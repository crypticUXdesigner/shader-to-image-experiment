import type { VisualElement } from '../../types';

export const planeGridElement: VisualElement = {
  id: 'plane-grid',
  displayName: 'Plane/Grid',
  description: 'Creates infinite plane or grid patterns for structured geometric backgrounds',
  category: 'Geometry',
  elementType: 'content-generator',
  order: 0,
  
  uniforms: [
    'uniform int uPlaneType;',
    'uniform float uPlaneScale;',
    'uniform float uPlaneSpacing;',
    'uniform float uPlaneIntensity;',
    'uniform float uPlaneRotation;',
    'uniform float uPlaneNormalX;',
    'uniform float uPlaneNormalY;',
    'uniform float uPlaneNormalZ;',
    'uniform float uPlaneHeight;'
  ],
  
  functions: `
// Infinite plane SDF
float sdPlane(vec3 p, vec3 n, float h) {
  float nLen = length(n);
  vec3 nNorm = nLen > 0.001 ? normalize(n) : vec3(0.0, 1.0, 0.0);
  return dot(p, nNorm) + h;
}

// Grid pattern
float gridPattern(vec2 p, float spacing) {
  vec2 cell = floor(p / spacing);
  vec2 local = mod(p, spacing) / spacing;
  
  // Grid lines
  float grid = 0.0;
  float lineWidth = 0.02;
  
  // Vertical lines
  if (local.x < lineWidth || local.x > 1.0 - lineWidth) {
    grid = 1.0;
  }
  // Horizontal lines
  if (local.y < lineWidth || local.y > 1.0 - lineWidth) {
    grid = 1.0;
  }
  
  return grid;
}

// Checkerboard pattern
float checkerboard(vec2 p, float size) {
  vec2 c = floor(p / size);
  return mod(c.x + c.y, 2.0);
}

// Rotate point
vec2 rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}
`,
  
  mainCode: `
  // Option 1: 2D grid pattern
  if (uPlaneType == 1) {
    vec2 rotatedP = rotate(p, uPlaneRotation * 3.14159 / 180.0);
    float pattern = gridPattern(rotatedP * uPlaneScale, uPlaneSpacing);
    result += pattern * uPlaneIntensity;
  }
  // Option 2: Checkerboard
  else if (uPlaneType == 2) {
    vec2 rotatedP = rotate(p, uPlaneRotation * 3.14159 / 180.0);
    float pattern = checkerboard(rotatedP * uPlaneScale, uPlaneSpacing);
    result += pattern * uPlaneIntensity;
  }
  // Option 3: Raymarched plane (simplified - uses 2D projection)
  else if (uPlaneType == 0) {
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(p, -1.0));
    vec3 planeNormal = normalize(vec3(uPlaneNormalX, uPlaneNormalY, uPlaneNormalZ));
    float t = -sdPlane(ro, planeNormal, uPlaneHeight) / dot(rd, planeNormal);
    if (t > 0.0) {
      vec3 hitPoint = ro + rd * t;
      float pattern = gridPattern(hitPoint.xy, uPlaneSpacing);
      result += pattern * uPlaneIntensity;
    }
  }
`,
  
  parameters: {
    planeType: {
      type: 'int',
      default: 1,
      min: 0,
      max: 2,
      step: 1,
      label: 'Type (0=Raymarched, 1=Grid, 2=Checkerboard)'
    },
    planeScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      label: 'Scale'
    },
    planeSpacing: {
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.01,
      label: 'Spacing'
    },
    planeIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    planeRotation: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Rotation (degrees)'
    },
    planeNormalX: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Normal X (Raymarched)'
    },
    planeNormalY: {
      type: 'float',
      default: 1.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Normal Y (Raymarched)'
    },
    planeNormalZ: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Normal Z (Raymarched)'
    },
    planeHeight: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Height (Raymarched)'
    }
  },
  
  parameterGroups: [
    {
      id: 'plane-main',
      label: 'Plane/Grid',
      parameters: ['planeType', 'planeScale', 'planeSpacing', 'planeIntensity', 'planeRotation'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'plane-raymarched',
      label: 'Raymarched (Type 0)',
      parameters: ['planeNormalX', 'planeNormalY', 'planeNormalZ', 'planeHeight'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
