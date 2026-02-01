import type { NodeGraph, NodeInstance, NodeSpec, UniformMetadata } from '../../types';

/**
 * Generates uniform names and metadata
 */
export class UniformGenerator {
  constructor(
    private nodeSpecs: Map<string, NodeSpec>,
    private isAudioNode: (nodeSpec: NodeSpec) => boolean,
    private getFrequencyBands: (node: NodeInstance, nodeSpec: NodeSpec) => number[][],
    private getParameterDefaultValue: (paramSpec: { type: string; default?: any }, paramName: string) => number | [number, number] | [number, number, number] | [number, number, number, number]
  ) {}

  /**
   * Sanitize uniform name according to specification
   */
  private sanitizeUniformName(nodeId: string, paramName: string): string {
    // Sanitize node ID
    let sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    if (/^\d/.test(sanitizedId)) {
      sanitizedId = 'n' + sanitizedId;
    }

    // Sanitize parameter name
    let sanitizedParam = paramName.replace(/[^a-zA-Z0-9]/g, '');
    sanitizedParam = sanitizedParam.charAt(0).toUpperCase() + sanitizedParam.slice(1);

    return `u${sanitizedId}${sanitizedParam}`;
  }

  /**
   * Generate uniform name mapping
   */
  generateUniformNameMapping(graph: NodeGraph): Map<string, string> {
    const uniformNames = new Map<string, string>();

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      // For audio nodes, generate uniforms for outputs (not just parameters)
      if (this.isAudioNode(nodeSpec)) {
        // Audio-file-input: outputs are uniforms
        if (nodeSpec.id === 'audio-file-input') {
          for (const output of nodeSpec.outputs) {
            const uniformName = this.sanitizeUniformName(node.id, output.name);
            uniformNames.set(`${node.id}.${output.name}`, uniformName);
          }
        }
        // Audio-analyzer: outputs are uniforms (bands + per-band remapped)
        else if (nodeSpec.id === 'audio-analyzer') {
          const frequencyBands = this.getFrequencyBands(node, nodeSpec);
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = this.sanitizeUniformName(node.id, `band${i}`);
            uniformNames.set(`${node.id}.band${i}`, uniformName);
          }
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = this.sanitizeUniformName(node.id, `remap${i}`);
            uniformNames.set(`${node.id}.remap${i}`, uniformName);
          }
        }
      }

      // Generate uniforms for all parameters in the spec (not just those in node.parameters)
      // This ensures we have uniforms for parameters that use default values
      // Skip array and string parameters - they are handled specially at compile time
      // Skip parameters that are connected to outputs - they get their value from the connection
      // Skip runtime-only parameters that are not shader uniforms
      for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
        // Skip array parameters - they can't be uniforms
        if (paramSpec.type === 'array') {
          continue;
        }
        // Skip string parameters - they are handled at compile time (e.g., swizzle node)
        if (paramSpec.type === 'string') {
          continue;
        }
        // Skip runtime-only parameters for audio-file-input nodes
        if (nodeSpec.id === 'audio-file-input' && (paramName === 'filePath' || paramName === 'autoPlay')) {
          continue;
        }
        // Skip runtime-only parameters for audio-analyzer nodes
        if (nodeSpec.id === 'audio-analyzer' && (paramName === 'frequencyBands' || paramName === 'smoothing' || paramName === 'fftSize')) {
          continue;
        }
        // Skip per-band remap params (used in JS to compute remap uniforms, not shader uniforms)
        if (nodeSpec.id === 'audio-analyzer' && /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(paramName)) {
          continue;
        }
        // Check if parameter is connected to an output
        const isConnected = graph.connections.some(
          conn => conn.targetNodeId === node.id && conn.targetParameter === paramName
        );
        if (isConnected) {
          // Parameter has input connection - check the input mode
          // If mode is 'override', the input completely replaces the config value, so no uniform needed
          // But if mode is 'add', 'subtract', or 'multiply', the uniform IS needed for the combination expression
          const inputMode = node.parameterInputModes?.[paramName] || 
                           paramSpec.inputMode || 
                           'override';
          
          // Only skip uniform generation if mode is explicitly 'override'
          if (inputMode === 'override') {
            continue;
          }
          // For add/subtract/multiply modes, we still need the uniform for the combination expression
        }
        const uniformName = this.sanitizeUniformName(node.id, paramName);
        uniformNames.set(`${node.id}.${paramName}`, uniformName);
      }
    }

    return uniformNames;
  }

  /**
   * Find which uniforms are actually used in the shader code
   */
  findUsedUniforms(
    mainCode: string,
    functions: string,
    uniformNames: Map<string, string>
  ): Set<string> {
    const usedUniforms = new Set<string>();
    const allCode = mainCode + '\n' + functions;
    
    // Check each uniform name to see if it appears in the code
    for (const uniformName of uniformNames.values()) {
      // Check if uniform name appears in the code
      // Use indexOf for simple substring match - this is more reliable than regex for uniform names
      // Uniform names are unique identifiers, so substring match is safe
      if (allCode.includes(uniformName)) {
        usedUniforms.add(uniformName);
      }
    }
    
    // Always include global uniforms
    usedUniforms.add('uTime');
    usedUniforms.add('uResolution');
    
    return usedUniforms;
  }

  /**
   * Generate uniform metadata
   */
  generateUniformMetadata(
    graph: NodeGraph,
    uniformNames: Map<string, string>,
    usedUniforms: Set<string>
  ): UniformMetadata[] {
    const uniforms: UniformMetadata[] = [];

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      // Handle audio nodes that provide outputs as uniforms
      // IMPORTANT: Audio output uniforms must ALWAYS be included, regardless of "used" check,
      // because they are runtime-provided uniforms that are updated every frame by AudioManager.
      // Even if they're not detected as "used" in the shader code, they must exist.
      if (this.isAudioNode(nodeSpec)) {
        if (nodeSpec.id === 'audio-file-input') {
          // Outputs are uniforms - always include them
          for (const output of nodeSpec.outputs) {
            const uniformName = uniformNames.get(`${node.id}.${output.name}`);
            if (!uniformName) continue;
            // Don't check usedUniforms - audio outputs must always be declared

            uniforms.push({
              name: uniformName,
              nodeId: node.id,
              paramName: output.name, // Use output name as paramName for metadata
              type: output.type === 'float' ? 'float' : 'float', // All audio outputs are float for now
              defaultValue: 0.0
            });
          }
        } else if (nodeSpec.id === 'audio-analyzer') {
          // Dynamic outputs (bands + per-band remapped) - always include them
          const frequencyBands = this.getFrequencyBands(node, nodeSpec);
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = uniformNames.get(`${node.id}.band${i}`);
            if (!uniformName) continue;
            uniforms.push({
              name: uniformName,
              nodeId: node.id,
              paramName: `band${i}`,
              type: 'float',
              defaultValue: 0.0
            });
          }
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = uniformNames.get(`${node.id}.remap${i}`);
            if (!uniformName) continue;
            uniforms.push({
              name: uniformName,
              nodeId: node.id,
              paramName: `remap${i}`,
              type: 'float',
              defaultValue: 0.0
            });
          }
        }
      }

      // Process all parameters from the spec (not just those in node.parameters)
      // This ensures we generate uniforms for all parameters, even if they use defaults
      for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
        // Skip array parameters - they are inlined as constants
        if (paramSpec.type === 'array') {
          continue;
        }
        
        const uniformName = uniformNames.get(`${node.id}.${paramName}`);
        if (!uniformName) continue;
        
        // Only include uniforms that are actually used in the shader code
        // This prevents WebGL from optimizing them out and causing warnings
        // Exception: Audio output uniforms are always included (handled above)
        if (!usedUniforms.has(uniformName)) {
          continue;
        }

        // Determine GLSL type
        let glslType: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4' = 'float';
        if (paramSpec.type === 'int') {
          glslType = 'int';
        } else if (paramSpec.type === 'vec4') {
          glslType = 'vec4';
        }

        // Get default value - prefer node's parameter value over spec default
        let defaultValue: number | [number, number] | [number, number, number] | [number, number, number, number];
        const paramValue = node.parameters[paramName];
        if (paramValue !== undefined && typeof paramValue === 'number') {
          // Use node's parameter value
          defaultValue = paramValue;
        } else if (paramValue !== undefined && Array.isArray(paramValue)) {
          // Use node's parameter array value
          defaultValue = paramValue as any;
        } else {
          // Fall back to spec default
          defaultValue = this.getParameterDefaultValue(paramSpec, paramName);
        }

        uniforms.push({
          name: uniformName,
          nodeId: node.id,
          paramName: paramName,
          type: glslType,
          defaultValue: defaultValue as any
        });
      }
    }

    return uniforms;
  }
}
