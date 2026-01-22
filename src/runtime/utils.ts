/**
 * Runtime Utility Functions
 * 
 * Uniform name mapping function that matches the compiler's naming convention.
 */

/**
 * Generate uniform name from node ID and parameter name.
 * This matches the compiler's sanitizeUniformName function exactly.
 * 
 * @param nodeId - Node ID (e.g., "node-123")
 * @param paramName - Parameter name (e.g., "scale")
 * @returns Uniform name (e.g., "uNode_123Scale")
 */
export function getUniformName(nodeId: string, paramName: string): string {
  // Sanitize node ID: replace non-alphanumeric with underscore
  let sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
  
  // If starts with digit, prefix with 'n'
  if (/^\d/.test(sanitizedId)) {
    sanitizedId = 'n' + sanitizedId;
  }
  
  // Sanitize parameter name: remove non-alphanumeric, capitalize first letter
  let sanitizedParam = paramName.replace(/[^a-zA-Z0-9]/g, '');
  sanitizedParam = sanitizedParam.charAt(0).toUpperCase() + sanitizedParam.slice(1);
  
  return `u${sanitizedId}${sanitizedParam}`;
}

/**
 * Hash a graph structure to detect changes.
 * Simple hash function for graph structure comparison.
 */
export function hashGraph(graph: import('../data-model/types').NodeGraph): string {
  // Create a simple hash from node IDs, connection IDs, and their relationships
  const nodeIds = graph.nodes.map(n => n.id).sort().join(',');
  const connectionIds = graph.connections.map(c => c.id).sort().join(',');
  const connections = graph.connections
    .map(c => `${c.sourceNodeId}:${c.sourcePort}->${c.targetNodeId}:${c.targetPort}`)
    .sort()
    .join(',');
  
  return `${nodeIds}|${connectionIds}|${connections}`;
}
