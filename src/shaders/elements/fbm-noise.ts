import type { VisualElement } from '../../types';

export const fbmNoiseElement: VisualElement = {
  id: 'fbm-noise',
  displayName: 'fBm Noise',
  description: 'Fractal Brownian motion noise pattern used as background texture',
  category: 'Background',
  elementType: 'content-generator',
  order: 0,
  
  uniforms: [
    'uniform float uFbmScale;',
    'uniform float uFbmOctaves;',
    'uniform float uFbmLacunarity;',
    'uniform float uFbmGain;',
    'uniform float uFbmTimeSpeed;',
    'uniform float uFbmIntensity;',
    'uniform float uFbmTimeOffset;'
  ],
  
  functions: `
// Hash function for noise
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p.xy, p.yx + 19.19);
  return fract(p.x * p.y);
}

// 2D noise with smooth time evolution
float noise(vec2 p, float time) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  // Create smooth time-varying offset using sin/cos to avoid discontinuities
  // This ensures the hash input changes smoothly without floor() jumps
  vec2 timeOffset = vec2(
    sin(time * 0.123) * 10.0 + time * 0.1,
    cos(time * 0.234) * 10.0 + time * 0.15
  );
  
  float a = hash(i + timeOffset);
  float b = hash(i + vec2(1.0, 0.0) + timeOffset);
  float c = hash(i + vec2(0.0, 1.0) + timeOffset);
  float d = hash(i + vec2(1.0, 1.0) + timeOffset);
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// fBm function with evolving noise
float fbm(vec2 p, float time) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uFbmOctaves) break;
    // Each octave evolves at a different rate for more complex evolution
    // Use slower time evolution per octave to reduce flicker
    float octaveTime = time * (0.5 + float(i) * 0.2);
    value += amplitude * noise(p * frequency, octaveTime);
    frequency *= uFbmLacunarity;
    amplitude *= uFbmGain;
  }
  
  return value;
}
`,
  
  mainCode: `
  // Evolve noise over time instead of panning
  float fbmTime = (uTime + uFbmTimeOffset) * uFbmTimeSpeed;
  result += fbm(p * uFbmScale, fbmTime) * uFbmIntensity;
`,
  
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
      max: 8.0,
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
      default: 0.5,
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
  ]
};

