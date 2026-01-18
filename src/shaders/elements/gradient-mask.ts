import type { VisualElement } from '../../types';

export const gradientMaskElement: VisualElement = {
  id: 'gradient-mask',
  displayName: 'Gradient Mask',
  description: 'Applies gradient masks to selectively apply or blend effects in specific regions',
  category: 'Masking',
  elementType: 'post-processor',
  order: 50,
  
  uniforms: [
    'uniform int uMaskType;',
    'uniform float uMaskCenterX;',
    'uniform float uMaskCenterY;',
    'uniform float uMaskRadius;',
    'uniform float uMaskFalloff;',
    'uniform float uMaskWidth;',
    'uniform float uMaskDirection;',
    'uniform float uMaskSizeX;',
    'uniform float uMaskSizeY;',
    'uniform float uMaskRotation;',
    'uniform float uMaskStrength;',
    'uniform float uMaskInvert;'
  ],
  
  functions: `
// Radial gradient mask
float radialMask(vec2 p, vec2 center, float radius, float falloff) {
  float dist = length(p - center);
  return smoothstep(radius + falloff, radius - falloff, dist);
}

// Linear gradient mask
float linearMask(vec2 p, vec2 center, vec2 direction, float width) {
  vec2 offset = p - center;
  float dirLen = length(direction);
  vec2 dirNorm = dirLen > 0.001 ? normalize(direction) : vec2(1.0, 0.0);
  float dist = dot(offset, dirNorm);
  return smoothstep(-width, width, dist);
}

// Rotate point
vec2 rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

// Elliptical mask
float ellipticalMask(vec2 p, vec2 center, vec2 size, float rotation) {
  vec2 offset = p - center;
  vec2 rotated = rotate(offset, rotation);
  float dist = length(rotated / size);
  return 1.0 - smoothstep(0.8, 1.2, dist);
}
`,
  
  mainCode: `
  // Calculate mask value
  float mask = 0.0;
  vec2 maskCenter = vec2(uMaskCenterX, uMaskCenterY);
  
  if (uMaskType == 0) {
    // Radial
    mask = radialMask(p, maskCenter, uMaskRadius, uMaskFalloff);
  } else if (uMaskType == 1) {
    // Linear
    vec2 dir = vec2(cos(uMaskDirection * 3.14159 / 180.0), sin(uMaskDirection * 3.14159 / 180.0));
    mask = linearMask(p, maskCenter, dir, uMaskWidth);
  } else if (uMaskType == 2) {
    // Elliptical
    mask = ellipticalMask(p, maskCenter, vec2(uMaskSizeX, uMaskSizeY), uMaskRotation * 3.14159 / 180.0);
  }
  
  // Invert if needed
  if (uMaskInvert > 0.5) {
    mask = 1.0 - mask;
  }
  
  // Apply mask to result
  // mask: 1.0 = full result, 0.0 = reduced result
  // maskStrength: how much to reduce when mask is 0
  result = result * (1.0 - uMaskStrength * (1.0 - mask));
`,
  
  parameters: {
    maskType: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Mask Type (0=Radial, 1=Linear, 2=Elliptical)'
    },
    maskCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    maskCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    maskRadius: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Radius (Radial)'
    },
    maskFalloff: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.1,
      label: 'Falloff (Radial)'
    },
    maskWidth: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Width (Linear)'
    },
    maskDirection: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Direction (Linear, degrees)'
    },
    maskSizeX: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Size X (Elliptical)'
    },
    maskSizeY: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Size Y (Elliptical)'
    },
    maskRotation: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Rotation (Elliptical, degrees)'
    },
    maskStrength: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength'
    },
    maskInvert: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 1.0,
      label: 'Invert'
    }
  },
  
  parameterGroups: [
    {
      id: 'mask-main',
      label: 'Gradient Mask',
      parameters: ['maskType', 'maskStrength', 'maskInvert'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'mask-position',
      label: 'Position',
      parameters: ['maskCenterX', 'maskCenterY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'mask-radial',
      label: 'Radial',
      parameters: ['maskRadius', 'maskFalloff'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'mask-linear',
      label: 'Linear',
      parameters: ['maskWidth', 'maskDirection'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'mask-elliptical',
      label: 'Elliptical',
      parameters: ['maskSizeX', 'maskSizeY', 'maskRotation'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
