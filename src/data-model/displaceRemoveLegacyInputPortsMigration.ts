/**
 * Removes connections to legacy `displace` input ports `offset` and `amount` (ports removed; use parameters only).
 */

import type { NodeGraph } from './types';

const DISPLACE_TYPE = 'displace';
const REMOVED_TARGET_PORTS = new Set(['offset', 'amount']);

export function migrateDisplaceRemoveLegacyInputPorts(graph: NodeGraph): NodeGraph {
  const displaceIds = new Set(
    graph.nodes.filter((n) => n.type === DISPLACE_TYPE).map((n) => n.id)
  );
  if (displaceIds.size === 0) return graph;

  const next = graph.connections.filter((c) => {
    if (!displaceIds.has(c.targetNodeId)) return true;
    if (c.targetPort != null && REMOVED_TARGET_PORTS.has(c.targetPort)) return false;
    return true;
  });

  if (next.length === graph.connections.length) return graph;
  return { ...graph, connections: next };
}
