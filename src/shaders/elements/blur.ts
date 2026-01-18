import type { VisualElement } from '../../types';

export const blurElement: VisualElement = {
  id: 'blur',
  displayName: 'Blur',
  description: 'Applies blur effects (Gaussian, directional, radial) for depth and motion effects',
  category: 'Post-Processing',
  elementType: 'post-processor',
  order: 98,
  
  uniforms: [
    'uniform float uBlurAmount;',
    'uniform float uBlurRadius;',
    'uniform int uBlurType;',
    'uniform float uBlurDirection;',
    'uniform float uBlurCenterX;',
    'uniform float uBlurCenterY;'
  ],
  
  functions: `
// Simple softening effect (approximation since we can't sample neighbors easily)
float soften(float value, float amount) {
  // Simple smoothing approximation
  return value * (1.0 - amount) + 0.5 * amount;
}
`,
  
  mainCode: `
  // Apply blur (simplified - full blur requires texture sampling)
  result = soften(result, uBlurAmount);
`,
  
  parameters: {
    blurAmount: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Blur Amount'
    },
    blurRadius: {
      type: 'float',
      default: 5.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Radius (for future multi-pass)'
    },
    blurType: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Type (0=Gaussian, 1=Directional, 2=Radial)'
    },
    blurDirection: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Direction (degrees, for directional)'
    },
    blurCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X (for radial)'
    },
    blurCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y (for radial)'
    }
  },
  
  parameterGroups: [
    {
      id: 'blur-main',
      label: 'Blur',
      parameters: ['blurAmount', 'blurRadius', 'blurType'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'blur-directional',
      label: 'Directional',
      parameters: ['blurDirection'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'blur-radial',
      label: 'Radial',
      parameters: ['blurCenterX', 'blurCenterY'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
