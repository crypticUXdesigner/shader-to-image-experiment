import type { VisualElement } from '../../types';

export const bayerDitherElement: VisualElement = {
  id: 'bayer-dither',
  displayName: 'Bayer Dithering',
  description: '8x8 Bayer matrix dithering for threshold-based color mapping',
  category: 'Effect',
  order: 10,
  
  uniforms: [
    // Uniforms are declared in base shader - this element just provides parameter values
  ],
  
  functions: `
// Bayer dithering functions are provided by base shader
// This element just provides the uniforms
`,
  
  mainCode: `
  // Bayer dithering is applied during color mapping (in base shader)
  // This element just provides the uniforms and functions
  // No modification to result needed here
`,
  
  parameters: {
    pixelSize: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.5,
      label: 'Pixel Size'
    },
    ditherStrength: {
      type: 'float',
      default: 3.0,
      min: 0.0,
      max: 10.0,
      step: 0.1,
      label: 'Dither Strength'
    }
  },
  
  parameterGroups: [
    {
      id: 'bayer-dither-main',
      label: 'Bayer Dithering',
      parameters: ['pixelSize', 'ditherStrength'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
