/**
 * Video export module - offline audio, export render path, and WebCodecs export.
 */

export {
  OfflineAudioProvider,
  createOfflineAudioProvider,
  type FrameAudioState,
  type UniformUpdate,
  type AnalyzerConfig,
  type OfflineAudioProviderConfig,
} from './OfflineAudioProvider';

export {
  createExportRenderPath,
  createExportRenderer,
  type ExportRenderPathConfig,
  type ExportRenderPathResult,
} from './ExportRenderPath';

export {
  WebCodecsVideoExporter,
  isSupported,
  type VideoExportConfig,
  type WebCodecsVideoExporterInterface,
} from './WebCodecsVideoExporter';

export {
  runVideoExportFlow,
  type VideoExportOrchestratorOptions,
  type VideoExportDialogConfig,
} from './videoExportOrchestrator';

import { WebCodecsVideoExporter } from './WebCodecsVideoExporter';
import type { VideoExportConfig } from './WebCodecsVideoExporter';

/** Create a WebCodecs video exporter. API: create(config) → addFrame / finalize / terminate. */
export function create(config: VideoExportConfig): WebCodecsVideoExporter {
  return WebCodecsVideoExporter.create(config);
}
