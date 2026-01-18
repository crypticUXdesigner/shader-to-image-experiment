import type { VisualElement } from '../../types';

export const glowBloomElement: VisualElement = {
  id: 'glow-bloom',
  displayName: 'Glow',
  description: 'Adds edge glow and bloom effects to enhance existing elements',
  category: 'Post-Processing',
  elementType: 'post-processor',
  order: 99,
  
  uniforms: [
    'uniform float uGlowThreshold;',
    'uniform float uGlowIntensity;',
    'uniform float uGlowRadius;',
    'uniform float uGlowStrength;'
  ],
  
  functions: `
// Simplified glow effect (distance-based approximation)
float glowEffect(float value, float threshold, float intensity) {
  float bright = max(0.0, value - threshold);
  return bright * intensity;
}
`,
  
  mainCode: `
  // Apply glow to result
  float glow = glowEffect(result, uGlowThreshold, uGlowIntensity);
  result += glow * uGlowStrength;
`,
  
  parameters: {
    glowThreshold: {
      type: 'float',
      default: 0.7,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Threshold'
    },
    glowIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Intensity'
    },
    glowRadius: {
      type: 'float',
      default: 5.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Radius (for future multi-pass)'
    },
    glowStrength: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Strength'
    }
  },
  
  parameterGroups: [
    {
      id: 'glow-main',
      label: 'Glow/Bloom',
      parameters: ['glowThreshold', 'glowIntensity', 'glowRadius', 'glowStrength'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
