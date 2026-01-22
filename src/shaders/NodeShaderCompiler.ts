import type { 
  NodeGraph, 
  NodeInstance, 
  NodeSpec, 
  CompilationResult, 
  UniformMetadata
} from '../types';

/**
 * Base shader template for node-based shader system
 */
const BASE_SHADER_TEMPLATE = `#version 300 es
precision highp float;

// Global uniforms
uniform vec2 uResolution;
uniform float uTime;

{{UNIFORMS}}

{{FUNCTIONS}}

out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = (uv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  
  {{MAIN_CODE}}
  
  fragColor = vec4({{FINAL_COLOR}}, 1.0);
}`;

/**
 * Node-based shader compiler
 * Converts a node graph into executable GLSL shader code
 */
export class NodeShaderCompiler {
  private nodeSpecs: Map<string, NodeSpec>;

  constructor(nodeSpecs: Map<string, NodeSpec>) {
    this.nodeSpecs = nodeSpecs;
  }

  /**
   * Compile a node graph into GLSL shader code
   */
  compile(graph: NodeGraph): CompilationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const executionOrder: string[] = [];

    // Handle empty graph
    if (graph.nodes.length === 0) {
      const emptyShader = BASE_SHADER_TEMPLATE
        .replace('{{UNIFORMS}}', '')
        .replace('{{FUNCTIONS}}', '')
        .replace('{{MAIN_CODE}}', '')
        .replace('{{FINAL_COLOR}}', 'vec3(0.0)');
      
      return {
        shaderCode: emptyShader,
        uniforms: [],
        metadata: {
          warnings: ['[WARNING] Empty graph - outputting black'],
          errors: [],
          executionOrder: [],
          finalOutputNodeId: null
        }
      };
    }

    // Step 1: Validate graph structure
    this.validateGraph(graph, errors, warnings);
    if (errors.length > 0) {
      return {
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder: [],
          finalOutputNodeId: null
        }
      };
    }

    // Step 2: Graph traversal - topological sort
    try {
      const sorted = this.topologicalSort(graph);
      executionOrder.push(...sorted);
    } catch (error) {
      errors.push(`[ERROR] Circular Dependency: ${error instanceof Error ? error.message : 'Graph contains cycles'}`);
      return {
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder: [],
          finalOutputNodeId: null
        }
      };
    }

    // Step 3: Type validation
    const typeErrors = this.validateTypes(graph);
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      return {
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder,
          finalOutputNodeId: null
        }
      };
    }

    // Step 4: Generate variable names
    const variableNames = this.generateVariableNames(graph);

    // Step 5: Generate uniform names
    const uniformNames = this.generateUniformNameMapping(graph);

    // Step 6: Collect functions (with uniform placeholders replaced)
    const functions = this.collectAndDeduplicateFunctions(graph, uniformNames);

    // Step 7: Generate main code
    const mainCode = this.generateMainCode(graph, executionOrder, variableNames, uniformNames);

    // Step 8: Find final output node
    const finalOutputNode = this.findFinalOutputNode(graph, executionOrder);

    // Step 9: Generate final color variable
    const finalColorVar = this.generateFinalColorVariable(graph, finalOutputNode, variableNames);

    // Step 10: Track which uniforms are actually used in the shader code
    const usedUniforms = this.findUsedUniforms(mainCode, functions, uniformNames);

    // Step 11: Generate uniform metadata (only for used uniforms)
    const uniforms = this.generateUniformMetadata(graph, uniformNames, usedUniforms);

    // Step 12: Check for disconnected nodes (warnings)
    const connectedNodes = new Set<string>();
    for (const conn of graph.connections) {
      connectedNodes.add(conn.sourceNodeId);
      connectedNodes.add(conn.targetNodeId);
    }
    for (const node of graph.nodes) {
      if (!connectedNodes.has(node.id)) {
        warnings.push(`[WARNING] Node '${node.id}' (${node.type}) has no connections`);
      }
    }

    // Step 13: Assemble shader
    const shaderCode = this.assembleShader(functions, uniforms, mainCode, finalColorVar);

    return {
      shaderCode,
      uniforms,
      metadata: {
        warnings,
        errors: [],
        executionOrder,
        finalOutputNodeId: finalOutputNode?.id || null
      }
    };
  }

  /**
   * Validate graph structure
   */
  private validateGraph(graph: NodeGraph, errors: string[], _warnings: string[]): void {
    // Check required fields
    if (!graph.id) errors.push('[ERROR] Graph missing id');
    if (!graph.name) errors.push('[ERROR] Graph missing name');
    if (graph.version !== '2.0') {
      errors.push(`[ERROR] Invalid version: ${graph.version} (expected 2.0)`);
    }

    // Check node IDs are unique
    const nodeIds = new Set<string>();
    for (const node of graph.nodes) {
      if (nodeIds.has(node.id)) {
        errors.push(`[ERROR] Duplicate node ID: ${node.id}`);
      }
      nodeIds.add(node.id);

      // Check node type exists
      if (!this.nodeSpecs.has(node.type)) {
        errors.push(`[ERROR] Unknown node type: ${node.type} (node ${node.id})`);
      }
    }

    // Check connection IDs are unique and reference valid nodes
    const connectionIds = new Set<string>();
    // Track target ports to detect duplicate connections to same input
    const targetPorts = new Map<string, string>(); // targetNodeId.targetPort -> connectionId
    
    for (const conn of graph.connections) {
      if (connectionIds.has(conn.id)) {
        errors.push(`[ERROR] Duplicate connection ID: ${conn.id}`);
      }
      connectionIds.add(conn.id);

      if (!nodeIds.has(conn.sourceNodeId)) {
        errors.push(`[ERROR] Connection references non-existent source node: ${conn.sourceNodeId}`);
      }
      if (!nodeIds.has(conn.targetNodeId)) {
        errors.push(`[ERROR] Connection references non-existent target node: ${conn.targetNodeId}`);
      }

      // Check for duplicate connections to same input port
      const targetKey = `${conn.targetNodeId}.${conn.targetPort}`;
      if (targetPorts.has(targetKey)) {
        const existingConnId = targetPorts.get(targetKey);
        errors.push(
          `[ERROR] Duplicate Connection: Input port '${conn.targetPort}' on node '${conn.targetNodeId}' ` +
          `already has a connection (${existingConnId}). Connection ${conn.id} conflicts.`
        );
      } else {
        targetPorts.set(targetKey, conn.id);
      }
    }
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(graph: NodeGraph): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    // Initialize all nodes with empty dependencies
    for (const node of graph.nodes) {
      dependencies.set(node.id, []);
    }

    // Add dependencies from connections
    for (const conn of graph.connections) {
      const deps = dependencies.get(conn.targetNodeId) || [];
      if (!deps.includes(conn.sourceNodeId)) {
        deps.push(conn.sourceNodeId);
      }
      dependencies.set(conn.targetNodeId, deps);
    }

    return dependencies;
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  private topologicalSort(graph: NodeGraph): string[] {
    const dependencies = this.buildDependencyGraph(graph);
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];

    // Calculate in-degree for each node
    for (const node of graph.nodes) {
      const degree = dependencies.get(node.id)?.length || 0;
      inDegree.set(node.id, degree);
      if (degree === 0) {
        queue.push(node.id);
      }
    }

    // Process nodes
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);

      // Find all nodes that depend on this node
      for (const conn of graph.connections) {
        if (conn.sourceNodeId === nodeId) {
          const targetInDegree = (inDegree.get(conn.targetNodeId) || 0) - 1;
          inDegree.set(conn.targetNodeId, targetInDegree);
          if (targetInDegree === 0) {
            queue.push(conn.targetNodeId);
          }
        }
      }
    }

    // Check for cycles
    if (result.length !== graph.nodes.length) {
      throw new Error('Graph contains cycles');
    }

    return result;
  }

  /**
   * Check if two types are compatible (exact match or promotion)
   */
  private areTypesCompatible(source: string, target: string): boolean {
    if (source === target) return true;

    // Check promotion rules
    const promotions: Record<string, string[]> = {
      'float': ['vec2', 'vec3', 'vec4'],
      'vec2': ['vec3', 'vec4'],
      'vec3': ['vec4']
    };

    return promotions[source]?.includes(target) || false;
  }

  /**
   * Validate type compatibility for all connections
   */
  private validateTypes(graph: NodeGraph): string[] {
    const errors: string[] = [];

    for (const conn of graph.connections) {
      const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
      const targetNode = graph.nodes.find(n => n.id === conn.targetNodeId);

      if (!sourceNode || !targetNode) continue;

      const sourceSpec = this.nodeSpecs.get(sourceNode.type);
      const targetSpec = this.nodeSpecs.get(targetNode.type);

      if (!sourceSpec || !targetSpec) continue;

      const sourceOutput = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
      const targetInput = targetSpec.inputs.find(i => i.name === conn.targetPort);

      if (!sourceOutput) {
        errors.push(
          `[ERROR] Invalid source port: ${conn.sourcePort} on node ${sourceNode.type} (${sourceNode.id})`
        );
        continue;
      }

      if (!targetInput) {
        errors.push(
          `[ERROR] Invalid target port: ${conn.targetPort} on node ${targetNode.type} (${targetNode.id})`
        );
        continue;
      }

      if (!this.areTypesCompatible(sourceOutput.type, targetInput.type)) {
        errors.push(
          `[ERROR] Type Mismatch: Cannot connect ${sourceOutput.type} to ${targetInput.type} ` +
          `(${sourceNode.type}.${conn.sourcePort} → ${targetNode.type}.${conn.targetPort})`
        );
      }
    }

    return errors;
  }

  /**
   * Generate variable names for all node outputs
   */
  private generateVariableNames(graph: NodeGraph): Map<string, Map<string, string>> {
    const variableNames = new Map<string, Map<string, string>>();

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      const nodeVars = new Map<string, string>();
      for (const output of nodeSpec.outputs) {
        const varName = this.generateVariableName(node.id, output.name);
        nodeVars.set(output.name, varName);
      }
      variableNames.set(node.id, nodeVars);
    }

    return variableNames;
  }

  /**
   * Generate a variable name for a node output
   */
  private generateVariableName(nodeId: string, portName: string): string {
    const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedPort = portName.replace(/[^a-zA-Z0-9]/g, '_');
    return `node_${sanitizedId}_${sanitizedPort}`;
  }

  /**
   * Generate a variable name for an array parameter
   */
  private generateArrayVariableName(nodeId: string, paramName: string): string {
    const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedParam = paramName.replace(/[^a-zA-Z0-9]/g, '_');
    return `array_${sanitizedId}_${sanitizedParam}`;
  }

  /**
   * Generate uniform name mapping
   */
  private generateUniformNameMapping(graph: NodeGraph): Map<string, string> {
    const uniformNames = new Map<string, string>();

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      // Generate uniforms for all parameters in the spec (not just those in node.parameters)
      // This ensures we have uniforms for parameters that use default values
      // Skip array parameters - they will be inlined as constants
      for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
        // Skip array parameters - they can't be uniforms
        if (paramSpec.type === 'array') {
          continue;
        }
        const uniformName = this.sanitizeUniformName(node.id, paramName);
        uniformNames.set(`${node.id}.${paramName}`, uniformName);
      }
    }

    return uniformNames;
  }

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
   * Find which uniforms are actually used in the shader code
   */
  private findUsedUniforms(
    mainCode: string,
    functions: string,
    uniformNames: Map<string, string>
  ): Set<string> {
    const usedUniforms = new Set<string>();
    const allCode = mainCode + '\n' + functions;
    
    // Check each uniform name to see if it appears in the code
    for (const uniformName of uniformNames.values()) {
      // Create regex to match the uniform name as a whole word
      const regex = new RegExp(`\\b${this.escapeRegex(uniformName)}\\b`, 'g');
      if (regex.test(allCode)) {
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
  private generateUniformMetadata(
    graph: NodeGraph,
    uniformNames: Map<string, string>,
    usedUniforms: Set<string>
  ): UniformMetadata[] {
    const uniforms: UniformMetadata[] = [];

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      // Process all parameters from the spec (not just those in node.parameters)
      // This ensures we generate uniforms for all parameters, even if they use defaults
      for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
        // Skip array parameters - they are inlined as constants
        if (paramSpec.type === 'array') {
          continue;
        }
        
        const uniformName = uniformNames.get(`${node.id}.${paramName}`);
        if (!uniformName) continue;
        
        // Only include uniforms that are actually used in the shader
        if (!usedUniforms.has(uniformName)) continue;

        // Determine GLSL type
        let glslType: 'float' | 'int' | 'vec2' | 'vec3' | 'vec4' = 'float';
        if (paramSpec.type === 'int') {
          glslType = 'int';
        } else if (paramSpec.type === 'vec4') {
          glslType = 'vec4';
        }

        // Get default value
        const defaultValue = this.getParameterDefaultValue(paramSpec, paramName);

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

  /**
   * Get default value for a parameter
   */
  private getParameterDefaultValue(
    paramSpec: { type: string; default?: any },
    _paramName: string
  ): number | [number, number] | [number, number, number] | [number, number, number, number] {
    if (paramSpec.default !== undefined) {
      if (typeof paramSpec.default === 'number') {
        return paramSpec.default;
      }
      if (Array.isArray(paramSpec.default)) {
        // Handle vec2, vec3, vec4 arrays
        if (paramSpec.default.length === 2) {
          return [paramSpec.default[0], paramSpec.default[1]] as [number, number];
        } else if (paramSpec.default.length === 3) {
          return [paramSpec.default[0], paramSpec.default[1], paramSpec.default[2]] as [number, number, number];
        } else if (paramSpec.default.length === 4) {
          return paramSpec.default as [number, number, number, number];
        }
        return paramSpec.default as any;
      }
    }

    // Type-appropriate defaults
    if (paramSpec.type === 'int') return 0;
    if (paramSpec.type === 'vec2') return [0, 0];
    if (paramSpec.type === 'vec3') return [0, 0, 0];
    if (paramSpec.type === 'vec4') return [0, 0, 0, 0];
    return 0.0;
  }

  /**
   * Collect and deduplicate functions
   * Processes functions per-node to replace uniform placeholders with actual uniform names
   */
  private collectAndDeduplicateFunctions(graph: NodeGraph, uniformNames: Map<string, string>): string {
    const processedFunctions: string[] = [];

    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec?.functions) continue;

      // Process function code for this node: replace placeholders with actual uniform names
      let funcCode = nodeSpec.functions;
      
      // Replace parameter placeholders with actual uniform names
      for (const paramName of Object.keys(nodeSpec.parameters)) {
        const uniformName = uniformNames.get(`${node.id}.${paramName}`);
        if (uniformName) {
          const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
          funcCode = funcCode.replace(regex, uniformName);
        }
      }
      
      // Replace global placeholders
      funcCode = funcCode.replace(/\$time/g, 'uTime');
      funcCode = funcCode.replace(/\$resolution/g, 'uResolution');
      
      processedFunctions.push(funcCode);
    }

    // Deduplicate by content (simple hash using trimmed code)
    // This handles cases where multiple nodes of the same type produce identical function code
    const seen = new Map<string, string>();
    const result: string[] = [];

    for (const funcCode of processedFunctions) {
      const hash = funcCode.trim();
      if (!seen.has(hash)) {
        seen.set(hash, funcCode);
        result.push(funcCode);
      }
    }

    return result.join('\n\n');
  }

  /**
   * Generate main code for all nodes in execution order
   */
  private generateMainCode(
    graph: NodeGraph,
    executionOrder: string[],
    variableNames: Map<string, Map<string, string>>,
    uniformNames: Map<string, string>
  ): string {
    const code: string[] = [];

    // First, declare all output variables at function scope so they're accessible across nodes
    // Declare for ALL nodes in the graph, not just execution order, to ensure all variables exist
    for (const node of graph.nodes) {
      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      const outputVars = variableNames.get(node.id);
      if (outputVars) {
        for (const output of nodeSpec.outputs) {
          const varName = outputVars.get(output.name);
          if (varName) {
            const initValue = this.getOutputInitialValue(output.type, nodeSpec.id);
            code.push(`  ${output.type} ${varName} = ${initValue};`);
          }
        }
      }
    }

    code.push(''); // Blank line between declarations and node code

    // Then generate node code in execution order (inside blocks for scoping)
    for (const nodeId of executionOrder) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      const nodeSpec = this.nodeSpecs.get(node.type);
      if (!nodeSpec) continue;

      const nodeCode = this.generateNodeCode(node, nodeSpec, graph, variableNames, uniformNames);
      code.push(`  // Node: ${nodeSpec.displayName} (${nodeId})`);
      // Wrap each node's code in a block scope to prevent variable name collisions
      code.push('  {');
      // Indent the node code
      const indentedCode = nodeCode.split('\n').map(line => line ? '  ' + line : line).join('\n');
      code.push(indentedCode);
      code.push('  }');
      code.push('');
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
    variableNames: Map<string, Map<string, string>>,
    uniformNames: Map<string, string>
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

    // Initialize inputs that aren't connected (use defaults)
    // Note: Input nodes (UV, Time, etc.) generate their own values and don't need defaults
    const isInputNode = nodeSpec.category === 'Input' || 
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
    const nodeCode = this.replacePlaceholders(
      nodeSpec.mainCode,
      node,
      nodeSpec,
      inputVars,
      outputVars,
      uniformNames
    );
    code.push(nodeCode);

    return code.join('\n');
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
   */
  private getOutputInitialValue(type: string, nodeType: string): string {
    // For generator nodes (output float), initialize to 0.0
    // For transform nodes (output vec2), initialize to input coordinate (p)
    // For operation nodes, initialize based on operation type

    if (type === 'float') {
      return '0.0';
    } else if (type === 'vec2') {
      // Transform nodes typically initialize to p
      if (nodeType.includes('transform') || nodeType.includes('coordinate')) {
        return 'p';
      }
      return 'vec2(0.0)';
    } else if (type === 'vec3') {
      return 'vec3(0.0)';
    } else if (type === 'vec4') {
      return 'vec4(0.0)';
    }

    return '0.0';
  }

  /**
   * Generate type promotion code
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

    const promotion = promotions[sourceType]?.[targetType];
    if (!promotion) {
      throw new Error(`Cannot promote ${sourceType} to ${targetType}`);
    }

    return promotion;
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
    uniformNames: Map<string, string>
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
      } else {
        // Regular parameter - use uniform
        const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
        if (uniformName) {
          const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
          result = result.replace(regex, uniformName);
        }
      }
    }

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
   * Escape regex special characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Find final output node
   */
  private findFinalOutputNode(
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
   */
  private generateFinalColorVariable(
    graph: NodeGraph,
    finalOutputNode: NodeInstance | null,
    variableNames: Map<string, Map<string, string>>
  ): string {
    if (!finalOutputNode) {
      // No final output node - try to find the last node with any output and auto-convert
      // This allows float outputs to be automatically converted to grayscale
      const executionOrder = this.topologicalSort(graph);
      
      // Find last node with an output (in reverse order)
      for (let i = executionOrder.length - 1; i >= 0; i--) {
        const node = graph.nodes.find(n => n.id === executionOrder[i]);
        if (!node) continue;
        
        const nodeSpec = this.nodeSpecs.get(node.type);
        if (!nodeSpec) continue;
        
        const outputVars = variableNames.get(node.id);
        if (!outputVars || outputVars.size === 0) continue;
        
        // Get the first output
        const firstOutput = Array.from(outputVars.values())[0];
        const firstOutputPort = nodeSpec.outputs[0];
        
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

    const outputVars = variableNames.get(finalOutputNode.id);
    if (!outputVars) {
      return 'vec3(0.0)';
    }

    // Try to find 'out' port first
    const outVar = outputVars.get('out');
    if (outVar) {
      const nodeSpec = this.nodeSpecs.get(finalOutputNode.type);
      const outPort = nodeSpec?.outputs.find(o => o.name === 'out');
      if (outPort) {
        if (outPort.type === 'vec4') {
          return `${outVar}.rgb`;
        } else if (outPort.type === 'vec3') {
          return outVar;
        } else if (outPort.type === 'vec2') {
          return `vec3(${outVar}, 0.0)`;
        } else if (outPort.type === 'float') {
          // Convert float to grayscale vec3
          return `vec3(${outVar})`;
        }
      }
    }

    // Fallback: use first output
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
  private assembleShader(
    functions: string,
    uniforms: UniformMetadata[],
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
    shader = shader.replace('{{FUNCTIONS}}', functions);
    shader = shader.replace('{{MAIN_CODE}}', mainCode);
    shader = shader.replace('{{FINAL_COLOR}}', finalColorVar);

    return shader;
  }
}
