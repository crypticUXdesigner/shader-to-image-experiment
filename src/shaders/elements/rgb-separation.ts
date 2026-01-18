import type { VisualElement } from '../../types';

export const rgbSeparationElement: VisualElement = {
  id: 'rgb-separation',
  displayName: 'RGB Separation',
  description: 'Advanced RGB channel separation with independent X/Y offsets per channel for glitch effects',
  category: 'Glitch',
  elementType: 'post-processor',
  order: 97,
  
  uniforms: [
    'uniform float uRgbSeparationRX;',
    'uniform float uRgbSeparationRY;',
    'uniform float uRgbSeparationGX;',
    'uniform float uRgbSeparationGY;',
    'uniform float uRgbSeparationBX;',
    'uniform float uRgbSeparationBY;',
    'uniform float uRgbSeparationStrength;'
  ],
  
  functions: `
// RGB channel separation (approximated - full effect requires texture sampling)
// This modifies the result value based on position to simulate channel separation
float rgbSeparation(float value, vec2 p, vec2 rOffset, vec2 gOffset, vec2 bOffset, float strength) {
  // Approximate channel separation by modifying value based on position
  // In a full implementation, we would sample RGB channels separately
  float r = value + dot(p, rOffset) * strength * 0.1;
  float g = value + dot(p, gOffset) * strength * 0.1;
  float b = value + dot(p, bOffset) * strength * 0.1;
  
  // Combine channels (weighted average to simulate separation)
  return (r * 0.3 + g * 0.4 + b * 0.3);
}
`,
  
  mainCode: `
  vec2 rOffset = vec2(uRgbSeparationRX, uRgbSeparationRY);
  vec2 gOffset = vec2(uRgbSeparationGX, uRgbSeparationGY);
  vec2 bOffset = vec2(uRgbSeparationBX, uRgbSeparationBY);
  result = rgbSeparation(result, p, rOffset, gOffset, bOffset, uRgbSeparationStrength);
`,
  
  parameters: {
    rgbSeparationRX: {
      type: 'float',
      default: 0.1,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Red X Offset'
    },
    rgbSeparationRY: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Red Y Offset'
    },
    rgbSeparationGX: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Green X Offset'
    },
    rgbSeparationGY: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Green Y Offset'
    },
    rgbSeparationBX: {
      type: 'float',
      default: -0.1,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Blue X Offset'
    },
    rgbSeparationBY: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Blue Y Offset'
    },
    rgbSeparationStrength: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Strength'
    }
  },
  
  parameterGroups: [
    {
      id: 'rgb-separation-main',
      label: 'RGB Separation',
      parameters: ['rgbSeparationStrength'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'rgb-separation-red',
      label: 'Red Channel',
      parameters: ['rgbSeparationRX', 'rgbSeparationRY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'rgb-separation-green',
      label: 'Green Channel',
      parameters: ['rgbSeparationGX', 'rgbSeparationGY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'rgb-separation-blue',
      label: 'Blue Channel',
      parameters: ['rgbSeparationBX', 'rgbSeparationBY'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
