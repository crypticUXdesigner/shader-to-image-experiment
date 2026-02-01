import type { NodeSpec } from '../../types';

export const fractalNodeSpec: NodeSpec = {
  id: 'fractal',
  category: 'Shapes',
  displayName: 'Fractal',
  description: 'Fractal iteration that deforms distance fields, creating complex geometric structures',
  icon: 'sparkles-2',
  inputs: [
    {
      name: 'in',
      type: 'vec2'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'float'
    }
  ],
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
    },
    fractalAnimationSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Speed'
    },
    fractalRotationSpeed: {
      type: 'float',
      default: 0.5,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'Rotation Speed'
    },
    fractalLayerPhase: {
      type: 'float',
      default: 0.1,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Layer Phase'
    }
  },
  parameterGroups: [
    {
      id: 'fractal-main',
      label: 'Fractal',
      parameters: ['fractalIntensity', 'fractalLayers', 'fractalIterations'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'fractal-animation',
      label: 'Animation',
      parameters: ['fractalAnimationSpeed', 'fractalRotationSpeed', 'fractalLayerPhase', 'fractalTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ],
  functions: `
float fractalDeform(vec2 p) {
  vec2 z = p;
  float scale = 1.0;
  float value = 0.0;
  
  for (int i = 0; i < 16; i++) {
    if (i >= $param.fractalIterations) break;
    
    // Rotate and scale (time scaled by speed, rotation and per-layer phase are controllable)
    float t = ($time + $param.fractalTimeOffset) * $param.fractalAnimationSpeed;
    float angle = t * $param.fractalRotationSpeed + float(i) * $param.fractalLayerPhase;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    z = rot * z;
    
    // Fractal formula
    z = abs(z);
    if (z.x < z.y) z.xy = z.yx;
    z = z * $param.fractalLayers - vec2(1.0);
    scale *= $param.fractalLayers;
    
    value += exp(-length(z) * scale);
  }
  
  return value * $param.fractalIntensity;
}
`,
  mainCode: `
  $output.out += fractalDeform($input.in * 2.0) * 0.3;
`
};
