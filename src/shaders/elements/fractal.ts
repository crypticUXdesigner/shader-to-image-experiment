import type { VisualElement } from '../../types';

export const fractalElement: VisualElement = {
  id: 'fractal',
  displayName: 'Fractal',
  description: 'Fractal iteration that deforms distance fields, creating complex geometric structures',
  category: 'Geometry',
  elementType: 'content-generator',
  order: 4,
  
  uniforms: [
    'uniform float uFractalIntensity;',
    'uniform float uFractalLayers;',
    'uniform int uFractalIterations;',
    'uniform float uFractalTimeOffset;'
  ],
  
  functions: `
float fractalDeform(vec2 p) {
  vec2 z = p;
  float scale = 1.0;
  float value = 0.0;
  
  for (int i = 0; i < 16; i++) {
    if (i >= uFractalIterations) break;
    
    // Rotate and scale
    float t = uTime + uFractalTimeOffset;
    float angle = t * 0.5 + float(i) * 0.1;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    z = rot * z;
    
    // Fractal formula
    z = abs(z);
    if (z.x < z.y) z.xy = z.yx;
    z = z * uFractalLayers - vec2(1.0);
    scale *= uFractalLayers;
    
    value += exp(-length(z) * scale);
  }
  
  return value * uFractalIntensity;
}
`,
  
  mainCode: `
  result += fractalDeform(p * 2.0) * 0.3;
`,
  
  parameters: {
    fractalIntensity: {
      type: 'float',
      default: 0.7,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: 'Intensity'
    },
    fractalLayers: {
      type: 'float',
      default: 2.0,
      min: 1.0,
      max: 4.0,
      step: 0.01,
      label: 'Scale (Higher = More Detail/Smaller Features)'
    },
    fractalIterations: {
      type: 'int',
      default: 8.0,
      min: 1.0,
      max: 16.0,
      step: 1.0,
      label: 'Iterations'
    },
    fractalTimeOffset: {
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
      id: 'fractal-main',
      label: 'Fractal',
      parameters: ['fractalIntensity', 'fractalLayers', 'fractalIterations', 'fractalTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};

