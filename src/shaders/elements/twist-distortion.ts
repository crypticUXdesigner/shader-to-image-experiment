import type { VisualElement } from '../../types';

export const twistDistortionElement: VisualElement = {
  id: 'twist-distortion',
  displayName: 'Twist',
  description: 'Applies rotational distortion around a center point, creating spiral/twist effects',
  category: 'Distortion',
  elementType: 'coordinate-modifier',
  order: 2,
  
  uniforms: [
    'uniform float uTwistCenterX;',
    'uniform float uTwistCenterY;',
    'uniform float uTwistStrength;',
    'uniform float uTwistRadius;',
    'uniform float uTwistFalloff;',
    'uniform float uTwistTimeSpeed;',
    'uniform float uTwistTimeOffset;'
  ],
  
  functions: `
vec2 twist(vec2 p, vec2 center, float strength, float radius, float falloff) {
  vec2 offset = p - center;
  float dist = length(offset);
  
  // Safety check for zero distance
  if (dist < 0.001) return p;
  
  float angle = atan(offset.y, offset.x);
  
  // Apply twist based on distance
  float twistAmount = strength * (1.0 - smoothstep(0.0, max(radius, 0.001), dist)) * falloff;
  angle += twistAmount;
  
  // Reconstruct position
  return center + vec2(cos(angle), sin(angle)) * dist;
}
`,
  
  mainCode: `
  float twistTime = (uTime + uTwistTimeOffset) * uTwistTimeSpeed;
  vec2 twistCenter = vec2(uTwistCenterX, uTwistCenterY);
  float dynamicStrength = uTwistStrength + sin(twistTime) * 0.1; // Optional: subtle animation
  p = twist(p, twistCenter, dynamicStrength, uTwistRadius, uTwistFalloff);
`,
  
  parameters: {
    twistCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    twistCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    twistStrength: {
      type: 'float',
      default: 2.0,
      min: -10.0,
      max: 10.0,
      step: 0.1,
      label: 'Strength'
    },
    twistRadius: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 5.0,
      step: 0.1,
      label: 'Radius'
    },
    twistFalloff: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Falloff'
    },
    twistTimeSpeed: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    twistTimeOffset: {
      type: 'float',
      default: 0.0,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Time Offset'
    }
  },
  
  parameterGroups: [
    {
      id: 'twist-main',
      label: 'Twist Distortion',
      parameters: ['twistCenterX', 'twistCenterY', 'twistStrength', 'twistRadius', 'twistFalloff'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'twist-animation',
      label: 'Animation',
      parameters: ['twistTimeSpeed', 'twistTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
