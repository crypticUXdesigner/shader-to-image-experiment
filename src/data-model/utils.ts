/**
 * Utility Functions for Node-Based Shader System (v2.0)
 * 
 * This module provides utility functions for working with node graphs,
 * including ID generation, parameter value retrieval, and graph helpers.
 */

import type {
  NodeGraph,
  NodeInstance,
  Connection,
  ParameterValue,
} from './types';
import type { NodeSpecification } from './validation';

/**
 * Generates a UUID v4.
 * 
 * @returns A UUID v4 string
 */
export function generateUUID(): string {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generates a unique node ID.
 * 
 * @param existingIds - Set of existing node IDs to avoid collisions
 * @returns A unique node ID
 */
export function generateNodeId(existingIds: Set<string> = new Set()): string {
  let id: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    id = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    attempts++;
    if (attempts > maxAttempts) {
      // Fallback to UUID if we can't generate a unique simple ID
      id = generateUUID();
      break;
    }
  } while (existingIds.has(id));

  return id;
}

/**
 * Generates a unique connection ID.
 * 
 * @param existingIds - Set of existing connection IDs to avoid collisions
 * @returns A unique connection ID
 */
export function generateConnectionId(existingIds: Set<string> = new Set()): string {
  let id: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    attempts++;
    if (attempts > maxAttempts) {
      // Fallback to UUID if we can't generate a unique simple ID
      id = generateUUID();
      break;
    }
  } while (existingIds.has(id));

  return id;
}

/**
 * Generates a unique graph ID.
 * 
 * @param existingIds - Set of existing graph IDs to avoid collisions
 * @returns A unique graph ID
 */
export function generateGraphId(existingIds: Set<string> = new Set()): string {
  let id: string;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    id = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    attempts++;
    if (attempts > maxAttempts) {
      // Fallback to UUID if we can't generate a unique simple ID
      id = generateUUID();
      break;
    }
  } while (existingIds.has(id));

  return id;
}

/**
 * Gets a parameter value from a node, using defaults from the node specification.
 * 
 * @param node - The node instance
 * @param paramName - The parameter name
 * @param nodeSpec - The node specification
 * @returns The parameter value (from node or default)
 */
export function getParameterValue(
  node: NodeInstance,
  paramName: string,
  nodeSpec?: NodeSpecification
): ParameterValue {
  // Check if parameter exists in node
  if (node.parameters[paramName] !== undefined) {
    return node.parameters[paramName];
  }

  // Use default from spec
  if (nodeSpec?.parameters?.[paramName]?.default !== undefined) {
    return nodeSpec.parameters[paramName].default!;
  }

  // Type-appropriate default
  const paramSpec = nodeSpec?.parameters?.[paramName];
  const typeDefaults: Record<string, ParameterValue> = {
    float: 0.0,
    int: 0,
    string: '',
    vec4: [0, 0, 0, 0],
    array: [],
  };

  const paramType = paramSpec?.type || 'float';
  return typeDefaults[paramType] ?? 0.0;
}

/**
 * Coerces a parameter value to the correct type.
 * 
 * @param value - The value to coerce
 * @param paramType - The expected parameter type
 * @returns The coerced value
 */
export function coerceParameterValue(
  value: unknown,
  paramType: 'float' | 'int' | 'string' | 'vec4' | 'array'
): ParameterValue {
  switch (paramType) {
    case 'float':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0.0 : parsed;
      }
      return 0.0;

    case 'int':
      if (typeof value === 'number') return Math.round(value);
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;

    case 'string':
      return String(value);

    case 'vec4':
      if (Array.isArray(value) && value.length === 4) {
        return value.map(v => (typeof v === 'number' ? v : 0)) as [number, number, number, number];
      }
      return [0, 0, 0, 0];

    case 'array':
      if (Array.isArray(value)) {
        return value.map(v => (typeof v === 'number' ? v : 0));
      }
      return [];

    default:
      return 0.0;
  }
}

/**
 * Clamps a numeric parameter value to its min/max range.
 * 
 * @param value - The value to clamp
 * @param min - Optional minimum value
 * @param max - Optional maximum value
 * @returns The clamped value
 */
export function clampParameterValue(
  value: number,
  min?: number,
  max?: number
): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

/**
 * Gets all node IDs in a graph.
 * 
 * @param graph - The graph
 * @returns Set of node IDs
 */
export function getNodeIds(graph: NodeGraph): Set<string> {
  return new Set(graph.nodes.map(n => n.id));
}

/**
 * Gets all connection IDs in a graph.
 * 
 * @param graph - The graph
 * @returns Set of connection IDs
 */
export function getConnectionIds(graph: NodeGraph): Set<string> {
  return new Set(graph.connections.map(c => c.id));
}

/**
 * Finds a node by ID.
 * 
 * @param graph - The graph
 * @param nodeId - The node ID to find
 * @returns The node instance, or undefined if not found
 */
export function findNode(graph: NodeGraph, nodeId: string): NodeInstance | undefined {
  return graph.nodes.find(n => n.id === nodeId);
}

/**
 * Finds a connection by ID.
 * 
 * @param graph - The graph
 * @param connectionId - The connection ID to find
 * @returns The connection, or undefined if not found
 */
export function findConnection(graph: NodeGraph, connectionId: string): Connection | undefined {
  return graph.connections.find(c => c.id === connectionId);
}

/**
 * Gets all connections from a source node.
 * 
 * @param graph - The graph
 * @param sourceNodeId - The source node ID
 * @returns Array of connections from the source node
 */
export function getConnectionsFromNode(graph: NodeGraph, sourceNodeId: string): Connection[] {
  return graph.connections.filter(c => c.sourceNodeId === sourceNodeId);
}

/**
 * Gets all connections to a target node.
 * 
 * @param graph - The graph
 * @param targetNodeId - The target node ID
 * @returns Array of connections to the target node
 */
export function getConnectionsToNode(graph: NodeGraph, targetNodeId: string): Connection[] {
  return graph.connections.filter(c => c.targetNodeId === targetNodeId);
}

/**
 * Gets the connection to a specific target port.
 * 
 * @param graph - The graph
 * @param targetNodeId - The target node ID
 * @param targetPort - The target port name
 * @returns The connection, or undefined if not found
 */
export function getConnectionToPort(
  graph: NodeGraph,
  targetNodeId: string,
  targetPort: string
): Connection | undefined {
  return graph.connections.find(
    c => c.targetNodeId === targetNodeId && c.targetPort === targetPort
  );
}

/**
 * Creates a new empty graph.
 * 
 * @param name - The graph name
 * @param id - Optional graph ID (generated if not provided)
 * @returns A new empty graph
 */
export function createEmptyGraph(name: string, id?: string): NodeGraph {
  return {
    id: id || generateGraphId(),
    name,
    version: '2.0',
    nodes: [],
    connections: [],
  };
}

/**
 * Creates a default view state.
 * 
 * @returns Default view state
 */
export function createDefaultViewState() {
  return {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    selectedNodeIds: [] as string[],
  };
}
