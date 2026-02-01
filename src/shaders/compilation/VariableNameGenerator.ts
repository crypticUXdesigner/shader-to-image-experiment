import type { NodeGraph, NodeInstance, NodeSpec } from '../../types';

/**
 * Generates variable names for node outputs
 */
export class VariableNameGenerator {
  constructor(
    private nodeSpecs: Map<string, NodeSpec>,
    private getFrequencyBands: (node: NodeInstance, nodeSpec: NodeSpec) => number[][]
  ) {}

  /**
   * Generate variable names for all node outputs
   */
  generateVariableNames(graph: NodeGraph): Map<string, Map<string, string>> {
    const variableNames = new Map<string, Map<string, string>>();

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      const nodeVars = new Map<string, string>();
      
      // Handle audio-analyzer dynamic outputs (bands + per-band remapped)
      if (nodeSpec.id === 'audio-analyzer') {
        const frequencyBands = this.getFrequencyBands(node, nodeSpec);
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = this.generateVariableName(node.id, `band${i}`);
          nodeVars.set(`band${i}`, varName);
        }
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = this.generateVariableName(node.id, `remap${i}`);
          nodeVars.set(`remap${i}`, varName);
        }
      } else {
        // Standard outputs
        for (const output of nodeSpec.outputs) {
          const varName = this.generateVariableName(node.id, output.name);
          nodeVars.set(output.name, varName);
        }
      }
      
      variableNames.set(node.id, nodeVars);
    }

    return variableNames;
  }

  /**
   * Generate a variable name for a node output
   */
  generateVariableName(nodeId: string, portName: string): string {
    const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedPort = portName.replace(/[^a-zA-Z0-9]/g, '_');
    return `node_${sanitizedId}_${sanitizedPort}`;
  }

  /**
   * Generate a variable name for an array parameter
   */
  generateArrayVariableName(nodeId: string, paramName: string): string {
    const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedParam = paramName.replace(/[^a-zA-Z0-9]/g, '_');
    return `array_${sanitizedId}_${sanitizedParam}`;
  }
}
