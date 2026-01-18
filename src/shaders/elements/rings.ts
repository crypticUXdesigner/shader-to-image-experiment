import type { VisualElement } from '../../types';

export const ringsElement: VisualElement = {
  id: 'rings',
  displayName: 'Rings',
  description: 'Concentric rings or ripples pattern',
  category: 'Pattern',
  elementType: 'content-generator',
  order: 1,
  
  
  uniforms: [
    'uniform float uRingCenterX;',
    'uniform float uRingCenterY;',
    'uniform float uRingRadius;',
    'uniform float uRingFrequency;',
    'uniform float uRingAmplitude;',
    'uniform float uRingIntensity;',
    'uniform float uRingTimeOffset;'
  ],
  
  functions: `
float rings(vec2 p, vec2 center, float radius, float frequency) {
  float dist = length(p - center);
  // Use radius to offset the distance, creating rings centered at radius distance
  float adjustedDist = abs(dist - radius);
  float t = uTime + uRingTimeOffset;
  return sin(adjustedDist * frequency - t * 2.0) * 0.5 + 0.5;
}
`,
  
  mainCode: `
  vec2 ringCenter = vec2(uRingCenterX, uRingCenterY);
  result += rings(p, ringCenter, uRingRadius, uRingFrequency) * uRingAmplitude * uRingIntensity;
`,
  
  parameters: {
    ringCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    ringCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    ringRadius: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Radius'
    },
    ringFrequency: {
      type: 'float',
      default: 10.0,
      min: 1.0,
      max: 50.0,
      step: 0.5,
      label: 'Frequency'
    },
    ringAmplitude: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Amplitude'
    },
    ringIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    ringTimeOffset: {
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
      id: 'rings-main',
      label: 'Rings',
      parameters: ['ringCenterX', 'ringCenterY', 'ringRadius', 'ringFrequency', 'ringAmplitude', 'ringIntensity', 'ringTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};

