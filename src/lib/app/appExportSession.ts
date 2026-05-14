/**
 * Editor shell wiring for image/video export flows — explicit deps (no hidden globals).
 */

import type { NodeGraph } from '../../data-model/types';
import type { AudioSetup } from '../../data-model/audioSetupTypes';
import { getPrimaryFileId } from '../../data-model/audioSetupTypes';
import type { IAudioManager, ShaderCompiler } from '../../runtime/types';
import type { ExportRasterBackend } from '../../runtime/renderBackends/renderBackendTypes';
import { runImageExportFlow } from '../../image-export';
import { runVideoExportFlow, isSupported as isVideoExportSupported } from '../../video-export';

/** Primary-file buffer lookup for video export (explicit deps; no graphStore reads inside). */
export function createGetPrimaryAudioBuffer(deps: {
  getAudioManager: () => IAudioManager | null | undefined;
  getAudioSetup: () => AudioSetup;
}): () => { nodeId: string; buffer: AudioBuffer } | null {
  return () => {
    const audioManager = deps.getAudioManager();
    if (!audioManager) return null;
    const primaryId = getPrimaryFileId(deps.getAudioSetup());
    if (!primaryId) return null;
    const state = audioManager.getAudioNodeState(primaryId);
    if (!state?.audioBuffer) return null;
    return { nodeId: primaryId, buffer: state.audioBuffer };
  };
}

export async function runEditorImageExportSession(deps: {
  compiler: ShaderCompiler | null | undefined;
  graph: NodeGraph;
  audioSetup: AudioSetup;
  getTimelineState: () => { currentTime: number; duration?: number } | null;
  exportRasterBackend: ExportRasterBackend;
}): Promise<void> {
  if (!deps.compiler) return;
  await runImageExportFlow({
    graph: deps.graph,
    audioSetup: deps.audioSetup,
    compiler: deps.compiler,
    getTimelineState: deps.getTimelineState,
    exportRasterBackend: deps.exportRasterBackend,
  });
}

export async function runEditorVideoExportSession(deps: {
  graph: NodeGraph;
  audioSetup: AudioSetup;
  compiler: ShaderCompiler;
  getPrimaryAudio: () => { nodeId: string; buffer: AudioBuffer } | null;
  exportRasterBackend: ExportRasterBackend;
}): Promise<void> {
  if (!isVideoExportSupported()) {
    throw new Error('Video export is not supported. WebCodecs (VideoEncoder/AudioEncoder) is required.');
  }
  await runVideoExportFlow(deps);
}
