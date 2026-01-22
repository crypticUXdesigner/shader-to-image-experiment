/**
 * Validation System for Node-Based Shader System (v2.0)
 * 
 * This module provides validation functions for node graphs, including
 * graph-level, node-level, and connection-level validation.
 */

import type {
  NodeGraph,
  NodeInstance,
  Connection,
  ParameterValue,
  ValidationResult,
} from './types';

/**
 * Node specification interface (referenced from Node Specification).
 * This is a minimal interface that validation can work with.
 */
export interface NodeSpecification {
  id: string;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  parameters?: Record<string, {
    type: 'float' | 'int' | 'string' | 'vec4' | 'array';
    default?: ParameterValue;
    min?: number;
    max?: number;
    required?: boolean;
  }>;
}

/**
 * Validates a parameter value against its specification.
 */
function validateParameterValue(
  value: ParameterValue,
  paramSpec: { type: string; default?: ParameterValue; min?: number; max?: number; required?: boolean } | undefined
): boolean {
  if (!paramSpec) return false;

  switch (paramSpec.type) {
    case 'float':
    case 'int':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'vec4':
      return (
        Array.isArray(value) &&
        value.length === 4 &&
        value.every(v => typeof v === 'number')
      );
    case 'array':
      return Array.isArray(value) && value.every(v => typeof v === 'number');
    default:
      return false;
  }
}

/**
 * Validates a single node instance.
 */
function validateNode(
  node: NodeInstance,
  nodeSpecs: NodeSpecification[],
  errors: string[],
  warnings: string[]
): void {
  // Check required fields
  if (!node.id) {
    errors.push(`Node missing id`);
    return;
  }
  if (!node.type) {
    errors.push(`Node ${node.id} missing type`);
    return;
  }
  if (!node.position) {
    errors.push(`Node ${node.id} missing position`);
    return;
  }
  if (node.parameters === undefined) {
    errors.push(`Node ${node.id} missing parameters`);
    return;
  }

  // Check position
  if (typeof node.position.x !== 'number' || typeof node.position.y !== 'number') {
    errors.push(`Node ${node.id} has invalid position`);
  }

  // Find node specification
  const nodeSpec = nodeSpecs.find(spec => spec.id === node.type);
  if (!nodeSpec) {
    errors.push(`Node ${node.id} has unknown node type: ${node.type}`);
    return;
  }

  // Validate parameters
  if (nodeSpec.parameters) {
    // Check for unknown parameters
    for (const paramName of Object.keys(node.parameters)) {
      if (!(paramName in nodeSpec.parameters)) {
        warnings.push(`Node ${node.id} (${node.type}) has unknown parameter: ${paramName}`);
        continue;
      }

      const paramSpec = nodeSpec.parameters[paramName];
      if (!paramSpec) {
        continue;
      }
      const paramValue = node.parameters[paramName];

      // Type validation
      if (!validateParameterValue(paramValue, paramSpec)) {
        errors.push(
          `Node ${node.id} (${node.type}) has invalid parameter value type for: ${paramName}`
        );
        continue;
      }

      // Range validation (for numeric types)
      if (typeof paramValue === 'number') {
        if (paramSpec.min !== undefined && paramValue < paramSpec.min) {
          errors.push(
            `Node ${node.id} (${node.type}) parameter ${paramName} is out of range: ${paramValue} < ${paramSpec.min}`
          );
        }
        if (paramSpec.max !== undefined && paramValue > paramSpec.max) {
          errors.push(
            `Node ${node.id} (${node.type}) parameter ${paramName} is out of range: ${paramValue} > ${paramSpec.max}`
          );
        }
      }
    }

    // Check for required parameters
    for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
      if (paramSpec.required && !(paramName in node.parameters)) {
        errors.push(
          `Node ${node.id} (${node.type}) is missing required parameter: ${paramName}`
        );
      }
    }
  }

  // Validate optional fields
  if (node.color !== undefined) {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexColorRegex.test(node.color)) {
      errors.push(`Node ${node.id} has invalid color format: ${node.color}`);
    }
  }
}

/**
 * Validates a single connection.
 */
function validateConnection(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: NodeSpecification[],
  errors: string[],
  warnings: string[]
): void {
  // Check required fields
  if (!connection.id) {
    errors.push('Connection missing id');
    return;
  }
  if (!connection.sourceNodeId) {
    errors.push(`Connection ${connection.id} missing sourceNodeId`);
    return;
  }
  if (!connection.sourcePort) {
    errors.push(`Connection ${connection.id} missing sourcePort`);
    return;
  }
  if (!connection.targetNodeId) {
    errors.push(`Connection ${connection.id} missing targetNodeId`);
    return;
  }
  if (!connection.targetPort) {
    errors.push(`Connection ${connection.id} missing targetPort`);
    return;
  }

  // Check node existence
  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode) {
    errors.push(
      `Connection ${connection.id} references non-existent source node: ${connection.sourceNodeId}`
    );
    return;
  }

  const targetNode = graph.nodes.find(n => n.id === connection.targetNodeId);
  if (!targetNode) {
    errors.push(
      `Connection ${connection.id} references non-existent target node: ${connection.targetNodeId}`
    );
    return;
  }

  // Check port existence
  const sourceSpec = nodeSpecs.find(spec => spec.id === sourceNode.type);
  if (sourceSpec) {
    const sourceOutput = sourceSpec.outputs?.find(o => o.name === connection.sourcePort);
    if (!sourceOutput) {
      errors.push(
        `Connection ${connection.id} references invalid source port: ${connection.sourcePort} on node type ${sourceNode.type}`
      );
    }
  }

  const targetSpec = nodeSpecs.find(spec => spec.id === targetNode.type);
  if (targetSpec) {
    const targetInput = targetSpec.inputs?.find(i => i.name === connection.targetPort);
    if (!targetInput) {
      errors.push(
        `Connection ${connection.id} references invalid target port: ${connection.targetPort} on node type ${targetNode.type}`
      );
    }
  }

  // Check for self-connection
  if (connection.sourceNodeId === connection.targetNodeId) {
    warnings.push(
      `Connection ${connection.id} connects node to itself (may cause cycles)`
    );
  }
}

/**
 * Validates a complete node graph.
 * 
 * @param graph - The graph to validate
 * @param nodeSpecs - Array of node specifications (from Node Specification)
 * @returns Validation result with errors and warnings
 */
export function validateGraph(
  graph: NodeGraph,
  nodeSpecs: NodeSpecification[] = []
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Graph-level validation
  if (!graph.id) {
    errors.push('Graph missing id');
  }
  if (!graph.name) {
    errors.push('Graph missing name');
  }
  if (graph.name && graph.name.length > 256) {
    errors.push('Graph name exceeds maximum length of 256 characters');
  }
  if (graph.version !== '2.0') {
    errors.push(`Invalid graph version: ${graph.version} (expected "2.0")`);
  }
  if (!Array.isArray(graph.nodes)) {
    errors.push('Graph missing or invalid nodes array');
  }
  if (!Array.isArray(graph.connections)) {
    errors.push('Graph missing or invalid connections array');
  }

  // If basic structure is invalid, stop here
  if (!graph.nodes || !graph.connections) {
    return { valid: false, errors, warnings };
  }

  // Validate node ID uniqueness
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // Validate connection ID uniqueness
  const connectionIds = new Set<string>();
  for (const conn of graph.connections) {
    if (connectionIds.has(conn.id)) {
      errors.push(`Duplicate connection ID: ${conn.id}`);
    }
    connectionIds.add(conn.id);
  }

  // Validate each node
  for (const node of graph.nodes) {
    validateNode(node, nodeSpecs, errors, warnings);
  }

  // Validate each connection
  for (const conn of graph.connections) {
    validateConnection(conn, graph, nodeSpecs, errors, warnings);
  }

  // Check for duplicate connections (same target port)
  const targetPortMap = new Map<string, Connection>();
  for (const conn of graph.connections) {
    const key = `${conn.targetNodeId}:${conn.targetPort}`;
    if (targetPortMap.has(key)) {
      errors.push(
        `Duplicate connection to target port ${conn.targetPort} on node ${conn.targetNodeId}`
      );
    } else {
      targetPortMap.set(key, conn);
    }
  }

  // Validate view state if present
  if (graph.viewState) {
    if (typeof graph.viewState.zoom !== 'number') {
      errors.push('View state zoom must be a number');
    } else if (graph.viewState.zoom < 0.1 || graph.viewState.zoom > 10.0) {
      warnings.push(`View state zoom is out of recommended range: ${graph.viewState.zoom}`);
    }
    if (typeof graph.viewState.panX !== 'number') {
      errors.push('View state panX must be a number');
    }
    if (typeof graph.viewState.panY !== 'number') {
      errors.push('View state panY must be a number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates that all node IDs in a graph are unique.
 */
export function validateUniqueNodeIds(graph: NodeGraph): string[] {
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  return errors;
}

/**
 * Validates that all connection IDs in a graph are unique.
 */
export function validateUniqueConnectionIds(graph: NodeGraph): string[] {
  const errors: string[] = [];
  const connectionIds = new Set<string>();

  for (const conn of graph.connections) {
    if (connectionIds.has(conn.id)) {
      errors.push(`Duplicate connection ID: ${conn.id}`);
    }
    connectionIds.add(conn.id);
  }

  return errors;
}

/**
 * Validates that all connections reference existing nodes.
 */
export function validateConnectionNodeReferences(graph: NodeGraph): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(graph.nodes.map(n => n.id));

  for (const conn of graph.connections) {
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent source node: ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection ${conn.id} references non-existent target node: ${conn.targetNodeId}`);
    }
  }

  return errors;
}

/**
 * Validates that a connection doesn't duplicate an existing connection to the same target port.
 * A target input port can only have ONE connection.
 * 
 * @param connection - The connection to validate
 * @param existingConnections - Array of existing connections to check against
 * @returns Validation result with valid flag and optional error message
 */
export function validateNoDuplicateConnections(
  connection: Connection,
  existingConnections: Connection[]
): { valid: boolean; error?: string } {
  const duplicate = existingConnections.find(
    c =>
      c.targetNodeId === connection.targetNodeId &&
      c.targetPort === connection.targetPort
  );

  if (duplicate) {
    return {
      valid: false,
      error: `Input port '${connection.targetPort}' on node '${connection.targetNodeId}' already has a connection`,
    };
  }

  return { valid: true };
}
