/**
 * Compile-graph view for the per-node Power feature.
 *
 * Builds a derived `{ compileConnections, bypassedNodeIds }` view from a graph + spec map,
 * scoped to a single `compile()` call. The graph itself is **not** mutated; this view is the
 * compiler's read-only filter over `graph.connections` so bypassed nodes drop out of GLSL/WGSL
 * codegen without changing the data model.
 *
 * Two rules (see `docs/implementation/node-power/_OVERVIEW.md`):
 *
 * - **Rule A — passthrough.** `inputs[0].type === outputs[0].type`. The bypassed node's
 *   primary output is rewritten in this view to point at the bypassed node's primary input
 *   upstream (chain through nested Rule A bypasses; degenerate to drop if the chain ends in
 *   an unconnected primary input or a Rule B bypassed node).
 * - **Rule B — disconnect.** No inputs OR `inputs[0].type !== outputs[0].type`. All outgoing
 *   wires from the bypassed node are removed; consumers fall back to their own existing
 *   `fallbackParameter` / `fallbackExpression` / port defaults via the normal codegen path.
 *
 * Bypassed nodes are returned in `bypassedNodeIds` so callers can filter them out of the
 * compiled `executionOrder` after topological sort. They contribute no GPU code.
 *
 * Multi-output Rule A nodes: only the primary `outputs[0]` is bridged. Wires from secondary
 * outputs of a Rule A bypassed node are dropped (treated as Rule B for that wire only). The
 * convention is "first input → first output", which holds for every node currently eligible.
 */
import type { Connection, NodeGraph } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { nodePowerRule } from '../nodePower';

/**
 * Compile-graph view returned to `NodeShaderCompiler` and the WGSL MVP path.
 *
 * `compileConnections` is a structurally-shared subset of `graph.connections` with Rule A
 * sources rewritten and Rule B / dangling Rule A outgoing wires removed.
 *
 * `bypassedNodeIds` is the union of Rule A and Rule B bypassed node ids that should be
 * dropped from `executionOrder` so they emit no main code.
 */
export interface CompileGraphView {
  compileConnections: Connection[];
  bypassedNodeIds: ReadonlySet<string>;
}

/** Maximum hops walked when chaining through nested Rule A bypasses; guards against malformed graphs. */
const RULE_A_CHAIN_GUARD = 64;

/**
 * Build the per-compile graph view. Pure: same inputs → same output, no side effects on `graph`.
 *
 * Performance characteristics: O(N + C) for the bypass scan, plus O(C) for the connection
 * pass. Each Rule A rewrite walks at most `RULE_A_CHAIN_GUARD` upstream hops via the
 * pre-built `primaryUpstreamByNodeId` index.
 */
export function buildCompileGraphView(
  graph: NodeGraph,
  nodeSpecs: Map<string, NodeSpec>
): CompileGraphView {
  const bypassedA = new Set<string>();
  const bypassedB = new Set<string>();
  const primaryOutputByNodeId = new Map<string, string>();
  const primaryInputByNodeId = new Map<string, string>();

  for (const node of graph.nodes) {
    if (!node.bypassed) continue;
    const spec = nodeSpecs.get(node.type);
    if (!spec) continue;
    const rule = nodePowerRule(spec);
    if (rule === 'none') continue;
    if (rule === 'A') {
      bypassedA.add(node.id);
      primaryOutputByNodeId.set(node.id, spec.outputs[0].name);
      primaryInputByNodeId.set(node.id, spec.inputs[0].name);
    } else {
      bypassedB.add(node.id);
    }
  }

  const bypassedNodeIds: ReadonlySet<string> = new Set([...bypassedA, ...bypassedB]);

  if (bypassedA.size === 0 && bypassedB.size === 0) {
    return { compileConnections: graph.connections, bypassedNodeIds };
  }

  // Index of each Rule A bypassed node's primary upstream wire (the connection feeding its
  // first input port). Lets the rewrite chain through nested Rule A bypasses without scanning
  // `graph.connections` each hop.
  const primaryUpstreamByNodeId = new Map<string, { sourceNodeId: string; sourcePort: string }>();
  for (const nodeId of bypassedA) {
    const inputName = primaryInputByNodeId.get(nodeId);
    if (!inputName) continue;
    const conn = graph.connections.find(
      (c) => c.targetNodeId === nodeId && c.targetPort === inputName
    );
    if (conn) {
      primaryUpstreamByNodeId.set(nodeId, {
        sourceNodeId: conn.sourceNodeId,
        sourcePort: conn.sourcePort
      });
    }
  }

  /**
   * Walk through nested Rule A bypasses to find the first non-bypassed source.
   * Returns null if the chain hits a Rule B bypass, an unconnected primary input,
   * or exceeds the safety guard.
   */
  const resolveRuleASource = (
    startSourceNodeId: string,
    startSourcePort: string
  ): { sourceNodeId: string; sourcePort: string } | null => {
    let current = { sourceNodeId: startSourceNodeId, sourcePort: startSourcePort };
    for (let hop = 0; hop < RULE_A_CHAIN_GUARD; hop++) {
      if (bypassedB.has(current.sourceNodeId)) return null;
      if (!bypassedA.has(current.sourceNodeId)) return current;
      // Only the primary output participates in Rule A bridging. Wires from a secondary
      // output of a Rule A bypassed node have no upstream to bridge to → drop.
      const primaryOutput = primaryOutputByNodeId.get(current.sourceNodeId);
      if (!primaryOutput || current.sourcePort !== primaryOutput) return null;
      const upstream = primaryUpstreamByNodeId.get(current.sourceNodeId);
      if (!upstream) return null;
      current = upstream;
    }
    return null;
  };

  const compileConnections: Connection[] = [];
  for (const c of graph.connections) {
    if (c.disabled) continue;
    if (bypassedB.has(c.sourceNodeId)) continue;
    if (bypassedA.has(c.sourceNodeId)) {
      const resolved = resolveRuleASource(c.sourceNodeId, c.sourcePort);
      if (!resolved) continue;
      if (
        resolved.sourceNodeId === c.sourceNodeId &&
        resolved.sourcePort === c.sourcePort
      ) {
        compileConnections.push(c);
      } else {
        compileConnections.push({
          ...c,
          sourceNodeId: resolved.sourceNodeId,
          sourcePort: resolved.sourcePort
        });
      }
      continue;
    }
    compileConnections.push(c);
  }

  return { compileConnections, bypassedNodeIds };
}

/**
 * Filter an execution order to drop bypassed node ids. Returns the same array reference when
 * no nodes are filtered, so existing snapshot tests stay byte-identical for graphs without
 * any bypassed nodes.
 */
export function filterExecutionOrderForBypass(
  executionOrder: string[],
  bypassedNodeIds: ReadonlySet<string>
): string[] {
  if (bypassedNodeIds.size === 0) return executionOrder;
  const next = executionOrder.filter((id) => !bypassedNodeIds.has(id));
  if (next.length === executionOrder.length) return executionOrder;
  return next;
}
