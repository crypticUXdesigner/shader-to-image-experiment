// Node Graph Serialization Utilities
// Handles saving/loading node graphs to/from JSON

import type { NodeGraph, SerializedNodeGraph } from '../types/nodeGraph';

export function serializeGraph(graph: NodeGraph, pretty: boolean = true): string {
  const wrapper: SerializedNodeGraph = {
    format: 'shader-composer-node-graph',
    formatVersion: '2.0',
    graph
  };
  
  return JSON.stringify(wrapper, null, pretty ? 2 : 0);
}

export function deserializeGraph(json: string): { graph: NodeGraph | null, errors: string[] } {
  const errors: string[] = [];
  
  try {
    const data = JSON.parse(json);
    
    // Validate format
    if (data.format !== 'shader-composer-node-graph') {
      errors.push('Invalid file format');
      return { graph: null, errors };
    }
    
    // Validate version
    if (data.formatVersion !== '2.0') {
      errors.push(`Unsupported version: ${data.formatVersion}`);
      return { graph: null, errors };
    }
    
    // Validate graph structure
    if (!data.graph || typeof data.graph !== 'object') {
      errors.push('Invalid graph structure');
      return { graph: null, errors };
    }
    
    const graph = data.graph as NodeGraph;
    
    // Basic validation
    if (!graph.id || !graph.name || !graph.version) {
      errors.push('Graph missing required fields (id, name, version)');
    }
    
    if (!Array.isArray(graph.nodes)) {
      errors.push('Graph nodes must be an array');
    }
    
    if (!Array.isArray(graph.connections)) {
      errors.push('Graph connections must be an array');
    }
    
    if (errors.length > 0) {
      return { graph: null, errors };
    }
    
    return { graph, errors };
  } catch (error) {
    errors.push(`JSON parse error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { graph: null, errors };
  }
}

export function validateGraph(graph: NodeGraph): { valid: boolean, errors: string[] } {
  const errors: string[] = [];
  
  // Check required fields
  if (!graph.id) errors.push('Graph missing id');
  if (!graph.name) errors.push('Graph missing name');
  if (graph.version !== '2.0') errors.push(`Invalid version: ${graph.version}`);
  
  // Check node IDs are unique
  const nodeIds = new Set<string>();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  }
  
  // Check connection IDs are unique
  const connectionIds = new Set<string>();
  for (const conn of graph.connections) {
    if (connectionIds.has(conn.id)) {
      errors.push(`Duplicate connection ID: ${conn.id}`);
    }
    connectionIds.add(conn.id);
    
    // Check connection references valid nodes
    if (!nodeIds.has(conn.sourceNodeId)) {
      errors.push(`Connection references non-existent source node: ${conn.sourceNodeId}`);
    }
    if (!nodeIds.has(conn.targetNodeId)) {
      errors.push(`Connection references non-existent target node: ${conn.targetNodeId}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
