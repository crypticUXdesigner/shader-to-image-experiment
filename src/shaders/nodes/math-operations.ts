import type { NodeSpec } from '../../types';

/**
 * Math/Operation Nodes
 * These nodes perform mathematical operations on values
 */

// Basic arithmetic
export const addNodeSpec: NodeSpec = {
  id: 'add',
  category: 'Math',
  displayName: 'Add',
  description: 'Adds two values together',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = $input.a + $input.b;
  `
};

export const subtractNodeSpec: NodeSpec = {
  id: 'subtract',
  category: 'Math',
  displayName: 'Subtract',
  description: 'Subtracts second value from first',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = $input.a - $input.b;
  `
};

export const multiplyNodeSpec: NodeSpec = {
  id: 'multiply',
  category: 'Math',
  displayName: 'Multiply',
  description: 'Multiplies two values',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = $input.a * $input.b;
  `
};

export const divideNodeSpec: NodeSpec = {
  id: 'divide',
  category: 'Math',
  displayName: 'Divide',
  description: 'Divides first value by second',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = $input.a / $input.b;
  `
};

export const powerNodeSpec: NodeSpec = {
  id: 'power',
  category: 'Math',
  displayName: 'Power',
  description: 'Raises first value to the power of second',
  inputs: [
    { name: 'base', type: 'float' },
    { name: 'exponent', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = pow($input.base, $input.exponent);
  `
};

export const squareRootNodeSpec: NodeSpec = {
  id: 'square-root',
  category: 'Math',
  displayName: 'Square Root',
  description: 'Square root of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = sqrt($input.in);
  `
};

export const absoluteNodeSpec: NodeSpec = {
  id: 'absolute',
  category: 'Math',
  displayName: 'Absolute',
  description: 'Absolute value of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = abs($input.in);
  `
};

export const floorNodeSpec: NodeSpec = {
  id: 'floor',
  category: 'Math',
  displayName: 'Floor',
  description: 'Floor (round down) of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = floor($input.in);
  `
};

export const ceilNodeSpec: NodeSpec = {
  id: 'ceil',
  category: 'Math',
  displayName: 'Ceil',
  description: 'Ceiling (round up) of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = ceil($input.in);
  `
};

export const fractNodeSpec: NodeSpec = {
  id: 'fract',
  category: 'Math',
  displayName: 'Fract',
  description: 'Fractional part of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = fract($input.in);
  `
};

export const moduloNodeSpec: NodeSpec = {
  id: 'modulo',
  category: 'Math',
  displayName: 'Modulo',
  description: 'Modulo (remainder) operation',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = mod($input.a, $input.b);
  `
};

export const minNodeSpec: NodeSpec = {
  id: 'min',
  category: 'Math',
  displayName: 'Min',
  description: 'Minimum of two values',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = min($input.a, $input.b);
  `
};

export const maxNodeSpec: NodeSpec = {
  id: 'max',
  category: 'Math',
  displayName: 'Max',
  description: 'Maximum of two values',
  inputs: [
    { name: 'a', type: 'float' },
    { name: 'b', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = max($input.a, $input.b);
  `
};

export const clampNodeSpec: NodeSpec = {
  id: 'clamp',
  category: 'Math',
  displayName: 'Clamp',
  description: 'Clamps value between min and max',
  inputs: [
    { name: 'in', type: 'float' },
    { name: 'min', type: 'float' },
    { name: 'max', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = clamp($input.in, $input.min, $input.max);
  `
};

export const mixNodeSpec: NodeSpec = {
  id: 'mix',
  category: 'Math',
  displayName: 'Mix',
  description: 'Linear interpolation between two values',
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

export const stepNodeSpec: NodeSpec = {
  id: 'step',
  category: 'Math',
  displayName: 'Step',
  description: 'Step function (0.0 if x < edge, 1.0 otherwise)',
  inputs: [
    { name: 'edge', type: 'float' },
    { name: 'x', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = step($input.edge, $input.x);
  `
};

export const smoothstepNodeSpec: NodeSpec = {
  id: 'smoothstep',
  category: 'Math',
  displayName: 'Smoothstep',
  description: 'Smooth Hermite interpolation between edge0 and edge1',
  inputs: [
    { name: 'edge0', type: 'float' },
    { name: 'edge1', type: 'float' },
    { name: 'x', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = smoothstep($input.edge0, $input.edge1, $input.x);
  `
};

// Trigonometric functions
export const sineNodeSpec: NodeSpec = {
  id: 'sine',
  category: 'Math',
  displayName: 'Sine',
  description: 'Sine function',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = sin($input.in);
  `
};

export const cosineNodeSpec: NodeSpec = {
  id: 'cosine',
  category: 'Math',
  displayName: 'Cosine',
  description: 'Cosine function',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = cos($input.in);
  `
};

export const tangentNodeSpec: NodeSpec = {
  id: 'tangent',
  category: 'Math',
  displayName: 'Tangent',
  description: 'Tangent function',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = tan($input.in);
  `
};

export const arcSineNodeSpec: NodeSpec = {
  id: 'arc-sine',
  category: 'Math',
  displayName: 'Arc Sine',
  description: 'Arc sine (inverse sine)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = asin($input.in);
  `
};

export const arcCosineNodeSpec: NodeSpec = {
  id: 'arc-cosine',
  category: 'Math',
  displayName: 'Arc Cosine',
  description: 'Arc cosine (inverse cosine)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = acos($input.in);
  `
};

export const arcTangentNodeSpec: NodeSpec = {
  id: 'arc-tangent',
  category: 'Math',
  displayName: 'Arc Tangent',
  description: 'Arc tangent (inverse tangent)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = atan($input.in);
  `
};

export const arcTangent2NodeSpec: NodeSpec = {
  id: 'arc-tangent-2',
  category: 'Math',
  displayName: 'Arc Tangent 2',
  description: 'Arc tangent of y/x (handles all quadrants)',
  inputs: [
    { name: 'y', type: 'float' },
    { name: 'x', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = atan($input.y, $input.x);
  `
};

// Exponential and logarithmic
export const exponentialNodeSpec: NodeSpec = {
  id: 'exponential',
  category: 'Math',
  displayName: 'Exponential',
  description: 'e raised to the power of input',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = exp($input.in);
  `
};

export const naturalLogarithmNodeSpec: NodeSpec = {
  id: 'natural-logarithm',
  category: 'Math',
  displayName: 'Natural Logarithm',
  description: 'Natural logarithm (base e)',
  inputs: [
    { name: 'in', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = log($input.in);
  `
};

// Vector operations
export const lengthNodeSpec: NodeSpec = {
  id: 'length',
  category: 'Math',
  displayName: 'Length',
  description: 'Length (magnitude) of vector',
  inputs: [
    { name: 'in', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = length($input.in);
  `
};

export const distanceNodeSpec: NodeSpec = {
  id: 'distance',
  category: 'Math',
  displayName: 'Distance',
  description: 'Distance between two points',
  inputs: [
    { name: 'a', type: 'vec2' },
    { name: 'b', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = distance($input.a, $input.b);
  `
};

export const dotProductNodeSpec: NodeSpec = {
  id: 'dot-product',
  category: 'Math',
  displayName: 'Dot Product',
  description: 'Dot product of two vectors',
  inputs: [
    { name: 'a', type: 'vec2' },
    { name: 'b', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {},
  mainCode: `
    $output.out = dot($input.a, $input.b);
  `
};

export const crossProductNodeSpec: NodeSpec = {
  id: 'cross-product',
  category: 'Math',
  displayName: 'Cross Product',
  description: 'Cross product of two 3D vectors',
  inputs: [
    { name: 'a', type: 'vec3' },
    { name: 'b', type: 'vec3' }
  ],
  outputs: [
    { name: 'out', type: 'vec3' }
  ],
  parameters: {},
  mainCode: `
    $output.out = cross($input.a, $input.b);
  `
};

export const normalizeNodeSpec: NodeSpec = {
  id: 'normalize',
  category: 'Math',
  displayName: 'Normalize',
  description: 'Normalizes vector to unit length',
  inputs: [
    { name: 'in', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'vec2' }
  ],
  parameters: {},
  mainCode: `
    $output.out = normalize($input.in);
  `
};

export const reflectNodeSpec: NodeSpec = {
  id: 'reflect',
  category: 'Math',
  displayName: 'Reflect',
  description: 'Reflects vector off surface with normal',
  inputs: [
    { name: 'I', type: 'vec2' },
    { name: 'N', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'vec2' }
  ],
  parameters: {},
  mainCode: `
    $output.out = reflect($input.I, $input.N);
  `
};

export const refractNodeSpec: NodeSpec = {
  id: 'refract',
  category: 'Math',
  displayName: 'Refract',
  description: 'Refracts vector through surface',
  inputs: [
    { name: 'I', type: 'vec2' },
    { name: 'N', type: 'vec2' },
    { name: 'eta', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'vec2' }
  ],
  parameters: {},
  mainCode: `
    $output.out = refract($input.I, $input.N, $input.eta);
  `
};
