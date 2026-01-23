// Adapter to convert VisualElement to NodeSpec
// This provides a bridge between the existing element system and the new node system

import type { VisualElement } from '../types';
import type { NodeSpec, PortSpec, ParameterSpec } from '../types/nodeSpec';

// Map element categories to node categories
const categoryMap: Record<string, string> = {
  'Background': 'Patterns',      // Noise generators → Patterns
  'Pattern': 'Patterns',          // Pattern generators → Patterns
  'Geometry': 'Shapes',           // Geometry and 3D → Shapes
  'Transform': 'Distort',         // Coordinate transforms → Distort
  'Distortion': 'Distort',        // Distortions → Distort
  'Compositing': 'Blend',         // Compositing → Blend
  'Masking': 'Mask',               // Masking → Mask
  'Post-Processing': 'Effects',   // Post-processing → Effects
  'Glitch': 'Effects',           // Glitch effects → Effects
  'Effect': 'Effects',           // General effects → Effects
  'Output': 'Output'
};

// Default: most elements take vec2 input and output float
export function visualElementToNodeSpec(element: VisualElement): NodeSpec {
  // Determine node category
  const nodeCategory = categoryMap[element.category] || 'Patterns';
  
  // Create input ports (most elements take a vec2 coordinate input)
  const inputs: PortSpec[] = [];
  if (element.elementType === 'coordinate-modifier') {
    // Coordinate modifiers take vec2 input
    inputs.push({
      name: 'in',
      type: 'vec2'
    });
  } else if (element.elementType === 'content-generator') {
    // Content generators typically take vec2 UV input
    inputs.push({
      name: 'in',
      type: 'vec2'
    });
  } else if (element.elementType === 'post-processor') {
    // Post-processors take vec4 color input
    inputs.push({
      name: 'in',
      type: 'vec4'
    });
  }
  
  // Create output ports (most elements output float or vec4)
  const outputs: PortSpec[] = [];
  if (element.elementType === 'post-processor') {
    outputs.push({
      name: 'out',
      type: 'vec4'
    });
  } else if (element.elementType === 'coordinate-modifier') {
    // Coordinate modifiers output vec2 (modified coordinates)
    outputs.push({
      name: 'out',
      type: 'vec2'
    });
  } else {
    // Most generators output float
    outputs.push({
      name: 'out',
      type: 'float'
    });
  }
  
  // Convert parameters
  const parameters: Record<string, ParameterSpec> = {};
  for (const [paramName, paramConfig] of Object.entries(element.parameters)) {
    parameters[paramName] = {
      type: paramConfig.type === 'int' ? 'int' : 'float',
      default: paramConfig.default,
      min: paramConfig.min,
      max: paramConfig.max,
      step: paramConfig.step,
      // Preserve inputMode if it exists (for elements that support it)
      inputMode: (paramConfig as any).inputMode
    };
  }
  
  // Convert mainCode: replace old patterns with placeholders
  // Old: uses `p`, `result += ...`
  // New: uses `$input.in`, `$output.out = ...`, `$param.paramName`
  let mainCode = element.mainCode;
  
  // Replace `result +=` with `$output.out =` or `$output.out +=`
  // For coordinate modifiers: output is vec2, so `$output.out = ...`
  // For content generators: output is float, so `$output.out = ...` or `$output.out += ...`
  // Use word boundary to avoid replacing parts of other words
  // IMPORTANT: Replace assignments first, then values, to avoid double-replacement
  // The order ensures: "result = result + 1" -> "$output.out = $output.out + 1"
  if (element.elementType === 'coordinate-modifier') {
    // For coordinate modifiers, p += ... means modify the coordinate
    // We need to: 1) initialize output from input, 2) then apply modifications
    // When p appears on the right side of = or +=, it refers to the input
    // When p appears on the left side, it refers to the output
    
    // First, handle p += (modify in place using old value)
    // p += expr becomes: $output.out = $input.in; $output.out += expr (with p in expr replaced by $input.in)
    mainCode = mainCode.replace(/\bp\s*\+=\s*/g, () => {
      // This will be replaced, but we need to handle p on the right side separately
      return '$output.out = $input.in; $output.out += ';
    });
    
    // Handle p = (assignment, p on right side refers to input)
    mainCode = mainCode.replace(/\bp\s*=\s*/g, '$output.out = ');
    
    // Replace remaining p (used as values in expressions) with $input.in
    // This handles p on the right side of assignments
    mainCode = mainCode.replace(/\bp\b/g, '$input.in');
    
    // Also handle result patterns
    mainCode = mainCode.replace(/\bresult\s*\+=\s*/g, '$output.out += ');
    mainCode = mainCode.replace(/\bresult\s*=\s*/g, '$output.out = ');
    mainCode = mainCode.replace(/\bresult\b/g, '$output.out');
  } else if (element.elementType === 'content-generator') {
    // Replace `p` with `$input.in` (for coordinate inputs)
    mainCode = mainCode.replace(/\bp\b/g, '$input.in');
    mainCode = mainCode.replace(/\bresult\s*\+=\s*/g, '$output.out += ');
    mainCode = mainCode.replace(/\bresult\s*=\s*/g, '$output.out = ');
    // Then replace remaining result (used as values in expressions)
    mainCode = mainCode.replace(/\bresult\b/g, '$output.out');
  } else if (element.elementType === 'post-processor') {
    // For post-processors, p typically refers to normalized screen space coordinates
    // Replace p with the same calculation used in base shader: (uv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0)
    // where uv = gl_FragCoord.xy / uResolution.xy
    mainCode = mainCode.replace(/\bp\b/g, '((gl_FragCoord.xy / $resolution.xy * 2.0 - 1.0) * vec2($resolution.x / $resolution.y, 1.0))');
    mainCode = mainCode.replace(/\bresult\s*\+=\s*/g, '$output.out += ');
    mainCode = mainCode.replace(/\bresult\s*=\s*/g, '$output.out = ');
    // Then replace remaining result (used as values in expressions)
    mainCode = mainCode.replace(/\bresult\b/g, '$output.out');
  }
  
  // Replace uniform references with parameter placeholders
  // Old uniforms like `uFbmScale` become `$param.fbmScale`
  for (const paramName of Object.keys(element.parameters)) {
    const uniformPattern = new RegExp(`u${paramName.charAt(0).toUpperCase() + paramName.slice(1)}`, 'g');
    mainCode = mainCode.replace(uniformPattern, `$param.${paramName}`);
    // Also handle lowercase uniform names
    const uniformPatternLower = new RegExp(`u${paramName}`, 'g');
    mainCode = mainCode.replace(uniformPatternLower, `$param.${paramName}`);
  }
  
  // Replace `uTime` with `$time` and `uResolution` with `$resolution`
  mainCode = mainCode.replace(/\buTime\b/g, '$time');
  mainCode = mainCode.replace(/\buResolution\b/g, '$resolution');
  
  // Convert functions: replace uniform references with parameter placeholders
  // This is similar to mainCode conversion, but functions are shared so we use placeholders
  let functions = element.functions;
  if (functions) {
    // Replace uniform references with parameter placeholders
    for (const paramName of Object.keys(element.parameters)) {
      const uniformPattern = new RegExp(`\\bu${paramName.charAt(0).toUpperCase() + paramName.slice(1)}\\b`, 'g');
      functions = functions.replace(uniformPattern, `$param.${paramName}`);
      // Also handle lowercase uniform names
      const uniformPatternLower = new RegExp(`\\bu${paramName}\\b`, 'g');
      functions = functions.replace(uniformPatternLower, `$param.${paramName}`);
    }
    
    // Replace `uTime` with `$time` and `uResolution` with `$resolution`
    functions = functions.replace(/\buTime\b/g, '$time');
    functions = functions.replace(/\buResolution\b/g, '$resolution');
  }
  
  return {
    id: element.id,
    category: nodeCategory,
    displayName: element.displayName,
    description: element.description,
    inputs,
    outputs,
    parameters,
    parameterGroups: element.parameterGroups,
    mainCode,
    functions: functions || undefined
  };
}

// Get node color by category (from UI/UX spec)
// Uses design tokens for consistency
export function getNodeColorByCategory(category: string): string {
  const tokenMap: Record<string, string> = {
    'Inputs': '--category-color-inputs',
    'Patterns': '--category-color-patterns',
    'Shapes': '--category-color-shapes',
    'Math': '--category-color-math',
    'Utilities': '--category-color-utilities',
    'Distort': '--category-color-distort',
    'Blend': '--category-color-blend',
    'Mask': '--category-color-mask',
    'Effects': '--category-color-effects',
    'Output': '--category-color-output'
  };
  
  const tokenName = tokenMap[category] || '--category-color-default';
  
  // Get the CSS variable value
  if (typeof document !== 'undefined') {
    const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
    if (value) {
      return value;
    }
  }
  
  // Fallback to hardcoded values if CSS variables aren't available (e.g., SSR)
  const fallbackColors: Record<string, string> = {
    'Inputs': '#E3F2FD',
    'Patterns': '#E8F5E9',
    'Shapes': '#FFF3E0',
    'Math': '#FFF9C4',
    'Utilities': '#E1F5FE',
    'Distort': '#F5F5F5',
    'Blend': '#F3E5F5',
    'Mask': '#FFF3E0',
    'Effects': '#FCE4EC',
    'Output': '#FFEBEE'
  };
  return fallbackColors[category] || '#F5F5F5';
}
