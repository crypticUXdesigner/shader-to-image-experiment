/**
 * Renderer - Canvas and Rendering Management
 * 
 * Manages canvas, viewport, and rendering loop.
 * Implements the Renderer class from Runtime Integration Specification.
 */

import { ShaderInstance } from './ShaderInstance';
import { WebGLContextError } from './errors';
import type { Disposable } from '../utils/Disposable';
import {
  previewPerformanceMark,
  PreviewPerfMark,
  previewPerfCounters
} from './previewPerformanceMarks';
import { getPreviewScheduler } from './PreviewScheduler';

/**
 * Used by WebGpuRenderBackend so WebGL2 lives on `glBackingCanvas` while the visible preview element
 * can acquire WebGPU exclusively (same canvas cannot host both contexts in Chromium).
 */
export type RendererConstructorOptions = {
  presentationCanvas?: HTMLCanvasElement;
};

export class Renderer implements Disposable {
  /** WebGL2 drawing surface (may be off-screen when paired with presentationCanvas). */
  private glBackingCanvas: HTMLCanvasElement;
  /** If set, `getCanvas()`, resize layout, and blit fallback target this DOM canvas. */
  private presentationCanvas: HTMLCanvasElement | null;
  private gl: WebGL2RenderingContext;
  private shaderInstance: ShaderInstance | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private pendingResize: boolean = false;
  /** PERF: Debounce resize during panel open/close (0.3s transition) so we don't run every frame and tank FPS. */
  private static readonly RESIZE_DEBOUNCE_MS = 320;
  private resizeDebounceTimeout: number | null = null;
  /** Mirrors debounced resize handling for `window` `resize` (preview shell also dispatches this). */
  private windowResizeHandler: (() => void) | null = null;

  // Event listeners for cleanup
  private contextLostHandler: ((e: Event) => void) | null = null;
  private contextRestoredHandler: (() => void) | null = null;
  private onContextRestoredCallback: (() => void) | null = null;
  private onContextLostCallback: (() => void) | null = null;
  
  // Dirty flag system for conditional rendering
  private isDirty: boolean = false;
  private dirtyReasons: Set<string> = new Set();
  private forceRender: boolean = false;
  
  constructor(canvas: HTMLCanvasElement, options?: RendererConstructorOptions) {
    this.glBackingCanvas = canvas;
    const presentation = options?.presentationCanvas;
    this.presentationCanvas = presentation ?? null;

    const layoutCanvas = presentation ?? canvas;
    // Some browsers return null for 0x0 canvas; ensure non-zero backing size.
    if (layoutCanvas.width < 1 || layoutCanvas.height < 1) {
      layoutCanvas.width = Math.max(1, layoutCanvas.clientWidth || 1);
      layoutCanvas.height = Math.max(1, layoutCanvas.clientHeight || 1);
    }
    // Keep backing bitmap in sync for first paint when detached.
    if (presentation != null && presentation !== canvas) {
      canvas.width = layoutCanvas.width;
      canvas.height = layoutCanvas.height;
    }

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true  // For export / 2d blit fallback
    });

    if (!gl) {
      throw new WebGLContextError('WebGL2 not supported');
    }

    this.gl = gl;
    this.setupViewport();
    this.setupResizeHandler();
    this.setupContextLossHandling();
  }

  /** Layout/size source: visible preview canvas when detached, else WebGL backing. */
  protected getLayoutObservedCanvas(): HTMLCanvasElement {
    return this.presentationCanvas ?? this.glBackingCanvas;
  }

  /** What compilation/runtime treats as “the preview canvas” dimensions / export surface hook. */
  protected getLogicalCanvas(): HTMLCanvasElement {
    return this.presentationCanvas ?? this.glBackingCanvas;
  }

  /**
   * When WebGL is off-screen, subclasses can disable 2D blit while the visible canvas may still receive WebGPU.
   */
  protected allow2dPresentationBlitAfterWebGl(): boolean {
    return true;
  }

  /**
   * WebGL renders into `glBackingCanvas`. When detached, copy pixels to the presentation canvas for fallback preview.
   */
  protected blitWebGlBackingToPresentationIfDetached(): void {
    if (!this.presentationCanvas || this.presentationCanvas === this.glBackingCanvas) return;
    if (!this.allow2dPresentationBlitAfterWebGl()) return;
    const dest = this.presentationCanvas;
    const ctx = dest.getContext('2d', { alpha: true });
    if (!ctx) return;
    ctx.drawImage(this.glBackingCanvas, 0, 0);
  }
  
  /**
   * Set shader instance for rendering.
   */
  setShaderInstance(instance: ShaderInstance): void {
    this.shaderInstance = instance;
    
    // Force initial render when shader is set
    this.forceRenderOnce();
  }
  
  /**
   * Mark renderer as dirty (needs rendering).
   */
  markDirty(reason: string = 'unknown'): void {
    this.isDirty = true;
    this.dirtyReasons.add(reason);
    getPreviewScheduler().recordDirty(reason, { source: 'Renderer' });
  }
  
  /**
   * Clear dirty flags after rendering.
   */
  private clearDirty(): void {
    this.isDirty = false;
    this.dirtyReasons.clear();
  }

  /** After a committed frame (WebGL path or WebGPU subclass). Keeps `{@link needsPresentationFlush}` accurate. */
  protected clearPresentationDirtyAfterDraw(): void {
    this.clearDirty();
    this.forceRender = false;
  }

  /**
   * True when resize/pending framebuffer work or Renderer dirty state still requires a draw but
   * `TimeManager.updateTime` may have skipped calling `render()` (paused shader, unchanged wall clock).
   */
  needsPresentationFlush(): boolean {
    if (this.gl.isContextLost?.()) return false;
    return this.pendingResize || this.isDirty || this.forceRender;
  }
  
  /**
   * Force a render (bypass dirty check).
   * Use sparingly - for initial render, etc.
   */
  forceRenderOnce(): void {
    this.forceRender = true;
    this.render();
  }
  
  /**
   * Apply canvas backing size from pending resize / adaptive-preview settle flags.
   * WebGPU subclasses override `render()` entirely; they must call this before reading `getCanvas().width`.
   */
  protected applyPendingViewportLayout(): void {
    if (this.gl.isContextLost?.()) return;
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

  /**
   * Render a single frame (only if dirty).
   */
  render(): void {
    if (this.gl.isContextLost && this.gl.isContextLost()) {
      this.shaderInstance = null;
      this.clearDirty();
      return;
    }
    this.applyPendingViewportLayout();
    
    if (!this.isDirty && !this.forceRender) {
      return; // Skip render - nothing changed
    }
    
    if (!this.shaderInstance) {
      this.clearDirty();
      return; // No shader to render
    }

    previewPerformanceMark(PreviewPerfMark.previewFrameStart);
    try {
      const width = this.glBackingCanvas.width;
      const height = this.glBackingCanvas.height;
      this.shaderInstance.setResolution(width, height);

      this.gl.clearColor(0, 0, 0, 1);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);

      this.shaderInstance.render(width, height);
      this.blitWebGlBackingToPresentationIfDetached();
      previewPerfCounters.previewFrameCommits += 1;
      getPreviewScheduler().recordPreviewFrameCommit();
    } finally {
      previewPerformanceMark(PreviewPerfMark.previewFrameEnd);
    }

    this.clearPresentationDirtyAfterDraw();
  }
  
  /**
   * Start animation loop.
   * NOTE: Animation loop is handled by main.ts App class, this method is kept for API compatibility
   * but does not start a separate loop to avoid double rendering.
   */
  startAnimation(): void {
    // Animation loop is handled by main.ts, do nothing here
    // This prevents double rendering
  }
  
  /**
   * Stop animation loop.
   * NOTE: Animation loop is handled by main.ts App class, this method is kept for API compatibility.
   */
  stopAnimation(): void {
    // Animation loop is handled by main.ts, do nothing here
  }
  
  /**
   * Setup viewport based on canvas size.
   */
  private setupViewport(): void {
    const sched = getPreviewScheduler();
    let dpr = window.devicePixelRatio || 1;
    if (sched.consumeAdaptiveSettleFullDprOnce()) {
      dpr = window.devicePixelRatio || 1;
    } else if (sched.isAdaptivePreviewEnabled() && sched.getState().mode === 'interactionReduced') {
      dpr = Math.min(dpr, 1.25);
    }
    const layout = this.getLayoutObservedCanvas();
    const width = Math.max(1, layout.clientWidth * dpr);
    const height = Math.max(1, layout.clientHeight * dpr);

    this.glBackingCanvas.width = width;
    this.glBackingCanvas.height = height;
    if (this.presentationCanvas != null && this.presentationCanvas !== this.glBackingCanvas) {
      this.presentationCanvas.width = width;
      this.presentationCanvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
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
  
  /**
   * DPR snapshot for resize heuristic only (never consumes adaptive settle-one-shot flags).
   * Must stay aligned with the non-consume branches in {@link setupViewport}.
   */
  private peekPreviewDprFloor(): number {
    let dpr = window.devicePixelRatio || 1;
    const sched = getPreviewScheduler();
    if (sched.isAdaptivePreviewEnabled() && sched.getState().mode === 'interactionReduced') {
      dpr = Math.min(dpr, 1.25);
    }
    return dpr;
  }

  /**
   * Setup resize handler.
   * Uses ResizeObserver for more accurate resize detection; debounced during panel transitions
   * so gradual width changes don't reallocate buffers every frame. When the framebuffer is visibly
   * too small for the CSS viewport (stretch / blur — e.g. view 1→3), flush immediately instead of
   * waiting behind debounce stacked on animated layout.
   */
  private setupResizeHandler(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const layout = this.getLayoutObservedCanvas();
      const cssW = layout.clientWidth;
      const cssH = layout.clientHeight;
      const probeDpr = this.peekPreviewDprFloor();
      const wantW = Math.max(1, Math.round(cssW * probeDpr));
      const wantH = Math.max(1, Math.round(cssH * probeDpr));
      const backingW = this.glBackingCanvas.width;
      const backingH = this.glBackingCanvas.height;
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
    this.resizeObserver.observe(this.getLayoutObservedCanvas());

    this.windowResizeHandler = () => this.scheduleDebouncedResize();
    window.addEventListener('resize', this.windowResizeHandler);
  }
  
  /**
   * Handle resize event - marks resize as pending for processing in render loop.
   */
  private handleResize(): void {
    if (!this.pendingResize) {
      this.pendingResize = true;
      this.markDirty('resize');
      // Viewport will be updated in next render() call
    }
  }

  /**
   * Re-read CSS layout size (client rect × preview DPR) and resize backing stores immediately.
   * Call after preview shell geometry changes (view mode, panel edge) when ResizeObserver may not
   * have fired yet for the canvas element.
   */
  notifyPreviewLayoutChanged(): void {
    if (this.gl.isContextLost?.()) return;
    this.setupViewport();
    this.markDirty('resize');
  }

  private scheduleDebouncedResize(): void {
    if (this.resizeDebounceTimeout !== null) {
      window.clearTimeout(this.resizeDebounceTimeout);
      this.resizeDebounceTimeout = null;
    }
    this.resizeDebounceTimeout = window.setTimeout(() => {
      this.resizeDebounceTimeout = null;
      this.handleResize();
    }, Renderer.RESIZE_DEBOUNCE_MS);
  }
  
  /**
   * Cleanup all resources.
   * Releases the WebGL context so it does not count toward the per-page context limit
   * (important for HMR or re-initialization).
   */
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

    // Remove event listeners before losing context (avoids firing during loseContext)
    if (this.contextLostHandler) {
      this.glBackingCanvas.removeEventListener('webglcontextlost', this.contextLostHandler);
      this.contextLostHandler = null;
    }

    if (this.contextRestoredHandler) {
      this.glBackingCanvas.removeEventListener('webglcontextrestored', this.contextRestoredHandler);
      this.contextRestoredHandler = null;
    }
    
    // Clean up shader instance if it exists
    if (this.shaderInstance) {
      this.shaderInstance.destroy();
      this.shaderInstance = null;
    }
    // Do not call loseContext() here. It was causing the live app's context to be killed when
    // a second App was created (e.g. DOMContentLoaded firing after a module re-run). The context
    // is released when the canvas is GC'd or the page unloads.
  }
  
  /**
   * Setup WebGL context loss handling.
   */
  private setupContextLossHandling(): void {
    this.contextLostHandler = (e: Event) => {
      e.preventDefault();
      console.warn('WebGL context lost');
      // Stop using the invalid context so we don't flood INVALID_OPERATION every frame.
      this.shaderInstance = null;
      this.onContextLostCallback?.();
    };
    
    this.contextRestoredHandler = () => {
      console.log('WebGL context restored');
      this.shaderInstance = null;
      this.setupViewport();
      this.onContextRestoredCallback?.();
    };
    
    this.glBackingCanvas.addEventListener('webglcontextlost', this.contextLostHandler);
    this.glBackingCanvas.addEventListener('webglcontextrestored', this.contextRestoredHandler);
  }
  
  /**
   * Register a callback to run when the WebGL context is restored after loss.
   * Used to trigger recompile so the new context gets a new ShaderInstance.
   */
  setOnContextRestored(callback: () => void): void {
    this.onContextRestoredCallback = callback;
  }

  /**
   * Register a callback to run when the WebGL context is lost.
   * Used so the app can stop its animation loop and avoid touching the invalid context.
   */
  setOnContextLost(callback: () => void): void {
    this.onContextLostCallback = callback;
  }

  /**
   * Get WebGL context (for CompilationManager).
   */
  getGLContext(): WebGL2RenderingContext {
    return this.gl;
  }
  
  /**
   * Get canvas element.
   */
  getCanvas(): HTMLCanvasElement {
    return this.getLogicalCanvas();
  }
}
