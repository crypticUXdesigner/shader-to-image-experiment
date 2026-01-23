import type { NodeSpec } from '../../types';

/**
 * Masking/Control Nodes
 */

export const compareNodeSpec: NodeSpec = {
  id: 'compare',
  category: 'Mask',
  displayName: 'Compare',
  description: 'Compares two values and outputs 0.0 or 1.0',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {
    operation: {
      type: 'int',
      default: 0,
      min: 0,
      max: 5
    }
  },
  mainCode: `
    if ($param.operation == 0) {
      $output.out = ($input.a == $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 1) {
      $output.out = ($input.a != $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 2) {
      $output.out = ($input.a < $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 3) {
      $output.out = ($input.a <= $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 4) {
      $output.out = ($input.a > $input.b) ? 1.0 : 0.0;
    } else {
      $output.out = ($input.a >= $input.b) ? 1.0 : 0.0;
    }
  `
};

export const selectNodeSpec: NodeSpec = {
  id: 'select',
  category: 'Mask',
  displayName: 'Select',
  description: 'Selects between two values based on condition',
  inputs: [
    { name: 'condition', type: 'float' },
    { name: 'trueValue', type: 'float' },
    { name: 'falseValue', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = ($input.condition > 0.5) ? $input.trueValue : $input.falseValue;
  `
};

export const gradientMaskNodeSpec: NodeSpec = {
  id: 'gradient-mask',
  category: 'Mask',
  displayName: 'Gradient Mask',
  description: 'Creates gradient-based mask',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    direction: {
      type: 'int',
      default: 0,
      min: 0,
      max: 3
    },
    centerX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01
    },
    centerY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.01
    },
    softness: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    invert: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1
    }
  },
  mainCode: `
    vec4 color = $input.in;
    // Note: This requires fragCoord input - using p from base shader
    // p is available in the main shader context
    vec2 center = vec2($param.centerX, $param.centerY);
    
    // Use p from base shader (available in main shader context)
    // For post-processing nodes, we'd need to pass coordinates as input
    // Simplified version using center-relative coordinates
    vec2 coord = vec2(0.0, 0.0); // Placeholder - should use p or fragCoord
    
    float mask = 0.0;
    
    if ($param.direction == 0) {
      // Horizontal
      mask = smoothstep(-1.0, 1.0, coord.x - center.x);
    } else if ($param.direction == 1) {
      // Vertical
      mask = smoothstep(-1.0, 1.0, coord.y - center.y);
    } else if ($param.direction == 2) {
      // Radial
      float dist = length(coord - center);
      mask = 1.0 - smoothstep(0.0, 1.0 + $param.softness, dist);
    } else {
      // Diagonal
      vec2 dir = normalize(vec2(1.0, 1.0));
      float dist = dot(coord - center, dir);
      mask = smoothstep(-1.0, 1.0, dist);
    }
    
    if ($param.invert > 0) {
      mask = 1.0 - mask;
    }
    
    color.a *= mask;
    $output.out = color;
  `
};
