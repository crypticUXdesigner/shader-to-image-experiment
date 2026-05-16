/**
 * Shader codegen helpers (literals, defaults, GLSL clamp).
 */
/**
 * Clamp a float GLSL expression to a parameter's min/max (matches `$param` / panel ranges).
 */
export function clampFloatExpressionGlsl(
  expr: string,
  paramSpec: { type?: string; min?: number; max?: number } | undefined
): string {
  if (!paramSpec || paramSpec.type !== 'float') return expr;
  const min = typeof paramSpec.min === 'number' ? paramSpec.min : 0;
  const max = typeof paramSpec.max === 'number' ? paramSpec.max : 1;
  const minStr = formatParamLiteralForGlsl(min, { type: 'float' });
  const maxStr = formatParamLiteralForGlsl(max, { type: 'float' });
  return `clamp((${expr}), ${minStr}, ${maxStr})`;
}

export function formatParamLiteralForGlsl(
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
 * Sanitize node id for use in GLSL function names (e.g. generic_raymarcher_sdf_<id>).
 */
export function sanitizeIdForGlsl(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Generate output variable name for a node/port (same convention as VariableNameGenerator).
 */
export function generateOutputVariableName(nodeId: string, portName: string): string {
  const sanitizedId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedPort = portName.replace(/[^a-zA-Z0-9]/g, '_');
  return `node_${sanitizedId}_${sanitizedPort}`;
}

/**
 * Get default value for an unconnected input.
 */
export function getInputDefaultValue(type: string): string {
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
