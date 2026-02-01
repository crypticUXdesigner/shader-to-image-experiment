/**
 * WebCodecs-based video exporter for shader-composer video export.
 *
 * Wraps Mediabunny (Output + CanvasSource + AudioBufferSource) to produce MP4
 * from per-frame canvas and audio. No dependency on NodeGraph or AudioManager.
 * API: create(config), addFrame(canvas, audioChannels, timestampSeconds),
 * finalize() → Uint8Array, terminate().
 */

import {
  Output,
  Mp4OutputFormat,
  BufferTarget,
  CanvasSource,
  AudioBufferSource,
  QUALITY_HIGH,
  type VideoEncodingConfig,
  type AudioEncodingConfig,
} from 'mediabunny';
import {
  MAX_SAMPLES_PER_FRAME,
  MAX_EXPORT_BUFFER_BYTES,
  formatExportLimitError,
} from './exportLimits';

// --- Config and API types ---

export interface VideoExportConfig {
  width: number;
  height: number;
  frameRate: number;
  sampleRate: number;
  numberOfChannels: number;
  videoBitrate?: number;
  audioBitrate?: number;
}

export interface WebCodecsVideoExporterInterface {
  addFrame(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    audioChannels: Float32Array[],
    timestampSeconds: number
  ): Promise<void>;
  finalize(): Promise<Uint8Array>;
  terminate(): void;
}

// --- Support check (WebCodecs) ---

/**
 * Returns true if VideoEncoder and AudioEncoder are available (required for export).
 */
export function isSupported(): boolean {
  return typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
}

// --- Exporter implementation ---

/**
 * WebCodecs-based video exporter. Uses Mediabunny for MP4 muxing;
 * video from CanvasSource (captures canvas per frame), audio from AudioBufferSource (per-frame buffers).
 */
export class WebCodecsVideoExporter implements WebCodecsVideoExporterInterface {
  private readonly config: VideoExportConfig;
  private output: Output | null = null;
  private videoSource: CanvasSource | null = null;
  private audioSource: AudioBufferSource | null = null;
  private startPromise: Promise<void> | null = null;
  private terminated = false;

  private constructor(config: VideoExportConfig) {
    this.config = { ...config };
  }

  /**
   * Create an exporter instance. Tracks are created on first addFrame (lazy init).
   */
  static create(config: VideoExportConfig): WebCodecsVideoExporter {
    return new WebCodecsVideoExporter(config);
  }

  private async ensureStarted(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (this.terminated) {
      throw new Error('Exporter has been terminated');
    }
    if (this.startPromise !== null) {
      await this.startPromise;
      return;
    }

    // Use Quality-based bitrate for better visual quality (less compression artifacts);
    // override with explicit videoBitrate when provided.
    const videoBitrate = this.config.videoBitrate ?? QUALITY_HIGH;
    const audioBitrate = this.config.audioBitrate ?? 192_000;

    const videoConfig: VideoEncodingConfig = {
      codec: 'avc',
      bitrate: videoBitrate,
      keyFrameInterval: 1,
      latencyMode: 'quality',
    };

    const format = new Mp4OutputFormat();
    const target = new BufferTarget();
    this.output = new Output({ format, target });

    this.videoSource = new CanvasSource(canvas, videoConfig);
    this.output.addVideoTrack(this.videoSource);

    if (this.config.numberOfChannels > 0) {
      const audioConfig: AudioEncodingConfig = {
        codec: 'aac',
        bitrate: audioBitrate,
      };
      this.audioSource = new AudioBufferSource(audioConfig);
      this.output.addAudioTrack(this.audioSource);
    }

    this.startPromise = this.output.start();
    await this.startPromise;
  }

  private get frameDurationSeconds(): number {
    return 1 / this.config.frameRate;
  }

  /**
   * Add one frame: capture current canvas as video frame and optional audio chunk.
   * Must be called in increasing timestamp order. First call initializes the output.
   */
  async addFrame(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    audioChannels: Float32Array[],
    timestampSeconds: number
  ): Promise<void> {
    if (this.terminated) {
      return;
    }

    await this.ensureStarted(canvas);

    const output = this.output!;
    if (output.state === 'canceled' || output.state === 'finalizing' || output.state === 'finalized') {
      return;
    }

    const videoSource = this.videoSource!;
    await videoSource.add(timestampSeconds, this.frameDurationSeconds);

    if (this.audioSource && this.config.numberOfChannels > 0) {
      const samplesPerFrame = Math.round(
        this.config.sampleRate / this.config.frameRate
      );
      if (samplesPerFrame > MAX_SAMPLES_PER_FRAME) {
        throw new Error(
          formatExportLimitError({
            limitName: 'samples per frame',
            limitValue: MAX_SAMPLES_PER_FRAME,
            actualValue: samplesPerFrame,
            hint: 'Use a higher frame rate or lower sample rate.',
          })
        );
      }
      const audioBuffer = this.createAudioBufferFromChannels(
        audioChannels,
        samplesPerFrame
      );
      await this.audioSource.add(audioBuffer);
    }
  }

  private createAudioBufferFromChannels(
    audioChannels: Float32Array[],
    length: number
  ): AudioBuffer {
    const { numberOfChannels, sampleRate } = this.config;
    const ctx = new OfflineAudioContext(
      numberOfChannels,
      length,
      sampleRate
    );
    const buffer = ctx.createBuffer(numberOfChannels, length, sampleRate);
    for (let c = 0; c < numberOfChannels; c++) {
      const channelData = buffer.getChannelData(c);
      const channel = audioChannels[c];
      if (channel && channel.length >= length) {
        channelData.set(channel.subarray(0, length));
      }
      // else leave as zeros (silent frame)
    }
    return buffer;
  }

  /**
   * Flush encoders and mux to a single buffer. Call after all frames have been added.
   */
  async finalize(): Promise<Uint8Array> {
    if (this.terminated) {
      throw new Error('Exporter has been terminated; cannot finalize');
    }

    if (!this.output) {
      throw new Error('No frames were added; cannot finalize');
    }

    const output = this.output;
    if (output.state === 'canceled') {
      throw new Error('Output was canceled; cannot finalize');
    }

    await this.videoSource?.close();
    await this.audioSource?.close();
    await output.finalize();

    const target = output.target as BufferTarget;
    const buffer = target.buffer;
    if (!buffer) {
      throw new Error('Muxer did not produce a buffer');
    }

    const byteLength = buffer.byteLength;
    if (byteLength > MAX_EXPORT_BUFFER_BYTES) {
      throw new Error(
        formatExportLimitError({
          limitName: 'output buffer size (bytes)',
          limitValue: MAX_EXPORT_BUFFER_BYTES,
          actualValue: byteLength,
          hint: 'Shorten duration, lower resolution, or lower bitrate.',
        })
      );
    }

    try {
      this.cleanup();
      return new Uint8Array(buffer);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new Error(
          formatExportLimitError({
            limitName: 'output buffer size (bytes)',
            limitValue: MAX_EXPORT_BUFFER_BYTES,
            actualValue: byteLength,
            hint: 'Shorten duration, lower resolution, or lower bitrate.',
          })
        );
      }
      throw err;
    }
  }

  /**
   * Cancel export and release resources. Idempotent. After terminate(), addFrame and finalize do nothing or throw.
   */
  terminate(): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    if (this.output && this.output.state !== 'canceled' && this.output.state !== 'finalized') {
      this.output.cancel();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.output = null;
    this.videoSource = null;
    this.audioSource = null;
  }
}
