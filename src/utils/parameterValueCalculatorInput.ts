/**
 * Resolve input connection values and trackability.
 * Extracted from parameterValueCalculator for smaller module size.
 */

import type { NodeGraph, NodeInstance, Connection } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import type { IAudioManager } from '../runtime/types';
import type {
  SignalBinding,
  AudioSignalSource,
} from '../data-model/signals';
import { createAudioSignalBinding } from '../data-model/signals';
import {
  isVirtualNodeId,
  getSignalIdFromVirtualNodeId,
  getVirtualNodeId,
} from './virtualNodes';
import {
  evaluateMixedWaveSignalPreview,
  getShaderTimeSeconds,
} from './mixedWaveSignalPreview';
import { evaluateOscillator2dPortPreview } from './oscillator2dPreview';

const MAX_INPUT_CHAIN_DEPTH = 8;

function evaluateAudioSignalBinding(
  binding: SignalBinding<number>,
  audioManager: IAudioManager | undefined,
): number | null {
  if (!audioManager?.getVirtualNodeLiveValue) return null;
  const source = binding.source as AudioSignalSource;
  if (source.kind !== 'audio') return null;
  const virtualNodeId = getVirtualNodeId(source.audioSignalId);
  const value = audioManager.getVirtualNodeLiveValue(virtualNodeId);
  return typeof value === 'number' && !isNaN(value) ? value : null;
}

function readNumericNodeParam(node: NodeInstance, key: string, fallback: number): number {
  const v = node.parameters[key];
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

/**
 * Vec4 preview for the wire feeding split-vector `in` (subset of GPU types).
 * Returns null when the upstream node has no CPU evaluator (e.g. complex color nodes).
 */
function evaluateVec4FromNodeOutput(
  sourceNodeId: string,
  sourcePort: string,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager: IAudioManager | undefined,
  depth: number
): readonly [number, number, number, number] | null {
  if (depth > MAX_INPUT_CHAIN_DEPTH) return null;
  if (sourcePort !== 'out') return null;
  const src = graph.nodes.find((n) => n.id === sourceNodeId);
  if (!src) return null;

  if (src.type === 'constant-vec3') {
    return [
      readNumericNodeParam(src, 'x', 0),
      readNumericNodeParam(src, 'y', 0),
      readNumericNodeParam(src, 'z', 0),
      1,
    ] as const;
  }
  if (src.type === 'constant-vec4') {
    return [
      readNumericNodeParam(src, 'x', 0),
      readNumericNodeParam(src, 'y', 0),
      readNumericNodeParam(src, 'z', 0),
      readNumericNodeParam(src, 'w', 1),
    ] as const;
  }
  if (src.type === 'combine-vector') {
    const otRaw = src.parameters.outputType;
    const ot =
      typeof otRaw === 'number' && isFinite(otRaw)
        ? Math.max(2, Math.min(4, Math.round(otRaw)))
        : 2;
    const x = getNodeInputPortValue(src.id, 'x', graph, nodeSpecs, audioManager, depth + 1);
    const y = getNodeInputPortValue(src.id, 'y', graph, nodeSpecs, audioManager, depth + 1);
    const z = getNodeInputPortValue(src.id, 'z', graph, nodeSpecs, audioManager, depth + 1);
    const w = getNodeInputPortValue(src.id, 'w', graph, nodeSpecs, audioManager, depth + 1);
    const vx = x !== null && isFinite(x) ? x : 0;
    const vy = y !== null && isFinite(y) ? y : 0;
    const vz = z !== null && isFinite(z) ? z : readNumericNodeParam(src, 'z', 0);
    const vw = w !== null && isFinite(w) ? w : readNumericNodeParam(src, 'w', 1);
    if (ot === 2) return [vx, vy, 0, 1] as const;
    if (ot === 3) return [vx, vy, vz, 1] as const;
    return [vx, vy, vz, vw] as const;
  }
  return null;
}

function evaluateVec4IntoSplitVectorIn(
  splitNodeId: string,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager: IAudioManager | undefined,
  depth: number
): readonly [number, number, number, number] | null {
  const inConn = graph.connections.find(
    (c) => !c.disabled && c.targetNodeId === splitNodeId && c.targetPort === 'in'
  );
  if (!inConn) return null;
  return evaluateVec4FromNodeOutput(
    inConn.sourceNodeId,
    inConn.sourcePort,
    graph,
    nodeSpecs,
    audioManager,
    depth + 1
  );
}

function isVec4SourceTrackable(
  conn: Connection,
  graph: NodeGraph,
  depth: number,
  nodeSpecs: Map<string, NodeSpec> | undefined
): boolean {
  if (!nodeSpecs || depth > MAX_INPUT_CHAIN_DEPTH) return false;
  const src = graph.nodes.find((n) => n.id === conn.sourceNodeId);
  if (!src) return false;
  if (src.type === 'constant-vec3' || src.type === 'constant-vec4') {
    return conn.sourcePort === 'out';
  }
  if (src.type === 'combine-vector' && conn.sourcePort === 'out') {
    for (const portName of ['x', 'y', 'z', 'w']) {
      const inConn = graph.connections.find(
        (c) => !c.disabled && c.targetNodeId === src.id && c.targetPort === portName
      );
      if (inConn && !isConnectionTrackable(inConn, graph, depth + 1, nodeSpecs)) {
        return false;
      }
    }
    return true;
  }
  return false;
}

function getNodeInputPortValue(
  nodeId: string,
  portName: string,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager: IAudioManager | undefined,
  depth: number
): number | null {
  const conn = graph.connections.find(
    (c) => !c.disabled && c.targetNodeId === nodeId && c.targetPort === portName
  );
  if (!conn) {
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const spec = nodeSpecs.get(node.type);
    if (!spec?.inputs) return null;
    const inputSpec = spec.inputs.find(i => i.name === portName);
    if (!inputSpec?.fallbackParameter) return null;
    const paramNames = inputSpec.fallbackParameter.split(',').map(s => s.trim()).filter(Boolean);
    if (paramNames.length !== 1) return null;
    const paramName = paramNames[0];
    const paramSpec = spec.parameters && paramName in spec.parameters ? spec.parameters[paramName] : undefined;
    if (!paramSpec) return null;
    const v = node.parameters[paramName];
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof paramSpec.default === 'number') return paramSpec.default;
    return paramSpec.type === 'int' ? 0 : 0.0;
  }
  return getInputValue(conn, graph, nodeSpecs, audioManager, depth);
}

/**
 * Get the current value from an input connection.
 * Exported for use by computeEffectiveParameterValue.
 */
export function getInputValue(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager,
  depth: number = 0
): number | null {
  if (depth > MAX_INPUT_CHAIN_DEPTH) return null;

  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode) {
    if (isVirtualNodeId(connection.sourceNodeId) && connection.sourcePort === 'out') {
      const signalId = getSignalIdFromVirtualNodeId(connection.sourceNodeId);
      if (!signalId) return null;
      const binding = createAudioSignalBinding<number>(
        `audio:${signalId}`,
        signalId,
        0,
      ) as SignalBinding<number>;
      const value = evaluateAudioSignalBinding(binding, audioManager);
      return value !== null && typeof value === 'number' && !isNaN(value)
        ? value
        : null;
    }
    return null;
  }

  const sourceSpec = nodeSpecs.get(sourceNode.type);
  if (!sourceSpec) return null;

  if (sourceNode.type === 'constant-float') {
    if (connection.sourcePort !== 'out') return null;
    const v = sourceNode.parameters['value'];
    return typeof v === 'number' && !isNaN(v) ? v : 0;
  }
  if (sourceNode.type === 'time') {
    if (connection.sourcePort !== 'out') return null;
    return getShaderTimeSeconds();
  }

  if (sourceNode.type === 'mixed-wave-signal') {
    if (connection.sourcePort !== 'out') return null;
    return evaluateMixedWaveSignalPreview(sourceNode, {
      graph,
      nodeSpecs,
      audioManager: audioManager ?? undefined,
    });
  }

  if (sourceNode.type === 'oscillator-2d') {
    if (connection.sourcePort === 'x' || connection.sourcePort === 'y') {
      return evaluateOscillator2dPortPreview(
        sourceNode,
        connection.sourcePort
      );
    }
    return null;
  }

  if (sourceNode.type === 'split-vector') {
    const p = connection.sourcePort;
    if (p !== 'x' && p !== 'y' && p !== 'z' && p !== 'w') return null;
    const v4 = evaluateVec4IntoSplitVectorIn(
      sourceNode.id,
      graph,
      nodeSpecs,
      audioManager,
      depth
    );
    if (!v4) return null;
    const idx = p === 'x' ? 0 : p === 'y' ? 1 : p === 'z' ? 2 : 3;
    return v4[idx];
  }

  if (sourceNode.type === 'one-minus') {
    const inConn = graph.connections.find(
      (c) => !c.disabled && c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return null;
    const inValue = getInputValue(inConn, graph, nodeSpecs, audioManager, depth + 1);
    if (inValue === null) return null;
    return 1.0 - inValue;
  }
  if (sourceNode.type === 'negate') {
    const inConn = graph.connections.find(
      (c) => !c.disabled && c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return null;
    const inValue = getInputValue(inConn, graph, nodeSpecs, audioManager, depth + 1);
    if (inValue === null) return null;
    return -inValue;
  }
  const sid = sourceNode.id;
  const d = depth + 1;
  const g = graph;
  const specs = nodeSpecs;
  const audio = audioManager;

  const getA = () => getNodeInputPortValue(sid, 'a', g, specs, audio, d);
  const getB = () => getNodeInputPortValue(sid, 'b', g, specs, audio, d);
  const getIn = () => getNodeInputPortValue(sid, 'in', g, specs, audio, d);
  const getBase = () => getNodeInputPortValue(sid, 'base', g, specs, audio, d);
  const getExp = () => getNodeInputPortValue(sid, 'exponent', g, specs, audio, d);
  const getMin = () => getNodeInputPortValue(sid, 'min', g, specs, audio, d);
  const getMax = () => getNodeInputPortValue(sid, 'max', g, specs, audio, d);
  const getT = () => getNodeInputPortValue(sid, 't', g, specs, audio, d);
  const getEdge = () => getNodeInputPortValue(sid, 'edge', g, specs, audio, d);
  const getEdge0 = () => getNodeInputPortValue(sid, 'edge0', g, specs, audio, d);
  const getEdge1 = () => getNodeInputPortValue(sid, 'edge1', g, specs, audio, d);
  const getX = () => getNodeInputPortValue(sid, 'x', g, specs, audio, d);
  const getY = () => getNodeInputPortValue(sid, 'y', g, specs, audio, d);
  const getBg = () => getNodeInputPortValue(sid, 'bg', g, specs, audio, d);
  const getMask = () => getNodeInputPortValue(sid, 'mask', g, specs, audio, d);
  const getFg = () => getNodeInputPortValue(sid, 'fg', g, specs, audio, d);

  if (sourceNode.type === 'add') { const a = getA(), b = getB(); if (a === null || b === null) return null; return a + b; }
  if (sourceNode.type === 'subtract') { const a = getA(), b = getB(); if (a === null || b === null) return null; return a - b; }
  if (sourceNode.type === 'multiply') { const a = getA(), b = getB(); if (a === null || b === null) return null; return a * b; }
  if (sourceNode.type === 'divide') { const a = getA(), b = getB(); if (a === null || b === null || b === 0) return null; return a / b; }
  if (sourceNode.type === 'power') { const base = getBase(), exp = getExp(); if (base === null || exp === null) return null; return Math.pow(base, exp); }
  if (sourceNode.type === 'square-root') { const x = getIn(); if (x === null || x < 0) return null; return Math.sqrt(x); }
  if (sourceNode.type === 'absolute') { const x = getIn(); if (x === null) return null; return Math.abs(x); }
  if (sourceNode.type === 'floor') { const x = getIn(); if (x === null) return null; return Math.floor(x); }
  if (sourceNode.type === 'ceil') { const x = getIn(); if (x === null) return null; return Math.ceil(x); }
  if (sourceNode.type === 'fract') { const x = getIn(); if (x === null) return null; return x - Math.floor(x); }
  if (sourceNode.type === 'modulo') { const a = getA(), b = getB(); if (a === null || b === null || b === 0) return null; return ((a % b) + b) % b; }
  if (sourceNode.type === 'min') { const a = getA(), b = getB(); if (a === null || b === null) return null; return Math.min(a, b); }
  if (sourceNode.type === 'max') { const a = getA(), b = getB(); if (a === null || b === null) return null; return Math.max(a, b); }
  if (sourceNode.type === 'clamp') { const x = getIn(), mn = getMin(), mx = getMax(); if (x === null || mn === null || mx === null) return null; return Math.max(mn, Math.min(mx, x)); }
  if (sourceNode.type === 'mix') { const a = getA(), b = getB(), t = getT(); if (a === null || b === null || t === null) return null; return a + t * (b - a); }
  if (sourceNode.type === 'mask-composite-float') {
    const bg = getBg(), mask = getMask(), fg = getFg();
    if (bg === null || mask === null || fg === null) return null;
    const inv = sourceNode.parameters.invert === 1;
    const m = inv ? 1 - mask : mask;
    return bg + m * (fg - bg);
  }
  if (sourceNode.type === 'step') { const edge = getEdge(), x = getX(); if (edge === null || x === null) return null; return x < edge ? 0 : 1; }
  if (sourceNode.type === 'smoothstep') {
    const edge0 = getEdge0(), edge1 = getEdge1(), x = getX();
    if (edge0 === null || edge1 === null || x === null) return null;
    const t = edge0 !== edge1 ? Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))) : (x >= edge1 ? 1 : 0);
    return t * t * (3 - 2 * t);
  }
  if (sourceNode.type === 'sine') { const x = getIn(); if (x === null) return null; return Math.sin(x); }
  if (sourceNode.type === 'cosine') { const x = getIn(); if (x === null) return null; return Math.cos(x); }
  if (sourceNode.type === 'tangent') { const x = getIn(); if (x === null) return null; return Math.tan(x); }
  if (sourceNode.type === 'arc-sine') { const x = getIn(); if (x === null || x < -1 || x > 1) return null; return Math.asin(x); }
  if (sourceNode.type === 'arc-cosine') { const x = getIn(); if (x === null || x < -1 || x > 1) return null; return Math.acos(x); }
  if (sourceNode.type === 'arc-tangent') { const x = getIn(); if (x === null) return null; return Math.atan(x); }
  if (sourceNode.type === 'arc-tangent-2') { const y = getY(), x = getX(); if (y === null || x === null) return null; return Math.atan2(y, x); }
  if (sourceNode.type === 'exponential') { const x = getIn(); if (x === null) return null; return Math.exp(x); }
  if (sourceNode.type === 'natural-logarithm') { const x = getIn(); if (x === null || x <= 0) return null; return Math.log(x); }
  if (sourceNode.type === 'reciprocal') { const x = getIn(); if (x === null || x === 0) return null; return 1 / x; }
  if (sourceNode.type === 'remap') {
    const x = getNodeInputPortValue(sid, 'in', g, specs, audio, d);
    if (x === null) return null;
    const inMin = getNodeInputPortValue(sid, 'inMin', g, specs, audio, d) ?? (typeof sourceNode.parameters.inMin === 'number' ? sourceNode.parameters.inMin : 0);
    const inMax = getNodeInputPortValue(sid, 'inMax', g, specs, audio, d) ?? (typeof sourceNode.parameters.inMax === 'number' ? sourceNode.parameters.inMax : 1);
    const outMin = getNodeInputPortValue(sid, 'outMin', g, specs, audio, d) ?? (typeof sourceNode.parameters.outMin === 'number' ? sourceNode.parameters.outMin : 0);
    const outMax = getNodeInputPortValue(sid, 'outMax', g, specs, audio, d) ?? (typeof sourceNode.parameters.outMax === 'number' ? sourceNode.parameters.outMax : 1);
    const range = inMax - inMin;
    const t = range !== 0 ? (x - inMin) / range : 0;
    return outMin + t * (outMax - outMin);
  }
  if (sourceNode.type === 'clamp-01' || sourceNode.type === 'saturate') { const x = getIn(); if (x === null) return null; return Math.max(0, Math.min(1, x)); }
  if (sourceNode.type === 'sign') { const x = getIn(); if (x === null) return null; return x < 0 ? -1 : x > 0 ? 1 : 0; }
  return null;
}

const TRACKABLE_NODE_INPUT_PORTS: Record<string, string[]> = {
  'add': ['a', 'b'], 'subtract': ['a', 'b'], 'multiply': ['a', 'b'], 'divide': ['a', 'b'],
  'power': ['base', 'exponent'], 'square-root': ['in'], 'absolute': ['in'], 'floor': ['in'], 'ceil': ['in'], 'fract': ['in'],
  'modulo': ['a', 'b'], 'min': ['a', 'b'], 'max': ['a', 'b'], 'clamp': ['in', 'min', 'max'], 'mix': ['a', 'b', 't'],
  'step': ['edge', 'x'], 'smoothstep': ['edge0', 'edge1', 'x'],
  'sine': ['in'], 'cosine': ['in'], 'tangent': ['in'], 'arc-sine': ['in'], 'arc-cosine': ['in'], 'arc-tangent': ['in'], 'arc-tangent-2': ['y', 'x'],
  'exponential': ['in'], 'natural-logarithm': ['in'], 'reciprocal': ['in'], 'remap': ['in'], 'clamp-01': ['in'], 'saturate': ['in'], 'sign': ['in'],
  'mask-composite-float': ['bg', 'mask', 'fg'], 'mask-composite-vec3': ['bg', 'mask', 'fg']
};

function isConnectionTrackable(
  connection: Connection,
  graph: NodeGraph,
  depth: number,
  nodeSpecs: Map<string, NodeSpec> | undefined
): boolean {
  if (depth > MAX_INPUT_CHAIN_DEPTH) return false;
  if (isVirtualNodeId(connection.sourceNodeId) && connection.sourcePort === 'out') return true;
  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode) return false;
  if (
    sourceNode.type === 'constant-float' ||
    sourceNode.type === 'time' ||
    sourceNode.type === 'mixed-wave-signal' ||
    sourceNode.type === 'oscillator-2d'
  ) {
    return true;
  }
  if (sourceNode.type === 'split-vector') {
    const inConn = graph.connections.find(
      (c) => !c.disabled && c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return false;
    return isVec4SourceTrackable(inConn, graph, depth + 1, nodeSpecs);
  }
  if (sourceNode.type === 'one-minus' || sourceNode.type === 'negate') {
    const inConn = graph.connections.find(
      (c) => !c.disabled && c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return false;
    return isConnectionTrackable(inConn, graph, depth + 1, nodeSpecs);
  }
  const inputPorts = TRACKABLE_NODE_INPUT_PORTS[sourceNode.type];
  if (inputPorts && nodeSpecs) {
    for (const portName of inputPorts) {
      const inConn = graph.connections.find(
        (c) => !c.disabled && c.targetNodeId === sourceNode.id && c.targetPort === portName
      );
      if (!inConn || !isConnectionTrackable(inConn, graph, depth + 1, nodeSpecs)) return false;
    }
    return true;
  }
  return false;
}

export function getParameterInputValue(
  targetNodeId: string,
  targetParameter: string,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager
): number | null {
  const connection = graph.connections.find(
    (conn) =>
      !conn.disabled &&
      conn.targetNodeId === targetNodeId &&
      conn.targetParameter === targetParameter
  );
  if (!connection) return null;
  return getInputValue(connection, graph, nodeSpecs, audioManager, 0);
}

export function hasTrackableInput(
  node: NodeInstance,
  paramName: string,
  graph: NodeGraph,
  nodeSpecs?: Map<string, NodeSpec>
): boolean {
  const connection = graph.connections.find(
    (conn) =>
      !conn.disabled &&
      conn.targetNodeId === node.id &&
      conn.targetParameter === paramName
  );
  if (!connection) return false;
  return isConnectionTrackable(connection, graph, 0, nodeSpecs);
}

export function getAudioRemapLiveValues(
  _node: NodeInstance,
  _graph: NodeGraph,
  _nodeSpecs: Map<string, NodeSpec>,
  _audioManager?: IAudioManager
): { incoming: number | null; outgoing: number | null } {
  return { incoming: null, outgoing: null };
}

export function getAudioAnalyzerBandLiveValues(
  _node: NodeInstance,
  _graph: NodeGraph,
  _nodeSpecs: Map<string, NodeSpec>,
  _audioManager?: IAudioManager
): Map<number, { incoming: number | null; outgoing: number | null }> {
  return new Map();
}
