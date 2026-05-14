/**
 * Preview-only: pushes `pulseSpawnTimeline` … `pulseSpawnTimeline7` uniforms from (a) audio Schmitt triggers
 * on virtual **Drive**, or (b) **Loop interval** free‑run when Drive has no virtual connection and spawn slots
 * are still defaults. Each write uses the next slot (round‑robin). Uses the same clock as `shaderInstance.setTime`
 * / WGSL `globals.v0.x`.
 */

import type { AudioSetup } from '../../data-model/audioSetupTypes';
import type { Connection, NodeGraph } from '../../data-model/types';
import type { AnalyzerNodeState } from './FrequencyAnalyzer';
import type { PreviewProgramInstance } from '../types';
import { getVirtualNodeLiveValue } from './audioLiveValues';
import { advanceRadialPulseSchmitt } from './radialPulseSchmitt';
import { isVirtualNodeId } from '../../utils/virtualNodes';
import {
  RADIAL_PULSE_SPAWN_SLOT_COUNT,
  radialPulseSpawnTimelineParam
} from '../../shaders/nodes/radial-pulse';

const armedByRadialPulseNodeId = new Map<string, boolean>();
/** Next spawn slot index (0 … SLOT_COUNT−1) for round‑robin `setParameter` targets. */
const nextRadialPulseSpawnSlotByNodeId = new Map<string, number>();
/** Last preview wall time (`shaderTime`) when we fired a loop-interval spawn for a node without virtual Drive. */
const lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId = new Map<string, number>();
/** Slot index next for free‑run bursts (orthogonal to audio round‑robin). */
const nextRadialPulseFreeRunSlotByNodeId = new Map<string, number>();

const radialPulsePruneStaleKeysScratch: string[] = [];

function deleteMapKeysNotInSet(map: Map<string, unknown>, activePulseNodeIds: Set<string>): void {
  const scratch = radialPulsePruneStaleKeysScratch;
  scratch.length = 0;
  for (const id of map.keys()) {
    if (!activePulseNodeIds.has(id)) scratch.push(id);
  }
  for (const id of scratch) {
    map.delete(id);
  }
}

export function clearRadialPulseSpawnArmingState(): void {
  armedByRadialPulseNodeId.clear();
  nextRadialPulseSpawnSlotByNodeId.clear();
  lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId.clear();
  nextRadialPulseFreeRunSlotByNodeId.clear();
}

function pruneStaleArmingRadialPulse(activePulseNodeIds: Set<string>): void {
  deleteMapKeysNotInSet(armedByRadialPulseNodeId as Map<string, unknown>, activePulseNodeIds);
  deleteMapKeysNotInSet(nextRadialPulseSpawnSlotByNodeId as Map<string, unknown>, activePulseNodeIds);
  deleteMapKeysNotInSet(lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId as Map<string, unknown>, activePulseNodeIds);
  deleteMapKeysNotInSet(nextRadialPulseFreeRunSlotByNodeId as Map<string, unknown>, activePulseNodeIds);
}

/** True when graph parameters still reflect “no authored spawn”: every slot absent or below shader inactive threshold (< -9e9). */
function radialPulseSpawnSlotsUnsetFromGraphParams(parameters: Record<string, unknown> | undefined): boolean {
  for (let i = 0; i < RADIAL_PULSE_SPAWN_SLOT_COUNT; i++) {
    const key = radialPulseSpawnTimelineParam(i);
    const v = parameters?.[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= -9e9) {
      return false;
    }
  }
  return true;
}

function findPulseDriveConnection(graph: NodeGraph, nodeId: string): Connection | undefined {
  return graph.connections.find(
    (c) => c.targetNodeId === nodeId && c.targetParameter === 'pulseDrive'
  );
}

function clamp01Param(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  return v;
}

function readPulseFreeRunIntervalSeconds(parameters: Record<string, unknown> | undefined): number {
  const raw = parameters?.pulseFreeRunInterval;
  const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 2.0;
  return Math.max(0, v);
}

/**
 * Run after frequency analysis uniform pass so `getVirtualNodeLiveValue` matches panel/remap needles.
 */
export function applyRadialPulseSpawnUniforms(args: {
  graph: NodeGraph | null | undefined;
  shaderInstance: PreviewProgramInstance | null | undefined;
  shaderTime: number;
  audioSetup: AudioSetup | null | undefined;
  getAnalyzerNodeState: (nodeId: string) => AnalyzerNodeState | undefined;
}): void {
  const { graph, shaderInstance, shaderTime } = args;
  if (!graph?.nodes?.length || !shaderInstance || !Number.isFinite(shaderTime)) {
    return;
  }

  const pulseNodes = graph.nodes.filter((n) => n.type === 'radial-pulse');
  const activeIds = new Set(pulseNodes.map((n) => n.id));
  pruneStaleArmingRadialPulse(activeIds);

  const getAnalyser = args.getAnalyzerNodeState;
  const audioSetup = args.audioSetup ?? null;

  for (const node of pulseNodes) {
    const conn = findPulseDriveConnection(graph, node.id);
    const sourceId = conn?.sourceNodeId;
    const virtualDrive = !!(sourceId && isVirtualNodeId(sourceId));

    if (!virtualDrive) {
      armedByRadialPulseNodeId.delete(node.id);
      nextRadialPulseSpawnSlotByNodeId.delete(node.id);

      const intervalSec = readPulseFreeRunIntervalSeconds(node.parameters);
      if (intervalSec <= 0 || !radialPulseSpawnSlotsUnsetFromGraphParams(node.parameters)) {
        lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId.delete(node.id);
        nextRadialPulseFreeRunSlotByNodeId.delete(node.id);
        continue;
      }

      let lastSpawn = lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId.get(node.id);
      if (lastSpawn === undefined || shaderTime - lastSpawn >= intervalSec - 1e-6) {
        const slot = nextRadialPulseFreeRunSlotByNodeId.get(node.id) ?? 0;
        shaderInstance.setParameter(node.id, radialPulseSpawnTimelineParam(slot), shaderTime);
        nextRadialPulseFreeRunSlotByNodeId.set(node.id, (slot + 1) % RADIAL_PULSE_SPAWN_SLOT_COUNT);
        lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId.set(node.id, shaderTime);
      }

      continue;
    }

    lastRadialPulseFreeRunSpawnAtShaderTimeByNodeId.delete(node.id);
    nextRadialPulseFreeRunSlotByNodeId.delete(node.id);

    const signal = getVirtualNodeLiveValue(sourceId, audioSetup, getAnalyser);
    if (signal == null || !Number.isFinite(signal)) {
      continue;
    }

    const rise = clamp01Param(node.parameters.pulseRiseThreshold, 0.55);
    const fall = clamp01Param(node.parameters.pulseFallThreshold, 0.35);

    const prevArmed = armedByRadialPulseNodeId.get(node.id) ?? true;
    const { armed, fired } = advanceRadialPulseSchmitt(prevArmed, signal, rise, fall);
    armedByRadialPulseNodeId.set(node.id, armed);

    if (fired) {
      const slot = nextRadialPulseSpawnSlotByNodeId.get(node.id) ?? 0;
      shaderInstance.setParameter(node.id, radialPulseSpawnTimelineParam(slot), shaderTime);
      nextRadialPulseSpawnSlotByNodeId.set(node.id, (slot + 1) % RADIAL_PULSE_SPAWN_SLOT_COUNT);
    }
  }
}
