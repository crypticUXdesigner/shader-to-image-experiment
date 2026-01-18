import type { VisualElement } from '../../types';

export const polarCoordinatesElement: VisualElement = {
  id: 'polar-coordinates',
  displayName: 'Polar Coordinates',
  description: 'Converts Cartesian coordinates to polar coordinates, enabling radial/rotational effects',
  category: 'Transform',
  elementType: 'coordinate-modifier',
  order: 0,
  
  uniforms: [
    'uniform float uPolarCenterX;',
    'uniform float uPolarCenterY;',
    'uniform float uPolarScale;',
    'uniform float uPolarRadiusScale;',
    'uniform float uPolarRotation;',
    'uniform float uPolarEnabled;'
  ],
  
  functions: `
vec2 toPolar(vec2 p, vec2 center) {
  vec2 offset = p - center;
  float angle = atan(offset.y, offset.x);
  float radius = length(offset);
  return vec2(angle / 3.14159, radius); // Normalize angle to -1..1
}

vec2 fromPolar(vec2 polar, vec2 center) {
  float angle = polar.x * 3.14159;
  float radius = polar.y;
  return center + vec2(cos(angle), sin(angle)) * radius;
}
`,
  
  mainCode: `
  if (uPolarEnabled > 0.5) {
    vec2 polarCenter = vec2(uPolarCenterX, uPolarCenterY);
    vec2 polarP = toPolar(p, polarCenter);
    // Apply scale and rotation
    polarP.x *= uPolarScale;
    polarP.y *= uPolarRadiusScale;
    polarP.x += uPolarRotation;
    // Convert back to Cartesian
    p = fromPolar(polarP, polarCenter);
  }
`,
  
  parameters: {
    polarCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    polarCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    polarScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Angular Scale'
    },
    polarRadiusScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Radial Scale'
    },
    polarRotation: {
      type: 'float',
      default: 0.0,
      min: -6.28,
      max: 6.28,
      step: 0.01,
      label: 'Rotation'
    },
    polarEnabled: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 1.0,
      label: 'Enabled'
    }
  },
  
  parameterGroups: [
    {
      id: 'polar-main',
      label: 'Polar Coordinates',
      parameters: ['polarCenterX', 'polarCenterY', 'polarScale', 'polarRadiusScale', 'polarRotation', 'polarEnabled'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
