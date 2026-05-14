import type { NodeGraph } from '../data-model/types';
import type { NodeSpec } from '../types/nodeSpec';
import type { CompilationResult, CompileTargetOptions, RenderBackendKind } from '../runtime/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import { getVirtualNodeIdsFromAudioSetup } from '../utils/virtualNodes';
import { GraphValidator } from './compilation/GraphValidator';
import { TypeValidator } from './compilation/TypeValidator';
import { GraphAnalyzer } from './compilation/GraphAnalyzer';
import { VariableNameGenerator } from './compilation/VariableNameGenerator';
import { UniformGenerator } from './compilation/UniformGenerator';
import { FunctionGenerator } from './compilation/FunctionGenerator';
import { MainCodeGenerator } from './compilation/MainCodeGenerator';
import {
  computePreviewDependencyMask,
  computePreviewDependencyMaskForWgslMvp,
  mergeWebGpuPreviewDependencyMask
} from './compilation/previewDependencyMask';
import { computeEffectiveNodeSpecs } from './compilation/effectiveNodeSpecs';
import { compileWgslMvp } from './compilation/WgslMvpCompiler';
import { buildCompileGraphView, filterExecutionOrderForBypass } from './compilation/CompileGraphView';
import {
  audioNodesFirst as audioNodesFirstHelper,
  isAudioNode as isAudioNodeHelper,
  getParameterDefaultValue as getParameterDefaultValueHelper,
  escapeRegex as escapeRegexHelper,
  normalizeSwizzlePattern as normalizeSwizzlePatternHelper,
  generateParameterCombination as generateParameterCombinationHelper,
  generateSwizzleCode as generateSwizzleCodeHelper
} from './compilation/NodeShaderCompilerHelpers';

function computeParamLayout(uniforms: CompilationResult['uniforms']): CompilationResult['paramLayout'] {
  const keys = uniforms.map((u) => `${u.nodeId}.${u.paramName}`);
  keys.sort();
  const out: Record<string, number> = {};
  for (let i = 0; i < keys.length; i++) {
    out[keys[i] as string] = i;
  }
  return out;
}

/**
 * True if `prev` appears in order as a subsequence of `next` (same relative order for all previous nodes).
 * Used so incremental compile can run after **node additions** without reordering the existing pipeline.
 */
function isExecutionOrderSubsequencePreserved(prev: string[], next: string[]): boolean {
  let i = 0;
  for (let k = 0; k < next.length && i < prev.length; k++) {
    if (next[k] === prev[i]) i++;
  }
  return i === prev.length;
}

/**
 * Node-based shader compiler
 * Converts a node graph into executable GLSL shader code
 * 
 * This class orchestrates the compilation process using focused components:
 * - GraphValidator: Validates graph structure
 * - TypeValidator: Validates type compatibility
 * - GraphAnalyzer: Calculates execution order
 * - VariableNameGenerator: Generates variable names
 * - UniformGenerator: Generates uniform names and metadata
 * - FunctionGenerator: Collects and deduplicates functions
 * - MainCodeGenerator: Generates main shader code
 */
export class NodeShaderCompiler {
  private readonly nodeSpecs: Map<string, NodeSpec>;
  private graphValidator: GraphValidator;
  private typeValidator: TypeValidator;
  private graphAnalyzer: GraphAnalyzer;
  private variableNameGenerator: VariableNameGenerator;
  private uniformGenerator: UniformGenerator;
  private functionGenerator: FunctionGenerator;
  private mainCodeGenerator: MainCodeGenerator;

  constructor(nodeSpecs: Map<string, NodeSpec>) {
    this.nodeSpecs = nodeSpecs;
    // Initialize components with shared helper methods
    this.graphValidator = new GraphValidator(nodeSpecs);
    this.typeValidator = new TypeValidator(nodeSpecs);
    this.graphAnalyzer = new GraphAnalyzer();
    this.variableNameGenerator = new VariableNameGenerator(nodeSpecs);
    this.uniformGenerator = new UniformGenerator(
      nodeSpecs,
      (spec) => isAudioNodeHelper(spec),
      (paramSpec, paramName) => getParameterDefaultValueHelper(paramSpec, paramName)
    );
    this.functionGenerator = new FunctionGenerator(
      nodeSpecs,
      (str) => escapeRegexHelper(str),
      (configValue, inputValue, mode, paramType) => generateParameterCombinationHelper(configValue, inputValue, mode, paramType)
    );
    this.mainCodeGenerator = new MainCodeGenerator(
      nodeSpecs,
      (spec) => isAudioNodeHelper(spec),
      (nodeId, paramName) => this.variableNameGenerator.generateArrayVariableName(nodeId, paramName),
      (str) => escapeRegexHelper(str),
      (configValue, inputValue, mode, paramType) => generateParameterCombinationHelper(configValue, inputValue, mode, paramType),
      (code, swizzleValue, inputVars, outputVars) => generateSwizzleCodeHelper(code, swizzleValue, inputVars, outputVars, escapeRegexHelper, normalizeSwizzlePatternHelper),
      (pattern) => normalizeSwizzlePatternHelper(pattern)
    );
  }

  /**
   * Incremental compilation: same full codegen as {@link compile} after cheap structural checks,
   * so the GPU still links a full program, but the worker can skip work when the change is unsafe
   * (falls back to {@link compile} via caller).
   *
   * Supports **node additions** when the new execution order keeps the previous order as a subsequence
   * (no removals; existing pipeline order preserved among old nodes).
   *
   * @param graph - Current node graph
   * @param previousResult - Last successful compilation result (must match graph history for execution order)
   * @param affectedNodeIds - Changed / added nodes and dependents (from GraphChangeDetector)
   */
  compileIncremental(
    graph: NodeGraph,
    previousResult: CompilationResult | null,
    affectedNodeIds: Set<string>,
    audioSetup?: AudioSetup | null,
    options?: CompileTargetOptions
  ): CompilationResult | null {
    const targetBackend: RenderBackendKind = options?.backend ?? 'webgl';
    if (targetBackend === 'webgpu') {
      // MVP: keep WebGPU compilation deterministic; skip incremental.
      return null;
    }

    if (!previousResult) {
      // No previous result - must do full compilation
      return null;
    }
    
    // If too many nodes affected, fall back to full compilation
    const changeThreshold = graph.nodes.length * 0.5; // 50% threshold
    if (affectedNodeIds.size > changeThreshold) {
      return null;
    }
    
    // Phase 2: Implement incremental compilation
    // Strategy:
    // 1. Find downstream dependents of changed nodes (nodes that depend on changed nodes)
    // 2. Regenerate code only for changed nodes + their dependents
    // 3. Reuse unchanged sections where possible
    
    try {
      // Step 1: Validate graph structure (quick check)
      const errors: string[] = [];
      const warnings: string[] = [];
      const incrValidSourceNodeIds = audioSetup
        ? new Set(getVirtualNodeIdsFromAudioSetup(audioSetup))
        : undefined;
      this.graphValidator.validateGraph(graph, errors, warnings, incrValidSourceNodeIds);
      if (errors.length > 0) {
        // Validation errors - fall back to full compilation
        return null;
      }
      
      // Step 2: Calculate execution order and check if it changed significantly
      const previousExecutionOrder = previousResult.metadata.executionOrder || [];
      let executionOrder: string[];
      try {
        executionOrder = this.graphAnalyzer.topologicalSort(graph);
        executionOrder = audioNodesFirstHelper(executionOrder, graph);
      } catch (error) {
        // Circular dependency or other error - fall back to full compilation
        return null;
      }
      
      // Step 3: Use affected nodes (already calculated by GraphChangeDetector)
      // Note: affectedNodeIds already includes changed nodes + their dependents

      // Step 4: Execution-order safety (same length, or **pure additions** preserving previous order)
      const graphNodeIds = new Set(graph.nodes.map((n) => n.id));
      for (const id of previousExecutionOrder) {
        if (!graphNodeIds.has(id)) {
          return null;
        }
      }

      if (executionOrder.length < previousExecutionOrder.length) {
        return null;
      }

      const orderSameLength = executionOrder.length === previousExecutionOrder.length;
      const isPureNodeAddition =
        executionOrder.length > previousExecutionOrder.length &&
        isExecutionOrderSubsequencePreserved(previousExecutionOrder, executionOrder);

      if (!orderSameLength && !isPureNodeAddition) {
        return null;
      }

      const executionOrderChanged = executionOrder.some((id, idx) => id !== previousExecutionOrder[idx]);

      if (orderSameLength) {
        if (executionOrderChanged) {
          const previousAffectedOrder = previousExecutionOrder.filter((id) => affectedNodeIds.has(id));
          const currentAffectedOrder = executionOrder.filter((id) => affectedNodeIds.has(id));
          if (
            previousAffectedOrder.length !== currentAffectedOrder.length ||
            previousAffectedOrder.some((id, idx) => id !== currentAffectedOrder[idx])
          ) {
            return null;
          }
        }
      } else {
        const prevIdSet = new Set(previousExecutionOrder);
        const previousAffectedOrder = previousExecutionOrder.filter((id) => affectedNodeIds.has(id));
        const currentAffectedAmongPrev = executionOrder.filter(
          (id) => affectedNodeIds.has(id) && prevIdSet.has(id)
        );
        if (
          previousAffectedOrder.length !== currentAffectedAmongPrev.length ||
          previousAffectedOrder.some((id, idx) => id !== currentAffectedAmongPrev[idx])
        ) {
          return null;
        }
      }

      const effectiveNodeSpecsById = computeEffectiveNodeSpecs(graph, executionOrder, this.nodeSpecs);
      const typeErrors = this.typeValidator.validateTypes(graph, effectiveNodeSpecsById);
      if (typeErrors.length > 0) {
        return null;
      }

      // Per-node Power view (mirrors `compile`). Toggling `bypassed` typically changes the
      // execution-order length, which fails the subsequence guard above and forces a full compile;
      // building the view here keeps the incremental path correct in the rare cases it does run
      // (e.g. parameter changes on a graph that already has a stable bypass set).
      const compileGraphView = buildCompileGraphView(graph, this.nodeSpecs);
      const compileGraph: NodeGraph =
        compileGraphView.compileConnections === graph.connections
          ? graph
          : { ...graph, connections: compileGraphView.compileConnections };
      const compileExecutionOrder = filterExecutionOrderForBypass(
        executionOrder,
        compileGraphView.bypassedNodeIds
      );

      const variableNames = this.variableNameGenerator.generateVariableNames(graph);

      const uniformNames = this.uniformGenerator.generateUniformNameMapping(compileGraph, audioSetup ?? null);

      let { functions, functionNameMap } = this.functionGenerator.collectAndDeduplicateFunctions(
        compileGraph,
        uniformNames,
        variableNames,
        compileExecutionOrder
      );

      const { variableDeclarations, mainCode, genericRaymarcherSdfFunctions } = this.mainCodeGenerator.generateMainCode(
        compileGraph,
        compileExecutionOrder,
        variableNames,
        uniformNames,
        functionNameMap,
        effectiveNodeSpecsById
      );
      if (genericRaymarcherSdfFunctions) {
        functions = functions ? `${functions}\n\n${genericRaymarcherSdfFunctions}` : genericRaymarcherSdfFunctions;
      }

      const finalOutputNode = this.mainCodeGenerator.findFinalOutputNode(compileGraph, compileExecutionOrder);

      const finalColorVar = this.mainCodeGenerator.generateFinalColorVariable(compileGraph, finalOutputNode, variableNames);

      const usedUniforms = this.uniformGenerator.findUsedUniforms(mainCode + '\n' + variableDeclarations, functions, uniformNames);

      const uniforms = this.uniformGenerator.generateUniformMetadata(graph, uniformNames, usedUniforms, audioSetup ?? null);

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

      const automationFunctions = this.mainCodeGenerator.generateAutomationFunctions(graph, compileExecutionOrder);
      const shaderCode = this.mainCodeGenerator.assembleShader(functions, uniforms, variableDeclarations, mainCode, finalColorVar, automationFunctions);

      return {
        backend: 'webgl',
        supported: true,
        code: shaderCode,
        shaderCode,
        uniforms,
        metadata: {
          warnings,
          errors: [],
          executionOrder: compileExecutionOrder,
          finalOutputNodeId: finalOutputNode?.id || null,
          previewDependencies: computePreviewDependencyMask(
            compileGraph,
            uniforms,
            shaderCode,
            this.nodeSpecs,
            audioSetup
          )
        },
        paramLayout: computeParamLayout(uniforms),
      };
      
    } catch (error) {
      // Any error during incremental compilation - fall back to full compilation
      console.warn('[NodeShaderCompiler] Incremental compilation failed, falling back to full compilation:', error);
      return null;
    }
  }

  /**
   * Compile a node graph into GLSL shader code
   * @param audioSetup - Optional panel audio setup for audio-derived uniforms (bands/remappers/files).
   */
  compile(graph: NodeGraph, audioSetup?: AudioSetup | null, options?: CompileTargetOptions): CompilationResult {
    const targetBackend: RenderBackendKind = options?.backend ?? 'webgl';
    const errors: string[] = [];
    const warnings: string[] = [];
    const executionOrder: string[] = [];

    // Handle empty graph
    if (graph.nodes.length === 0) {
      const emptyShader = this.mainCodeGenerator.assembleShader(
        '',
        [],
        '',
        '',
        'vec3(0.0)'
      );
      
      return {
        backend: 'webgl',
        supported: true,
        code: emptyShader,
        shaderCode: emptyShader,
        uniforms: [],
        metadata: {
          warnings: ['[WARNING] Empty graph - outputting black'],
          errors: [],
          executionOrder: [],
          finalOutputNodeId: null,
          previewDependencies: computePreviewDependencyMask(
            graph,
            [],
            emptyShader,
            this.nodeSpecs,
            audioSetup
          )
        },
        paramLayout: {},
      };
    }

    // Step 1: Validate graph structure
    const validSourceNodeIds = audioSetup
      ? new Set(getVirtualNodeIdsFromAudioSetup(audioSetup))
      : undefined;
    this.graphValidator.validateGraph(graph, errors, warnings, validSourceNodeIds);
    if (errors.length > 0) {
      return {
        backend: 'webgl',
        supported: true,
        code: '',
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder: [],
          finalOutputNodeId: null
        },
        paramLayout: {},
      };
    }

    // Step 2: Graph traversal - topological sort
    try {
      let sorted = this.graphAnalyzer.topologicalSort(graph);
      sorted = audioNodesFirstHelper(sorted, graph);
      executionOrder.push(...sorted);
    } catch (error) {
      errors.push(`[ERROR] Circular Dependency: ${error instanceof Error ? error.message : 'Graph contains cycles'}`);
      return {
        backend: 'webgl',
        supported: true,
        code: '',
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder: [],
          finalOutputNodeId: null
        },
        paramLayout: {},
      };
    }

    // Step 2.5: Effective node specs (type-polymorphic nodes like select)
    const effectiveNodeSpecsById = computeEffectiveNodeSpecs(graph, executionOrder, this.nodeSpecs);

    // Step 2.6: Per-node Power view. Drops Rule B outgoing wires + rewrites Rule A wires to the
    // bypassed node's primary upstream so consumers point past the bypassed node. Also yields the
    // set of bypassed node ids to filter out of the compiled `executionOrder`. Type validation
    // still runs on the original graph so untouched type errors keep their original framing.
    const compileGraphView = buildCompileGraphView(graph, this.nodeSpecs);
    const compileGraph: NodeGraph =
      compileGraphView.compileConnections === graph.connections
        ? graph
        : { ...graph, connections: compileGraphView.compileConnections };
    const compileExecutionOrder = filterExecutionOrderForBypass(
      executionOrder,
      compileGraphView.bypassedNodeIds
    );

    // Step 3: Type validation
    const typeErrors = this.typeValidator.validateTypes(graph, effectiveNodeSpecsById);
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      return {
        backend: 'webgl',
        supported: true,
        code: '',
        shaderCode: '',
        uniforms: [],
        metadata: {
          warnings,
          errors,
          executionOrder,
          finalOutputNodeId: null
        },
        paramLayout: {},
      };
    }

    // Task 04: WGSL MVP subset (explicit, no GLSL→WGSL transpilation).
    if (targetBackend === 'webgpu') {
      const finalOutputNode = this.mainCodeGenerator.findFinalOutputNode(compileGraph, compileExecutionOrder);
      if (!finalOutputNode) {
        return {
          backend: 'webgpu',
          supported: false,
          unsupportedReasons: ['missing final-output node'],
          code: '',
          shaderCode: '',
          uniforms: [],
          metadata: { warnings, errors: [], executionOrder: compileExecutionOrder, finalOutputNodeId: null },
          paramLayout: {},
          resources: [],
        };
      }

      const wgslResult = compileWgslMvp(
        compileGraph,
        this.nodeSpecs,
        compileExecutionOrder,
        finalOutputNode.id,
        audioSetup ?? null
      );
      if (!wgslResult.supported) return wgslResult;
      const computedDeps = computePreviewDependencyMaskForWgslMvp(
        compileGraph,
        wgslResult.uniforms,
        wgslResult.code,
        this.nodeSpecs,
        audioSetup ?? null,
        wgslResult.metadata.finalOutputNodeId
      );
      const previewDependencies = mergeWebGpuPreviewDependencyMask(
        computedDeps,
        wgslResult.metadata.previewDependencies,
        wgslResult.webgpuPassPlan != null
      );
      return {
        ...wgslResult,
        metadata: {
          ...wgslResult.metadata,
          previewDependencies
        }
      };
    }

    // Step 4: Generate variable names (declared for every node — bypassed nodes' variables are
    // simply unused in main code, which the GLSL compiler strips).
    const variableNames = this.variableNameGenerator.generateVariableNames(graph);

    // Step 5: Generate uniform names. Pass `compileGraph` so the parameter-wire `isConnected`
    // check sees the bypass-aware connection set: a wire from a bypassed source is dropped, and
    // the consumer's parameter falls back to its own default uniform.
    const uniformNames = this.uniformGenerator.generateUniformNameMapping(compileGraph, audioSetup ?? null);

    // Step 6: Collect functions for the nodes that will actually emit code. Filter to
    // `compileExecutionOrder` so bypassed nodes' helper functions and uniform placeholders never
    // make it into the final shader.
    let { functions, functionNameMap } = this.functionGenerator.collectAndDeduplicateFunctions(
      compileGraph,
      uniformNames,
      variableNames,
      compileExecutionOrder
    );

    // Step 7: Generate main code (returns variable declarations, main code, and generic-raymarcher SDF functions).
    // Uses `compileGraph` (filtered connections) and `compileExecutionOrder` (bypassed nodes
    // dropped) so the emitted code follows the two Power rules from `_OVERVIEW.md`.
    const { variableDeclarations, mainCode, genericRaymarcherSdfFunctions } = this.mainCodeGenerator.generateMainCode(
      compileGraph,
      compileExecutionOrder,
      variableNames,
      uniformNames,
      functionNameMap,
      effectiveNodeSpecsById
    );
    if (genericRaymarcherSdfFunctions) {
      functions = functions ? `${functions}\n\n${genericRaymarcherSdfFunctions}` : genericRaymarcherSdfFunctions;
    }

    // Step 8: Find final output node
    const finalOutputNode = this.mainCodeGenerator.findFinalOutputNode(compileGraph, compileExecutionOrder);

    // Step 9: Generate final color variable
    const finalColorVar = this.mainCodeGenerator.generateFinalColorVariable(
      compileGraph,
      finalOutputNode,
      variableNames,
      effectiveNodeSpecsById
    );

    // Step 10: Track which uniforms are actually used in the shader code
    const usedUniforms = this.uniformGenerator.findUsedUniforms(mainCode + '\n' + variableDeclarations, functions, uniformNames);

    // Step 11: Generate uniform metadata (only for used uniforms; incl. panel audio).
    // Uses `graph` so audio-side uniforms (file primary uniforms, etc.) keep their full view.
    const uniforms = this.uniformGenerator.generateUniformMetadata(graph, uniformNames, usedUniforms, audioSetup ?? null);

    // Step 12: Check for disconnected nodes (warnings).
    // Reads `graph.connections` (the full set) so a bypassed wire is still considered "connected"
    // for warning purposes; "no connections" warnings are about authoring, not compile output.
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

    // Step 13: Assemble shader (include automation eval functions when graph has automation).
    // Automation iterates `graph` directly (lanes are full-graph metadata) and is not affected by
    // Power: a bypassed node still owns its automation lanes, the lane evaluator just emits dead
    // GLSL for any lane whose node never runs.
    const automationFunctions = this.mainCodeGenerator.generateAutomationFunctions(graph, compileExecutionOrder);
    const shaderCode = this.mainCodeGenerator.assembleShader(functions, uniforms, variableDeclarations, mainCode, finalColorVar, automationFunctions);

    return {
      backend: 'webgl',
      supported: true,
      code: shaderCode,
      shaderCode,
      uniforms,
      metadata: {
        warnings,
        errors: [],
        executionOrder: compileExecutionOrder,
        finalOutputNodeId: finalOutputNode?.id || null,
        previewDependencies: computePreviewDependencyMask(
          compileGraph,
          uniforms,
          shaderCode,
          this.nodeSpecs,
          audioSetup
        )
      },
      paramLayout: computeParamLayout(uniforms),
    };
  }

}
