import type { VisualElement } from '../../types';

export const simplexNoiseElement: VisualElement = {
  id: 'simplex-noise',
  displayName: 'Simplex Noise',
  description: 'Alternative noise algorithm producing smoother, more natural-looking patterns than fBm',
  category: 'Background',
  elementType: 'content-generator',
  order: 0,
  
  uniforms: [
    'uniform float uSimplexScale;',
    'uniform float uSimplexOctaves;',
    'uniform float uSimplexLacunarity;',
    'uniform float uSimplexGain;',
    'uniform float uSimplexTimeSpeed;',
    'uniform float uSimplexIntensity;',
    'uniform float uSimplexTimeOffset;'
  ],
  
  functions: `
// Hash function
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec3 hash3(vec3 v) {
  vec3 p = vec3(dot(v, vec3(127.1, 311.7, 74.7)),
                dot(v, vec3(269.5, 183.3, 246.1)),
                dot(v, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

// Simplified 2D Simplex noise
float simplexNoise(vec2 v, float time) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  
  i = mod(i, 289.0);
  vec3 p = hash3(vec3(i.x, i.y, time));
  p = mod(p, 289.0);
  
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// fBm with Simplex
float simplexFbm(vec2 p, float time) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uSimplexOctaves) break;
    float octaveTime = time * (0.5 + float(i) * 0.2);
    value += amplitude * simplexNoise(p * frequency + vec2(octaveTime * 0.1, octaveTime * 0.15), octaveTime);
    frequency *= uSimplexLacunarity;
    amplitude *= uSimplexGain;
  }
  
  return value;
}
`,
  
  mainCode: `
  float simplexTime = (uTime + uSimplexTimeOffset) * uSimplexTimeSpeed;
  float value = simplexFbm(p * uSimplexScale, simplexTime);
  result += value * uSimplexIntensity;
`,
  
  parameters: {
    simplexScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 20.0,
      step: 0.01,
      label: 'Scale'
    },
    simplexOctaves: {
      type: 'int',
      default: 4,
      min: 1,
      max: 8,
      step: 1,
      label: 'Octaves'
    },
    simplexLacunarity: {
      type: 'float',
      default: 2.0,
      min: 1.0,
      max: 4.0,
      step: 0.01,
      label: 'Lacunarity'
    },
    simplexGain: {
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 1.0,
      step: 0.01,
      label: 'Gain'
    },
    simplexTimeSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    simplexIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    simplexTimeOffset: {
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
      id: 'simplex-main',
      label: 'Simplex Noise',
      parameters: ['simplexScale', 'simplexOctaves', 'simplexLacunarity', 'simplexGain', 'simplexIntensity'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'simplex-animation',
      label: 'Animation',
      parameters: ['simplexTimeSpeed', 'simplexTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
