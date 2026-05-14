/**
 * Editor preview runtime bootstrap: URL flags (`?renderBackend=…`, `?webgpuPreviewDependencyClock=…`)
 * and `createRuntimeManager` wiring (no Svelte).
 */

import type { NodeShaderCompiler } from '../../shaders/NodeShaderCompiler';
import { createRuntimeManager } from '../../runtime/factories';
import {
  parseUrlWebGpuPreviewDependencyClockMask,
} from '../../runtime/webGpuPreviewDependencyClock';
import type { PreviewCompileUiSink } from '../../runtime/previewCompileUiSink';
import type { RenderBackendMode } from '../../runtime/renderBackends/renderBackendTypes';
import type { ErrorHandler } from '../../utils/errorHandling';
import type { NodeSpec } from '../../types';
import type { RuntimeManager } from '../../runtime/RuntimeManager';
import { WaveformService } from '../../runtime';
import type { AudioSetup } from '../../data-model/audioSetupTypes';
import { getPrimaryFileId } from '../../data-model/audioSetupTypes';

/**
 * `?renderBackend=auto|webgpu|webgl` — drives preview and export rasterization together.
 * Invalid values are ignored (falls back to default `webgl` in `createRuntimeManager`).
 */
export function parseUrlRenderBackendOverride(): RenderBackendMode | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = new URLSearchParams(window.location.search).get('renderBackend')?.trim().toLowerCase();
    if (!raw) return undefined;
    if (raw === 'auto' || raw === 'webgpu' || raw === 'webgl') return raw;
    return undefined;
  } catch {
    return undefined;
  }
}

function buildPreviewRuntimeInitOptions(previewCompileUiSink: PreviewCompileUiSink): {
  renderBackend?: RenderBackendMode;
  webGpuPreviewDependencyClockMask?: true;
  previewCompileUiSink: PreviewCompileUiSink;
} {
  const renderBackend = parseUrlRenderBackendOverride();
  const webGpuPreviewDependencyClockMask = parseUrlWebGpuPreviewDependencyClockMask();
  return {
    ...(renderBackend != null ? { renderBackend } : {}),
    ...(webGpuPreviewDependencyClockMask ? { webGpuPreviewDependencyClockMask: true as const } : {}),
    previewCompileUiSink,
  };
}

/** Creates the preview `RuntimeManager` (worker path when `nodeSpecsMap` is provided). */
export async function createEditorPreviewRuntimeManager(params: {
  previewCanvas: HTMLCanvasElement;
  compiler: NodeShaderCompiler;
  errorHandler: ErrorHandler;
  nodeSpecsMap: Map<string, NodeSpec>;
  previewCompileUiSink: PreviewCompileUiSink;
}): Promise<Awaited<ReturnType<typeof createRuntimeManager>>> {
  const { previewCanvas, compiler, errorHandler, nodeSpecsMap, previewCompileUiSink } = params;
  const runtimeInitOptions = buildPreviewRuntimeInitOptions(previewCompileUiSink);
  return await Promise.resolve(
    createRuntimeManager(
      previewCanvas,
      compiler,
      errorHandler,
      nodeSpecsMap,
      Object.keys(runtimeInitOptions).length > 0 ? runtimeInitOptions : undefined
    )
  );
}

/** Same `WaveformService` wiring as the editor shell (`App.svelte` / canvas lifecycle). */
export function createEditorWaveformService(
  rm: RuntimeManager,
  getAudioSetup: () => AudioSetup | null | undefined
): WaveformService {
  return new WaveformService({
    getPrimarySource: () => getAudioSetup()?.primarySource,
    getPrimaryFileId: () => getPrimaryFileId(getAudioSetup()),
    getPrimaryBuffer: () => {
      const id = getPrimaryFileId(getAudioSetup());
      return id ? rm.getAudioManager().getAudioNodeState(id)?.audioBuffer ?? null : null;
    },
  });
}
