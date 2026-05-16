import type { NodeGraph, NodeInstance } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { isVirtualNodeId } from '../../utils/virtualNodes';
import { clampFloatExpressionGlsl, formatParamLiteralForGlsl, getInputDefaultValue } from './MainCodeGeneratorUtils';
import { generateParameterCombination } from './NodeShaderCompilerHelpers';
import { sanitizeAutomationLaneId } from './MainCodeGeneratorOutput';
import { automationLaneHasEvaluableRegions } from '../../utils/automationEvaluator';
import { replacePlaceholders, type PlaceholderContext } from './MainCodeGeneratorPlaceholders';
import { resolveFloatParameterInputVarsFromConnections } from './resolveFloatParameterInputVarsFromConnections';
import { arrangementNotesEvalStructName } from '../arrangement/packArrangementNotesForGlsl';

export function generatePromotionCode(
  sourceVar: string,
  sourceType: string,
  targetType: string
): string {
  if (sourceType === targetType) return sourceVar;
  if (targetType === 'any' || sourceType === 'any') return sourceVar;
  const promotions: Record<string, Record<string, string>> = {
    float: { vec2: `vec2(${sourceVar}, ${sourceVar})`, vec3: `vec3(${sourceVar}, ${sourceVar}, ${sourceVar})`, vec4: `vec4(${sourceVar}, ${sourceVar}, ${sourceVar}, 1.0)` },
    vec2: { vec3: `vec3(${sourceVar}.x, ${sourceVar}.y, 0.0)`, vec4: `vec4(${sourceVar}.x, ${sourceVar}.y, 0.0, 1.0)` },
    vec3: { vec4: `vec4(${sourceVar}.x, ${sourceVar}.y, ${sourceVar}.z, 1.0)` }
  };
  const demotions: Record<string, Record<string, string>> = {
    vec4: { float: `${sourceVar}.r`, vec2: `${sourceVar}.xy`, vec3: `${sourceVar}.rgb` },
    vec3: { float: `${sourceVar}.r`, vec2: `${sourceVar}.xy` },
    vec2: { float: `${sourceVar}.x` }
  };
  const promotion = promotions[sourceType]?.[targetType];
  if (promotion) return promotion;
  const demotion = demotions[sourceType]?.[targetType];
  if (demotion) return demotion;
  throw new Error(`Cannot convert ${sourceType} to ${targetType}`);
}

/**
 * Float parameter driven by a wire: same semantics as `$param` in {@link replacePlaceholders}
 * (override vs multiply/add/subtract with slider/uniform config, then clamp to param range).
 */
function buildGlslExprForDrivenFloatParameter(
  node: NodeInstance,
  nodeSpec: NodeSpec,
  paramName: string,
  wireExpr: string,
  uniformNames: Map<string, string>
): string {
  const paramSpec = nodeSpec.parameters[paramName];
  if (!paramSpec || paramSpec.type !== 'float') return wireExpr;

  const inputMode =
    node.parameterInputModes?.[paramName] || paramSpec.inputMode || 'override';

  if (inputMode === 'override') {
    return clampFloatExpressionGlsl(wireExpr, paramSpec);
  }

  const uniformName = uniformNames.get(`${node.id}.${paramName}`) || '';
  let configValue: string;
  if (uniformName) {
    configValue = uniformName;
  } else {
    const paramValue = node.parameters[paramName];
    const rawDefault =
      paramSpec.default !== undefined && typeof paramSpec.default === 'number'
        ? paramSpec.default
        : 0.0;
    const v =
      paramValue !== undefined && typeof paramValue === 'number' ? paramValue : rawDefault;
    configValue = formatParamLiteralForGlsl(v, paramSpec);
  }

  const combined = generateParameterCombination(
    configValue,
    wireExpr,
    inputMode,
    'float'
  );
  return clampFloatExpressionGlsl(combined, paramSpec);
}

export function getParameterComponentExpression(
  node: NodeInstance,
  nodeSpec: NodeSpec,
  paramName: string,
  parameterInputVars: Map<string, string>,
  uniformNames: Map<string, string>,
  graph: NodeGraph | undefined
): string {
  const paramSpec = nodeSpec.parameters[paramName];
  if (graph?.automation?.lanes && paramSpec?.type === 'float') {
    const lane = graph.automation.lanes.find((l) => l.nodeId === node.id && l.paramName === paramName);
    if (lane && automationLaneHasEvaluableRegions(lane)) {
      return clampFloatExpressionGlsl(
        `evalAutomation_${sanitizeAutomationLaneId(lane.id)}(uTimelineTime)`,
        paramSpec
      );
    }
  }
  const paramInputVar = parameterInputVars.get(paramName);
  if (paramInputVar) {
    return buildGlslExprForDrivenFloatParameter(
      node,
      nodeSpec,
      paramName,
      paramInputVar,
      uniformNames
    );
  }
  const uniformName = uniformNames.get(`${node.id}.${paramName}`);
  if (uniformName) return uniformName;
  const raw = node.parameters[paramName];
  const value = typeof raw === 'number' && isFinite(raw)
    ? raw
    : (paramSpec && typeof paramSpec.default === 'number' ? paramSpec.default : (paramSpec?.type === 'int' ? 0 : 0.0));
  return formatParamLiteralForGlsl(value, paramSpec);
}

export function getInputFallbackValue(
  node: NodeInstance,
  nodeSpec: NodeSpec,
  input: { name: string; type: string; fallbackParameter?: string }
): string | null {
  const fp = input.fallbackParameter;
  if (!fp || !nodeSpec.parameters) return null;
  const paramNames = fp.split(',').map(s => s.trim()).filter(Boolean);
  if (paramNames.length === 0) return null;

  const getParamValue = (name: string): number => {
    const raw = node.parameters[name];
    if (typeof raw === 'number' && isFinite(raw)) return raw;
    const spec = nodeSpec.parameters[name];
    if (spec && typeof spec.default === 'number') return spec.default;
    return spec?.type === 'int' ? 0 : 0.0;
  };

  if (paramNames.length === 1) {
    const name = paramNames[0];
    if (!nodeSpec.parameters[name]) return null;
    return formatParamLiteralForGlsl(getParamValue(name), nodeSpec.parameters[name]);
  }
  if (paramNames.length === 2 && input.type === 'vec2') {
    const fa = formatParamLiteralForGlsl(getParamValue(paramNames[0]), undefined);
    const fb = formatParamLiteralForGlsl(getParamValue(paramNames[1]), undefined);
    return `vec2(${fa}, ${fb})`;
  }
  if (paramNames.length === 3 && input.type === 'vec3') {
    const fa = formatParamLiteralForGlsl(getParamValue(paramNames[0]), undefined);
    const fb = formatParamLiteralForGlsl(getParamValue(paramNames[1]), undefined);
    const fc = formatParamLiteralForGlsl(getParamValue(paramNames[2]), undefined);
    return `vec3(${fa}, ${fb}, ${fc})`;
  }
  if (paramNames.length === 4 && input.type === 'vec4') {
    const fa = formatParamLiteralForGlsl(getParamValue(paramNames[0]), undefined);
    const fb = formatParamLiteralForGlsl(getParamValue(paramNames[1]), undefined);
    const fc = formatParamLiteralForGlsl(getParamValue(paramNames[2]), undefined);
    const fd = formatParamLiteralForGlsl(getParamValue(paramNames[3]), undefined);
    return `vec4(${fa}, ${fb}, ${fc}, ${fd})`;
  }
  return null;
}

export function substituteInputRefsInExpression(
  expression: string,
  inputVars: Map<string, string>
): string {
  return expression.replace(/\$input\.(\w+)/g, (_, name) => {
    const value = inputVars.get(name);
    return value !== undefined ? value : `$input.${name}`;
  });
}

export type NodeCodeContext = PlaceholderContext & {
  nodeSpecs: Map<string, NodeSpec>;
  effectiveNodeSpecsById?: Map<string, NodeSpec>;
  getGenericRaymarcherReplacements: (
    node: NodeInstance,
    graph: NodeGraph,
    uniformNames: Map<string, string>,
    functionNameMap: Map<string, Map<string, string>>
  ) => { sdfCall: string; displacementAtP: string };
};

/**
 * Generate code for a single node.
 */
export function generateNodeCode(
  node: NodeInstance,
  nodeSpec: NodeSpec,
  graph: NodeGraph,
  executionOrder: string[],
  variableNames: Map<string, Map<string, string>>,
  uniformNames: Map<string, string>,
  functionNameMap: Map<string, Map<string, string>>,
  ctx: NodeCodeContext
): string {
  const code: string[] = [];
  const inputVars = new Map<string, string>();

  for (const conn of graph.connections) {
    if (conn.disabled) continue;
    if (conn.targetNodeId !== node.id || !conn.targetPort) continue;
    const targetInput = nodeSpec.inputs.find(i => i.name === conn.targetPort);
    if (!targetInput) continue;

    if (isVirtualNodeId(conn.sourceNodeId) && conn.sourcePort === 'out') {
      const uniformName = uniformNames.get(conn.sourceNodeId);
      if (uniformName) {
        inputVars.set(conn.targetPort, generatePromotionCode(uniformName, 'float', targetInput.type));
      }
      continue;
    }

    const sourceNode = graph.nodes.find(n => n.id === conn.sourceNodeId);
    if (!sourceNode) continue;
    const sourceSpec = ctx.effectiveNodeSpecsById?.get(sourceNode.id) ?? ctx.nodeSpecs.get(sourceNode.type);
    if (!sourceSpec) continue;
    const sourceOutput = sourceSpec.outputs.find(o => o.name === conn.sourcePort);
    if (!sourceOutput) continue;

    const sourceVarName = variableNames.get(conn.sourceNodeId)?.get(conn.sourcePort);
    if (sourceVarName) {
      inputVars.set(conn.targetPort, generatePromotionCode(sourceVarName, sourceOutput.type, targetInput.type));
    } else {
      console.warn(
        `[NodeShaderCompiler] Could not find variable for connection: ` +
        `${conn.sourceNodeId}.${conn.sourcePort} -> ${node.id}.${conn.targetPort}`
      );
    }
  }

  const parameterInputVars = resolveFloatParameterInputVarsFromConnections(
    node,
    nodeSpec,
    graph,
    executionOrder,
    variableNames,
    uniformNames,
    ctx.nodeSpecs,
    ctx.effectiveNodeSpecsById
  );

  const skipInputDefaults = nodeSpec.inputs.length === 0;
  if (!skipInputDefaults) {
    for (const input of nodeSpec.inputs) {
      if (inputVars.has(input.name)) continue;
      let defaultValue: string;
      if (input.fallbackExpression) {
        defaultValue = substituteInputRefsInExpression(input.fallbackExpression, inputVars);
      } else if (input.fallbackParameter) {
        const paramNames = input.fallbackParameter.split(',').map(s => s.trim()).filter(Boolean);
        if (paramNames.length === 1) {
          defaultValue = getParameterComponentExpression(node, nodeSpec, paramNames[0], parameterInputVars, uniformNames, graph);
        } else if (paramNames.length === 2 && input.type === 'vec2') {
          const e0 = getParameterComponentExpression(node, nodeSpec, paramNames[0], parameterInputVars, uniformNames, graph);
          const e1 = getParameterComponentExpression(node, nodeSpec, paramNames[1], parameterInputVars, uniformNames, graph);
          defaultValue = `vec2(${e0}, ${e1})`;
        } else if (paramNames.length === 3 && input.type === 'vec3') {
          const e0 = getParameterComponentExpression(node, nodeSpec, paramNames[0], parameterInputVars, uniformNames, graph);
          const e1 = getParameterComponentExpression(node, nodeSpec, paramNames[1], parameterInputVars, uniformNames, graph);
          const e2 = getParameterComponentExpression(node, nodeSpec, paramNames[2], parameterInputVars, uniformNames, graph);
          defaultValue = `vec3(${e0}, ${e1}, ${e2})`;
        } else if (paramNames.length === 4 && input.type === 'vec4') {
          const e0 = getParameterComponentExpression(node, nodeSpec, paramNames[0], parameterInputVars, uniformNames, graph);
          const e1 = getParameterComponentExpression(node, nodeSpec, paramNames[1], parameterInputVars, uniformNames, graph);
          const e2 = getParameterComponentExpression(node, nodeSpec, paramNames[2], parameterInputVars, uniformNames, graph);
          const e3 = getParameterComponentExpression(node, nodeSpec, paramNames[3], parameterInputVars, uniformNames, graph);
          defaultValue = `vec4(${e0}, ${e1}, ${e2}, ${e3})`;
        } else {
          defaultValue = getInputFallbackValue(node, nodeSpec, input) ?? getInputDefaultValue(input.type);
        }
      } else {
        defaultValue = getInputDefaultValue(input.type);
      }
      inputVars.set(input.name, defaultValue);
    }

    // When a vec2/vec3/vec4 *port* is wired, we normally take the full vector from that edge.
    // If individual floats are also wired via `targetParameter` (same logical vector as
    // `fallbackParameter` lists), merge: use port swizzles for unwired components and the
    // driven expression for wired ones — matches panel live values and fixes "hue param
    // wire ignored when Start/End color ports are used" (e.g. oklch-color-map-bezier).
    for (const input of nodeSpec.inputs) {
      if (!input.fallbackParameter) continue;
      const paramNames = input.fallbackParameter.split(',').map((s) => s.trim()).filter(Boolean);
      const portVar = inputVars.get(input.name);
      if (!portVar) continue;
      const anyWiredAxis = paramNames.some((p) => parameterInputVars.has(p));
      if (!anyWiredAxis) continue;
      if (input.type === 'vec2' && paramNames.length === 2) {
        const e0 = parameterInputVars.has(paramNames[0])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[0],
              parameterInputVars.get(paramNames[0])!,
              uniformNames
            )
          : `${portVar}.x`;
        const e1 = parameterInputVars.has(paramNames[1])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[1],
              parameterInputVars.get(paramNames[1])!,
              uniformNames
            )
          : `${portVar}.y`;
        inputVars.set(input.name, `vec2(${e0}, ${e1})`);
      } else if (input.type === 'vec3' && paramNames.length === 3) {
        const e0 = parameterInputVars.has(paramNames[0])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[0],
              parameterInputVars.get(paramNames[0])!,
              uniformNames
            )
          : `${portVar}.x`;
        const e1 = parameterInputVars.has(paramNames[1])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[1],
              parameterInputVars.get(paramNames[1])!,
              uniformNames
            )
          : `${portVar}.y`;
        const e2 = parameterInputVars.has(paramNames[2])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[2],
              parameterInputVars.get(paramNames[2])!,
              uniformNames
            )
          : `${portVar}.z`;
        inputVars.set(input.name, `vec3(${e0}, ${e1}, ${e2})`);
      } else if (input.type === 'vec4' && paramNames.length === 4) {
        const e0 = parameterInputVars.has(paramNames[0])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[0],
              parameterInputVars.get(paramNames[0])!,
              uniformNames
            )
          : `${portVar}.x`;
        const e1 = parameterInputVars.has(paramNames[1])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[1],
              parameterInputVars.get(paramNames[1])!,
              uniformNames
            )
          : `${portVar}.y`;
        const e2 = parameterInputVars.has(paramNames[2])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[2],
              parameterInputVars.get(paramNames[2])!,
              uniformNames
            )
          : `${portVar}.z`;
        const e3 = parameterInputVars.has(paramNames[3])
          ? buildGlslExprForDrivenFloatParameter(
              node,
              nodeSpec,
              paramNames[3],
              parameterInputVars.get(paramNames[3])!,
              uniformNames
            )
          : `${portVar}.w`;
        inputVars.set(input.name, `vec4(${e0}, ${e1}, ${e2}, ${e3})`);
      }
    }
  }

  const outputVars = variableNames.get(node.id) || new Map();

  for (const [paramName, paramSpec] of Object.entries(nodeSpec.parameters)) {
    if (paramSpec.type === 'array') {
      const arrayValue = node.parameters[paramName] as number[] | undefined;
      if (Array.isArray(arrayValue) && arrayValue.length > 0) {
        const arrayVarName = ctx.generateArrayVariableName(node.id, paramName);
        const arrayValues = arrayValue.map(v => v.toFixed(10)).join(', ');
        code.push(`  const float ${arrayVarName}[${arrayValue.length}] = float[${arrayValue.length}](${arrayValues});`);
      }
    }
  }

  let nodeCode = replacePlaceholders(
    nodeSpec.mainCode,
    node,
    nodeSpec,
    inputVars,
    outputVars,
    uniformNames,
    ctx,
    parameterInputVars,
    graph
  );

  const nodeFunctionNameMap = functionNameMap.get(node.id);
  if (nodeFunctionNameMap) {
    for (const [originalName, nodeSpecificName] of nodeFunctionNameMap.entries()) {
      const functionCallRegex = new RegExp(`\\b${ctx.escapeRegex(originalName)}\\s*\\(`, 'g');
      nodeCode = nodeCode.replace(functionCallRegex, `${nodeSpecificName}(`);
    }
  }

  if (nodeSpec.id === 'generic-raymarcher') {
    const replacements = ctx.getGenericRaymarcherReplacements(
      node,
      graph,
      uniformNames,
      functionNameMap
    );
    nodeCode = nodeCode.replace(/\$sdf_call/g, replacements.sdfCall);
    nodeCode = nodeCode.replace(/\$displacement_at_p/g, replacements.displacementAtP);
  }

  if (nodeSpec.id === 'arrangement-notes') {
    nodeCode = nodeCode.replace(
      /\$arrNotesEvalStruct\b/g,
      arrangementNotesEvalStructName(node.id)
    );
  }

  code.push(nodeCode);
  return code.join('\n');
}
