/**
 * Utility to compute effective parameter values when inputs are connected,
 * and to snap values to parameter constraints (min/max/step/int).
 */

import type { NodeGraph, NodeInstance, Connection } from '../types/nodeGraph';
import type { NodeSpec, ParameterSpec } from '../types/nodeSpec';
import type { IAudioManager } from '../runtime/types';

/**
 * Snap a raw number to the parameter's constraints so that dragging/typing
 * can hit discrete values. Without this, only min/max are enforced and
 * paramSpec.step / type 'int' are ignored, making some values unreachable.
 *
 * - Clamps to [min, max]
 * - If step is defined: snaps to nearest step (min + k*step)
 * - If type is 'int' and no step: rounds to integer
 */
export function snapParameterValue(value: number, paramSpec: ParameterSpec): number {
  const min = paramSpec.min ?? 0;
  const max = paramSpec.max ?? 1;
  let v = Math.max(min, Math.min(max, value));

  if (typeof paramSpec.step === 'number' && paramSpec.step > 0) {
    const step = paramSpec.step;
    v = min + Math.round((v - min) / step) * step;
    v = Math.max(min, Math.min(max, v));
  } else if (paramSpec.type === 'int') {
    v = Math.round(v);
    v = Math.max(min, Math.min(max, v));
  }

  return v;
}

export type ParameterInputMode = 'override' | 'add' | 'subtract' | 'multiply';

/**
 * Compute the effective value of a parameter when it has an input connection
 */
export function computeEffectiveParameterValue(
  node: NodeInstance,
  paramName: string,
  paramSpec: ParameterSpec,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager
): number | null {
  // Find connection that targets this parameter
  const connection = graph.connections.find(
    conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
  );
  
  if (!connection) {
    // No input connection - return null to indicate static config value
    return null;
  }
  
  // Get input mode
  const inputMode: ParameterInputMode = 
    node.parameterInputModes?.[paramName] || 
    paramSpec.inputMode || 
    'override';
  
  // Get config value
  const configValue = node.parameters[paramName];
  const configNum: number = typeof configValue === 'number' ? configValue : (typeof paramSpec.default === 'number' ? paramSpec.default : 0);
  
  // Get input value from source node
  const inputValue = getInputValue(
    connection,
    graph,
    nodeSpecs,
    audioManager
  );
  
  if (inputValue === null) {
    // Can't compute input value - return null to show static config value
    return null;
  }
  
  // Apply input mode
  switch (inputMode) {
    case 'override':
      return inputValue;
    case 'add':
      return configNum + inputValue;
    case 'subtract':
      return configNum - inputValue;
    case 'multiply':
      return configNum * inputValue;
    default:
      return inputValue;
  }
}

/** Max depth when following input chains (e.g. one-minus -> audio-analyzer) to avoid infinite recursion */
const MAX_INPUT_CHAIN_DEPTH = 8;

/**
 * Get the current value from an input connection
 */
function getInputValue(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager,
  depth: number = 0
): number | null {
  if (depth > MAX_INPUT_CHAIN_DEPTH) return null;

  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode) return null;
  
  const sourceSpec = nodeSpecs.get(sourceNode.type);
  if (!sourceSpec) return null;
  
  // Handle one-minus: follow input and return 1.0 - value (so UI shows live value)
  if (sourceNode.type === 'one-minus') {
    const inConn = graph.connections.find(
      c => c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return null;
    const inValue = getInputValue(inConn, graph, nodeSpecs, audioManager, depth + 1);
    if (inValue === null) return null;
    return 1.0 - inValue;
  }

  // Handle negate: follow input and return -value
  if (sourceNode.type === 'negate') {
    const inConn = graph.connections.find(
      c => c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return null;
    const inValue = getInputValue(inConn, graph, nodeSpecs, audioManager, depth + 1);
    if (inValue === null) return null;
    return -inValue;
  }

  // Handle audio-analyzer nodes - get current band values
  if (sourceNode.type === 'audio-analyzer') {
    // If no audio manager, return null (can't compute value)
    if (!audioManager) {
      return null;
    }
    
    // Try to get analyzer state - if audio hasn't loaded yet, this will be undefined
    const analyzerState = audioManager.getAnalyzerNodeState(sourceNode.id);
    
    // If analyzer state doesn't exist (audio not loaded yet), return null gracefully
    if (!analyzerState) {
      return null; // Audio not loaded yet - this is OK, UI should handle null values
    }
    
    // Check if smoothedBandValues exists and is valid
    if (!analyzerState.smoothedBandValues || analyzerState.smoothedBandValues.length === 0) {
      return null; // No band values available yet
    }
    
    // Port name: band0..bandN (raw) or remap0..remapN (remapped)
    const bandMatch = connection.sourcePort.match(/^band(\d+)$/);
    const remapMatch = connection.sourcePort.match(/^remap(\d+)$/);
    const indexMatch = bandMatch ?? remapMatch;
    if (!indexMatch) return null;

    const bandIndex = parseInt(indexMatch[1], 10);
    if (bandIndex < 0 || bandIndex >= analyzerState.smoothedBandValues.length) return null;

    const bandValue = analyzerState.smoothedBandValues[bandIndex];
    if (typeof bandValue !== 'number' || isNaN(bandValue)) return null;

    if (bandMatch) return bandValue;

    // remap{N}: apply per-band remap
    const inMin = getBandRemapParam(sourceNode, bandIndex, 'InMin', 0);
    const inMax = getBandRemapParam(sourceNode, bandIndex, 'InMax', 1);
    const outMin = getBandRemapParam(sourceNode, bandIndex, 'OutMin', 0);
    const outMax = getBandRemapParam(sourceNode, bandIndex, 'OutMax', 1);
    const range = inMax - inMin;
    const normalized = range !== 0 ? (bandValue - inMin) / range : 0;
    const clamped = Math.max(0, Math.min(1, normalized));
    return outMin + clamped * (outMax - outMin);
  }

  // Handle audio-remap nodes - compute remapped value
  if (sourceNode.type === 'audio-remap') {
    // Get the input audio value
    const audioInputConn = graph.connections.find(
      c => c.targetNodeId === sourceNode.id && c.targetPort === 'audioValue'
    );
    
    // If no audio connection or no audio manager, return null (can't compute value)
    if (!audioInputConn || !audioManager) {
      return null;
    }
    
    const audioInputNode = graph.nodes.find(n => n.id === audioInputConn.sourceNodeId);
    
    // If audio input node doesn't exist or isn't an analyzer, return null
    if (!audioInputNode || audioInputNode.type !== 'audio-analyzer') {
      return null;
    }
    
    // Try to get analyzer state - if audio hasn't loaded yet, this will be undefined
    const analyzerState = audioManager.getAnalyzerNodeState(audioInputNode.id);
    
    // If analyzer state doesn't exist (audio not loaded yet), return null gracefully
    if (!analyzerState) {
      return null; // Audio not loaded yet - this is OK, UI should handle null values
    }
    
    // Check if smoothedBandValues exists and is valid
    if (!analyzerState.smoothedBandValues || analyzerState.smoothedBandValues.length === 0) {
      return null; // No band values available yet
    }
    
    const bandMatch = audioInputConn.sourcePort.match(/^band(\d+)$/);
    if (!bandMatch) {
      return null; // Invalid port name
    }
    
    const bandIndex = parseInt(bandMatch[1], 10);
    
    // Validate band index is in range
    if (bandIndex < 0 || bandIndex >= analyzerState.smoothedBandValues.length) {
      return null; // Band index out of range
    }
    
    // Get audio value - now we know it's safe to access
    const audioValue = analyzerState.smoothedBandValues[bandIndex];
    
    // Validate audio value is a number
    if (typeof audioValue !== 'number' || isNaN(audioValue)) {
      return null; // Invalid audio value
    }
    
    // Apply remap: remap from [inMin, inMax] to [outMin, outMax]
    const inMin = typeof sourceNode.parameters.inMin === 'number' ? sourceNode.parameters.inMin : 0;
    const inMax = typeof sourceNode.parameters.inMax === 'number' ? sourceNode.parameters.inMax : 1;
    const outMin = typeof sourceNode.parameters.outMin === 'number' ? sourceNode.parameters.outMin : 0;
    const outMax = typeof sourceNode.parameters.outMax === 'number' ? sourceNode.parameters.outMax : 1;
    const clamp = typeof sourceNode.parameters.clamp === 'number' ? Math.round(sourceNode.parameters.clamp) : 1;
    
    // Normalize to [0, 1] range
    const range = inMax - inMin;
    const normalized = range !== 0 ? (audioValue - inMin) / range : 0;
    
    // Clamp if enabled
    const clamped = clamp ? Math.max(0, Math.min(1, normalized)) : normalized;
    
    // Remap to output range
    const outRange = outMax - outMin;
    return outMin + clamped * outRange;
  }
  
  // For other node types, we can't easily compute the value at runtime
  // Return null to indicate we can't compute it
  return null;
}

/**
 * Get live incoming (audioValue) and outgoing (remapped) values for an audio-remap node.
 * Used to draw needle markers on the remap range UI.
 */
export function getAudioRemapLiveValues(
  node: NodeInstance,
  graph: NodeGraph,
  _nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager
): { incoming: number | null; outgoing: number | null } {
  if (node.type !== 'audio-remap') {
    return { incoming: null, outgoing: null };
  }

  const audioInputConn = graph.connections.find(
    (c) => c.targetNodeId === node.id && c.targetPort === 'audioValue'
  );
  if (!audioInputConn || !audioManager) {
    return { incoming: null, outgoing: null };
  }

  const audioInputNode = graph.nodes.find((n) => n.id === audioInputConn.sourceNodeId);
  if (!audioInputNode || audioInputNode.type !== 'audio-analyzer') {
    return { incoming: null, outgoing: null };
  }

  const analyzerState = audioManager.getAnalyzerNodeState(audioInputNode.id);
  if (!analyzerState?.smoothedBandValues?.length) {
    return { incoming: null, outgoing: null };
  }

  const bandMatch = audioInputConn.sourcePort.match(/^band(\d+)$/);
  if (!bandMatch) return { incoming: null, outgoing: null };

  const bandIndex = parseInt(bandMatch[1], 10);
  if (bandIndex < 0 || bandIndex >= analyzerState.smoothedBandValues.length) {
    return { incoming: null, outgoing: null };
  }

  const audioValue = analyzerState.smoothedBandValues[bandIndex];
  if (typeof audioValue !== 'number' || isNaN(audioValue)) {
    return { incoming: null, outgoing: null };
  }

  const inMin = typeof node.parameters.inMin === 'number' ? node.parameters.inMin : 0;
  const inMax = typeof node.parameters.inMax === 'number' ? node.parameters.inMax : 1;
  const outMin = typeof node.parameters.outMin === 'number' ? node.parameters.outMin : 0;
  const outMax = typeof node.parameters.outMax === 'number' ? node.parameters.outMax : 1;
  const clamp = typeof node.parameters.clamp === 'number' ? Math.round(node.parameters.clamp) : 1;

  const range = inMax - inMin;
  const normalized = range !== 0 ? (audioValue - inMin) / range : 0;
  const clamped = clamp ? Math.max(0, Math.min(1, normalized)) : normalized;
  const outRange = outMax - outMin;
  const remapped = outMin + clamped * outRange;

  return { incoming: audioValue, outgoing: remapped };
}

function getBandRemapParam(node: NodeInstance, bandIndex: number, suffix: string, fallback: number): number {
  const key = `band${bandIndex}Remap${suffix}`;
  const v = node.parameters[key];
  return typeof v === 'number' ? v : fallback;
}

/**
 * Get per-band live incoming (band value) and outgoing (remapped) values for an audio-analyzer node.
 * Used to draw needle markers on each band's optional remap UI.
 */
export function getAudioAnalyzerBandLiveValues(
  node: NodeInstance,
  _graph: NodeGraph,
  _nodeSpecs: Map<string, NodeSpec>,
  audioManager?: IAudioManager
): Map<number, { incoming: number | null; outgoing: number | null }> {
  const result = new Map<number, { incoming: number | null; outgoing: number | null }>();
  if (node.type !== 'audio-analyzer' || !audioManager) {
    return result;
  }

  const analyzerState = audioManager.getAnalyzerNodeState(node.id);
  if (!analyzerState?.smoothedBandValues?.length) {
    return result;
  }

  const bandCount = analyzerState.smoothedBandValues.length;
  for (let i = 0; i < bandCount; i++) {
    const incoming = analyzerState.smoothedBandValues[i];
    if (typeof incoming !== 'number' || isNaN(incoming)) {
      result.set(i, { incoming: null, outgoing: null });
      continue;
    }
    const inMin = getBandRemapParam(node, i, 'InMin', 0);
    const inMax = getBandRemapParam(node, i, 'InMax', 1);
    const outMin = getBandRemapParam(node, i, 'OutMin', 0);
    const outMax = getBandRemapParam(node, i, 'OutMax', 1);
    const range = inMax - inMin;
    const normalized = range !== 0 ? (incoming - inMin) / range : 0;
    const clamped = Math.max(0, Math.min(1, normalized));
    const outRange = outMax - outMin;
    const outgoing = outMin + clamped * outRange;
    result.set(i, { incoming, outgoing });
  }
  return result;
}

/**
 * Check if we can get a live value from the source of this connection (direct or via one-minus/negate chain).
 */
function isConnectionTrackable(
  connection: Connection,
  graph: NodeGraph,
  depth: number
): boolean {
  if (depth > MAX_INPUT_CHAIN_DEPTH) return false;

  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode) return false;

  if (sourceNode.type === 'audio-analyzer' || sourceNode.type === 'audio-remap') {
    return true;
  }
  if (sourceNode.type === 'one-minus' || sourceNode.type === 'negate') {
    const inConn = graph.connections.find(
      c => c.targetNodeId === sourceNode.id && c.targetPort === 'in'
    );
    if (!inConn) return false;
    return isConnectionTrackable(inConn, graph, depth + 1);
  }
  return false;
}

/**
 * Check if a parameter has an input connection that we can track (live value from audio or through one-minus/negate)
 */
export function hasTrackableInput(
  node: NodeInstance,
  paramName: string,
  graph: NodeGraph
): boolean {
  const connection = graph.connections.find(
    conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
  );
  if (!connection) return false;
  return isConnectionTrackable(connection, graph, 0);
}
