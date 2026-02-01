import type { NodeGraph, NodeInstance, NodeSpec } from '../../types';

/**
 * Base shader template for node-based shader system
 */
const BASE_SHADER_TEMPLATE = `#version 300 es
precision highp float;

// Global uniforms
uniform vec2 uResolution;
uniform float uTime;

{{UNIFORMS}}

// Global variable declarations (accessible in functions)
{{VARIABLE_DECLARATIONS}}

{{FUNCTIONS}}

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = (uv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  
  {{MAIN_CODE}}
  
  fragColor = vec4({{FINAL_COLOR}}, 1.0);
}`;

/**
 * Generates main shader code and assembles the final shader
 */
export class MainCodeGenerator {
  constructor(
    private nodeSpecs: Map<string, NodeSpec>,
    private isAudioNode: (nodeSpec: NodeSpec) => boolean,
    private getFrequencyBands: (node: NodeInstance, nodeSpec: NodeSpec) => number[][],
    private generateArrayVariableName: (nodeId: string, paramName: string) => string,
    private escapeRegex: (str: string) => string,
    private generateParameterCombination: (
      configValue: string,
      inputValue: string,
      mode: 'override' | 'add' | 'subtract' | 'multiply',
      paramType: 'float' | 'int'
    ) => string,
    private generateSwizzleCode: (
      code: string,
      swizzleValue: string,
      inputVars: Map<string, string>,
      outputVars: Map<string, string>
    ) => string,
    // normalizeSwizzlePattern: kept for API consistency but not currently used
    _normalizeSwizzlePattern: (pattern: string) => string | null
  ) {
    // Constructor parameter accepted but intentionally unused
  }

  /**
   * Generate main code for all nodes in execution order
   * Returns both variable declarations (for global scope) and main code (for main function)
   */
  generateMainCode(
    graph: NodeGraph,
    executionOrder: string[],
    variableNames: Map<string, Map<string, string>>,
    uniformNames: Map<string, string>,
    functionNameMap: Map<string, Map<string, string>> = new Map()
  ): { variableDeclarations: string; mainCode: string } {
    const variableDeclarations: string[] = [];
    const mainCode: string[] = [];
    const declaredVars = new Set<string>(); // Track declared variables

    // First, declare all output variables at function scope so they're accessible across nodes
    // Declare for ALL nodes in the graph, not just execution order, to ensure all variables exist
    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) {
        // Node type not found - this should have been caught in validation, but continue gracefully
        continue;
      }

      const outputVars = variableNames.get(node.id);
      if (!outputVars || outputVars.size === 0) {
        // No output variables generated for this node - this can happen if:
        // 1. Node has no outputs (shouldn't happen for nodes with connections)
        // 2. Variable generation failed (shouldn't happen if nodeSpec exists)
        // Log a warning but continue - this might be expected for some node types
        if (nodeSpec.outputs && nodeSpec.outputs.length > 0) {
          console.warn(
            `[NodeShaderCompiler] Node ${node.type} (${node.id}) has outputs in spec but no variables generated`
          );
        }
        continue;
      }
      
      // Handle audio-analyzer dynamic outputs (bands + per-band remapped)
      if (nodeSpec.id === 'audio-analyzer') {
        const frequencyBands = this.getFrequencyBands(node, nodeSpec);
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = outputVars.get(`band${i}`);
          if (varName) {
            const initValue = this.getOutputInitialValue('float', nodeSpec.id);
            variableDeclarations.push(`float ${varName} = ${initValue};`);
            declaredVars.add(varName);
          }
        }
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = outputVars.get(`remap${i}`);
          if (varName) {
            const initValue = this.getOutputInitialValue('float', nodeSpec.id);
            variableDeclarations.push(`float ${varName} = ${initValue};`);
            declaredVars.add(varName);
          }
        }
      } else {
        // Standard outputs (including audio-file-input and audio-remap)
        for (const output of nodeSpec.outputs) {
          const varName = outputVars.get(output.name);
          if (varName) {
            const initValue = this.getOutputInitialValue(output.type, nodeSpec.id);
            // Declare at global scope (without const) so it can be reassigned from uniforms (for audio nodes)
            variableDeclarations.push(`${output.type} ${varName} = ${initValue};`);
            declaredVars.add(varName);
          } else {
            // Variable name not found in outputVars - this shouldn't happen if generateVariableNames worked correctly
            console.warn(
              `[NodeShaderCompiler] Variable name not found for ${node.type} (${node.id}).${output.name}`
            );
          }
        }
      }
    }

    // Validate that all variables referenced in connections are declared
    for (const conn of graph.connections) {
      const sourceVarName = variableNames.get(conn.sourceNodeId)?.get(conn.sourcePort);
      if (sourceVarName && !declaredVars.has(sourceVarName)) {
        const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
        console.error(
          `[NodeShaderCompiler] Variable ${sourceVarName} is referenced but not declared. ` +
          `Source node: ${sourceNode?.type || 'unknown'} (${conn.sourceNodeId}).${conn.sourcePort}`
        );
        // This is a critical error - the shader will fail to compile
        // We should ensure the variable is declared
        if (sourceNode) {
          const sourceSpec = this.nodeSpecs.get(sourceNode.type);
          if (sourceSpec && sourceSpec.outputs) {
            const output = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
            if (output) {
              // Force declare the variable - add it to the global declarations
              const initValue = this.getOutputInitialValue(output.type, sourceSpec.id);
              variableDeclarations.push(`${output.type} ${sourceVarName} = ${initValue};`);
              declaredVars.add(sourceVarName);
              console.warn(
                `[NodeShaderCompiler] Force-declared missing variable ${sourceVarName} for ${sourceNode.type} (${conn.sourceNodeId})`
              );
            }
          }
        }
      }
    }

    // Then generate node code in execution order (inside blocks for scoping)
    // Debug: Log execution order for turbulence debugging
    const hasTurbulence = graph.nodes.some(n => n.type === 'turbulence');
    if (hasTurbulence) {
      console.log(`[Execution Order] Total nodes: ${executionOrder.length}`, executionOrder);
    }
    
    for (const nodeId of executionOrder) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;
      
      // Debug: Log when processing nodes that might be connected to turbulence
      if (hasTurbulence && (node.type === 'audio-remap' || node.type === 'turbulence')) {
        const outputVars = variableNames.get(node.id);
        const outVar = outputVars?.get('out');
        console.log(`[Execution Order] Processing ${node.type} (${nodeId}), output var: ${outVar}`);
      }

      // Skip audio nodes that provide uniforms (audio-file-input, audio-analyzer)
      // They don't generate GLSL code, their outputs are uniforms
      if (this.isAudioNode(nodeSpec) && 
          (nodeSpec.id === 'audio-file-input' || nodeSpec.id === 'audio-analyzer')) {
        // Generate code to read from uniforms and assign to output variables
        const nodeCode = this.generateAudioNodeCode(node, nodeSpec, graph, variableNames, uniformNames);
        if (nodeCode.trim()) {
          mainCode.push(`  // Node: ${nodeSpec.displayName} (${nodeId})`);
          mainCode.push('  {');
          const indentedCode = nodeCode.split('\n').map(line => line ? '  ' + line : line).join('\n');
          mainCode.push(indentedCode);
          mainCode.push('  }');
          mainCode.push('');
        }
        continue;
      }

      // Skip final-output nodes - they're terminal nodes with no code to generate
      // The compiler uses their input connection directly in generateFinalColorVariable
      if (nodeSpec.id === 'final-output') {
        continue;
      }

      const nodeCode = this.generateNodeCode(node, nodeSpec, graph, executionOrder, variableNames, uniformNames, functionNameMap);
      mainCode.push(`  // Node: ${nodeSpec.displayName} (${nodeId})`);
      // Wrap each node's code in a block scope to prevent variable name collisions
      mainCode.push('  {');
      // Indent the node code
      const indentedCode = nodeCode.split('\n').map(line => line ? '  ' + line : line).join('\n');
      mainCode.push(indentedCode);
      mainCode.push('  }');
      mainCode.push('');
    }

    return {
      variableDeclarations: variableDeclarations.join('\n'),
      mainCode: mainCode.join('\n')
    };
  }

  /**
   * Generate code for audio nodes that provide uniforms
   */
  private generateAudioNodeCode(
    node: NodeInstance,
    nodeSpec: NodeSpec,
    _graph: NodeGraph,
    variableNames: Map<string, Map<string, string>>,
    uniformNames: Map<string, string>
  ): string {
    const code: string[] = [];
    const outputVars = variableNames.get(node.id) || new Map();

    if (nodeSpec.id === 'audio-file-input') {
      // Read uniforms and assign to output variables
      for (const output of nodeSpec.outputs) {
        const varName = outputVars.get(output.name);
        const uniformName = uniformNames.get(`${node.id}.${output.name}`);
        if (varName && uniformName) {
          code.push(`${varName} = ${uniformName};`);
        }
      }
    } else if (nodeSpec.id === 'audio-analyzer') {
      const frequencyBands = this.getFrequencyBands(node, nodeSpec);
      for (let i = 0; i < frequencyBands.length; i++) {
        const varName = outputVars.get(`band${i}`);
        const uniformName = uniformNames.get(`${node.id}.band${i}`);
        if (varName && uniformName) {
          code.push(`${varName} = ${uniformName};`);
        }
      }
      for (let i = 0; i < frequencyBands.length; i++) {
        const varName = outputVars.get(`remap${i}`);
        const uniformName = uniformNames.get(`${node.id}.remap${i}`);
        if (varName && uniformName) {
          code.push(`${varName} = ${uniformName};`);
        }
      }
    }

    return code.join('\n');
  }

  /**
   * Generate code for a single node
   */
  private generateNodeCode(
    node: NodeInstance,
    nodeSpec: NodeSpec,
    graph: NodeGraph,
    executionOrder: string[],
    variableNames: Map<string, Map<string, string>>,
    uniformNames: Map<string, string>,
    functionNameMap: Map<string, Map<string, string>> = new Map()
  ): string {
    const code: string[] = [];

    // Get input variable names (from connections)
    const inputVars = new Map<string, string>();
    for (const conn of graph.connections) {
      if (conn.targetNodeId === node.id && conn.targetPort) {
        const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
        if (!sourceNode) continue;

        const sourceSpec = this.nodeSpecs.get(sourceNode.type);
        if (!sourceSpec) continue;

        const sourceOutput = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
        const targetInput = nodeSpec.inputs.find(i => i.name === conn.targetPort);
        if (!sourceOutput || !targetInput) continue;

        const sourceVarName = variableNames.get(conn.sourceNodeId)?.get(conn.sourcePort);
        if (sourceVarName) {
          // Check if type promotion is needed
          const promotedVar = this.generatePromotionCode(
            sourceVarName,
            sourceOutput.type,
            targetInput.type
          );
          inputVars.set(conn.targetPort, promotedVar);
        } else {
          // This should not happen if variable generation is correct, but log for debugging
          console.warn(
            `[NodeShaderCompiler] Could not find variable for connection: ` +
            `${conn.sourceNodeId}.${conn.sourcePort} -> ${node.id}.${conn.targetPort}`
          );
        }
      }
    }

    // Get parameter input variable names (from parameter connections).
    // When multiple connections target the same parameter (invalid but possible), prefer the source
    // that is topologically closest to this node (latest in execution order), so e.g. one-minus -> hexGap
    // wins over audio-analyzer -> hexGap when both exist.
    const parameterInputVars = new Map<string, string>();
    const paramSourceIndex = new Map<string, number>(); // paramName -> executionOrder index of chosen source
    const targetIndex = executionOrder.indexOf(node.id);
    // If node not in execution order (e.g. should not happen), allow any source so we don't drop all param connections
    const effectiveTargetIndex = targetIndex < 0 ? executionOrder.length : targetIndex;
    for (const conn of graph.connections) {
      if (conn.targetNodeId !== node.id || !conn.targetParameter) continue;
      const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
      if (!sourceNode) continue;

      const sourceSpec = this.nodeSpecs.get(sourceNode.type);
      if (!sourceSpec) continue;

      const sourceOutput = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
      const paramSpec = nodeSpec.parameters[conn.targetParameter];
      if (!sourceOutput || !paramSpec || paramSpec.type !== 'float') continue;

      const sourceIndex = executionOrder.indexOf(conn.sourceNodeId);
      if (sourceIndex < 0 || sourceIndex >= effectiveTargetIndex) continue; // source must run before target
      const existingIndex = paramSourceIndex.get(conn.targetParameter) ?? -1;
      if (sourceIndex <= existingIndex) continue; // keep connection whose source is later (closer to target)

      let sourceVarName = variableNames.get(conn.sourceNodeId)?.get(conn.sourcePort);
      if (!sourceVarName) {
        sourceVarName = this.generateOutputVariableName(conn.sourceNodeId, conn.sourcePort);
        console.warn(
          `[NodeShaderCompiler] Variable name not in map for connection, using fallback: ` +
          `${conn.sourceNodeId}.${conn.sourcePort} -> ${node.id}.${conn.targetParameter} => ${sourceVarName}`
        );
      }

      let promotedVar = sourceVarName;
      if (sourceOutput.type === 'int') {
        promotedVar = `float(${sourceVarName})`;
      } else if (sourceOutput.type !== 'float') {
        promotedVar = `${sourceVarName}.x`;
      }
      if (nodeSpec.id === 'turbulence' && conn.targetParameter === 'turbulenceTimeOffset') {
        console.log(`[Turbulence TimeOffset Connection] Found connection for ${node.id}:`, {
          sourceNodeId: conn.sourceNodeId,
          sourcePort: conn.sourcePort,
          sourceVarName,
          promotedVar,
          targetParameter: conn.targetParameter
        });
      }
      parameterInputVars.set(conn.targetParameter, promotedVar);
      paramSourceIndex.set(conn.targetParameter, sourceIndex);
    }

    // Initialize inputs that aren't connected (use defaults)
    // Note: Input nodes (UV, Time, etc.) generate their own values and don't need defaults
    const isInputNode = nodeSpec.category === 'Inputs' || 
                        nodeSpec.id === 'uv-coordinates' || 
                        nodeSpec.id === 'time' || 
                        nodeSpec.id === 'resolution' ||
                        nodeSpec.id === 'fragment-coordinates' ||
                        nodeSpec.id === 'constant-float' ||
                        nodeSpec.id === 'constant-vec2' ||
                        nodeSpec.id === 'constant-vec3';
    
    if (!isInputNode) {
      for (const input of nodeSpec.inputs) {
        if (!inputVars.has(input.name)) {
          const defaultValue = this.getInputDefaultValue(input.type);
          inputVars.set(input.name, defaultValue);
        }
      }
    }

    // Get output variable names
    const outputVars = variableNames.get(node.id) || new Map();

    // Generate constant array declarations for array parameters
    for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
      if (paramSpec.type === 'array') {
        const arrayValue = node.parameters[paramName] as number[] | undefined;
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          const arrayVarName = this.generateArrayVariableName(node.id, paramName);
          const arrayValues = arrayValue.map(v => v.toFixed(10)).join(', ');
          // GLSL ES 3.0 const array initialization syntax (const required for initialization in function scope)
          code.push(`  const float ${arrayVarName}[${arrayValue.length}] = float[${arrayValue.length}](${arrayValues});`);
        }
      }
    }

    // Note: Output variables are now declared at function scope in generateMainCode
    // We only need to assign values to them here

    // Generate node-specific code with placeholder replacement
    let nodeCode = this.replacePlaceholders(
      nodeSpec.mainCode,
      node,
      nodeSpec,
      inputVars,
      outputVars,
      uniformNames,
      parameterInputVars
    );
    
    // CRITICAL FIX: Replace function calls with node-specific function names if they exist
    // This ensures that when a function has parameter connections, it uses the correct node-specific version
    const nodeFunctionNameMap = functionNameMap.get(node.id);
    if (nodeFunctionNameMap) {
      if (nodeSpec.id === 'turbulence') {
        console.log(`[Function Call Replace] Node ${node.id} has function name map:`, Array.from(nodeFunctionNameMap.entries()));
        console.log(`[Function Call Replace] Before replacement, nodeCode contains:`, nodeCode.includes('turbulence('));
      }
      for (const [originalName, nodeSpecificName] of nodeFunctionNameMap.entries()) {
        // Replace function calls: match "functionName(" but not "functionName_" (to avoid replacing the renamed function definition)
        const functionCallRegex = new RegExp(`\\b${this.escapeRegex(originalName)}\\s*\\(`, 'g');
        const beforeReplace = nodeCode;
        nodeCode = nodeCode.replace(functionCallRegex, `${nodeSpecificName}(`);
        if (nodeSpec.id === 'turbulence' && originalName === 'turbulence' && beforeReplace !== nodeCode) {
          console.log(`[Function Call Replace] Replaced ${originalName}( with ${nodeSpecificName}( in mainCode`);
        }
      }
      if (nodeSpec.id === 'turbulence') {
        console.log(`[Function Call Replace] After replacement, nodeCode contains:`, nodeCode.includes('turbulence_node'));
      }
    }
    
    code.push(nodeCode);

    return code.join('\n');
  }

  /**
   * Generate output variable name for a node/port (same convention as VariableNameGenerator).
   * Used as fallback when building parameterInputVars so parameter connections are always wired.
   */
  private generateOutputVariableName(nodeId: string, portName: string): string {
    const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedPort = portName.replace(/[^a-zA-Z0-9]/g, '_');
    return `node_${sanitizedId}_${sanitizedPort}`;
  }

  /**
   * Format a numeric parameter value for GLSL so float context (e.g. clamp(x, 0.0, 1.0)) gets
   * a float literal; GLSL treats "0" as int and clamp(int, float, float) has no matching overload.
   */
  private formatParamLiteralForGlsl(
    value: number,
    paramSpec?: { type?: string } | null
  ): string {
    const isFloat = paramSpec?.type !== 'int';
    if (isFloat && typeof value === 'number') {
      return Number.isInteger(value) ? `${value}.0` : String(value);
    }
    return String(Math.round(value));
  }

  /**
   * Get default value for an unconnected input
   */
  private getInputDefaultValue(type: string): string {
    switch (type) {
      case 'float': return '0.0';
      case 'vec2': return 'vec2(0.0)';
      case 'vec3': return 'vec3(0.0)';
      case 'vec4': return 'vec4(0.0)';
      case 'int': return '0';
      case 'bool': return 'false';
      default: return '0.0';
    }
  }

  /**
   * Get initial value for an output variable
   * Note: Variables are now declared at global scope, so we can't use 'p' here
   * (p is only available inside main()). Use safe defaults instead.
   */
  private getOutputInitialValue(type: string, _nodeType: string): string {
    // For generator nodes (output float), initialize to 0.0
    // For transform nodes (output vec2), initialize to vec2(0.0) - actual value assigned in main()
    // For operation nodes, initialize based on operation type

    if (type === 'float') {
      return '0.0';
    } else if (type === 'vec2') {
      // Use vec2(0.0) as default - the node code will assign the actual value in main()
      return 'vec2(0.0)';
    } else if (type === 'vec3') {
      return 'vec3(0.0)';
    } else if (type === 'vec4') {
      return 'vec4(0.0)';
    }

    return '0.0';
  }

  /**
   * Generate type promotion or demotion code for input connections.
   * Promotion: float→vec2/vec3/vec4, vec2→vec3/vec4, vec3→vec4.
   * Demotion: vec4→vec3/vec2/float, vec3→vec2/float, vec2→float (extract components).
   */
  private generatePromotionCode(
    sourceVar: string,
    sourceType: string,
    targetType: string
  ): string {
    if (sourceType === targetType) return sourceVar;

    const promotions: Record<string, Record<string, string>> = {
      'float': {
        'vec2': `vec2(${sourceVar}, ${sourceVar})`,
        'vec3': `vec3(${sourceVar}, ${sourceVar}, ${sourceVar})`,
        'vec4': `vec4(${sourceVar}, ${sourceVar}, ${sourceVar}, 1.0)`
      },
      'vec2': {
        'vec3': `vec3(${sourceVar}.x, ${sourceVar}.y, 0.0)`,
        'vec4': `vec4(${sourceVar}.x, ${sourceVar}.y, 0.0, 1.0)`
      },
      'vec3': {
        'vec4': `vec4(${sourceVar}.x, ${sourceVar}.y, ${sourceVar}.z, 1.0)`
      }
    };

    const demotions: Record<string, Record<string, string>> = {
      'vec4': {
        'float': `${sourceVar}.r`,
        'vec2': `${sourceVar}.xy`,
        'vec3': `${sourceVar}.rgb`
      },
      'vec3': {
        'float': `${sourceVar}.r`,
        'vec2': `${sourceVar}.xy`
      },
      'vec2': {
        'float': `${sourceVar}.x`
      }
    };

    const promotion = promotions[sourceType]?.[targetType];
    if (promotion) return promotion;

    const demotion = demotions[sourceType]?.[targetType];
    if (demotion) return demotion;

    throw new Error(`Cannot convert ${sourceType} to ${targetType}`);
  }

  /**
   * Replace placeholders in node mainCode
   */
  private replacePlaceholders(
    code: string,
    node: NodeInstance,
    nodeSpec: NodeSpec,
    inputVars: Map<string, string>,
    outputVars: Map<string, string>,
    uniformNames: Map<string, string>,
    parameterInputVars: Map<string, string> = new Map()
  ): string {
    let result = code;

    // Replace input placeholders
    for (const [portName, varName] of inputVars.entries()) {
      const regex = new RegExp(`\\$input\\.${this.escapeRegex(portName)}`, 'g');
      result = result.replace(regex, varName);
    }

    // Replace output placeholders
    for (const [portName, varName] of outputVars.entries()) {
      const regex = new RegExp(`\\$output\\.${this.escapeRegex(portName)}`, 'g');
      result = result.replace(regex, varName);
    }

    // Replace parameter placeholders
    // Check both node.parameters and nodeSpec.parameters to handle defaults
    const allParamNames = new Set([
      ...Object.keys(node.parameters),
      ...Object.keys(nodeSpec.parameters)
    ]);
    for (const paramName of allParamNames) {
      const paramSpec = nodeSpec.parameters[paramName];
      
      // Handle array parameters specially - inline them as constant arrays
      if (paramSpec?.type === 'array') {
        const arrayValue = node.parameters[paramName] as number[] | undefined;
        if (Array.isArray(arrayValue) && arrayValue.length > 0) {
          // Generate a constant array name
          const arrayVarName = this.generateArrayVariableName(node.id, paramName);
          
          // Replace $param.colorStops[index] with arrayVarName[index]
          // This regex matches $param.paramName[index] where index can be any expression
          const arrayAccessRegex = new RegExp(
            `\\$param\\.${this.escapeRegex(paramName)}\\[([^\\]]+)\\]`,
            'g'
          );
          result = result.replace(arrayAccessRegex, `${arrayVarName}[$1]`);
          
          // Also replace simple $param.paramName (without index) - shouldn't happen but handle it
          const simpleRegex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
          result = result.replace(simpleRegex, arrayVarName);
        }
      } else if (paramSpec?.type === 'string') {
        // Handle string parameters specially - for swizzle node, generate code directly
        if (nodeSpec.id === 'swizzle' && paramName === 'swizzle') {
          const swizzleValue = (node.parameters[paramName] as string | undefined) || 
                               (paramSpec.default as string | undefined) || 
                               'xyzw';
          result = this.generateSwizzleCode(result, swizzleValue, inputVars, outputVars);
        } else {
          // For other string parameters, we can't use them as uniforms in GLSL
          // They should be handled at compile time or not used in shader code
          // For now, just remove the placeholder to avoid errors
          const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
          result = result.replace(regex, '""');
        }
      } else {
        // Check if parameter has an input connection
        // Match the condition in collectAndDeduplicateFunctions (line 860) to ensure consistency
        // Only float parameters can have connections (enforced during connection processing),
        // so we only need to check if paramInputVar exists
        const paramInputVar = parameterInputVars.get(paramName);
        if (paramInputVar) {
          // Get input mode (from node override, spec default, or 'override')
          const inputMode = node.parameterInputModes?.[paramName] || 
                           paramSpec?.inputMode || 
                           'override';
          
          if (inputMode === 'override') {
            // Override mode: use input value directly (consistent with function code handling)
            // \b ensures we only replace the full param name (e.g. hexSize not hexSizeVariationSteps)
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
            result = result.replace(regex, paramInputVar);
          } else {
            // Add/subtract/multiply mode: need to combine with config value
            const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
            let configValue: string;
            if (uniformName) {
              // Use uniform name as config value
              configValue = uniformName;
            } else {
              // No uniform found - use parameter default value from spec
              // This can happen if uniform generation was skipped for some reason
              // Mode is add/subtract/multiply - we need config value but uniform doesn't exist
              // This shouldn't happen if uniform generation is correct, but handle it gracefully
              console.warn(
                `[NodeShaderCompiler] Uniform not found for ${node.id}.${paramName} with mode '${inputMode}'. ` +
                `Using node parameter value as fallback. This may indicate a uniform generation issue.`
              );
              const paramValue = node.parameters[paramName];
              if (paramValue !== undefined) {
                configValue = String(paramValue);
              } else if (paramSpec?.default !== undefined) {
                configValue = String(paramSpec.default);
              } else {
                // Fallback to 0.0 if no default available
                configValue = paramSpec?.type === 'int' ? '0' : '0.0';
              }
            }
            // Generate combined expression
            const paramType = (paramSpec?.type === 'float' || paramSpec?.type === 'int') ? paramSpec.type : 'float';
            const combinedExpr = this.generateParameterCombination(
              configValue,
              paramInputVar,
              inputMode,
              paramType
            );
            // Debug logging for turbulence parameters
            if (nodeSpec.id === 'turbulence' && (paramName === 'turbulenceTimeOffset' || paramName === 'turbulenceStrength')) {
              console.log(`[Turbulence ${paramName} Debug] Node ${node.id}, param ${paramName}:`, {
                configValue,
                paramInputVar,
                inputMode,
                combinedExpr,
                nodeParamValue: node.parameters[paramName]
              });
            }
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
            result = result.replace(regex, combinedExpr);
          }
        } else {
          // Regular parameter - use uniform
          const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
          if (uniformName) {
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
            result = result.replace(regex, uniformName);
          } else if (paramSpec) {
            // No uniform found - use default value directly (float literals must be "0.0" not "0" for clamp etc.)
            const rawDefault: number = paramSpec.default !== undefined && typeof paramSpec.default === 'number'
              ? paramSpec.default
              : (paramSpec.type === 'int' ? 0 : 0.0);
            const defaultValue = this.formatParamLiteralForGlsl(rawDefault, paramSpec);
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
            result = result.replace(regex, defaultValue);
          } else {
            // paramSpec is undefined - try to use value from node.parameters directly
            const paramValue = node.parameters[paramName];
            if (paramValue !== undefined && typeof paramValue === 'number') {
              const valueStr = this.formatParamLiteralForGlsl(paramValue, undefined);
              const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
              result = result.replace(regex, valueStr);
            } else {
              const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}\\b`, 'g');
              result = result.replace(regex, '0.0');
            }
          }
        }
      }
    }

    // Final cleanup pass: catch any remaining $param.* placeholders that weren't replaced
    // Use float literals (e.g. 0.0) so clamp(float, float, float) gets valid args in GLSL
    result = result.replace(/\$param\.\w+/g, (match) => {
      const paramName = match.replace('$param.', '');
      const paramSpec = nodeSpec.parameters[paramName];
      const paramValue = node.parameters[paramName];
      if (paramValue !== undefined && typeof paramValue === 'number') {
        return this.formatParamLiteralForGlsl(paramValue, paramSpec);
      }
      return '0.0';
    });

    // Replace global placeholders
    result = result.replace(/\$time/g, 'uTime');
    result = result.replace(/\$resolution/g, 'uResolution');
    result = result.replace(/\$p/g, 'p');

    // Replace 'result' with appropriate output variable (fallback for legacy code)
    // Try to find 'out' output first, otherwise use first output
    const outVar = outputVars.get('out') || Array.from(outputVars.values())[0];
    if (outVar) {
      // Use word boundary to avoid replacing parts of other words
      const resultRegex = new RegExp(`\\bresult\\b`, 'g');
      result = result.replace(resultRegex, outVar);
    }

    return result;
  }

  /**
   * Find final output node
   */
  findFinalOutputNode(
    graph: NodeGraph,
    executionOrder: string[]
  ): NodeInstance | null {
    // Find final-output nodes
    const outputNodes = graph.nodes.filter(n => {
      const spec = this.nodeSpecs.get(n.type);
      return spec?.id === 'final-output';
    });

    if (outputNodes.length === 1) {
      return outputNodes[0];
    }

    if (outputNodes.length > 1) {
      // Find leaf node (no outgoing connections)
      const outgoingConnections = new Set(
        graph.connections.map(c => c.sourceNodeId)
      );
      const leaf = outputNodes.find(n => !outgoingConnections.has(n.id));
      if (leaf) return leaf;

      // Use last in execution order
      return outputNodes.sort((a, b) =>
        executionOrder.indexOf(b.id) - executionOrder.indexOf(a.id)
      )[0];
    }

    // No final-output node, find last vec3/vec4 output
    for (let i = executionOrder.length - 1; i >= 0; i--) {
      const node = graph.nodes.find(n => n.id === executionOrder[i]);
      if (!node) continue;
      const spec = this.nodeSpecs.get(node.type);
      const hasColorOutput = spec?.outputs.some(o =>
        o.type === 'vec3' || o.type === 'vec4'
      );
      if (hasColorOutput) return node;
    }

    return null;
  }

  /**
   * Generate final color variable
   * For final-output nodes, finds the input connection and uses the source node's output.
   * For other nodes (fallback), uses the node's output directly.
   */
  generateFinalColorVariable(
    graph: NodeGraph,
    finalOutputNode: NodeInstance | null,
    variableNames: Map<string, Map<string, string>>
  ): string {
    if (!finalOutputNode) {
      // No final output node - try to find the last node with any output and auto-convert
      // This allows float outputs to be automatically converted to grayscale
      const executionOrder = Array.from(variableNames.keys()); // Simple fallback
      
      // Find last node with an output (in reverse order)
      for (let i = executionOrder.length - 1; i >= 0; i--) {
        const nodeId = executionOrder[i];
        const outputVars = variableNames.get(nodeId);
        if (!outputVars || outputVars.size === 0) continue;
        
        // Get the first output
        const firstOutput = Array.from(outputVars.values())[0];
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) continue;
        const nodeSpec = this.nodeSpecs.get(node.type);
        const firstOutputPort = nodeSpec?.outputs[0];
        
        if (firstOutputPort) {
          // Auto-convert based on output type
          if (firstOutputPort.type === 'vec4') {
            return `${firstOutput}.rgb`;
          } else if (firstOutputPort.type === 'vec3') {
            return firstOutput;
          } else if (firstOutputPort.type === 'vec2') {
            return `vec3(${firstOutput}, 0.0)`;
          } else if (firstOutputPort.type === 'float') {
            // Auto-convert float to grayscale vec3
            return `vec3(${firstOutput})`;
          }
        }
      }
      
      return 'vec3(0.0)';
    }

    // For final-output node, find the input connection and use the source node's output
    const finalOutputSpec = this.nodeSpecs.get(finalOutputNode.type);
    if (finalOutputSpec?.id === 'final-output') {
      // Find connection to final-output's input port
      const inputConnection = graph.connections.find(
        conn => conn.targetNodeId === finalOutputNode.id && conn.targetPort === 'in'
      );

      if (inputConnection) {
        const sourceNode = graph.nodes.find(n => n.id === inputConnection.sourceNodeId);
        if (sourceNode) {
          const sourceSpec = this.nodeSpecs.get(sourceNode.type);
          if (sourceSpec) {
            const sourceOutput = sourceSpec.outputs.find(o => o.name === inputConnection.sourcePort);
            const sourceVarName = variableNames.get(inputConnection.sourceNodeId)?.get(inputConnection.sourcePort);
            
            if (sourceVarName && sourceOutput) {
              // Apply type conversion based on source output type
              if (sourceOutput.type === 'vec4') {
                return `${sourceVarName}.rgb`;
              } else if (sourceOutput.type === 'vec3') {
                return sourceVarName;
              } else if (sourceOutput.type === 'vec2') {
                return `vec3(${sourceVarName}, 0.0)`;
              } else if (sourceOutput.type === 'float') {
                // Convert float to grayscale vec3
                return `vec3(${sourceVarName})`;
              }
            }
          }
        }
      }

      // No connection found - return default
      return 'vec3(0.0)';
    }

    // Fallback: for non-final-output nodes (shouldn't happen, but handle gracefully)
    const outputVars = variableNames.get(finalOutputNode.id);
    if (!outputVars) {
      return 'vec3(0.0)';
    }

    // Use first output
    const firstOutput = Array.from(outputVars.values())[0];
    if (firstOutput) {
      const nodeSpec = this.nodeSpecs.get(finalOutputNode.type);
      const firstOutputPort = nodeSpec?.outputs[0];
      if (firstOutputPort) {
        if (firstOutputPort.type === 'vec4') {
          return `${firstOutput}.rgb`;
        } else if (firstOutputPort.type === 'vec3') {
          return firstOutput;
        } else if (firstOutputPort.type === 'vec2') {
          return `vec3(${firstOutput}, 0.0)`;
        } else if (firstOutputPort.type === 'float') {
          // Convert float to grayscale vec3
          return `vec3(${firstOutput})`;
        }
      }
      return firstOutput;
    }

    return 'vec3(0.0)';
  }

  /**
   * Assemble complete shader
   */
  assembleShader(
    functions: string,
    uniforms: Array<{ name: string; type: string }>,
    variableDeclarations: string,
    mainCode: string,
    finalColorVar: string
  ): string {
    // Generate uniform declarations
    const uniformDeclarations = uniforms
      .map(u => {
        const type = u.type === 'int' ? 'int' : u.type === 'vec2' ? 'vec2' : u.type === 'vec3' ? 'vec3' : u.type === 'vec4' ? 'vec4' : 'float';
        return `uniform ${type} ${u.name};`;
      })
      .sort()
      .join('\n');

    let shader = BASE_SHADER_TEMPLATE;
    shader = shader.replace('{{UNIFORMS}}', uniformDeclarations);
    shader = shader.replace('{{VARIABLE_DECLARATIONS}}', variableDeclarations);
    shader = shader.replace('{{FUNCTIONS}}', functions);
    shader = shader.replace('{{MAIN_CODE}}', mainCode);
    shader = shader.replace('{{FINAL_COLOR}}', finalColorVar);

    return shader;
  }
}
