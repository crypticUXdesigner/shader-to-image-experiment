import type { Disposable } from '../../utils/Disposable';
import type { ShaderInstance } from '../ShaderInstance';
import type { CompilationResult, PreviewProgramInstance } from '../types';
import type { RenderBackendSelection } from './renderBackendTypes';

/**
 * Render backend seam (preview only, Task 01).
 * Single façade for preview raster + compile install hooks (see graph-runtime-ui-architecture-followup task 02).
 * Keep surface minimal; expand only when later tasks require it.
 */
export interface IRenderBackend extends Disposable {
  /** Debug/telemetry selection metadata. */
  readonly selection: RenderBackendSelection;

  /**
   * Exclusive GPU API for preview compilation (Task 04): matches the active preview backend
   * from {@link selectRenderBackend} — never inferred from a prior cross-API fallback.
   */
  getPreviewCompileExclusiveGpu(): RenderBackendSelection['selected'];

  markDirty(reason?: string): void;
  render(): void;

  /** Preview presentation loop (rAF); WebGPU may no-op when the shell owns stepping. */
  startAnimation(): void;
  /** Stop preview presentation loop. */
  stopAnimation(): void;

  /** Keep legacy name to minimize churn in compilation/runtime code paths. */
  setShaderInstance(instance: ShaderInstance): void;

  /**
   * (Task 03) Optional WebGPU program install path.
   * When `result.backend === 'webgpu' && result.supported`, the backend may install a WebGPU pipeline
   * and return the active program sink for time/param/audio updates. Returning null means "not handled".
   */
  setWebGpuProgram?(result: CompilationResult): PreviewProgramInstance | null;

  getCanvas(): HTMLCanvasElement;
  /** WebGL-only backends return a context; WebGPU-only preview returns null (Task 03). */
  getGLContext(): WebGL2RenderingContext | null;

  /**
   * True when WebGPU preview cannot run (init failed or device lost) and this session has no WebGL fallback canvas.
   * Compilation/runtime uses this to avoid infinite “program pending” retries.
   */
  isWebGpuPreviewBlocked?(): boolean;

  setOnContextRestored(callback: () => void): void;
  setOnContextLost(callback: () => void): void;

  /** Match {@link import('../types').IRenderer.notifyPreviewLayoutChanged}. */
  notifyPreviewLayoutChanged?(): void;

  /** Match {@link import('../types').IRenderer.needsPresentationFlush}. */
  needsPresentationFlush?(): boolean;
}

