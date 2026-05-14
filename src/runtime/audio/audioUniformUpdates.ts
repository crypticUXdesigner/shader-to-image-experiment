/**
 * Collects audio uniform updates for the current frame.
 * Extracted from AudioManager.updateUniforms for smaller module size.
 */

import type { AudioSetup } from '../../data-model/audioSetupTypes';
import type { AudioPlaybackController } from './AudioPlaybackController';
import type { FrequencyAnalyzer } from './FrequencyAnalyzer';
import type { UniformUpdate as OfflineUniformUpdate } from '../../video-export/OfflineAudioProvider';

export interface AudioUniformUpdate {
  nodeId: string;
  paramName: string;
  value: number;
}

export interface GraphForUniforms {
  nodes: Array<{ id: string; type: string; parameters: Record<string, unknown> }>;
  connections: Array<{ sourceNodeId: string; targetNodeId: string; targetPort?: string }>;
}

/** Reused each `collectAudioUniformUpdates` call; cleared before fill. Consumers must treat the return as ephemeral (same contract as a fresh array). */
const collectedAudioUniformUpdatesScratch: AudioUniformUpdate[] = [];

/**
 * @internal Vitest — same buffer is returned across calls when length is reset each invocation.
 */
export function getAudioUniformUpdatesScratchBufferForTests(): AudioUniformUpdate[] {
  return collectedAudioUniformUpdatesScratch;
}

/**
 * Remap a band value from [inMin,inMax] to [outMin,outMax].
 */
function remapValue(
  value: number | undefined | null,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number
): number {
  if (value === undefined || value === null) return (outMin + outMax) / 2;
  const range = inMax - inMin;
  const normalized = range !== 0 ? (value - inMin) / range : 0;
  const clamped = Math.max(0, Math.min(1, normalized));
  return outMin + clamped * (outMax - outMin);
}

/**
 * Collect all audio uniform updates (file uniforms, frequency analysis, panel bands, remappers).
 * Mutates previousUniformValues to track last-sent values.
 * @param forcePushAll - When true, push every uniform (for a new shader instance); ignore change threshold.
 */
export function collectAudioUniformUpdates(
  playbackController: AudioPlaybackController,
  frequencyAnalyzer: FrequencyAnalyzer,
  audioSetup: AudioSetup | null,
  previousUniformValues: Map<string, number>,
  threshold: number,
  graph?: GraphForUniforms | null,
  forcePushAll: boolean = false,
  offlineFileUniforms?: Map<string, { getUniformUpdatesAtTime: (timeSeconds: number) => OfflineUniformUpdate[] }>
): AudioUniformUpdate[] {
  const updates = collectedAudioUniformUpdatesScratch;
  updates.length = 0;
  const audioNodeStates = playbackController.getAllAudioNodeStates();

  for (const [nodeId, state] of audioNodeStates.entries()) {
    if (!state.audioBuffer) continue;
    playbackController.updatePlaybackTime(nodeId);

    const currentTimeKey = `${nodeId}.currentTime`;
    const previousCurrentTime = previousUniformValues.get(currentTimeKey) ?? state.currentTime;
    if (forcePushAll || Math.abs(state.currentTime - previousCurrentTime) > threshold) {
      updates.push({ nodeId, paramName: 'currentTime', value: state.currentTime });
      previousUniformValues.set(currentTimeKey, state.currentTime);
    }

    const durationKey = `${nodeId}.duration`;
    const previousDuration = previousUniformValues.get(durationKey) ?? state.duration;
    if (forcePushAll || Math.abs(state.duration - previousDuration) > threshold) {
      updates.push({ nodeId, paramName: 'duration', value: state.duration });
      previousUniformValues.set(durationKey, state.duration);
    }

    const isPlayingValue = state.isPlaying ? 1.0 : 0.0;
    const isPlayingKey = `${nodeId}.isPlaying`;
    const previousIsPlaying = previousUniformValues.get(isPlayingKey) ?? isPlayingValue;
    if (forcePushAll || Math.abs(isPlayingValue - previousIsPlaying) > threshold) {
      updates.push({ nodeId, paramName: 'isPlaying', value: isPlayingValue });
      previousUniformValues.set(isPlayingKey, isPlayingValue);
    }
  }

  const curveUniformProviders = offlineFileUniforms;
  const useCurveSampler = !!(curveUniformProviders && curveUniformProviders.size > 0);

  // Canonical-curve uniforms would otherwise skip FrequencyAnalyzer entirely, which leaves panel
  // analyzers stale: no smoothedBandValues → remap needles hidden, spectrum frozen, virtual-node
  // live reads null. Refresh FFT→smoothing for UI while shader uniforms come from curves below.
  if (useCurveSampler) {
    frequencyAnalyzer.updateFrequencyAnalysis(
      audioNodeStates,
      graph ?? undefined,
      undefined,
      threshold,
      false
    );
  }

  // Preferred live path (Phase 2): when we have a decoded AudioBuffer, sample the same
  // canonical 120 Hz analysis curve used by export and emit those values directly.
  //
  // When provided, offlineFileUniforms should cover all file-backed sources in audioSetup;
  // in that case, we skip the analyser-returned uniform branch + panel remap blocks to avoid duplicates.
  if (useCurveSampler && curveUniformProviders) {
    for (const [fileId, provider] of curveUniformProviders.entries()) {
      const state = audioNodeStates.get(fileId);
      if (!state?.audioBuffer) continue;
      const uniformUpdates = provider.getUniformUpdatesAtTime(state.currentTime);
      for (const u of uniformUpdates) {
        const key = `${u.nodeId}.${u.paramName}`;
        // For the canonical-curve path we must avoid refresh-rate-dependent "update skipping".
        // Export pushes every sampled value; live should do the same so 60 Hz and 120 Hz
        // displays don't diverge due to the change-threshold heuristic.
        updates.push({ nodeId: u.nodeId, paramName: u.paramName, value: u.value });
        previousUniformValues.set(key, u.value);
      }
    }
    return updates;
  }

  // Legacy/live analyser path: FrequencyAnalyzer bands + remaps derived from audioSetup.
  const frequencyUpdates = frequencyAnalyzer.updateFrequencyAnalysis(
    audioNodeStates,
    graph ?? undefined,
    previousUniformValues,
    threshold,
    forcePushAll
  );
  updates.push(...frequencyUpdates);

  if (audioSetup?.bands) {
    for (const band of audioSetup.bands) {
      const analyzerState = frequencyAnalyzer.getAnalyzerNodeState(band.id);
      const bandValue = analyzerState?.smoothedBandValues?.[0];
      const remapped = remapValue(
        bandValue,
        band.remapInMin ?? 0,
        band.remapInMax ?? 1,
        band.remapOutMin ?? 0,
        band.remapOutMax ?? 1
      );
      const key = `${band.id}.remap`;
      const prev = previousUniformValues.get(key);
      if (forcePushAll || prev === undefined || Math.abs(remapped - prev) > threshold) {
        updates.push({ nodeId: band.id, paramName: 'remap', value: remapped });
        previousUniformValues.set(key, remapped);
      }
    }
  }

  if (audioSetup?.remappers) {
    for (const remapper of audioSetup.remappers) {
      const analyzerState = frequencyAnalyzer.getAnalyzerNodeState(remapper.bandId);
      const bandValue = analyzerState?.smoothedBandValues?.[0];
      const remapped = remapValue(
        bandValue,
        remapper.inMin,
        remapper.inMax,
        remapper.outMin,
        remapper.outMax
      );
      const key = `remap-${remapper.id}.out`;
      const prev = previousUniformValues.get(key);
      if (forcePushAll || prev === undefined || Math.abs(remapped - prev) > threshold) {
        updates.push({ nodeId: `remap-${remapper.id}`, paramName: 'out', value: remapped });
        previousUniformValues.set(key, remapped);
      }
    }
  }

  return updates;
}
