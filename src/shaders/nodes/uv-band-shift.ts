import type { NodeSpec } from '../../types/nodeSpec';

/** Max bands along the secondary axis (partition resolution). */
const UV_BAND_SHIFT_MAX = 64;

export const uvBandShiftNodeSpec: NodeSpec = {
  id: 'uv-band-shift',
  category: 'Distort',
  displayName: 'Band Shift',
  icon: 'square-split-vertical',
  description:
    'Orientation picks primary vs secondary UV axes: primary drives shear offset; secondary drives band thickness (variable partition, min/max, spread), with strip widths randomly permuted along the secondary axis after normalization. Incoming UV space.',
  inputs: [{ name: 'in', type: 'vec2', label: 'UV' }],
  outputs: [{ name: 'out', type: 'vec2', label: 'UV' }],
  parameters: {
    uvBandShiftOrientation: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Orientation',
    },
    uvBandShiftSeed: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01,
      label: 'Seed',
      knobPolarity: 'two-sided',
    },
    uvBandShiftBandCount: {
      type: 'float',
      default: 20.0,
      min: 1.0,
      max: 64.0,
      step: 1.0,
      label: 'Bands',
    },
    uvBandShiftPriOffMin: {
      type: 'float',
      default: -0.04,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'Off min',
      knobPolarity: 'two-sided',
    },
    uvBandShiftPriOffMax: {
      type: 'float',
      default: 0.04,
      min: -0.5,
      max: 0.5,
      step: 0.001,
      label: 'Off max',
      knobPolarity: 'two-sided',
    },
    uvBandShiftPriSpread: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Off spr',
    },
    uvBandShiftSecSizeMin: {
      type: 'float',
      default: 0.5,
      min: 0.05,
      max: 4.0,
      step: 0.01,
      label: 'Thk min',
    },
    uvBandShiftSecSizeMax: {
      type: 'float',
      default: 1.5,
      min: 0.05,
      max: 4.0,
      step: 0.01,
      label: 'Thk max',
    },
    uvBandShiftSecSpread: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Thk spr',
    },
  },
  parameterGroups: [
    {
      id: 'uv-band-shift-core',
      label: 'Bands',
      parameters: ['uvBandShiftOrientation', 'uvBandShiftSeed', 'uvBandShiftBandCount'],
      collapsible: false,
      defaultCollapsed: false,
    },
    {
      id: 'uv-band-shift-primary',
      label: 'Primary',
      parameters: ['uvBandShiftPriOffMin', 'uvBandShiftPriOffMax', 'uvBandShiftPriSpread'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'uv-band-shift-secondary',
      label: 'Secondary',
      parameters: ['uvBandShiftSecSizeMin', 'uvBandShiftSecSizeMax', 'uvBandShiftSecSpread'],
      collapsible: true,
      defaultCollapsed: false,
    },
  ],
  parameterLayout: {
    minColumns: 3,
    elements: [
      {
        type: 'grid',
        parameters: ['uvBandShiftOrientation', 'uvBandShiftSeed', 'uvBandShiftBandCount'],
        parameterUI: { uvBandShiftOrientation: 'enum' },
        layout: { columns: 3, parameterSpan: { uvBandShiftOrientation: 3 } },
      },
      {
        type: 'grid',
        label: 'Primary',
        parameters: ['uvBandShiftPriOffMin', 'uvBandShiftPriOffMax', 'uvBandShiftPriSpread'],
        layout: { columns: 3 },
      },
      {
        type: 'grid',
        label: 'Secondary',
        parameters: ['uvBandShiftSecSizeMin', 'uvBandShiftSecSizeMax', 'uvBandShiftSecSpread'],
        layout: { columns: 3 },
      },
    ],
  },
  functions: `
float uvBandShiftHash11(float i, float seed) {
  vec3 p3 = fract(vec3(i, seed, i + seed) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

// UV Coords outputs aspect-corrected p (y in [-1,1]); true 0-1 UV stays in [0,1].
float uvBandShiftNormPartitionY(float y) {
  return (y < 0.0) ? (y * 0.5 + 0.5) : clamp(y, 0.0, 1.0);
}
float uvBandShiftNormPartitionX(float x, float aspect) {
  if (x < 0.0 || x > 1.0001) {
    return clamp(x / (2.0 * max(aspect, 1e-6)) + 0.5, 0.0, 1.0);
  }
  return clamp(x, 0.0, 1.0);
}

vec2 uvBandShiftApplyHorizontal(vec2 uv, int nIn, float seed,
    float priMin, float priMax, float priSpread,
    float secMin, float secMax, float secSpread) {
  int n = nIn;
  if (n < 1) n = 1;
  if (n > ${UV_BAND_SHIFT_MAX}) n = ${UV_BAND_SHIFT_MAX};
  float sh[${UV_BAND_SHIFT_MAX}];
  float sum = 0.0;
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    float fi = float(i);
    float r = mix(secMin, secMax, uvBandShiftHash11(fi, seed));
    float r0 = mix(secMin, secMax, uvBandShiftHash11(fi - 1.0, seed));
    float r1 = r;
    float r2 = mix(secMin, secMax, uvBandShiftHash11(fi + 1.0, seed));
    float blended = mix(r1, (r0 + 2.0 * r1 + r2) * 0.25, secSpread);
    sh[i] = max(blended, 1e-5);
    sum += sh[i];
  }
  float invSum = 1.0 / max(sum, 1e-6);
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    sh[i] *= invSum;
  }
  // Randomize which thickness lands in which spatial strip (Fisher–Yates), so the
  // secondary axis is not left-to-right in generation index order.
  for (int k = 0; k < ${UV_BAND_SHIFT_MAX}; k++) {
    int i = n - 1 - k;
    if (i < 1) break;
    float jf = floor(uvBandShiftHash11(float(i), seed + 213.45) * float(i + 1));
    int ji = int(min(max(jf, 0.0), float(i)));
    float tmp = sh[i];
    sh[i] = sh[ji];
    sh[ji] = tmp;
  }
  float y = uvBandShiftNormPartitionY(uv.y);
  int bi = n - 1;
  float acc = 0.0;
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    if (y < acc + sh[i]) {
      bi = i;
      break;
    }
    acc += sh[i];
  }
  float fbi = float(bi);
  float o0 = mix(priMin, priMax, uvBandShiftHash11(fbi - 1.0, seed + 31.17));
  float o1 = mix(priMin, priMax, uvBandShiftHash11(fbi, seed + 31.17));
  float o2 = mix(priMin, priMax, uvBandShiftHash11(fbi + 1.0, seed + 31.17));
  float ox = mix(o1, (o0 + 2.0 * o1 + o2) * 0.25, priSpread);
  return uv + vec2(ox, 0.0);
}

vec2 uvBandShiftApplyVertical(vec2 uv, float aspect, int nIn, float seed,
    float priMin, float priMax, float priSpread,
    float secMin, float secMax, float secSpread) {
  int n = nIn;
  if (n < 1) n = 1;
  if (n > ${UV_BAND_SHIFT_MAX}) n = ${UV_BAND_SHIFT_MAX};
  float sh[${UV_BAND_SHIFT_MAX}];
  float sum = 0.0;
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    float fi = float(i);
    float r = mix(secMin, secMax, uvBandShiftHash11(fi + 101.0, seed));
    float r0 = mix(secMin, secMax, uvBandShiftHash11(fi - 1.0 + 101.0, seed));
    float r1 = r;
    float r2 = mix(secMin, secMax, uvBandShiftHash11(fi + 1.0 + 101.0, seed));
    float blended = mix(r1, (r0 + 2.0 * r1 + r2) * 0.25, secSpread);
    sh[i] = max(blended, 1e-5);
    sum += sh[i];
  }
  float invSum = 1.0 / max(sum, 1e-6);
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    sh[i] *= invSum;
  }
  for (int k = 0; k < ${UV_BAND_SHIFT_MAX}; k++) {
    int i = n - 1 - k;
    if (i < 1) break;
    float jf = floor(uvBandShiftHash11(float(i), seed + 419.77) * float(i + 1));
    int ji = int(min(max(jf, 0.0), float(i)));
    float tmp = sh[i];
    sh[i] = sh[ji];
    sh[ji] = tmp;
  }
  float x = uvBandShiftNormPartitionX(uv.x, aspect);
  int bi = n - 1;
  float acc = 0.0;
  for (int i = 0; i < ${UV_BAND_SHIFT_MAX}; i++) {
    if (i >= n) break;
    if (x < acc + sh[i]) {
      bi = i;
      break;
    }
    acc += sh[i];
  }
  float fbi = float(bi);
  float o0 = mix(priMin, priMax, uvBandShiftHash11(fbi - 1.0, seed + 67.91));
  float o1 = mix(priMin, priMax, uvBandShiftHash11(fbi, seed + 67.91));
  float o2 = mix(priMin, priMax, uvBandShiftHash11(fbi + 1.0, seed + 67.91));
  float oy = mix(o1, (o0 + 2.0 * o1 + o2) * 0.25, priSpread);
  return uv + vec2(0.0, oy);
}
`,
  mainCode: `
  int n = int(clamp(floor($param.uvBandShiftBandCount + 0.5), 1.0, float(${UV_BAND_SHIFT_MAX})));
  vec2 outUv = $input.in;
  float uvBandShiftAspect = $resolution.x / max($resolution.y, 1.0);
  if ($param.uvBandShiftOrientation == 0) {
    outUv = uvBandShiftApplyHorizontal($input.in, n, $param.uvBandShiftSeed,
      $param.uvBandShiftPriOffMin, $param.uvBandShiftPriOffMax, clamp($param.uvBandShiftPriSpread, 0.0, 1.0),
      $param.uvBandShiftSecSizeMin, $param.uvBandShiftSecSizeMax, clamp($param.uvBandShiftSecSpread, 0.0, 1.0));
  } else {
    outUv = uvBandShiftApplyVertical($input.in, uvBandShiftAspect, n, $param.uvBandShiftSeed,
      $param.uvBandShiftPriOffMin, $param.uvBandShiftPriOffMax, clamp($param.uvBandShiftPriSpread, 0.0, 1.0),
      $param.uvBandShiftSecSizeMin, $param.uvBandShiftSecSizeMax, clamp($param.uvBandShiftSecSpread, 0.0, 1.0));
  }
  $output.out = outUv;
`,
};
