import { Renderer, type RendererConstructorOptions } from '../Renderer';
import type { IRenderBackend } from './IRenderBackend';
import type { RenderBackendSelection } from './renderBackendTypes';

/**
 * Task 01: thin adapter that keeps the concrete `Renderer` surface intact
 * (so downstream code like `CompilationManager` can keep depending on `Renderer`)
 * while adding selection metadata.
 */
export class WebGlRenderBackend extends Renderer implements IRenderBackend {
  public readonly selection: RenderBackendSelection;

  constructor(
    canvas: HTMLCanvasElement,
    selection: RenderBackendSelection,
    rendererOptions?: RendererConstructorOptions
  ) {
    super(canvas, rendererOptions);
    this.selection = selection;
  }

  getPreviewCompileExclusiveGpu(): RenderBackendSelection['selected'] {
    return this.selection.selected;
  }
}

