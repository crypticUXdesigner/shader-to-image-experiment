import type { Disposable } from '../../utils/Disposable';
import { previewPerformanceMark, PreviewPerfMark } from '../previewPerformanceMarks';
import { getPreviewScheduler } from '../PreviewScheduler';

const RESIZE_DEBOUNCE_MS = 320;

export type PreviewFrameLayoutHostOptions = {
  /** Subsystem label passed to {@link getPreviewScheduler}.recordDirty */
  dirtySource?: string;
  /** When true, skip viewport updates and report no pending presentation work. */
  isLayoutBlocked?: () => boolean;
};

/**
 * ResizeObserver + backing-store sizing for a single preview canvas without WebGL.
 * Used by {@link WebGpuRenderBackend} (Task 03) so WebGPU mode does not construct a WebGL2 context.
 */
export class PreviewFrameLayoutHost implements Disposable {
  private readonly canvas: HTMLCanvasElement;
  private readonly dirtySource: string;
  private readonly isLayoutBlocked: () => boolean;

  private resizeObserver: ResizeObserver | null = null;
  private pendingResize = false;
  private resizeDebounceTimeout: number | null = null;
  private windowResizeHandler: (() => void) | null = null;

  private isDirty = false;
  private readonly dirtyReasons = new Set<string>();
  private forceRender = false;

  constructor(canvas: HTMLCanvasElement, options?: PreviewFrameLayoutHostOptions) {
    this.canvas = canvas;
    this.dirtySource = options?.dirtySource ?? 'PreviewFrameLayoutHost';
    this.isLayoutBlocked = options?.isLayoutBlocked ?? (() => false);

    const layoutCanvas = canvas;
    if (layoutCanvas.width < 1 || layoutCanvas.height < 1) {
      layoutCanvas.width = Math.max(1, layoutCanvas.clientWidth || 1);
      layoutCanvas.height = Math.max(1, layoutCanvas.clientHeight || 1);
    }

    this.setupViewport();
    this.setupResizeHandler();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  markDirty(reason: string = 'unknown'): void {
    this.isDirty = true;
    this.dirtyReasons.add(reason);
    getPreviewScheduler().recordDirty(reason, { source: this.dirtySource });
  }

  private clearDirty(): void {
    this.isDirty = false;
    this.dirtyReasons.clear();
  }

  clearPresentationDirtyAfterDraw(): void {
    this.clearDirty();
    this.forceRender = false;
  }

  needsPresentationFlush(): boolean {
    if (this.isLayoutBlocked()) return false;
    return this.pendingResize || this.isDirty || this.forceRender;
  }

  forceRenderOnce(render: () => void): void {
    this.forceRender = true;
    render();
  }

  applyPendingViewportLayout(): void {
    if (this.isLayoutBlocked()) return;
    if (getPreviewScheduler().consumeAdaptiveSettleFullDprOnce()) {
      this.setupViewport();
      this.markDirty('resize');
    }
    if (this.pendingResize) {
      this.setupViewport();
      this.pendingResize = false;
      this.markDirty('resize');
    }
  }

  notifyPreviewLayoutChanged(): void {
    if (this.isLayoutBlocked()) return;
    this.setupViewport();
    this.markDirty('resize');
  }

  destroy(): void {
    if (this.resizeDebounceTimeout !== null) {
      window.clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler);
      this.windowResizeHandler = null;
    }
  }

  private setupViewport(): void {
    const sched = getPreviewScheduler();
    let dpr = window.devicePixelRatio || 1;
    if (sched.consumeAdaptiveSettleFullDprOnce()) {
      dpr = window.devicePixelRatio || 1;
    } else if (sched.isAdaptivePreviewEnabled() && sched.getState().mode === 'interactionReduced') {
      dpr = Math.min(dpr, 1.25);
    }
    const layout = this.canvas;
    const width = Math.max(1, layout.clientWidth * dpr);
    const height = Math.max(1, layout.clientHeight * dpr);

    this.canvas.width = width;
    this.canvas.height = height;
    previewPerformanceMark(PreviewPerfMark.previewViewportLayout);
    const cssW = layout.clientWidth;
    const cssH = layout.clientHeight;
    sched.recordPreviewViewportSnapshot({
      backingPx: {
        width: Math.round(width),
        height: Math.round(height)
      },
      layoutCssPx: { width: cssW, height: cssH },
      effectivePreviewDpr: dpr
    });
  }

  private peekPreviewDprFloor(): number {
    let dpr = window.devicePixelRatio || 1;
    const sched = getPreviewScheduler();
    if (sched.isAdaptivePreviewEnabled() && sched.getState().mode === 'interactionReduced') {
      dpr = Math.min(dpr, 1.25);
    }
    return dpr;
  }

  private setupResizeHandler(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const layout = this.canvas;
      const cssW = layout.clientWidth;
      const cssH = layout.clientHeight;
      const probeDpr = this.peekPreviewDprFloor();
      const wantW = Math.max(1, Math.round(cssW * probeDpr));
      const wantH = Math.max(1, Math.round(cssH * probeDpr));
      const backingW = this.canvas.width;
      const backingH = this.canvas.height;
      const backingTooSmallForDisplay =
        cssW > 0 &&
        cssH > 0 &&
        backingW > 0 &&
        backingH > 0 &&
        (wantW > backingW + 8 || wantH > backingH + 8);

      if (this.resizeDebounceTimeout !== null) {
        window.clearTimeout(this.resizeDebounceTimeout);
        this.resizeDebounceTimeout = null;
      }

      if (backingTooSmallForDisplay) {
        this.handleResize();
      } else {
        this.scheduleDebouncedResize();
      }
    });
    this.resizeObserver.observe(this.canvas);

    this.windowResizeHandler = () => this.scheduleDebouncedResize();
    window.addEventListener('resize', this.windowResizeHandler);
  }

  private handleResize(): void {
    if (!this.pendingResize) {
      this.pendingResize = true;
      this.markDirty('resize');
    }
  }

  private scheduleDebouncedResize(): void {
    if (this.resizeDebounceTimeout !== null) {
      window.clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }
    this.resizeDebounceTimeout = window.setTimeout(() => {
      this.resizeDebounceTimeout = null;
      this.handleResize();
    }, RESIZE_DEBOUNCE_MS);
  }
}
