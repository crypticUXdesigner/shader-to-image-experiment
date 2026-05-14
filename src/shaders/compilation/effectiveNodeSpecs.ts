import type { NodeGraph, NodeInstance } from '../../data-model/types';
import type { NodeSpec, PortSpec, PortType } from '../../types/nodeSpec';

const WIDENESS: Record<Exclude<PortType, 'any'>, number> = {
  bool: 0,
  int: 1,
  float: 2,
  vec2: 3,
  vec3: 4,
  vec4: 5
};

function pickWiderType(a: PortType, b: PortType): PortType {
  if (a === 'any') return b;
  if (b === 'any') return a;
  if (a === b) return a;
  const wa = WIDENESS[a as Exclude<PortType, 'any'>] ?? -1;
  const wb = WIDENESS[b as Exclude<PortType, 'any'>] ?? -1;
  return wa >= wb ? a : b;
}

function clonePort(p: PortSpec, patch: Partial<PortSpec>): PortSpec {
  return { ...p, ...patch };
}

function getDefaultLiteralForType(type: PortType, kind: 'true' | 'false'): string | undefined {
  if (type === 'any') return undefined;
  if (type === 'bool') return kind === 'true' ? 'true' : 'false';
  if (type === 'int') return kind === 'true' ? '1' : '0';
  if (type === 'float') return kind === 'true' ? '1.0' : '0.0';
  if (type === 'vec2') return kind === 'true' ? 'vec2(1.0)' : 'vec2(0.0)';
  if (type === 'vec3') return kind === 'true' ? 'vec3(1.0)' : 'vec3(0.0)';
  if (type === 'vec4') return kind === 'true' ? 'vec4(1.0)' : 'vec4(0.0)';
  return undefined;
}

function resolveSelectBranchType(
  node: NodeInstance,
  graph: NodeGraph,
  canonical: NodeSpec,
  effectiveByNodeId: Map<string, NodeSpec>,
  nodeSpecsByType: Map<string, NodeSpec>
): PortType {
  let inferred: PortType = 'float';
  for (const conn of graph.connections) {
    if (conn.targetNodeId !== node.id) continue;
    if (conn.targetParameter) continue;
    if (conn.targetPort !== 'trueValue' && conn.targetPort !== 'falseValue') continue;

    const sourceNode = graph.nodes.find((n) => n.id === conn.sourceNodeId);
    if (!sourceNode) continue;
    const sourceSpec = effectiveByNodeId.get(sourceNode.id) ?? nodeSpecsByType.get(sourceNode.type);
    if (!sourceSpec) continue;
    const sourceOut = sourceSpec.outputs.find((o) => o.name === conn.sourcePort) ?? sourceSpec.outputs[0];
    if (!sourceOut) continue;
    inferred = pickWiderType(inferred, sourceOut.type);
  }

  // If neither branch is connected, inferred stays float (unwired branches compile as scalar zeros).
  if (inferred === 'float') return inferred;

  // If we only ever inferred 'float' via default, but the canonical spec wants any, keep float.
  // (This also ensures existing presets remain valid.)
  if (canonical.inputs.find((i) => i.name === 'trueValue')?.type !== 'any') return 'float';

  return inferred;
}

/**
 * Returns a per-node effective NodeSpec map.
 *
 * This is an escape hatch for a small number of nodes whose port types depend on connections
 * (currently: `select`). Most nodes use their canonical NodeSpec unchanged.
 */
export function computeEffectiveNodeSpecs(
  graph: NodeGraph,
  executionOrder: string[],
  nodeSpecsByType: Map<string, NodeSpec>
): Map<string, NodeSpec> {
  const effectiveByNodeId = new Map<string, NodeSpec>();

  for (const nodeId of executionOrder) {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) continue;
    const canonical = nodeSpecsByType.get(node.type);
    if (!canonical) continue;

    if (canonical.id !== 'select') {
      effectiveByNodeId.set(node.id, canonical);
      continue;
    }

    const branchType = resolveSelectBranchType(node, graph, canonical, effectiveByNodeId, nodeSpecsByType);

    const inputs = canonical.inputs.map((p) => {
      if (p.name !== 'trueValue' && p.name !== 'falseValue') return p;

      if (branchType === 'float') {
        return clonePort(p, { type: 'float', fallbackExpression: undefined });
      }

      // Non-float: parameters are float-only, so we use typed literal defaults.
      // Connected values will be promoted/demoted to this resolved port type via codegen.
      const kind = p.name === 'trueValue' ? 'true' : 'false';
      const lit = getDefaultLiteralForType(branchType, kind);
      return clonePort(p, {
        type: branchType,
        fallbackParameter: undefined,
        fallbackExpression: lit
      });
    });

    const outputs = canonical.outputs.map((o) => o.name === 'out' ? { ...o, type: branchType } : o);

    effectiveByNodeId.set(node.id, { ...canonical, inputs, outputs });
  }

  // Include any nodes not present in executionOrder (defensive; shouldn't happen in compilation)
  for (const node of graph.nodes) {
    if (effectiveByNodeId.has(node.id)) continue;
    const canonical = nodeSpecsByType.get(node.type);
    if (canonical) effectiveByNodeId.set(node.id, canonical);
  }

  return effectiveByNodeId;
}

