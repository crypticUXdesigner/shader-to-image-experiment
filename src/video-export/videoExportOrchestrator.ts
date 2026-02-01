/**
 * Video Export Orchestrator & UI
 *
 * Dialog for resolution, duration, full-audio option, bitrate; progress + cancel;
 * offline loop using OfflineAudioProvider (01), ExportRenderPath (02B), WebCodecsVideoExporter (02A);
 * file save.
 */

import type { NodeGraph } from '../data-model/types';
import type { ShaderCompiler } from '../runtime/types';
import { createOfflineAudioProvider } from './OfflineAudioProvider';
import { createExportRenderPath } from './ExportRenderPath';
import { WebCodecsVideoExporter, isSupported } from './WebCodecsVideoExporter';
import type { FrameAudioState } from './OfflineAudioProvider';
import { getCSSColor } from '../utils/cssTokens';
import {
  MAX_EXPORT_FRAMES,
  MAX_EXPORT_WIDTH,
  MAX_EXPORT_HEIGHT,
  formatExportLimitError,
} from './exportLimits';

export interface VideoExportOrchestratorOptions {
  graph: NodeGraph;
  compiler: ShaderCompiler;
  /** Returns the first audio-file-input node with a loaded buffer, or null. */
  getPrimaryAudio: () => { nodeId: string; buffer: AudioBuffer } | null;
}

export interface VideoExportDialogConfig {
  width: number;
  height: number;
  maxDurationSeconds: number;
  useFullAudio: boolean;
  videoBitrate?: number;
  audioBitrate?: number;
  frameRate: number;
}

/** 120 fps so uTime step size matches high-refresh displays; reduces hectic look vs 60 fps */
const DEFAULT_FRAME_RATE = 120;
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;
const DEFAULT_DURATION = 10;
/** 192 kbps AAC – high quality, within typical browser encoder support (256 kbps often unsupported) */
const DEFAULT_AUDIO_BITRATE = 192_000;
/** 50 Mbps – high quality, within typical browser encoder limits (100 Mbps often unsupported) */
const DEFAULT_VIDEO_BITRATE = 50_000_000;

/**
 * Show modal dialog to collect export config. Resolves with config on Confirm, rejects on Cancel.
 * If no primary audio is loaded, shows error in dialog and does not resolve until user fixes or cancels.
 */
function showExportDialog(
  options: VideoExportOrchestratorOptions
): Promise<VideoExportDialogConfig & { primaryNodeId: string; buffer: AudioBuffer; audioDurationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const primary = options.getPrimaryAudio();

    const overlay = document.createElement('div');
    overlay.className = 'video-export-dialog-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: var(--search-dialog-overlay, rgba(0,0,0,0.5));
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const dialog = document.createElement('div');
    dialog.className = 'video-export-dialog';
    const bg = getCSSColor('frame-bg', getCSSColor('color-gray-20', '#1a1c20'));
    const border = getCSSColor('frame-border', '#282b31');
    dialog.style.cssText = `
      background: ${bg};
      border: 1px solid ${border};
      border-radius: var(--search-dialog-radius, 8px);
      box-shadow: var(--search-dialog-shadow, 0 8px 24px rgba(0,0,0,0.5));
      padding: 20px;
      min-width: 320px;
      max-width: 90vw;
    `;

    const errorEl = document.createElement('div');
    errorEl.style.cssText = `color: var(--color-red-90, #c44748); margin-bottom: 12px; display: none;`;
    dialog.appendChild(errorEl);

    const widthLabel = document.createElement('label');
    widthLabel.textContent = 'Width';
    widthLabel.style.display = 'block';
    dialog.appendChild(widthLabel);
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = String(DEFAULT_WIDTH);
    widthInput.min = '1';
    widthInput.max = '4096';
    widthInput.className = 'input primary';
    widthInput.style.cssText = 'width: 100%; margin-bottom: 12px; box-sizing: border-box;';
    dialog.appendChild(widthInput);

    const heightLabel = document.createElement('label');
    heightLabel.textContent = 'Height';
    heightLabel.style.display = 'block';
    dialog.appendChild(heightLabel);
    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.value = String(DEFAULT_HEIGHT);
    heightInput.min = '1';
    heightInput.max = '4096';
    heightInput.className = 'input primary';
    heightInput.style.cssText = 'width: 100%; margin-bottom: 12px; box-sizing: border-box;';
    dialog.appendChild(heightInput);

    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Max duration (seconds)';
    durationLabel.style.display = 'block';
    dialog.appendChild(durationLabel);
    const durationInput = document.createElement('input');
    durationInput.type = 'number';
    durationInput.value = String(DEFAULT_DURATION);
    durationInput.min = '0.1';
    durationInput.step = '0.1';
    durationInput.className = 'input primary';
    durationInput.style.cssText = 'width: 100%; margin-bottom: 8px; box-sizing: border-box;';
    dialog.appendChild(durationInput);

    const fullAudioLabel = document.createElement('label');
    fullAudioLabel.style.display = 'flex';
    fullAudioLabel.style.alignItems = 'center';
    fullAudioLabel.style.gap = '8px';
    fullAudioLabel.style.marginBottom = '12px';
    const fullAudioCheck = document.createElement('input');
    fullAudioCheck.type = 'checkbox';
    fullAudioCheck.checked = false;
    fullAudioLabel.appendChild(fullAudioCheck);
    fullAudioLabel.appendChild(document.createTextNode('Use full audio length'));
    dialog.appendChild(fullAudioLabel);

    const bitrateLabel = document.createElement('label');
    bitrateLabel.textContent = 'Video bitrate (bps, e.g. 50000000 = 50 Mbps)';
    bitrateLabel.style.display = 'block';
    dialog.appendChild(bitrateLabel);
    const bitrateInput = document.createElement('input');
    bitrateInput.type = 'number';
    bitrateInput.placeholder = String(DEFAULT_VIDEO_BITRATE);
    bitrateInput.value = String(DEFAULT_VIDEO_BITRATE);
    bitrateInput.min = '100000';
    bitrateInput.className = 'input primary';
    bitrateInput.style.cssText = 'width: 100%; margin-bottom: 12px; box-sizing: border-box;';
    dialog.appendChild(bitrateInput);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'button secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      document.removeEventListener('keydown', handleEscape);
      overlay.remove();
      reject(new Error('Cancelled'));
    });
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'button primary';
    confirmBtn.textContent = 'Export';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        overlay.remove();
        reject(new Error('Cancelled'));
      }
    };

    function tryConfirm(): void {
      const primaryNow = options.getPrimaryAudio();
      if (!primaryNow) {
        errorEl.textContent = 'No audio loaded. Add an audio-file-input node and load an audio file.';
        errorEl.style.display = 'block';
        return;
      }
      document.removeEventListener('keydown', handleEscape);
      errorEl.style.display = 'none';
      const { nodeId: primaryNodeId, buffer: buf } = primaryNow;
      const width = Math.max(1, Math.min(4096, parseInt(widthInput.value, 10) || DEFAULT_WIDTH));
      const height = Math.max(1, Math.min(4096, parseInt(heightInput.value, 10) || DEFAULT_HEIGHT));
      const maxDuration = parseFloat(durationInput.value) || DEFAULT_DURATION;
      const useFullAudio = fullAudioCheck.checked;
      const videoBitrate = bitrateInput.value.trim()
        ? parseInt(bitrateInput.value, 10) || DEFAULT_VIDEO_BITRATE
        : DEFAULT_VIDEO_BITRATE;
      const audioDurationSeconds = buf.duration;
      const maxDurationSeconds = useFullAudio ? audioDurationSeconds : Math.min(maxDuration, audioDurationSeconds);
      overlay.remove();
      resolve({
        width,
        height,
        maxDurationSeconds,
        useFullAudio,
        videoBitrate,
        audioBitrate: DEFAULT_AUDIO_BITRATE,
        frameRate: DEFAULT_FRAME_RATE,
        primaryNodeId,
        buffer: buf,
        audioDurationSeconds,
      });
    }

    if (primary) {
      durationInput.placeholder = `Audio length: ${primary.buffer.duration.toFixed(1)}s`;
    }

    confirmBtn.addEventListener('click', tryConfirm);
    buttons.appendChild(cancelBtn);
    buttons.appendChild(confirmBtn);
    dialog.appendChild(buttons);
    overlay.appendChild(dialog);

    document.addEventListener('keydown', handleEscape);
    document.body.appendChild(overlay);
    widthInput.focus();
  });
}

/**
 * Show progress overlay with "Frame N / M" and Cancel button. Returns a controller with setProgress and cancel.
 */
function showProgressOverlay(): {
  setProgress: (current: number, total: number) => void;
  cancel: () => void;
  closed: Promise<void>;
} {
  let resolveClosed: () => void;
  const closed = new Promise<void>((r) => {
    resolveClosed = r;
  });

  const overlay = document.createElement('div');
  overlay.className = 'video-export-progress-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: var(--search-dialog-overlay, rgba(0,0,0,0.6));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10001;
    gap: 16px;
  `;

  const text = document.createElement('div');
  text.style.cssText = 'color: #eee; font-size: 16px;';
  text.textContent = 'Frame 0 / 0';
  overlay.appendChild(text);

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'button secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    if (overlay.parentNode) overlay.remove();
    resolveClosed!();
  });
  overlay.appendChild(cancelBtn);

  document.body.appendChild(overlay);

  return {
    setProgress(current: number, total: number) {
      text.textContent = `Frame ${current} / ${total}`;
    },
    cancel() {
      if (overlay.parentNode) overlay.remove();
      resolveClosed!();
    },
    closed,
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

/**
 * Run the full video export flow: dialog → progress → offline loop → save.
 * Throws if WebCodecs not supported, no primary audio, or user cancels.
 */
export async function runVideoExportFlow(options: VideoExportOrchestratorOptions): Promise<void> {
  if (!isSupported()) {
    throw new Error('Video export is not supported in this browser. WebCodecs (VideoEncoder/AudioEncoder) is required.');
  }

  const config = await showExportDialog(options);
  const { graph, compiler } = options;
  const { width, height, maxDurationSeconds, frameRate, primaryNodeId, buffer } = config;
  const sampleRate = buffer.sampleRate;
  const numberOfChannels = buffer.numberOfChannels;
  const maxFrames = Math.max(1, Math.floor(maxDurationSeconds * frameRate));

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

  const progress = showProgressOverlay();
  let cancelled = false;
  progress.closed.then(() => {
    cancelled = true;
  });

  const offlineProvider = createOfflineAudioProvider(
    graph,
    primaryNodeId,
    buffer,
    sampleRate,
    frameRate
  );

  const renderPath = createExportRenderPath(graph, compiler, {
    width,
    height,
    frameRate,
  });

  const exporter = WebCodecsVideoExporter.create({
    width,
    height,
    frameRate,
    sampleRate,
    numberOfChannels,
    videoBitrate: config.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
    audioBitrate: config.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
  });

  try {
    for (let frameIndex = 0; frameIndex < maxFrames; frameIndex++) {
      if (cancelled) {
        exporter.terminate();
        break;
      }
      progress.setProgress(frameIndex + 1, maxFrames);

      const frameState: FrameAudioState = offlineProvider.getFrameState(frameIndex);
      const canvas = renderPath.renderFrame(frameIndex, frameState);
      const timestampSeconds = frameIndex / frameRate;
      await exporter.addFrame(canvas, frameState.channelSamples, timestampSeconds);

      // Yield to UI so progress and cancel are responsive
      await new Promise((r) => setTimeout(r, 0));
    }

    if (cancelled) {
      throw new Error('Export cancelled');
    }

    const data = await exporter.finalize();
    progress.cancel();
    renderPath.dispose();
    downloadBlob(data, defaultFilename());
  } catch (err) {
    exporter.terminate();
    progress.cancel();
    renderPath.dispose();
    throw err;
  }
}
