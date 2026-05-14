/**
 * Connection-level validation. Extracted from validation.ts for smaller module size.
 */

import type { NodeGraph, Connection } from './types';
import type { NodeSpecification } from './validationTypes';
import { isPortConnection, isParameterConnection } from './connectionUtils';
import type { ConnectionValidationContext } from './connectionValidationContext';
import { validateWebGpuExclusiveWireRules } from './webGpuExclusiveConnectionValidation';

/**
 * Validates a single connection.
 */
export function validateConnection(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: NodeSpecification[],
  errors: string[],
  warnings: string[],
  connectionValidation?: ConnectionValidationContext
): void {
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
  const hasPort = connection.targetPort != null && connection.targetPort !== '';
  const hasParam = connection.targetParameter != null && connection.targetParameter !== '';
  if (hasPort && hasParam) {
    errors.push(`Connection ${connection.id} must have exactly one of targetPort or targetParameter (both are set)`);
    return;
  }
  if (!hasPort && !hasParam) {
    errors.push(`Connection ${connection.id} missing targetPort or targetParameter (exactly one required)`);
    return;
  }

  const isVirtualNodeSource = connection.sourceNodeId.startsWith('audio-signal:');
  const sourceNode = graph.nodes.find(n => n.id === connection.sourceNodeId);
  if (!sourceNode && !isVirtualNodeSource) {
    errors.push(`Connection ${connection.id} references non-existent source node: ${connection.sourceNodeId}`);
    return;
  }
  if (isVirtualNodeSource) {
    if (connection.sourcePort !== 'out') {
      errors.push(`Connection ${connection.id} invalid: virtual node source requires sourcePort "out"`);
      return;
    }
    const targetNode = graph.nodes.find(n => n.id === connection.targetNodeId);
    if (!targetNode) {
      errors.push(`Connection ${connection.id} references non-existent target node: ${connection.targetNodeId}`);
      return;
    }
    const targetSpec = nodeSpecs.find(spec => spec.id === targetNode.type);
    if (targetSpec) {
      if (connection.targetParameter) {
        const targetParam = targetSpec.parameters?.[connection.targetParameter];
        if (!targetParam || (targetParam.type !== 'float' && targetParam.type !== 'int')) {
          errors.push(`Connection ${connection.id} target parameter ${connection.targetParameter} must be float or int`);
        }
      } else if (connection.targetPort) {
        const targetInput = targetSpec.inputs?.find(i => i.name === connection.targetPort);
        if (!targetInput || (targetInput.type !== 'float' && targetInput.type !== 'int')) {
          errors.push(`Connection ${connection.id} target port ${connection.targetPort} must be float or int for virtual node source`);
        }
      } else {
        errors.push(`Connection ${connection.id} invalid: virtual node source requires targetParameter or targetPort`);
      }
    }
    return;
  }

  const targetNode = graph.nodes.find(n => n.id === connection.targetNodeId);
  if (!targetNode) {
    errors.push(`Connection ${connection.id} references non-existent target node: ${connection.targetNodeId}`);
    return;
  }

  const sourceSpec = nodeSpecs.find(spec => spec.id === sourceNode!.type);
  if (sourceSpec && sourceNode) {
    const sourceOutput = sourceSpec.outputs?.find(o => o.name === connection.sourcePort);
    if (!sourceOutput) {
      errors.push(`Connection ${connection.id} references invalid source port: ${connection.sourcePort} on node type ${sourceNode.type}`);
    }
  }

  const targetSpec = nodeSpecs.find(spec => spec.id === targetNode.type);
  if (targetSpec) {
    if (isPortConnection(connection)) {
      const targetInput = targetSpec.inputs?.find(i => i.name === connection.targetPort);
      if (!targetInput) {
        errors.push(`Connection ${connection.id} references invalid target port: ${connection.targetPort} on node type ${targetNode.type}`);
      }
    }
    if (isParameterConnection(connection)) {
      const targetParam = targetSpec.parameters?.[connection.targetParameter];
      if (!targetParam || (targetParam.type !== 'float' && targetParam.type !== 'int')) {
        errors.push(`Connection ${connection.id} references invalid target parameter: ${connection.targetParameter} on node type ${targetNode.type} (must be float or int)`);
      }
    }
  }

  if (connection.sourceNodeId === connection.targetNodeId) {
    warnings.push(`Connection ${connection.id} connects node to itself (may cause cycles)`);
  }

  if (errors.length === 0) {
    validateWebGpuExclusiveWireRules(connection, graph, nodeSpecs, connectionValidation, errors);
  }
}
