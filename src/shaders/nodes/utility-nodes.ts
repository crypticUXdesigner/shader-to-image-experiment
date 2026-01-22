import type { NodeSpec } from '../../types';

/**
 * Utility Nodes
 */

export const oneMinusNodeSpec: NodeSpec = {
  id: 'one-minus',
  category: 'Operation',
  displayName: 'One Minus',
  description: 'Subtracts input from 1.0 (invert for 0-1 range)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = 1.0 - $input.in;
  `
};

export const negateNodeSpec: NodeSpec = {
  id: 'negate',
  category: 'Operation',
  displayName: 'Negate',
  description: 'Negates input value',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = -$input.in;
  `
};

export const reciprocalNodeSpec: NodeSpec = {
  id: 'reciprocal',
  category: 'Operation',
  displayName: 'Reciprocal',
  description: 'Reciprocal (1.0 / input)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = 1.0 / $input.in;
  `
};

export const remapNodeSpec: NodeSpec = {
  id: 'remap',
  category: 'Operation',
  displayName: 'Remap',
  description: 'Remaps value from one range to another',
  inputs: [
    { name: 'in', type: 'float' },
    { name: 'inMin', type: 'float' },
    { name: 'inMax', type: 'float' },
    { name: 'outMin', type: 'float' },
    { name: 'outMax', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    float t = ($input.in - $input.inMin) / ($input.inMax - $input.inMin);
    $output.out = mix($input.outMin, $input.outMax, t);
  `
};

export const clamp01NodeSpec: NodeSpec = {
  id: 'clamp-01',
  category: 'Operation',
  displayName: 'Clamp 01',
  description: 'Clamps value to 0.0-1.0 range',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = clamp($input.in, 0.0, 1.0);
  `
};

export const saturateNodeSpec: NodeSpec = {
  id: 'saturate',
  category: 'Operation',
  displayName: 'Saturate',
  description: 'Same as Clamp 01 (common shader term)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = clamp($input.in, 0.0, 1.0);
  `
};

export const signNodeSpec: NodeSpec = {
  id: 'sign',
  category: 'Operation',
  displayName: 'Sign',
  description: 'Returns sign of value (-1.0, 0.0, or 1.0)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = sign($input.in);
  `
};

export const roundNodeSpec: NodeSpec = {
  id: 'round',
  category: 'Operation',
  displayName: 'Round',
  description: 'Rounds to nearest integer',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = round($input.in);
  `
};

export const truncateNodeSpec: NodeSpec = {
  id: 'truncate',
  category: 'Operation',
  displayName: 'Truncate',
  description: 'Truncates (removes fractional part)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = trunc($input.in);
  `
};

export const lerpNodeSpec: NodeSpec = {
  id: 'lerp',
  category: 'Operation',
  displayName: 'Lerp',
  description: 'Linear interpolation (alias for Mix)',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' },
    { name: 't', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = mix($input.a, $input.b, $input.t);
  `
};

export const swizzleNodeSpec: NodeSpec = {
  id: 'swizzle',
  category: 'Operation',
  displayName: 'Swizzle',
  description: 'Reorders/swizzles vector components (supports common patterns)',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    swizzle: {
      type: 'string',
      default: 'xyzw'
    }
  },
  mainCode: `
    // Swizzle pattern - supports common 2, 3, and 4 component patterns
    // Output is vec4, compiler will handle type promotion/demotion
    // Common patterns: "xy", "yx", "xyz", "zyx", "xyzw", "wzyx", "rgba", "abgr"
    // This uses conditional logic for common patterns - full implementation would parse the string
    // For now, output vec4 and let compiler handle type conversion
    vec4 v = $input.in;
    if ($param.swizzle == "xy") {
      $output.out = vec4(v.xy, 0.0, 1.0);
    } else if ($param.swizzle == "yx") {
      $output.out = vec4(v.yx, 0.0, 1.0);
    } else if ($param.swizzle == "xyz") {
      $output.out = vec4(v.xyz, 1.0);
    } else if ($param.swizzle == "zyx") {
      $output.out = vec4(v.zyx, 1.0);
    } else if ($param.swizzle == "xyzw") {
      $output.out = v.xyzw;
    } else if ($param.swizzle == "wzyx") {
      $output.out = v.wzyx;
    } else {
      // Default: pass through
      $output.out = v;
    }
  `
};

export const splitVectorNodeSpec: NodeSpec = {
  id: 'split-vector',
  category: 'Operation',
  displayName: 'Split Vector',
  description: 'Splits vector into components',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'x', type: 'float' },
    { name: 'y', type: 'float' },
    { name: 'z', type: 'float' },
    { name: 'w', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.x = $input.in.x;
    $output.y = $input.in.y;
    $output.z = $input.in.z;
    $output.w = $input.in.w;
  `
};

export const combineVectorNodeSpec: NodeSpec = {
  id: 'combine-vector',
  category: 'Operation',
  displayName: 'Combine Vector',
  description: 'Combines floats into vector',
  inputs: [
    { name: 'x', type: 'float' },
    { name: 'y', type: 'float' },
    { name: 'z', type: 'float' },
    { name: 'w', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    outputType: {
      type: 'int',
      default: 2,
      min: 2,
      max: 4
    }
  },
  mainCode: `
    // Output type is vec4, compiler will handle promotion/demotion based on connections
    if ($param.outputType == 2) {
      $output.out = vec4($input.x, $input.y, 0.0, 1.0);
    } else if ($param.outputType == 3) {
      $output.out = vec4($input.x, $input.y, $input.z, 1.0);
    } else {
      $output.out = vec4($input.x, $input.y, $input.z, $input.w);
    }
  `
};
