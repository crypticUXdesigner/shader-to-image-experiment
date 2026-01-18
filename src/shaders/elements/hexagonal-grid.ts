import type { VisualElement } from '../../types';

export const hexagonalGridElement: VisualElement = {
  id: 'hexagonal-grid',
  displayName: 'Hexagonal Grid',
  description: 'Creates hexagonal tiling patterns for structured, geometric backgrounds',
  category: 'Pattern',
  elementType: 'content-generator',
  order: 1,
  
  uniforms: [
    'uniform float uHexScale;',
    'uniform float uHexSize;',
    'uniform float uHexRotation;',
    'uniform float uHexIntensity;'
  ],
  
  functions: `
// Hexagonal grid coordinate calculation
vec2 hexGrid(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508); // Hex spacing (sqrt(3))
  const vec2 h = vec2(0.5, 0.8660254); // Hex center offset
  
  vec2 a = mod(p, s) - h * s;
  vec2 b = mod(p + h * s, s) - h * s;
  
  vec2 gv = length(a) < length(b) ? a : b;
  vec2 id = length(a) < length(b) ? floor(p / s) : floor((p + h * s) / s);
  
  return vec2(length(gv), id.x + id.y * 1000.0);
}

// Create hexagonal pattern
float hexPattern(vec2 hexCoord, float size) {
  float dist = hexCoord.x;
  // Create hexagon cells - distance from center
  float hex = smoothstep(size * 0.4, size * 0.5, dist);
  return hex;
}

// Rotate point
vec2 rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}
`,
  
  mainCode: `
  // Rotate coordinates
  vec2 rotatedP = rotate(p, uHexRotation * 3.14159 / 180.0);
  
  vec2 hex = hexGrid(rotatedP * uHexScale);
  float value = hexPattern(hex, uHexSize);
  result += value * uHexIntensity;
`,
  
  parameters: {
    hexScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      label: 'Scale'
    },
    hexSize: {
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.01,
      label: 'Cell Size'
    },
    hexRotation: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Rotation (degrees)'
    },
    hexIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    }
  },
  
  parameterGroups: [
    {
      id: 'hex-main',
      label: 'Hexagonal Grid',
      parameters: ['hexScale', 'hexSize', 'hexRotation', 'hexIntensity'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
