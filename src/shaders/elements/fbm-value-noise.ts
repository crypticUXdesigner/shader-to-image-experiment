import type { VisualElement } from '../../types';

export const fbmValueNoiseElement: VisualElement = {
  id: 'fbm-value-noise',
  displayName: 'fBm Value Noise',
  description: 'Fractal Brownian motion using 3D value noise (reference implementation)',
  category: 'Background',
  elementType: 'content-generator',
  order: 0,
  
  uniforms: [
    'uniform float uFbmValueScale;',
    'uniform float uFbmValueOctaves;',
    'uniform float uFbmValueLacunarity;',
    'uniform float uFbmValueGain;',
    'uniform float uFbmValueTimeSpeed;',
    'uniform float uFbmValueTimeOffset;'
  ],
  
  functions: `
// 1-D hash function
float hash11(float n) {
    return fract(sin(n) * 43758.5453);
}

// 2-D hash function
vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

// 3-D value noise
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

// Standard fBm (matching reference implementation)
float fbm2_standard(vec2 uv, float t, float scale, int octaves, float lacunarity, float gain) {
    vec3 p = vec3(uv * scale, t);
    float amp = 1.0;
    float freq = 1.0;
    float sum = 0.0;

    for (int i = 0; i < 6; ++i) {  // Max 6 octaves
        if (i >= octaves) break;
        sum += amp * vnoise(p * freq);
        freq *= lacunarity;
        amp *= gain;
    }
    
    return sum * 0.5 + 0.5;   // [0,1]
}
`,
  
  mainCode: `
  // fBm value noise (matching reference implementation)
  // Calculate UV properly - normalize to [0,1] range then center for fBm
  // Reference uses: uv = (cellCoord / uResolution - 0.5) * vec2(aspectRatio, 1.0)
  // We use: uv = (gl_FragCoord.xy / uResolution.xy - 0.5) * vec2(aspectRatio, 1.0)
  // Note: uv is already available from base shader as gl_FragCoord.xy / uResolution.xy
  float aspectRatio = uResolution.x / uResolution.y;
  vec2 fbmUV = (uv - 0.5) * vec2(aspectRatio, 1.0);
  
  float fbmValueTime = (uTime + uFbmValueTimeOffset) * uFbmValueTimeSpeed;
  int octaves = int(uFbmValueOctaves);
  float feed = fbm2_standard(fbmUV, fbmValueTime, uFbmValueScale, octaves, uFbmValueLacunarity, uFbmValueGain);
  
  // Apply the noise (feed is in [0,1] range from fbm2_standard)
  // Scale by 0.5 to match reference behavior (reference applies volume scaling, compression, etc.)
  result += feed * 0.5;
`,
  
  parameters: {
    fbmValueScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.05,
      label: 'Scale'
    },
    fbmValueOctaves: {
      type: 'int',
      default: 6.0,
      min: 1.0,
      max: 6.0,
      step: 1.0,
      label: 'Octaves'
    },
    fbmValueLacunarity: {
      type: 'float',
      default: 1.35,
      min: 1.0,
      max: 4.0,
      step: 0.05,
      label: 'Lacunarity'
    },
    fbmValueGain: {
      type: 'float',
      default: 0.65,
      min: 0.1,
      max: 1.0,
      step: 0.05,
      label: 'Gain'
    },
    fbmValueTimeSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Time Speed'
    },
    fbmValueTimeOffset: {
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
      id: 'fbm-value-noise-main',
      label: 'fBm Value Noise',
      parameters: ['fbmValueScale', 'fbmValueOctaves', 'fbmValueLacunarity', 'fbmValueGain', 'fbmValueTimeSpeed', 'fbmValueTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
