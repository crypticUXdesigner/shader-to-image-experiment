/**
 * Immutable Graph Update Utilities
 * 
 * This module provides immutable update functions for node graphs.
 * All functions return new graph instances rather than mutating existing ones.
 * This enables reliable change detection and efficient undo/redo.
 * 
 * Uses structural sharing where possible for efficiency - only changed parts
 * of the graph are copied, unchanged parts are reused.
 */

import type {
  NodeGraph,
  NodeInstance,
  Connection,
  GraphViewState,
  ParameterValue,
  AutomationState,
  AutomationLane,
  AutomationRegion,
} from './types';
import type { ParameterInputMode, ParameterSpec } from '../types/nodeSpec';
import type { NodeSpecification } from './validationTypes';
import type { ConnectionValidationContext } from './connectionValidationContext';
import { validateConnection } from './validationConnection';
import { getConnectionTargetKey, isPortConnection } from './connectionUtils';
import { getUpstreamOutputType } from './connectionWireTypes';
import { generateConnectionId, getConnectionIds } from './utils';

/**
 * Creates a deep copy of a node instance.
 * Uses structural sharing for nested objects that haven't changed.
 */
function copyNode(node: NodeInstance): NodeInstance {
  return {
    ...node,
    position: { ...node.position },
    parameters: { ...node.parameters },
    parameterInputModes: node.parameterInputModes ? { ...node.parameterInputModes } : undefined,
  };
}

/**
 * Creates a deep copy of a connection.
 */
function copyConnection(connection: Connection): Connection {
  return { ...connection };
}

/**
 * Creates a deep copy of a graph.
 * Uses structural sharing - only copies arrays, reuses node/connection objects
 * (which are then copied when modified).
 */
export function deepCopyGraph(graph: NodeGraph): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.map(copyNode),
    connections: graph.connections.map(copyConnection),
    metadata: graph.metadata ? { ...graph.metadata } : undefined,
    viewState: graph.viewState ? { ...graph.viewState } : undefined,
    automation: graph.automation ? copyAutomationState(graph.automation) : undefined,
  };
}

function copyAutomationState(a: AutomationState): AutomationState {
  return {
    ...a,
    lanes: a.lanes.map((lane: AutomationLane) => ({
      ...lane,
      regions: lane.regions.map((r: AutomationRegion) => ({ ...r, curve: { ...r.curve, keyframes: [...r.curve.keyframes] } })),
    })),
  };
}

/**
 * Adds a node to the graph, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param node - The node to add
 * @returns New graph with the node added
 */
export function addNode(graph: NodeGraph, node: NodeInstance): NodeGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, copyNode(node)],
  };
}

export interface RemoveNodeOptions {
  /**
   * When provided, deleting a node with exactly one incoming and one outgoing connection
   * may add a direct wire from upstream to downstream when the removed node's output
   * port type matches the incoming wire's source type (passthrough).
   */
  nodeSpecs?: NodeSpecification[];
  /** When the editor is in a WebGPU session, bridge wires are validated with the same rules as user connections. */
  connectionValidation?: ConnectionValidationContext;
}

function removeNodeStripOnly(graph: NodeGraph, nodeId: string): NodeGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    connections: graph.connections.filter(
      (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
    ),
  };
}

/**
 * Removes a node from the graph, returning a new graph instance.
 * Also removes all connections involving this node.
 *
 * With `options.nodeSpecs`, a single linear chain through the removed node may be
 * reconnected across the gap when wire types match (see `RemoveNodeOptions`).
 *
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to remove
 * @returns New graph with the node removed (and optionally a bridge connection)
 */
export function removeNode(graph: NodeGraph, nodeId: string, options?: RemoveNodeOptions): NodeGraph {
  const specs = options?.nodeSpecs;
  if (!specs?.length) {
    return removeNodeStripOnly(graph, nodeId);
  }

  const incoming = graph.connections.filter((c) => c.targetNodeId === nodeId);
  const outgoing = graph.connections.filter((c) => c.sourceNodeId === nodeId);

  if (incoming.length !== 1 || outgoing.length !== 1) {
    return removeNodeStripOnly(graph, nodeId);
  }

  const connIn = incoming[0];
  const connOut = outgoing[0];

  const removedNode = graph.nodes.find((n) => n.id === nodeId);
  if (!removedNode) {
    return removeNodeStripOnly(graph, nodeId);
  }

  const removedSpec = specs.find((s) => s.id === removedNode.type);
  const bOutType = removedSpec?.outputs?.find((o) => o.name === connOut.sourcePort)?.type;
  const upstreamType = getUpstreamOutputType(graph, connIn, specs);

  if (!upstreamType || !bOutType || upstreamType !== bOutType) {
    return removeNodeStripOnly(graph, nodeId);
  }

  const graphWithoutNode = removeNodeStripOnly(graph, nodeId);

  const bridgeConn: Connection = {
    id: generateConnectionId(getConnectionIds(graphWithoutNode)),
    sourceNodeId: connIn.sourceNodeId,
    sourcePort: connIn.sourcePort,
    targetNodeId: connOut.targetNodeId,
    ...(isPortConnection(connOut)
      ? { targetPort: connOut.targetPort! }
      : { targetParameter: connOut.targetParameter! }),
  };

  const result = addConnectionWithValidation(graphWithoutNode, bridgeConn, specs, {
    replaceExisting: true,
    connectionValidation: options?.connectionValidation,
  });
  if (result.errors.length > 0) {
    return graphWithoutNode;
  }
  return result.graph;
}

/**
 * Updates a node in the graph, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to update
 * @param updater - Function that receives the node and returns an updated node
 * @returns New graph with the node updated
 */
export function updateNode(
  graph: NodeGraph,
  nodeId: string,
  updater: (node: NodeInstance) => NodeInstance
): NodeGraph {
  const nodeIndex = graph.nodes.findIndex(n => n.id === nodeId);
  if (nodeIndex === -1) {
    return graph; // Node not found, return unchanged
  }

  const updatedNode = updater(copyNode(graph.nodes[nodeIndex]));
  
  // Structural sharing: only copy nodes array, reuse connections
  const newNodes = [...graph.nodes];
  newNodes[nodeIndex] = updatedNode;

  return {
    ...graph,
    nodes: newNodes,
  };
}

/**
 * Updates a node's position, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to update
 * @param position - The new position
 * @returns New graph with the node position updated
 */
export function updateNodePosition(
  graph: NodeGraph,
  nodeId: string,
  position: { x: number; y: number }
): NodeGraph {
  return updateNode(graph, nodeId, (node) => ({
    ...node,
    position: { ...position },
  }));
}

/**
 * Updates a node's parameter value, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to update
 * @param paramName - The parameter name
 * @param value - The new parameter value
 * @returns New graph with the parameter updated
 */
export function updateNodeParameter(
  graph: NodeGraph,
  nodeId: string,
  paramName: string,
  value: ParameterValue
): NodeGraph {
  return updateNode(graph, nodeId, (node) => {
    const newParameters = { ...node.parameters };
    newParameters[paramName] = value;
    return {
      ...node,
      parameters: newParameters,
    };
  });
}

/**
 * Updates a node's parameter input mode, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to update
 * @param paramName - The parameter name
 * @param mode - The new input mode
 * @returns New graph with the parameter input mode updated
 */
export function updateNodeParameterInputMode(
  graph: NodeGraph,
  nodeId: string,
  paramName: string,
  mode: ParameterInputMode
): NodeGraph {
  return updateNode(graph, nodeId, (node) => {
    const newModes = { ...(node.parameterInputModes || {}) };
    newModes[paramName] = mode;
    return {
      ...node,
      parameterInputModes: newModes,
    };
  });
}

/**
 * Resets a node's stored parameters and per-parameter input modes to match a freshly added
 * instance of the node's type (every `ParameterSpec.default`; same keys as palette add).
 *
 * Clears optional `parameterInputModes` so wired signal combination uses spec defaults again.
 *
 * @param graph - Graph to update
 * @param nodeId - Node to reset
 * @param parameterSpecs - `NodeSpec.parameters` for `node.type`
 */
export function resetNodeParametersToDefaults(
  graph: NodeGraph,
  nodeId: string,
  parameterSpecs: Record<string, ParameterSpec>
): NodeGraph {
  return updateNode(graph, nodeId, (node) => {
    const parameters: Record<string, ParameterValue> = {};
    for (const [paramName, paramSpec] of Object.entries(parameterSpecs)) {
      parameters[paramName] = paramSpec.default;
    }
    const { parameterInputModes: _omitModes, ...rest } = node;
    return {
      ...rest,
      parameters,
    };
  });
}

/**
 * Updates a node's label, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param nodeId - The ID of the node to update
 * @param label - The new label (undefined to remove)
 * @returns New graph with the node label updated
 */
export function updateNodeLabel(
  graph: NodeGraph,
  nodeId: string,
  label: string | undefined
): NodeGraph {
  return updateNode(graph, nodeId, (node) => {
    if (label === undefined) {
      const { label: _, ...rest } = node;
      return rest;
    }
    return {
      ...node,
      label,
    };
  });
}

/**
 * Sets whether the node's Power / bypass state is active (`bypassed`).
 * When `bypassed` is false, the field is omitted so serialization matches graphs that never used Power.
 */
export function setNodeBypassed(
  graph: NodeGraph,
  nodeId: string,
  bypassed: boolean
): NodeGraph {
  return updateNode(graph, nodeId, (node) => {
    if (!bypassed) {
      if (node.bypassed === undefined) {
        return node;
      }
      const { bypassed: _, ...rest } = node;
      return rest;
    }
    return {
      ...node,
      bypassed: true,
    };
  });
}

/**
 * Adds a connection to the graph, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param connection - The connection to add
 * @returns New graph with the connection added
 */
export function addConnection(graph: NodeGraph, connection: Connection): NodeGraph {
  return {
    ...graph,
    connections: [...graph.connections, copyConnection(connection)],
  };
}

/**
 * Removes a connection from the graph, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param connectionId - The ID of the connection to remove
 * @returns New graph with the connection removed
 */
export function removeConnection(graph: NodeGraph, connectionId: string): NodeGraph {
  return {
    ...graph,
    connections: graph.connections.filter(c => c.id !== connectionId),
  };
}

/**
 * Set whether a connection is disabled (ignored by compilation / evaluation) without removing it.
 * Returns the same graph reference when no change is needed.
 */
export function setConnectionDisabled(
  graph: NodeGraph,
  connectionId: string,
  disabled: boolean
): NodeGraph {
  const index = graph.connections.findIndex((c) => c.id === connectionId);
  if (index === -1) return graph;
  const prev = graph.connections[index];
  const nextDisabled = disabled ? true : undefined;
  if (prev.disabled === nextDisabled) return graph;
  const connections = [...graph.connections];
  connections[index] = { ...prev, disabled: nextDisabled };
  return { ...graph, connections };
}

/**
 * Removes connections that match a predicate, returning a new graph instance.
 * Useful for removing connections to/from a specific port or parameter.
 * 
 * @param graph - The graph to update
 * @param predicate - Function that returns true for connections to remove
 * @returns New graph with matching connections removed
 */
export function removeConnections(
  graph: NodeGraph,
  predicate: (connection: Connection) => boolean
): NodeGraph {
  return {
    ...graph,
    connections: graph.connections.filter(c => !predicate(c)),
  };
}

/**
 * Updates the graph's view state, returning a new graph instance.
 * 
 * @param graph - The graph to update
 * @param viewState - The new view state (partial updates supported)
 * @returns New graph with the view state updated
 */
export function updateViewState(
  graph: NodeGraph,
  viewState: Partial<GraphViewState>
): NodeGraph {
  return {
    ...graph,
    viewState: {
      ...(graph.viewState || { zoom: 1.0, panX: 0, panY: 0 }),
      ...viewState,
      selectedNodeIds: viewState.selectedNodeIds !== undefined
        ? [...(viewState.selectedNodeIds || [])]
        : graph.viewState?.selectedNodeIds,
    },
  };
}

/**
 * Adds multiple nodes to the graph, returning a new graph instance.
 * More efficient than calling addNode multiple times.
 * 
 * @param graph - The graph to update
 * @param nodes - The nodes to add
 * @returns New graph with the nodes added
 */
export function addNodes(graph: NodeGraph, nodes: NodeInstance[]): NodeGraph {
  return {
    ...graph,
    nodes: [...graph.nodes, ...nodes.map(copyNode)],
  };
}

/**
 * Adds multiple connections to the graph, returning a new graph instance.
 * More efficient than calling addConnection multiple times.
 * 
 * @param graph - The graph to update
 * @param connections - The connections to add
 * @returns New graph with the connections added
 */
export function addConnections(graph: NodeGraph, connections: Connection[]): NodeGraph {
  return {
    ...graph,
    connections: [...graph.connections, ...connections.map(copyConnection)],
  };
}

export interface AddConnectionWithValidationResult {
  graph: NodeGraph;
  errors: string[];
  warnings: string[];
  /**
   * If an existing connection to the same target (port or parameter) was replaced,
   * this is the ID of the removed connection.
   */
  replacedConnectionId?: string;
}

export interface AddConnectionWithValidationOptions {
  /**
   * When true (default), an existing connection to the same target port/parameter
   * is removed before adding the new one, so the one-connection-per-target invariant
   * holds. When false, no replacement is performed and the helper only validates;
   * callers are responsible for ensuring no duplicates.
   */
  replaceExisting?: boolean;
  connectionValidation?: ConnectionValidationContext;
}

/**
 * Adds a connection with data-model–level validation and optional duplicate replacement.
 *
 * - Enforces connection invariants via `validateConnection` (IDs, node/port/param existence, types).
 * - When `replaceExisting` is true (default), removes any existing connection to the same target
 *   port or parameter before adding the new one.
 *
 * Returns the new graph plus any validation errors/warnings. If errors are present, the
 * returned graph will be the original input graph.
 */
export function addConnectionWithValidation(
  graph: NodeGraph,
  connection: Connection,
  nodeSpecs: NodeSpecification[],
  options: AddConnectionWithValidationOptions = {}
): AddConnectionWithValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate the candidate connection against the current graph and node specs.
  validateConnection(connection, graph, nodeSpecs, errors, warnings, options.connectionValidation);
  if (errors.length > 0) {
    return { graph, errors, warnings };
  }

  const replaceExisting = options.replaceExisting ?? true;
  let workingGraph = graph;
  let replacedConnectionId: string | undefined;

  if (replaceExisting) {
    const targetKey = getConnectionTargetKey(connection);
    if (targetKey) {
      const existing = workingGraph.connections.find(
        (c) => getConnectionTargetKey(c) === targetKey
      );
      if (existing) {
        replacedConnectionId = existing.id;
        workingGraph = removeConnections(workingGraph, (c) => c.id === existing.id);
      }
    }
  }

  const updatedGraph = addConnection(workingGraph, connection);
  return { graph: updatedGraph, errors, warnings, replacedConnectionId };
}

export {
  addAutomationLane,
  addAutomationRegion,
  updateAutomationRegion,
  removeAutomationRegion,
  removeAutomationLane,
  setAutomationBpm,
  setAutomationDuration,
} from './immutableUpdatesAutomation';
