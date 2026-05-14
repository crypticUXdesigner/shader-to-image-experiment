import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Input: additive mix of three shaped periodic waves driven by time,
 * with global speed/offset and a final remap into [outMin, outMax] ⊂ [-1, 1].
 */

const waveShapeParam = {
  type: 'int' as const,
  default: 0,
  min: 0,
  max: 7,
  step: 1,
  label: 'Shape',
};

export const mixedWaveSignalNodeSpec: NodeSpec = {
  id: 'mixed-wave-signal',
  category: 'Inputs',
  displayName: 'Mixed Wave',
  description:
    'Three weighted periodic waves (shape per wave) plus global time scale; output remapped between min and max.',
  icon: 'wave-sine',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'float',
      label: 'Signal',
    },
  ],
  parameters: {
    globalSpeed: {
      type: 'float',
      default: 1.0,
      min: -30.0,
      max: 30.0,
      step: 0.01,
      label: 'Global speed',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    globalOffset: {
      type: 'float',
      default: 0.0,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Global offset',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w0Speed: {
      type: 'float',
      default: 1.0,
      min: -30.0,
      max: 30.0,
      step: 0.01,
      label: 'Speed',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w0Offset: {
      type: 'float',
      default: 0.0,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Phase',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w0Weight: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 4.0,
      step: 0.01,
      label: 'Weight',
      supportsAnimation: true,
    },
    w0Shape: { ...waveShapeParam },
    w1Speed: {
      type: 'float',
      default: 0.73,
      min: -30.0,
      max: 30.0,
      step: 0.01,
      label: 'Speed',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w1Offset: {
      type: 'float',
      default: 2.17,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Phase',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w1Weight: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 4.0,
      step: 0.01,
      label: 'Weight',
      supportsAnimation: true,
    },
    w1Shape: { ...waveShapeParam },
    w2Speed: {
      type: 'float',
      default: 1.31,
      min: -30.0,
      max: 30.0,
      step: 0.01,
      label: 'Speed',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w2Offset: {
      type: 'float',
      default: 4.03,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Phase',
      supportsAnimation: true,
      knobPolarity: 'two-sided',
    },
    w2Weight: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 4.0,
      step: 0.01,
      label: 'Weight',
      supportsAnimation: true,
    },
    w2Shape: { ...waveShapeParam },
    outMin: {
      type: 'float',
      default: -1.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Out min',
      supportsAnimation: true,
    },
    outMax: {
      type: 'float',
      default: 1.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Out max',
      supportsAnimation: true,
    },
  },
  parameterGroups: [
    {
      id: 'mws-global',
      label: 'Global',
      parameters: ['globalSpeed', 'globalOffset', 'outMin', 'outMax'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'mws-w0',
      label: 'Wave 1',
      parameters: ['w0Speed', 'w0Offset', 'w0Weight', 'w0Shape'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'mws-w1',
      label: 'Wave 2',
      parameters: ['w1Speed', 'w1Offset', 'w1Weight', 'w1Shape'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'mws-w2',
      label: 'Wave 3',
      parameters: ['w2Speed', 'w2Offset', 'w2Weight', 'w2Shape'],
      collapsible: true,
      defaultCollapsed: false,
    },
  ],
  parameterLayout: {
    minColumns: 4,
    elements: [
      {
        type: 'grid',
        label: 'Global',
        parameters: ['globalSpeed', 'globalOffset', 'outMin', 'outMax'],
        layout: { columns: 4 },
      },
      {
        type: 'grid',
        label: 'Wave 1',
        parameters: ['w0Speed', 'w0Offset', 'w0Weight', 'w0Shape'],
        parameterUI: { w0Shape: 'enum' },
        layout: { columns: 4 },
      },
      {
        type: 'grid',
        label: 'Wave 2',
        parameters: ['w1Speed', 'w1Offset', 'w1Weight', 'w1Shape'],
        parameterUI: { w1Shape: 'enum' },
        layout: { columns: 4 },
      },
      {
        type: 'grid',
        label: 'Wave 3',
        parameters: ['w2Speed', 'w2Offset', 'w2Weight', 'w2Shape'],
        parameterUI: { w2Shape: 'enum' },
        layout: { columns: 4 },
      },
    ],
  },
  functions: `
float mwsMixedWaveShape(float p, int shape) {
  float twoPi = 6.28318530718;
  float pi = 3.14159265359;
  if (shape == 0) return sin(p);
  if (shape == 1) return cos(p);
  if (shape == 2) return sign(sin(p));
  if (shape == 3) return asin(sin(p)) * (2.0 / pi);
  if (shape == 4) return 2.0 * fract(p / twoPi) - 1.0;
  if (shape == 5) return 1.0 - 2.0 * fract(p / twoPi);
  if (shape == 6) return 2.0 * abs(sin(p)) - 1.0;
  if (shape == 7) return smoothstep(-0.999, 0.999, sin(p)) * 2.0 - 1.0;
  return sin(p);
}
`,
  mainCode: `
    float tBase = $time * $param.globalSpeed + $param.globalOffset;
    float p0 = tBase * $param.w0Speed + $param.w0Offset;
    float p1 = tBase * $param.w1Speed + $param.w1Offset;
    float p2 = tBase * $param.w2Speed + $param.w2Offset;
    float s0 = mwsMixedWaveShape(p0, $param.w0Shape);
    float s1 = mwsMixedWaveShape(p1, $param.w1Shape);
    float s2 = mwsMixedWaveShape(p2, $param.w2Shape);
    float wsum = $param.w0Weight + $param.w1Weight + $param.w2Weight + 1e-6;
    float combined = ($param.w0Weight * s0 + $param.w1Weight * s1 + $param.w2Weight * s2) / wsum;
    float u = combined * 0.5 + 0.5;
    $output.out = $param.outMin + u * ($param.outMax - $param.outMin);
  `,
};
