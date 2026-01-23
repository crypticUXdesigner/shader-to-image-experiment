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

      // Check for duplicate connections to same input port or parameter
      const targetKey = conn.targetParameter 
        ? `${conn.targetNodeId}.param:${conn.targetParameter}`
        : `${conn.targetNodeId}.${conn.targetPort}`;
      if (targetPorts.has(targetKey)) {
        const existingConnId = targetPorts.get(targetKey);
        const targetName = conn.targetParameter || conn.targetPort;
        errors.push(
          `[ERROR] Duplicate Connection: ${conn.targetParameter ? 'Parameter' : 'Input port'} '${targetName}' on node '${conn.targetNodeId}' ` +
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

      if (!sourceOutput) {
        errors.push(
          `[ERROR] Invalid source port: ${conn.sourcePort} on node ${sourceNode.type} (${sourceNode.id})`
        );
        continue;
      }

      // Handle parameter connections
      if (conn.targetParameter) {
        const paramSpec = targetSpec.parameters[conn.targetParameter];
        if (!paramSpec) {
          errors.push(
            `[ERROR] Invalid target parameter: ${conn.targetParameter} on node ${targetNode.type} (${targetNode.id})`
          );
          continue;
        }
        
        // Check type compatibility for parameter connections (float only)
        if (paramSpec.type !== 'float') {
          errors.push(
            `[ERROR] Parameter connection type mismatch: Parameter '${conn.targetParameter}' on node ${targetNode.type} ` +
            `is of type '${paramSpec.type}', but only float parameters can have input connections.`
          );
          continue;
        }
        
        // Check source type compatibility (must be float, int, or vec type)
        if (sourceOutput.type !== 'float' && sourceOutput.type !== 'int' && 
            sourceOutput.type !== 'vec2' && sourceOutput.type !== 'vec3' && sourceOutput.type !== 'vec4') {
          errors.push(
            `[ERROR] Type Mismatch: Cannot connect ${sourceOutput.type} to parameter '${conn.targetParameter}' ` +
            `(${sourceNode.type}.${conn.sourcePort} → ${targetNode.type}.${conn.targetParameter})`
          );
        }
      } else {
        // Regular port connection
        const targetInput = targetSpec.inputs.find(i => i.name === conn.targetPort);

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
      
      // Handle audio-analyzer dynamic outputs
      if (nodeSpec.id === 'audio-analyzer') {
        const frequencyBands = this.getFrequencyBands(node, nodeSpec);
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = this.generateVariableName(node.id, `band${i}`);
          nodeVars.set(`band${i}`, varName);
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

      // For audio nodes, generate uniforms for outputs (not just parameters)
      if (this.isAudioNode(nodeSpec)) {
        // Audio-file-input: outputs are uniforms
        if (nodeSpec.id === 'audio-file-input') {
          for (const output of nodeSpec.outputs) {
            const uniformName = this.sanitizeUniformName(node.id, output.name);
            uniformNames.set(`${node.id}.${output.name}`, uniformName);
          }
        }
        // Audio-analyzer: outputs are uniforms (dynamic based on frequencyBands)
        else if (nodeSpec.id === 'audio-analyzer') {
          // Get frequency bands from node parameters or default
          const frequencyBands = this.getFrequencyBands(node, nodeSpec);
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = this.sanitizeUniformName(node.id, `band${i}`);
            uniformNames.set(`${node.id}.band${i}`, uniformName);
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
   * Check if a node is an audio node
   */
  private isAudioNode(nodeSpec: NodeSpec): boolean {
    return nodeSpec.category === 'Audio';
  }

  /**
   * Get frequency bands from node (for audio-analyzer)
   */
  private getFrequencyBands(node: NodeInstance, nodeSpec: NodeSpec): number[][] {
    const frequencyBandsParam = node.parameters.frequencyBands;
    if (Array.isArray(frequencyBandsParam) && frequencyBandsParam.length > 0) {
      // Validate it's an array of arrays
      if (Array.isArray(frequencyBandsParam[0])) {
        return frequencyBandsParam as number[][];
      }
    }
    // Fall back to default from spec
    const defaultParam = nodeSpec.parameters.frequencyBands;
    if (defaultParam && Array.isArray(defaultParam.default) && Array.isArray(defaultParam.default[0])) {
      return defaultParam.default as number[][];
    }
    // Ultimate fallback
    return [[20, 120], [120, 300], [300, 4000], [4000, 20000]];
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
  private generateUniformMetadata(
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
          // Dynamic outputs based on frequency bands - always include them
          const frequencyBands = this.getFrequencyBands(node, nodeSpec);
          for (let i = 0; i < frequencyBands.length; i++) {
            const uniformName = uniformNames.get(`${node.id}.band${i}`);
            if (!uniformName) continue;
            // Don't check usedUniforms - audio outputs must always be declared

            uniforms.push({
              name: uniformName,
              nodeId: node.id,
              paramName: `band${i}`,
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
   * Deduplicates at the individual function level by signature
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

    // Extract and deduplicate individual functions by signature
    const functionMap = new Map<string, string>(); // signature -> function body
    
    for (const funcCode of processedFunctions) {
      const functions = this.extractFunctions(funcCode);
      for (const func of functions) {
        // Use function signature as key (return type + name + parameter types)
        const signature = func.signature;
        // Only keep the first occurrence of each function signature
        if (!functionMap.has(signature)) {
          functionMap.set(signature, func.body);
        }
      }
    }

    // Combine all unique functions
    return Array.from(functionMap.values()).join('\n\n');
  }

  /**
   * Extract individual function definitions from a code block
   * Returns array of {signature, body} objects
   */
  private extractFunctions(code: string): Array<{signature: string, body: string}> {
    const functions: Array<{signature: string, body: string}> = [];
    
    // Find all function definitions by looking for "returnType functionName(" pattern
    // Match: returnType functionName(params) { body }
    // Match common return types: float, vec2, vec3, vec4, int, bool, void
    const functionStartRegex = /\b(float|vec2|vec3|vec4|int|bool|void)\s+(\w+)\s*\(/g;
    let match;
    const functionStarts: Array<{index: number, returnType: string, name: string}> = [];
    
    // Collect all function start positions
    while ((match = functionStartRegex.exec(code)) !== null) {
      const returnType = match[1].trim();
      const functionName = match[2].trim();
      functionStarts.push({
        index: match.index,
        returnType,
        name: functionName
      });
    }
    
    // For each function start, extract the full function body
    for (let i = 0; i < functionStarts.length; i++) {
      const funcStart = functionStarts[i];
      const startPos = funcStart.index;
      
      // Find the opening brace by looking for '{' after the parameter list
      let parenCount = 0;
      let bracePos = -1;
      let foundParams = false;
      
      // Skip to the opening parenthesis
      let pos = startPos;
      while (pos < code.length && code[pos] !== '(') pos++;
      if (pos >= code.length) continue;
      
      // Skip over parameters (handle nested parens)
      parenCount = 1;
      pos++;
      while (pos < code.length && parenCount > 0) {
        if (code[pos] === '(') parenCount++;
        else if (code[pos] === ')') parenCount--;
        pos++;
      }
      if (parenCount !== 0) continue;
      
      // Now find the opening brace
      while (pos < code.length && /\s/.test(code[pos])) pos++;
      if (pos >= code.length || code[pos] !== '{') continue;
      
      bracePos = pos;
      
      // Find the matching closing brace (handle nested braces)
      let braceCount = 1;
      let endPos = bracePos + 1;
      while (endPos < code.length && braceCount > 0) {
        if (code[endPos] === '{') braceCount++;
        else if (code[endPos] === '}') braceCount--;
        endPos++;
      }
      
      if (braceCount !== 0) continue;
      
      // Extract the full function
      const fullFunction = code.substring(startPos, endPos);
      
      // Extract parameter list and types for signature
      const paramsMatch = fullFunction.match(/\(([^)]*)\)/);
      const params = paramsMatch?.[1] || '';
      
      // Extract parameter types
      const paramTypes: string[] = [];
      if (params.trim()) {
        const paramList = params.split(',').map(p => p.trim());
        for (const param of paramList) {
          // Match "type name" or "type name = default" patterns
          const paramMatch = param.match(/^(\w+)\s+\w+/);
          if (paramMatch) {
            paramTypes.push(paramMatch[1]);
          }
        }
      }
      
      // Create signature: returnType_functionName_paramTypes (normalized, no whitespace)
      const signature = `${funcStart.returnType.trim()}_${funcStart.name.trim()}_${paramTypes.map(t => t.trim()).join('_')}`;
      
      functions.push({ signature, body: fullFunction });
    }
    
    return functions;
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
      if (!outputVars || outputVars.size === 0) continue;
      
      // Handle audio-analyzer dynamic outputs
      if (nodeSpec.id === 'audio-analyzer') {
        const frequencyBands = this.getFrequencyBands(node, nodeSpec);
        for (let i = 0; i < frequencyBands.length; i++) {
          const varName = outputVars.get(`band${i}`);
          if (varName) {
            const initValue = this.getOutputInitialValue('float', nodeSpec.id);
            // Declare without const so it can be reassigned from uniforms
            code.push(`  float ${varName} = ${initValue};`);
          }
        }
      } else {
        // Standard outputs (including audio-file-input)
        for (const output of nodeSpec.outputs) {
          const varName = outputVars.get(output.name);
          if (varName) {
            const initValue = this.getOutputInitialValue(output.type, nodeSpec.id);
            // Declare without const so it can be reassigned from uniforms (for audio nodes)
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

      // Skip audio nodes that provide uniforms (audio-file-input, audio-analyzer)
      // They don't generate GLSL code, their outputs are uniforms
      if (this.isAudioNode(nodeSpec) && 
          (nodeSpec.id === 'audio-file-input' || nodeSpec.id === 'audio-analyzer')) {
        // Generate code to read from uniforms and assign to output variables
        const nodeCode = this.generateAudioNodeCode(node, nodeSpec, graph, variableNames, uniformNames);
        if (nodeCode.trim()) {
          code.push(`  // Node: ${nodeSpec.displayName} (${nodeId})`);
          code.push('  {');
          const indentedCode = nodeCode.split('\n').map(line => line ? '  ' + line : line).join('\n');
          code.push(indentedCode);
          code.push('  }');
          code.push('');
        }
        continue;
      }

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
   * Generate code for audio nodes that provide uniforms
   */
  private generateAudioNodeCode(
    node: NodeInstance,
    nodeSpec: NodeSpec,
    graph: NodeGraph,
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
      // Get frequency bands to determine how many outputs
      const frequencyBands = this.getFrequencyBands(node, nodeSpec);
      for (let i = 0; i < frequencyBands.length; i++) {
        const varName = outputVars.get(`band${i}`);
        const uniformName = uniformNames.get(`${node.id}.band${i}`);
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

    // Get parameter input variable names (from parameter connections)
    const parameterInputVars = new Map<string, string>();
    for (const conn of graph.connections) {
      if (conn.targetNodeId === node.id && conn.targetParameter) {
        const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
        if (!sourceNode) continue;

        const sourceSpec = this.nodeSpecs.get(sourceNode.type);
        if (!sourceSpec) continue;

        const sourceOutput = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
        const paramSpec = nodeSpec.parameters[conn.targetParameter];
        
        // Only allow float parameters to have input connections
        if (!sourceOutput || !paramSpec || paramSpec.type !== 'float') continue;

        const sourceVarName = variableNames.get(conn.sourceNodeId)?.get(conn.sourcePort);
        if (sourceVarName) {
          // Promote to appropriate type based on parameter type (float only)
          let promotedVar = sourceVarName;
          // Parameter is float - convert int inputs to float, extract first component for vec types
          if (sourceOutput.type === 'int') {
            promotedVar = `float(${sourceVarName})`;
          } else if (sourceOutput.type !== 'float') {
            // Extract first component for vec types
            promotedVar = `${sourceVarName}.x`;
          }
          parameterInputVars.set(conn.targetParameter, promotedVar);
        }
      }
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
    const nodeCode = this.replacePlaceholders(
      nodeSpec.mainCode,
      node,
      nodeSpec,
      inputVars,
      outputVars,
      uniformNames,
      parameterInputVars
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
          const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
          result = result.replace(regex, '""');
        }
      } else {
        // Check if parameter has an input connection
        const paramInputVar = parameterInputVars.get(paramName);
        if (paramInputVar && paramSpec && paramSpec.type === 'float') {
          // Parameter has input connection - combine with config value
          const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
          // Get config value: prefer uniform, then node parameter value, then default
          let configValue = uniformName;
          if (!configValue) {
            const paramValue = node.parameters[paramName];
            if (paramValue !== undefined) {
              configValue = String(paramValue);
            } else {
              configValue = String(paramSpec.default ?? 0);
            }
          }
          
          // Get input mode (from node override, spec default, or 'override')
          const inputMode = node.parameterInputModes?.[paramName] || 
                           paramSpec.inputMode || 
                           'override';
          
          // Generate combined expression based on mode
          const combinedExpr = this.generateParameterCombination(
            configValue,
            paramInputVar,
            inputMode,
            paramSpec.type
          );
          
          const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
          result = result.replace(regex, combinedExpr);
        } else {
          // Regular parameter - use uniform
          const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
          if (uniformName) {
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
            result = result.replace(regex, uniformName);
          } else if (paramSpec) {
            // No uniform found - use default value directly
            const defaultValue = paramSpec.default !== undefined ? String(paramSpec.default) : 
                                paramSpec.type === 'int' ? '0' : '0.0';
            const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
            result = result.replace(regex, defaultValue);
          } else {
            // paramSpec is undefined - try to use value from node.parameters directly
            // This handles cases where parameter exists in code but not in spec
            const paramValue = node.parameters[paramName];
            if (paramValue !== undefined) {
              // Use the actual parameter value
              const valueStr = String(paramValue);
              const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
              result = result.replace(regex, valueStr);
            } else {
              // No value found - use safe default (0.0 for float, 0 for int)
              // Try to infer type from usage context, default to float
              const regex = new RegExp(`\\$param\\.${this.escapeRegex(paramName)}`, 'g');
              result = result.replace(regex, '0.0');
            }
          }
        }
      }
    }

    // Final cleanup pass: catch any remaining $param.* placeholders that weren't replaced
    // This is a safety net for edge cases
    result = result.replace(/\$param\.\w+/g, (match) => {
      // Extract parameter name
      const paramName = match.replace('$param.', '');
      // Try to find it in node.parameters as last resort
      const paramValue = node.parameters[paramName];
      if (paramValue !== undefined) {
        return String(paramValue);
      }
      // Default to 0.0 if nothing found
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
   * Generate swizzle code directly based on parameter value
   * Replaces the conditional block with direct swizzle operation
   * Note: This is called after input/output placeholders are replaced
   */
  private generateSwizzleCode(
    code: string,
    swizzleValue: string,
    inputVars: Map<string, string>,
    outputVars: Map<string, string>
  ): string {
    const inputVar = inputVars.get('in') || 'vec4(0.0)';
    const outputVar = outputVars.get('out') || 'vec4(0.0)';
    
    // Escape the output variable name for use in regex
    const escapedOutputVar = this.escapeRegex(outputVar);
    
    // Validate and normalize swizzle pattern
    const normalized = this.normalizeSwizzlePattern(swizzleValue);
    if (!normalized) {
      // Invalid pattern, use pass-through
      // Match the entire conditional block - the output var has already been replaced
      const passThroughRegex = new RegExp(`vec4\\s+v\\s*=\\s*[^;]+;[\\s\\S]*?if\\s*\\([^)]+\\)[\\s\\S]*?else\\s*\\{[\\s\\S]*?${escapedOutputVar}\\s*=\\s*v;[\\s\\S]*?\\}`);
      return code.replace(passThroughRegex, `${outputVar} = ${inputVar};`);
    }
    
    // Generate swizzle expression
    let swizzleExpr: string;
    const pattern = normalized.toLowerCase();
    
    if (pattern.length === 2) {
      // 2-component swizzle (e.g., "xy", "yx")
      swizzleExpr = `vec4(${inputVar}.${pattern}, 0.0, 1.0)`;
    } else if (pattern.length === 3) {
      // 3-component swizzle (e.g., "xyz", "zyx")
      swizzleExpr = `vec4(${inputVar}.${pattern}, 1.0)`;
    } else if (pattern.length === 4) {
      // 4-component swizzle (e.g., "xyzw", "wzyx")
      swizzleExpr = `${inputVar}.${pattern}`;
    } else {
      // Invalid length, pass through
      swizzleExpr = inputVar;
    }
    
    // Replace the entire conditional block
    // Match from "vec4 v = ..." through all the if/else if statements to the final else block
    // The output variable has already been replaced, so use the actual variable name
    // Match: vec4 v = ...; [anything] if (...) { ... } [else if (...) { ... }]* else { ... output = v; ... }
    // Use [\s\S] to match across newlines
    const swizzleBlockRegex = new RegExp(
      `vec4\\s+v\\s*=\\s*[^;]+;[\\s\\S]*?if\\s*\\([^)]+\\)[\\s\\S]*?(?:else\\s+if\\s*\\([^)]+\\)[\\s\\S]*?)*else\\s*\\{[\\s\\S]*?${escapedOutputVar}\\s*=\\s*v;[\\s\\S]*?\\}`
    );
    const replacement = `${outputVar} = ${swizzleExpr};`;
    
    const result = code.replace(swizzleBlockRegex, replacement);
    
    // If the replacement didn't work (regex didn't match), try a simpler approach
    // Just replace the parameter references and let the shader compile (it will fail but give better error)
    if (result === code) {
      // Fallback: remove all $param.swizzle references
      return code.replace(/\$param\.swizzle/g, '""');
    }
    
    return result;
  }
  
  /**
   * Normalize swizzle pattern to valid GLSL swizzle
   * Converts rgba/abgr to xyzw, validates characters
   */
  private normalizeSwizzlePattern(pattern: string): string | null {
    if (!pattern || typeof pattern !== 'string') return null;
    
    // Convert rgba notation to xyzw
    let normalized = pattern.toLowerCase();
    normalized = normalized.replace(/r/g, 'x');
    normalized = normalized.replace(/g/g, 'y');
    normalized = normalized.replace(/b/g, 'z');
    normalized = normalized.replace(/a/g, 'w');
    
    // Validate: only x, y, z, w allowed, length 1-4
    if (!/^[xyzw]{1,4}$/.test(normalized)) {
      return null;
    }
    
    return normalized;
  }


  /**
   * Generate parameter combination expression based on input mode
   */
  private generateParameterCombination(
    configValue: string,
    inputValue: string,
    mode: 'override' | 'add' | 'subtract' | 'multiply',
    paramType: 'float' | 'int' = 'float'
  ): string {
    // For override mode, just return the input value
    if (mode === 'override') {
      return inputValue;
    }
    
    // For arithmetic operations, both values are already float-compatible
    switch (mode) {
      case 'add':
        return `(${configValue} + ${inputValue})`;
      case 'subtract':
        return `(${configValue} - ${inputValue})`;
      case 'multiply':
        return `(${configValue} * ${inputValue})`;
      default:
        return inputValue;
    }
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
