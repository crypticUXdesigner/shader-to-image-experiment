/**
 * Preview dependency summary for compile output (plan §4).
 * When in doubt for safety-critical motion (audio-driven preview), prefer true for `usesAudioUniforms`
 * only if panel audio uniforms are actually present in `uniforms` (wired into the shader).
 */

import type { NodeGraph } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { getPrimaryFileId, type AudioSetup } from '../../data-model/audioSetupTypes';
import type { PreviewDependencyMask, UniformMetadata } from '../../runtime/types';
import { isVirtualNodeId } from '../../utils/virtualNodes';
import { RADIAL_PULSE_SPAWN_SLOT_COUNT, radialPulseSpawnTimelineParam } from '../nodes/radial-pulse';
import { isAudioNode } from './NodeShaderCompilerHelpers';

function computeUpstreamReachableNodeIds(graph: NodeGraph, outputNodeId: string): Set<string> {
  const upstreamByTarget = new Map<string, string[]>();
  for (const c of graph.connections) {
    const list = upstreamByTarget.get(c.targetNodeId);
    if (list) list.push(c.sourceNodeId);
    else upstreamByTarget.set(c.targetNodeId, [c.sourceNodeId]);
  }

  const reachable = new Set<string>();
  const stack: string[] = [outputNodeId];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const ups = upstreamByTarget.get(id);
    if (!ups) continue;
    for (const srcId of ups) stack.push(srcId);
  }
  return reachable;
}

/**
 * True when a radial-pulse on the preview path has Drive wired to a virtual audio signal.
 * Spawn timing for that node is evaluated in TS (`applyRadialPulseSpawnUniforms`), not via shader
 * uniforms — so remap/band uniforms may be absent while we still must run the audio-uniform cadence.
 */
function usesReachableRadialPulseVirtualDrive(graph: NodeGraph): boolean {
  const finalOut = graph.nodes.find((n) => n.type === 'final-output');
  if (!finalOut) return false;
  const reachable = computeUpstreamReachableNodeIds(graph, finalOut.id);

  for (const c of graph.connections) {
    if (c.targetParameter !== 'pulseDrive') continue;
    if (!reachable.has(c.targetNodeId)) continue;
    const target = graph.nodes.find((n) => n.id === c.targetNodeId);
    if (!target || target.type !== 'radial-pulse') continue;
    if (isVirtualNodeId(c.sourceNodeId)) {
      return true;
    }
  }
  return false;
}

/** Matches `radialPulsePreviewSpawn.ts`: authored spawn timelines disable loop-interval spawning. */
function radialPulseSpawnSlotsUnsetForMask(parameters: Record<string, unknown> | undefined): boolean {
  for (let i = 0; i < RADIAL_PULSE_SPAWN_SLOT_COUNT; i++) {
    const key = radialPulseSpawnTimelineParam(i);
    const v = parameters?.[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= -9e9) {
      return false;
    }
  }
  return true;
}

function readPulseFreeRunIntervalForMask(
  params: Record<string, unknown> | undefined,
  radialSpec: NodeSpec | undefined
): number {
  const raw = params?.pulseFreeRunInterval;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, raw);
  }
  const d = radialSpec?.parameters?.pulseFreeRunInterval?.default;
  return typeof d === 'number' && Number.isFinite(d) ? Math.max(0, d) : 2;
}

/** Preview loop interval spawns when Drive has no virtual audio connection and graph spawns are unset. */
function usesReachableRadialPulseFreeRunInterval(graph: NodeGraph, nodeSpecs: Map<string, NodeSpec>): boolean {
  const finalOut = graph.nodes.find((n) => n.type === 'final-output');
  if (!finalOut) return false;
  const reachable = computeUpstreamReachableNodeIds(graph, finalOut.id);
  const radialSpec = nodeSpecs.get('radial-pulse');

  for (const node of graph.nodes) {
    if (node.type !== 'radial-pulse' || !reachable.has(node.id)) continue;
    const conn = graph.connections.find(
      (c) => c.targetNodeId === node.id && c.targetParameter === 'pulseDrive'
    );
    const sourceId = conn?.sourceNodeId;
    if (sourceId != null && isVirtualNodeId(sourceId)) continue;
    if (!radialPulseSpawnSlotsUnsetForMask(node.parameters as Record<string, unknown>)) continue;
    if (readPulseFreeRunIntervalForMask(node.parameters as Record<string, unknown>, radialSpec) > 0) {
      return true;
    }
  }
  return false;
}

/** Primary audio file uniforms drive transport-dependent preview. */
const PRIMARY_AUDIO_UNIFORM_PARAMS = new Set(['currentTime', 'duration', 'isPlaying']);

/**
 * Derive preview dependency flags from compiled shader artifacts.
 * @param shaderCode - Final fragment shader source (globals may appear only here, not in `uniforms`).
 */
export function computePreviewDependencyMask(
  graph: NodeGraph,
  uniforms: UniformMetadata[],
  shaderCode: string,
  nodeSpecs: Map<string, NodeSpec>,
  _audioSetup: AudioSetup | null | undefined
): PreviewDependencyMask {
  const code = shaderCode;

  const usesWallTime = /\buTime\b/.test(code);
  const usesTimelineTime = /\buTimelineTime\b/.test(code);
  const usesResolutionUniform = /\buResolution\b/.test(code);

  let usesAudioUniforms = false;
  for (const u of uniforms) {
    if (u.paramName === 'band' || u.paramName === 'remap') {
      usesAudioUniforms = true;
      break;
    }
    if (u.nodeId.startsWith('remap-') && u.paramName === 'out') {
      usesAudioUniforms = true;
      break;
    }
    if (PRIMARY_AUDIO_UNIFORM_PARAMS.has(u.paramName)) {
      usesAudioUniforms = true;
      break;
    }
    const node = graph.nodes.find((n) => n.id === u.nodeId);
    const spec = node ? nodeSpecs.get(node.type) : undefined;
    if (spec && isAudioNode(spec)) {
      usesAudioUniforms = true;
      break;
    }
  }

  const usesRadialPulseVirtualDrive = usesReachableRadialPulseVirtualDrive(graph);
  const usesRadialPulseSpawnUniformPass =
    usesRadialPulseVirtualDrive || usesReachableRadialPulseFreeRunInterval(graph, nodeSpecs);

  let usesMouseUniforms = false;
  let usesFrameIndex = false;
  for (const node of graph.nodes) {
    const t = node.type.toLowerCase();
    if (t.includes('mouse') || t.includes('pointer') || t.includes('cursor')) {
      usesMouseUniforms = true;
    }
    if (t.includes('frame') && t.includes('index')) {
      usesFrameIndex = true;
    }
  }

  return {
    usesWallTime,
    usesTimelineTime,
    usesAudioUniforms,
    usesRadialPulseVirtualDrive,
    usesRadialPulseSpawnUniformPass,
    usesResolutionUniform,
    usesMouseUniforms,
    usesFrameIndex
  };
}

/**
 * Preview deps for WGSL MVP: GLSL-oriented regexes don't apply; combine graph reachability
 * (time/resolution nodes) with WGSL text hints and uniform-based audio detection.
 */
export function computePreviewDependencyMaskForWgslMvp(
  graph: NodeGraph,
  uniforms: UniformMetadata[],
  wgslCode: string,
  nodeSpecs: Map<string, NodeSpec>,
  audioSetup: AudioSetup | null | undefined,
  finalOutputNodeId: string | null
): PreviewDependencyMask {
  const reachable =
    finalOutputNodeId != null ? computeUpstreamReachableNodeIds(graph, finalOutputNodeId) : new Set<string>();

  const hasTimeNode = graph.nodes.some((n) => reachable.has(n.id) && n.type === 'time');
  const hasResolutionNode = graph.nodes.some((n) => reachable.has(n.id) && n.type === 'resolution');

  const usesWallTime = hasTimeNode || /\buTime\b/.test(wgslCode) || /\bglobals\.v0\.x\b/.test(wgslCode);
  const usesTimelineTime = /\buTimelineTime\b/.test(wgslCode) || /\bglobals\.v0\.y\b/.test(wgslCode);

  const baseAudioAndMouse = computePreviewDependencyMask(graph, uniforms, wgslCode, nodeSpecs, audioSetup);

  // Any primary transport (playlist id, upload file, or legacy first file) can trigger follow-up
  // compiles and runtime sync; keep a wall-clock preview cadence so {@link TimeManager} never
  // treats the session as "idle" when primary-backed uniforms are missing from this snapshot
  // (e.g. timing vs. uniform list) or WGSL time hints are incomplete.
  const primaryDrivesPreviewTransport = getPrimaryFileId(audioSetup) != null;

  return {
    usesWallTime: usesWallTime || primaryDrivesPreviewTransport,
    usesTimelineTime,
    usesAudioUniforms: baseAudioAndMouse.usesAudioUniforms,
    usesRadialPulseVirtualDrive: baseAudioAndMouse.usesRadialPulseVirtualDrive,
    usesRadialPulseSpawnUniformPass: baseAudioAndMouse.usesRadialPulseSpawnUniformPass,
    usesResolutionUniform: hasResolutionNode || baseAudioAndMouse.usesResolutionUniform,
    usesMouseUniforms: baseAudioAndMouse.usesMouseUniforms,
    usesFrameIndex: baseAudioAndMouse.usesFrameIndex
  };
}

/**
 * WebGPU pass-plan results compile upstream WGSL separately; {@link computePreviewDependencyMaskForWgslMvp}
 * only sees that fragment string, while blur/bokeh/etc. stages still consume `globals` every frame.
 * Panel audio uniforms (`usesAudioUniforms`) can drive motion via `params[]` without `globals.v0.x`
 * appearing in that substring — after `setAudioSetup` recompiles, {@link TimeManager} would otherwise
 * treat the program as non–wall-clock and throttle/batch presents in a way that looks “frozen”.
 * Merge OR-forces `usesWallTime` when a pass plan exists **or** when audio uniforms are in play.
 */
export function mergeWebGpuPreviewDependencyMask(
  computed: PreviewDependencyMask,
  provided: PreviewDependencyMask | null | undefined,
  hasWebGpuPassPlan: boolean
): PreviewDependencyMask {
  const forceWallClockPreview =
    hasWebGpuPassPlan || computed.usesAudioUniforms || !!provided?.usesAudioUniforms;
  if (provided == null && !forceWallClockPreview) return computed;
  return {
    usesWallTime: computed.usesWallTime || !!provided?.usesWallTime || forceWallClockPreview,
    usesTimelineTime: computed.usesTimelineTime || !!provided?.usesTimelineTime,
    usesAudioUniforms: computed.usesAudioUniforms || !!provided?.usesAudioUniforms,
    usesRadialPulseVirtualDrive: computed.usesRadialPulseVirtualDrive || !!provided?.usesRadialPulseVirtualDrive,
    usesRadialPulseSpawnUniformPass:
      computed.usesRadialPulseSpawnUniformPass || !!provided?.usesRadialPulseSpawnUniformPass,
    usesResolutionUniform: computed.usesResolutionUniform || !!provided?.usesResolutionUniform,
    usesMouseUniforms: computed.usesMouseUniforms || !!provided?.usesMouseUniforms,
    usesFrameIndex: computed.usesFrameIndex || !!provided?.usesFrameIndex
  };
}
