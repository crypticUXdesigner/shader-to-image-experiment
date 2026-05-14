/**
 * Removes legacy `color-map` nodes (float → vec3 broadcast) by splicing upstream through to
 * former downstream targets. The editor/compiler already allow float→vec3 promotion, so this
 * node is redundant on disk after migration.
 *
 * Semantics (per removed node `N` of type `color-map`):
 * - Find the port connection targeting `N`'s `in` input (if any). Parameter wires to `in` are
 *   not used by this node in practice; we only match `targetPort === 'in'`.
 * - Find all connections with `sourceNodeId === N` and `sourcePort === 'out'`.
 * - Drop `N` and every connection incident on `N`.
 * - If an incoming wire exists: for each outgoing wire `C`, add `incoming.source → C.target`
 *   with the same port/parameter target fields as `C`. `disabled` is set when either the
 *   incoming or outgoing wire was disabled (both are ignored by compilation when disabled).
 * - If no incoming wire: only removals apply; downstream inputs become unwired.
 *
 * Chains (`… → color-map → color-map → …`) are handled by repeating until no `color-map`
 * nodes remain (each pass removes at least one node).
 */

import type { Connection, NodeGraph } from './types';
import { isPortConnection, isParameterConnection } from './connectionUtils';
import { generateConnectionId, getConnectionIds } from './utils';

/** Serialized `type` for the removed float→vec3 node; kept for migration + legacy tests only. */
export const LEGACY_COLOR_MAP_NODE_TYPE = 'color-map' as const;

function spliceOneColorMapNode(graph: NodeGraph, nodeId: string): NodeGraph {
  const incoming = graph.connections.find(
    (c) => c.targetNodeId === nodeId && c.targetPort === 'in'
  );
  const outgoing = graph.connections.filter(
    (c) => c.sourceNodeId === nodeId && c.sourcePort === 'out'
  );

  const connectionsWithout = graph.connections.filter(
    (c) => c.sourceNodeId !== nodeId && c.targetNodeId !== nodeId
  );

  const idSet = getConnectionIds({ ...graph, connections: connectionsWithout });
  const bridges: Connection[] = [];

  if (incoming) {
    for (const out of outgoing) {
      const mergedDisabled = !!(incoming.disabled || out.disabled);
      const id = generateConnectionId(idSet);
      idSet.add(id);
      const base: Connection = {
        id,
        sourceNodeId: incoming.sourceNodeId,
        sourcePort: incoming.sourcePort,
        targetNodeId: out.targetNodeId,
      };

      let conn: Connection;
      if (isPortConnection(out)) {
        conn = { ...base, targetPort: out.targetPort };
      } else if (isParameterConnection(out)) {
        conn = { ...base, targetParameter: out.targetParameter };
      } else {
        continue;
      }
      if (mergedDisabled) {
        conn = { ...conn, disabled: true };
      }
      bridges.push(conn);
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.filter((n) => n.id !== nodeId),
    connections: [...connectionsWithout, ...bridges],
  };
}

export function migrateRemoveColorMapNodes(graph: NodeGraph): NodeGraph {
  let next = graph;
  while (next.nodes.some((n) => n.type === LEGACY_COLOR_MAP_NODE_TYPE)) {
    const victim = next.nodes.find((n) => n.type === LEGACY_COLOR_MAP_NODE_TYPE)!;
    next = spliceOneColorMapNode(next, victim.id);
  }
  return next;
}
