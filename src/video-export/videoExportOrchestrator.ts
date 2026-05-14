/**
 * Video Export Orchestrator & UI
 *
 * Dialog for resolution, duration, full-audio option, bitrate; progress + cancel;
 * offline loop using OfflineAudioProvider (01), ExportRenderPath (02B), WebCodecsVideoExporter (02A);
 * file save.
 */

import { mount, unmount } from 'svelte';
import type { NodeGraph } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import { getPrimaryFileId } from '../data-model/audioSetupTypes';
import type { ShaderCompiler } from '../runtime/types';
import { createOfflineAudioProvider } from './OfflineAudioProvider';
import { createExportRenderPath } from './ExportRenderPath';
import { WebCodecsVideoExporter, isSupported } from './WebCodecsVideoExporter';
import type { FrameAudioState } from './OfflineAudioProvider';
import { createWebGpuVideoExportRenderPath } from './WebGpuVideoExportRenderPath';
import type { StreamTargetChunk } from 'mediabunny';
import {
  MAX_EXPORT_FRAMES,
  MAX_EXPORT_WIDTH,
  MAX_EXPORT_HEIGHT,
  formatExportLimitError,
} from './exportLimits';
import { writable } from 'svelte/store';
import VideoExportDialog from '../lib/components/export/VideoExportDialog.svelte';
import type { ExportRasterBackend } from '../runtime/renderBackends/renderBackendTypes';
import { formatWebGpuRasterExportUserMessage } from '../export/webGpuRasterExportUserMessage';

export interface VideoExportOrchestratorOptions {
  graph: NodeGraph;
  audioSetup: AudioSetup;
  compiler: ShaderCompiler;
  /** Returns the primary file (from audioSetup) with loaded buffer, or null. */
  getPrimaryAudio: () => { nodeId: string; buffer: AudioBuffer } | null;
  /** Same exclusive raster choice as live preview (`RuntimeManager.getExportRasterBackend`). */
  exportRasterBackend: ExportRasterBackend;
}

export interface VideoExportDialogConfig {
  width: number;
  height: number;
  maxDurationSeconds: number;
  useFullAudio: boolean;
  /** Start time (seconds) relative to the primary track. */
  startSeconds?: number;
  /** End time (seconds) relative to the primary track. */
  endSeconds?: number;
  /** When true and no audio is loaded, allow export as video-only (no audio track). */
  allowVideoOnly: boolean;
  videoBitrate?: number;
  /** Video bitrate mode as chosen in the dialog. */
  videoBitrateMode?: 'vbr' | 'cbr';
  audioBitrate?: number;
  /** Keyframe interval (seconds). */
  keyFrameIntervalSeconds?: number;
  /** Hardware acceleration preference for the encoder. */
  hardwareAcceleration?: 'no-preference' | 'prefer-software' | 'prefer-hardware';
  /** Latency mode: quality favors quality over speed; realtime favors rate control/latency. */
  latencyMode?: 'quality' | 'realtime';
  /** Video content hint for the encoder. */
  contentHint?: 'detail' | 'motion' | 'text' | 'none';
  frameRate: number;
}

/** 192 kbps AAC – high quality, within typical browser encoder support (256 kbps often unsupported) */
const DEFAULT_AUDIO_BITRATE = 192_000;
/** Default video bitrate in Mbps (shown in UI); stored as bps when passing to exporter */
const DEFAULT_VIDEO_BITRATE_MBPS = 10;
const DEFAULT_VIDEO_BITRATE = DEFAULT_VIDEO_BITRATE_MBPS * 1_000_000;
const DEFAULT_VIDEO_BITRATE_MODE: NonNullable<VideoExportDialogConfig['videoBitrateMode']> = 'vbr';
const DEFAULT_KEYFRAME_INTERVAL_SECONDS = 2;
const DEFAULT_HARDWARE_ACCELERATION: NonNullable<VideoExportDialogConfig['hardwareAcceleration']> = 'prefer-software';
const DEFAULT_LATENCY_MODE: NonNullable<VideoExportDialogConfig['latencyMode']> = 'quality';
const DEFAULT_CONTENT_HINT: NonNullable<VideoExportDialogConfig['contentHint']> = 'detail';

/** Config from dialog: audio optional (no buffer = video-only export when allowVideoOnly is true). */
export type VideoExportResolvedConfig = VideoExportDialogConfig & {
  primaryNodeId?: string;
  buffer?: AudioBuffer;
  audioDurationSeconds?: number;
};

/**
 * Show modal dialog to collect export config. Resolves with config on Confirm, rejects on Cancel.
 * After confirm, the dialog stays open and swaps to progress view.
 */
function showExportDialog(options: VideoExportOrchestratorOptions): {
  config: Promise<VideoExportResolvedConfig>;
  setProgress: (current: number, total: number) => void;
  requestCancel: () => void;
  close: () => void;
  cancelled: Promise<void>;
} {
  const progressStore = writable({ current: 0, total: 0 });
  const container = document.createElement('div');
  document.body.appendChild(container);

  let instance: ReturnType<typeof mount> | null = null;
  let settled = false;

  let resolveCancelled: () => void;
  const cancelled = new Promise<void>((r) => {
    resolveCancelled = r;
  });
  let cancelRequested = false;

  const cleanup = () => {
    if (!container.parentNode) return;
    if (instance) unmount(instance);
    container.remove();
  };

  let resolveConfig!: (config: VideoExportResolvedConfig) => void;
  let rejectConfig!: (err: Error) => void;
  const config = new Promise<VideoExportResolvedConfig>((resolve, reject) => {
    resolveConfig = resolve;
    rejectConfig = reject;
  });

  const handleClose = () => {
    if (settled) return;
    settled = true;
    cleanup();
    rejectConfig(new Error('Cancelled'));
  };

  const handleConfirm = (cfg: VideoExportResolvedConfig) => {
    if (settled) return;
    settled = true;
    // Important: do NOT cleanup here. The dialog stays open and switches to progress step.
    resolveConfig(cfg);
  };

  const handleCancelExport = () => {
    if (cancelRequested) return;
    cancelRequested = true;
    resolveCancelled();
  };

  instance = mount(VideoExportDialog, {
    target: container,
    props: {
      visible: true,
      getPrimaryAudio: options.getPrimaryAudio,
      onClose: handleClose,
      onConfirm: handleConfirm,
      progress: progressStore,
      onCancelExport: handleCancelExport,
    },
  });

  return {
    config,
    setProgress(current: number, total: number) {
      progressStore.set({ current, total });
    },
    requestCancel() {
      handleCancelExport();
    },
    close() {
      cleanup();
    },
    cancelled,
  };
}

/**
 * Trigger download of binary data as a file.
 */
function downloadBlob(data: Uint8Array, filename: string): void {
  const blob = new Blob([data as unknown as BlobPart], { type: 'video/mp4' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a sensible filename for the exported video.
 */
function defaultFilename(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `shader-export-${y}-${m}-${d}-${h}${min}.mp4`;
}

async function pickSaveHandle(filename: string): Promise<FileSystemFileHandle> {
  if (!('showSaveFilePicker' in window)) {
    throw new Error('This browser does not support the File System Access API required for large video exports.');
  }
  const showSaveFilePicker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> })
    .showSaveFilePicker;
  return await showSaveFilePicker({
    suggestedName: filename,
    types: [
      {
        description: 'MP4 video',
        accept: { 'video/mp4': ['.mp4'] },
      },
    ],
  });
}

function createFileSystemWritableStream(
  fs: FileSystemWritableFileStream
): WritableStream<StreamTargetChunk> {
  return new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      // FileSystemWritableFileStream supports random-access writes via { type: 'write', position, data }.
      await fs.write({ type: 'write', position: chunk.position, data: chunk.data });
    },
    async close() {
      await fs.close();
    },
    async abort(reason) {
      // Chrome supports abort(); if not, close to release the file handle.
      const maybeAbort = fs as unknown as { abort?: (reason?: unknown) => Promise<void> };
      if (maybeAbort.abort) {
        await maybeAbort.abort(reason);
      } else {
        await fs.close();
      }
    },
  });
}

/**
 * Run the full video export flow: dialog → progress → offline loop → save.
 * Throws if WebCodecs not supported or user cancels. Audio is optional (video-only when no primary audio).
 */
export async function runVideoExportFlow(options: VideoExportOrchestratorOptions): Promise<void> {
  if (!isSupported()) {
    throw new Error('Video export is not supported in this browser. WebCodecs (VideoEncoder/AudioEncoder) is required.');
  }

  const dialog = showExportDialog(options);
  const config = await dialog.config;
  const { graph, audioSetup, compiler } = options;
  const { width, height, maxDurationSeconds, frameRate } = config;

  const hasAudio = config.buffer != null;
  if (!hasAudio && !config.allowVideoOnly) {
    throw new Error('No audio loaded. Load a track first, or explicitly enable "Export without audio" in the dialog.');
  }

  // Audio is required unless user explicitly opted into video-only export.
  const buffer: AudioBuffer | null = config.buffer ?? null;
  const primaryNodeId: string = config.primaryNodeId ?? getPrimaryFileId(audioSetup) ?? 'export-no-audio';
  const sampleRate = buffer?.sampleRate ?? 48_000;
  const numberOfChannels = hasAudio ? buffer!.numberOfChannels : 0;
  const startSeconds = hasAudio ? Math.max(0, config.startSeconds ?? 0) : 0;
  const endSeconds = hasAudio ? Math.max(startSeconds, config.endSeconds ?? startSeconds + maxDurationSeconds) : maxDurationSeconds;

  const effectiveDurationSeconds = Math.max(0.01, endSeconds - startSeconds);
  const maxFrames = Math.max(1, Math.floor(effectiveDurationSeconds * frameRate));

  if (width < 1 || width > MAX_EXPORT_WIDTH) {
    throw new Error(
      formatExportLimitError({
        limitName: 'width (px)',
        limitValue: MAX_EXPORT_WIDTH,
        actualValue: width,
        hint: `Use width between 1 and ${MAX_EXPORT_WIDTH}.`,
      })
    );
  }
  if (height < 1 || height > MAX_EXPORT_HEIGHT) {
    throw new Error(
      formatExportLimitError({
        limitName: 'height (px)',
        limitValue: MAX_EXPORT_HEIGHT,
        actualValue: height,
        hint: `Use height between 1 and ${MAX_EXPORT_HEIGHT}.`,
      })
    );
  }
  if (maxFrames > MAX_EXPORT_FRAMES) {
    throw new Error(
      formatExportLimitError({
        limitName: 'frame count',
        limitValue: MAX_EXPORT_FRAMES,
        actualValue: maxFrames,
        hint: 'Shorten duration or lower frame rate.',
      })
    );
  }

  let cancelled = false;
  dialog.cancelled.then(() => {
    cancelled = true;
  });

  // Pick output file upfront so we can stream bytes and avoid 4 GiB ArrayBuffer limits.
  const filename = defaultFilename();
  const fileHandle = await pickSaveHandle(filename);
  const fileStream = await fileHandle.createWritable();
  const writable = createFileSystemWritableStream(fileStream);

  const offlineProvider = hasAudio
    ? createOfflineAudioProvider(audioSetup, primaryNodeId, buffer!, sampleRate, frameRate, startSeconds, maxFrames)
    : null;

  const renderPathConfig = { width, height, frameRate, startTimeSeconds: startSeconds };

  type RenderFrameAsync = NonNullable<ReturnType<typeof createExportRenderPath>['renderFrameAsync']>;
  let renderPath: ReturnType<typeof createExportRenderPath>;
  let webgpuAsyncRender: RenderFrameAsync | null = null;

  if (options.exportRasterBackend === 'webgpu') {
    const wg = await createWebGpuVideoExportRenderPath(graph, compiler, audioSetup, renderPathConfig);
    if (!wg.ok) {
      const detail = wg.compilation?.unsupportedReasons?.join('; ') ?? wg.reason;
      throw new Error(formatWebGpuRasterExportUserMessage(wg.reason, detail), { cause: wg.error });
    }
    webgpuAsyncRender = wg.path.renderFrameAsync ?? null;
    if (!webgpuAsyncRender) {
      throw new Error(
        formatWebGpuRasterExportUserMessage('missing.renderFrameAsync', 'WebGPU video export path has no async renderer')
      );
    }
    renderPath = wg.path;
  } else {
    renderPath = createExportRenderPath(graph, compiler, audioSetup, renderPathConfig);
  }

  // WebCodecs (VideoEncoder) is separate from WebGL2/WebGPU rasterization; it muxes the frames we render.
  const slicedAudioBuffer = hasAudio && buffer ? sliceAudioBuffer(buffer, startSeconds, endSeconds) : undefined;
  const exporter = WebCodecsVideoExporter.create({
    width,
    height,
    frameRate,
    sampleRate,
    numberOfChannels,
    audioBuffer: slicedAudioBuffer,
    videoBitrate: config.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
    videoBitrateMode: config.videoBitrateMode ?? DEFAULT_VIDEO_BITRATE_MODE,
    keyFrameIntervalSeconds: config.keyFrameIntervalSeconds ?? DEFAULT_KEYFRAME_INTERVAL_SECONDS,
    hardwareAcceleration: config.hardwareAcceleration ?? DEFAULT_HARDWARE_ACCELERATION,
    latencyMode: config.latencyMode ?? DEFAULT_LATENCY_MODE,
    contentHint: config.contentHint ?? DEFAULT_CONTENT_HINT,
    audioBitrate: config.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
    outputTarget: { kind: 'stream', writable },
  });

  try {
    const yieldEvery = Math.max(1, Math.round(frameRate / 30)); // ~30 yields/sec at common FPS
    for (let frameIndex = 0; frameIndex < maxFrames; frameIndex++) {
      if (cancelled) {
        exporter.terminate();
        break;
      }
      const shouldYield = frameIndex === 0 || frameIndex === maxFrames - 1 || frameIndex % yieldEvery === 0;
      // Avoid per-frame UI churn: update progress roughly at the same cadence we yield.
      if (shouldYield) {
        dialog.setProgress(frameIndex + 1, maxFrames);
        // Important: allow the browser to paint progress updates before potentially blocking on encoding / stream backpressure.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }

      const frameState: FrameAudioState = offlineProvider
        ? offlineProvider.getFrameState(frameIndex)
        : { channelSamples: [], uniformUpdates: [], timelineTime: frameIndex / frameRate };

      let canvas: HTMLCanvasElement | OffscreenCanvas;
      if (webgpuAsyncRender) {
        try {
          canvas = await webgpuAsyncRender(frameIndex, frameState);
        } catch (err) {
          const e = err instanceof Error ? err : new Error('WebGPU renderFrame failed', { cause: err });
          throw new Error(
            formatWebGpuRasterExportUserMessage('renderFrame.failed', `frame ${frameIndex}: ${e.message}`),
            { cause: e }
          );
        }
      } else {
        canvas = renderPath.renderFrame(frameIndex, frameState);
      }
      const timestampSeconds = frameIndex / frameRate;
      // Audio is encoded as a full track up-front; per-frame channel samples are still computed
      // for offline analysis + uniform updates.
      await exporter.addFrame(canvas, frameState.channelSamples, timestampSeconds);

      // Yield to UI so progress and cancel are responsive
      if (shouldYield) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (cancelled) {
      // Sentinel error message used by the UI to treat cancel as user-intended (not an error).
      throw new Error('Cancelled');
    }

    const data = await exporter.finalize();
    dialog.close();
    renderPath.dispose();
    // Stream target returns null; buffer target returns bytes (kept for backwards compatibility).
    if (data) {
      downloadBlob(data, filename);
    }
  } catch (err) {
    exporter.terminate();
    try {
      // Ensure the partially written file is aborted when possible.
      await writable.abort(err);
    } catch {
      // ignore
    }
    dialog.close();
    renderPath.dispose();
    throw err;
  }
}

function sliceAudioBuffer(buffer: AudioBuffer, startSeconds: number, endSeconds: number): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.min(buffer.length, Math.round(startSeconds * sampleRate)));
  const endSample = Math.max(startSample, Math.min(buffer.length, Math.round(endSeconds * sampleRate)));
  const length = Math.max(1, endSample - startSample);
  const out = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch).subarray(startSample, endSample);
    out.getChannelData(ch).set(src);
  }
  return out;
}
