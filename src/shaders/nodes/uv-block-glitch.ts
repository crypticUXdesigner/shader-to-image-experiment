import type { NodeSpec } from '../../types/nodeSpec';

const UV_BLOCK_GLITCH_MAX = 16;

export const uvBlockGlitchNodeSpec: NodeSpec = {
  id: 'uv-block-glitch',
  category: 'Distort',
  displayName: 'Block Glitch',
  icon: 'selection-background',
  description:
    'Overlapping UV rectangles with randomized centers, half-width, aspect, and per-block offset (min/max + variation). Last matching block wins. Incoming UV space.',
  inputs: [{ name: 'in', type: 'vec2', label: 'UV' }],
  outputs: [{ name: 'out', type: 'vec2', label: 'UV' }],
  parameters: {
    uvBlockGlitchSeed: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01,
      label: 'Seed',
      knobPolarity: 'two-sided',
    },
    uvBlockGlitchBlocks: {
      type: 'float',
      default: 6.0,
      min: 1.0,
      max: 16.0,
      step: 1.0,
      label: 'Blocks',
    },
    uvBlockGlitchVariation: {
      type: 'float',
      default: 0.85,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Vary',
    },
    uvBlockGlitchSeedStepHz: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 60.0,
      step: 0.1,
      label: 'Step Hz',
    },
    uvBlockGlitchCenterXMin: {
      type: 'float',
      default: 0.15,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'CX min',
    },
    uvBlockGlitchCenterXMax: {
      type: 'float',
      default: 0.85,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'CX max',
    },
    uvBlockGlitchCenterYMin: {
      type: 'float',
      default: 0.15,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'CY min',
    },
    uvBlockGlitchCenterYMax: {
      type: 'float',
      default: 0.85,
      min: -2.0,
      max: 2.0,
      step: 0.01,
      label: 'CY max',
    },
    uvBlockGlitchHalfWMin: {
      type: 'float',
      default: 0.02,
      min: 0.001,
      max: 0.45,
      step: 0.001,
      label: 'W min',
    },
    uvBlockGlitchHalfWMax: {
      type: 'float',
      default: 0.12,
      min: 0.001,
      max: 0.45,
      step: 0.001,
      label: 'W max',
    },
    uvBlockGlitchAspectMin: {
      type: 'float',
      default: 0.4,
      min: 0.05,
      max: 8.0,
      step: 0.01,
      label: 'Asp min',
    },
    uvBlockGlitchAspectMax: {
      type: 'float',
      default: 2.5,
      min: 0.05,
      max: 8.0,
      step: 0.01,
      label: 'Asp max',
    },
    uvBlockGlitchOffXMin: {
      type: 'float',
      default: -0.06,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'dX min',
      knobPolarity: 'two-sided',
    },
    uvBlockGlitchOffXMax: {
      type: 'float',
      default: 0.06,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'dX max',
      knobPolarity: 'two-sided',
    },
    uvBlockGlitchOffYMin: {
      type: 'float',
      default: -0.06,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'dY min',
      knobPolarity: 'two-sided',
    },
    uvBlockGlitchOffYMax: {
      type: 'float',
      default: 0.06,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'dY max',
      knobPolarity: 'two-sided',
    },
  },
  parameterGroups: [
    {
      id: 'uv-block-glitch-main',
      label: 'Glitch',
      parameters: [
        'uvBlockGlitchSeed',
        'uvBlockGlitchBlocks',
        'uvBlockGlitchVariation',
        'uvBlockGlitchSeedStepHz',
      ],
      collapsible: false,
      defaultCollapsed: false,
    },
    {
      id: 'uv-block-glitch-center',
      label: 'Center',
      parameters: [
        'uvBlockGlitchCenterXMin',
        'uvBlockGlitchCenterXMax',
        'uvBlockGlitchCenterYMin',
        'uvBlockGlitchCenterYMax',
      ],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'uv-block-glitch-size',
      label: 'Size',
      parameters: ['uvBlockGlitchHalfWMin', 'uvBlockGlitchHalfWMax', 'uvBlockGlitchAspectMin', 'uvBlockGlitchAspectMax'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'uv-block-glitch-offset',
      label: 'Offset',
      parameters: ['uvBlockGlitchOffXMin', 'uvBlockGlitchOffXMax', 'uvBlockGlitchOffYMin', 'uvBlockGlitchOffYMax'],
      collapsible: true,
      defaultCollapsed: false,
    },
  ],
  parameterLayout: {
    minColumns: 4,
    elements: [
      {
        type: 'grid',
        parameters: [
          'uvBlockGlitchSeed',
          'uvBlockGlitchBlocks',
          'uvBlockGlitchVariation',
          'uvBlockGlitchSeedStepHz',
        ],
        layout: { columns: 4 },
      },
      {
        type: 'grid',
        label: 'Center',
        parameters: [
          'uvBlockGlitchCenterXMin',
          'uvBlockGlitchCenterXMax',
          'uvBlockGlitchCenterYMin',
          'uvBlockGlitchCenterYMax',
        ],
        layout: { columns: 2 },
      },
      {
        type: 'grid',
        label: 'Size',
        parameters: ['uvBlockGlitchHalfWMin', 'uvBlockGlitchHalfWMax', 'uvBlockGlitchAspectMin', 'uvBlockGlitchAspectMax'],
        layout: { columns: 2 },
      },
      {
        type: 'grid',
        label: 'Offset',
        parameters: ['uvBlockGlitchOffXMin', 'uvBlockGlitchOffXMax', 'uvBlockGlitchOffYMin', 'uvBlockGlitchOffYMax'],
        layout: { columns: 2 },
      },
    ],
  },
  functions: `
float uvBlockGlitchHash11(float t, float seed) {
  vec3 p3 = fract(vec3(t * 0.371 + seed, t + seed * 0.913, t * 0.017 + seed) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

float uvBlockGlitchPick(float a, float b, float t, float seed, float vari) {
  float mid = 0.5 * (a + b);
  float u = uvBlockGlitchHash11(t, seed);
  float v = mix(a, b, u);
  return mix(mid, v, clamp(vari, 0.0, 1.0));
}
`,
  mainCode: `
  int nb = int(clamp(floor($param.uvBlockGlitchBlocks + 0.5), 1.0, float(${UV_BLOCK_GLITCH_MAX})));
  float vari = clamp($param.uvBlockGlitchVariation, 0.0, 1.0);
  float stepHz = max($param.uvBlockGlitchSeedStepHz, 0.0);
  float seedTick = floor($time * stepHz);
  float seed = $param.uvBlockGlitchSeed + seedTick;
  vec2 uv = $input.in;
  vec2 outUv = uv;
  for (int i = 0; i < ${UV_BLOCK_GLITCH_MAX}; i++) {
    if (i >= nb) break;
    float fi = float(i);
    float cx = uvBlockGlitchPick($param.uvBlockGlitchCenterXMin, $param.uvBlockGlitchCenterXMax, fi + 0.11, seed, vari);
    float cy = uvBlockGlitchPick($param.uvBlockGlitchCenterYMin, $param.uvBlockGlitchCenterYMax, fi + 0.27, seed, vari);
    float hw = uvBlockGlitchPick($param.uvBlockGlitchHalfWMin, $param.uvBlockGlitchHalfWMax, fi + 0.43, seed, vari);
    float asp = uvBlockGlitchPick($param.uvBlockGlitchAspectMin, $param.uvBlockGlitchAspectMax, fi + 0.59, seed, vari);
    float hh = hw / max(asp, 0.05);
    float ox = uvBlockGlitchPick($param.uvBlockGlitchOffXMin, $param.uvBlockGlitchOffXMax, fi + 0.71, seed, vari);
    float oy = uvBlockGlitchPick($param.uvBlockGlitchOffYMin, $param.uvBlockGlitchOffYMax, fi + 0.83, seed, vari);
    if (abs(uv.x - cx) < hw && abs(uv.y - cy) < hh) {
      outUv = uv + vec2(ox, oy);
    }
  }
  $output.out = outUv;
`,
};
