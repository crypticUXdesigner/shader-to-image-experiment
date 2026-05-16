import type { NodeGraph, NodeInstance } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { isVirtualNodeId } from '../../utils/virtualNodes';
import { generateOutputVariableName } from './MainCodeGeneratorUtils';

/**
 * Resolves float parameter → GLSL variable references from parameter connections.
 * Matches MainCodeGeneratorNodeCode: execution order, virtual audio uniforms, tie-break when
 * multiple sources target the same float parameter, and optional effective specs for polymorphic
 * upstream nodes (e.g. `select`).
 */
export function resolveFloatParameterInputVarsFromConnections(
  node: NodeInstance,
  nodeSpec: NodeSpec,
  graph: NodeGraph,
  executionOrder: string[],
  variableNames: Map<string, Map<string, string>>,
  uniformNames: Map<string, string>,
  nodeSpecs: Map<string, NodeSpec>,
  effectiveNodeSpecsById?: Map<string, NodeSpec>
): Map<string, string> {
  const parameterInputVars = new Map<string, string>();
  const paramSourceIndex = new Map<string, number>();
  const targetIndex = executionOrder.indexOf(node.id);
  const effectiveTargetIndex = targetIndex < 0 ? executionOrder.length : targetIndex;

  for (const conn of graph.connections) {
    if (conn.disabled) continue;
    if (conn.targetNodeId !== node.id || !conn.targetParameter) continue;
    const paramSpec = nodeSpec.parameters[conn.targetParameter];
    if (!paramSpec || paramSpec.type !== 'float') continue;

    if (isVirtualNodeId(conn.sourceNodeId) && conn.sourcePort === 'out') {
      const uniformName = uniformNames.get(conn.sourceNodeId);
      if (uniformName) {
        parameterInputVars.set(conn.targetParameter, uniformName);
        paramSourceIndex.set(conn.targetParameter, -1);
      }
      continue;
    }

    const sourceNode = graph.nodes.find((n) => n.id === conn.sourceNodeId);
    if (!sourceNode) continue;
    const sourceSpec =
      effectiveNodeSpecsById?.get(sourceNode.id) ?? nodeSpecs.get(sourceNode.type);
    if (!sourceSpec) continue;
    const sourceOutput =
      sourceSpec.outputs.find((o) => o.name === conn.sourcePort) ?? sourceSpec.outputs[0];
    if (!sourceOutput) continue;

    const sourceIndex = executionOrder.indexOf(conn.sourceNodeId);
    if (sourceIndex < 0 || sourceIndex >= effectiveTargetIndex) continue;
    const existingIndex = paramSourceIndex.get(conn.targetParameter) ?? -1;
    if (sourceIndex <= existingIndex) continue;

    const sourcePortName = sourceOutput.name;
    let sourceVarName = variableNames.get(conn.sourceNodeId)?.get(sourcePortName);
    if (!sourceVarName) {
      sourceVarName = generateOutputVariableName(conn.sourceNodeId, sourcePortName);
      console.warn(
        `[NodeShaderCompiler] Variable name not in map for param connection, using fallback: ` +
          `${conn.sourceNodeId}.${sourcePortName} -> ${node.id}.${conn.targetParameter} => ${sourceVarName}`
      );
    }

    let promotedVar = sourceVarName;
    if (sourceOutput.type === 'int') {
      promotedVar = `float(${sourceVarName})`;
    } else if (sourceOutput.type !== 'float') {
      promotedVar = `${sourceVarName}.x`;
    }
    parameterInputVars.set(conn.targetParameter, promotedVar);
    paramSourceIndex.set(conn.targetParameter, sourceIndex);
  }

  return parameterInputVars;
}
