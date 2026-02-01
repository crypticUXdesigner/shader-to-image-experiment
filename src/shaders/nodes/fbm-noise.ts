import type { NodeSpec } from '../../types';

export const fbmNoiseNodeSpec: NodeSpec = {
  id: 'fbm-noise',
  category: 'Patterns',
  displayName: 'fBm Noise',
  description: 'Fractal Brownian motion using 3D value noise. Time is the third dimension for smooth animation. Output in [0,1].',
  icon: 'noise',
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
    fbmScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Scale'
    },
    fbmOctaves: {
      type: 'float',
      default: 4.0,
      min: 1.0,
      max: 10.0,
      step: 1.0,
      label: 'Octaves'
    },
    fbmLacunarity: {
      type: 'float',
      default: 2.0,
      min: 1.0,
      max: 4.0,
      step: 0.01,
      label: 'Lacunarity'
    },
    fbmGain: {
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 1.0,
      step: 0.01,
      label: 'Gain'
    },
    fbmTimeSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    fbmIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    fbmTimeOffset: {
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
      id: 'fbm-noise-main',
      label: 'fBm Noise',
      parameters: ['fbmScale', 'fbmOctaves', 'fbmLacunarity', 'fbmGain', 'fbmTimeSpeed', 'fbmIntensity', 'fbmTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ],
  functions: `
// 1-D hash function (reference)
float hash11(float n) {
  return fract(sin(n) * 43758.5453);
}

// 3-D value noise (reference: smootherstep, output [-1,1])
float vnoise(vec3 p) {
  vec3 ip = floor(p);
  vec3 fp = fract(p);

  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));

  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);   // smootherstep

  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);

  float y0  = mix(x00, x10, w.y);
  float y1  = mix(x01, x11, w.y);

  return mix(y0, y1, w.z) * 2.0 - 1.0;         // [-1,1]
}

// Standard fBm (reference: amp=1, freq=1, output [0,1])
float fbm2_standard(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
  vec3 p = vec3(uv * scale, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 0.0;

  for (int i = 0; i < 10; ++i) {
    if (i >= octaves) break;
    sum += amp * vnoise(p * freq);
    freq *= lacunarity;
    amp *= gain;
  }

  return sum * 0.5 + 0.5;   // [0,1]
}
`,
  mainCode: `
  // Aspect-corrected UV (match reference)
  float aspectRatio = $resolution.x / $resolution.y;
  vec2 fbmUV = ($input.in - 0.5) * vec2(aspectRatio, 1.0);

  float fbmTime = ($time + $param.fbmTimeOffset) * $param.fbmTimeSpeed;
  int octaves = int($param.fbmOctaves);
  float feed = fbm2_standard(fbmUV, fbmTime, $param.fbmScale, octaves, $param.fbmLacunarity, $param.fbmGain);

  $output.out += feed * $param.fbmIntensity;
`
};
