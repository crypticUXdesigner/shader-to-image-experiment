/**
 * Export Render Path - Render one shader frame for video export
 *
 * Renders one frame at a given time with precomputed audio state to an offscreen
 * canvas at export resolution. Uses the same graph and compiler as live preview;
 * sets time and audio uniforms from the offline audio provider's frame state.
 * No live AudioManager or real-time playback.
 */

import type { NodeGraph } from '../data-model/types';
import type { ShaderCompiler, CompilationResult } from '../runtime/types';
import { ShaderInstance } from '../runtime/ShaderInstance';
import type { FrameAudioState } from './OfflineAudioProvider';

export interface ExportRenderPathConfig {
  /** Export width in pixels */
  width: number;
  /** Export height in pixels */
  height: number;
  /** Frame rate (e.g. 30); time = frameIndex / frameRate */
  frameRate: number;
}

export interface ExportRenderPathResult {
  /**
   * Render one frame at frameIndex with precomputed audio state.
   * Sets uTime = frameIndex / frameRate, applies frameState.uniformUpdates, draws, returns canvas.
   */
  renderFrame(frameIndex: number, frameState: FrameAudioState): HTMLCanvasElement | OffscreenCanvas;
  /** Canvas at export resolution (width x height). Same reference every frame. */
  getCanvas(): HTMLCanvasElement | OffscreenCanvas;
  /** Release WebGL and shader resources. Call when export is done or cancelled. */
  dispose(): void;
}

/**
 * Create an export render path: offscreen canvas, compile graph once, render frames with time + audio uniforms.
 *
 * @param graph - Current node graph (same as live preview)
 * @param compiler - NodeShaderCompiler or any ShaderCompiler
 * @param config - width, height, frameRate
 * @returns Object with renderFrame(frameIndex, frameState), getCanvas(), dispose()
 */
export function createExportRenderPath(
  graph: NodeGraph,
  compiler: ShaderCompiler,
  config: ExportRenderPathConfig
): ExportRenderPathResult {
  return createExportRenderPathImpl(graph, compiler, config);
}

/**
 * Alias for createExportRenderPath with positional args for orchestrator (03).
 * createExportRenderer(graph, compiler, width, height, frameRate) → { renderFrame, getCanvas, dispose }.
 */
export function createExportRenderer(
  graph: NodeGraph,
  compiler: ShaderCompiler,
  width: number,
  height: number,
  frameRate: number
): ExportRenderPathResult {
  return createExportRenderPath(graph, compiler, { width, height, frameRate });
}

function createExportRenderPathImpl(
  graph: NodeGraph,
  compiler: ShaderCompiler,
  config: ExportRenderPathConfig
): ExportRenderPathResult {
  const { width, height, frameRate } = config;

  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height }) as HTMLCanvasElement;

  if (!('width' in canvas && canvas.width === width && canvas.height === height)) {
    canvas.width = width;
    canvas.height = height;
  }

  const gl = canvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true,
  });

  if (!gl) {
    throw new Error('WebGL2 not available for export');
  }
  const glContext: WebGL2RenderingContext = gl;

  const compilationResult: CompilationResult = compiler.compile(graph);
  if (compilationResult.metadata.errors.length > 0) {
    throw new Error(`Shader compilation failed: ${compilationResult.metadata.errors.join('; ')}`);
  }

  const shaderInstance = new ShaderInstance(glContext, compilationResult);
  shaderInstance.setResolution(width, height);

  transferParametersFromGraph(graph, shaderInstance);

  let disposed = false;

  function renderFrame(frameIndex: number, frameState: FrameAudioState): HTMLCanvasElement | OffscreenCanvas {
    if (disposed) {
      throw new Error('ExportRenderPath already disposed');
    }

    const time = frameIndex / frameRate;
    shaderInstance.setTime(time);
    shaderInstance.setParameters(frameState.uniformUpdates);

    glContext.viewport(0, 0, width, height);
    glContext.clearColor(0, 0, 0, 1);
    glContext.clear(glContext.COLOR_BUFFER_BIT);
    shaderInstance.render(width, height);

    return canvas;
  }

  function dispose(): void {
    if (disposed) return;
    shaderInstance.destroy();
    disposed = true;
  }

  return {
    renderFrame,
    getCanvas: () => canvas,
    dispose,
  };
}

/**
 * Set shader parameters from graph (same logic as live: skip runtime-only and override-connected).
 */
function transferParametersFromGraph(graph: NodeGraph, shaderInstance: ShaderInstance): void {
  for (const node of graph.nodes) {
    for (const [paramName, value] of Object.entries(node.parameters)) {
      if (node.type === 'audio-file-input' && (paramName === 'filePath' || paramName === 'autoPlay')) {
        continue;
      }
      if (
        node.type === 'audio-analyzer' &&
        (paramName === 'frequencyBands' ||
          paramName === 'smoothing' ||
          paramName === 'fftSize' ||
          /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(paramName))
      ) {
        continue;
      }

      const isConnected = graph.connections.some(
        (c) => c.targetNodeId === node.id && c.targetParameter === paramName
      );
      if (isConnected && node.parameterInputModes?.[paramName] === 'override') {
        continue;
      }

      if (typeof value === 'number') {
        shaderInstance.setParameter(node.id, paramName, value);
      }
    }
  }
}
