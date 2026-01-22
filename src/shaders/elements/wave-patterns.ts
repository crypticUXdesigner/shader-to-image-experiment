import type { VisualElement } from '../../types';

export const wavePatternsElement: VisualElement = {
  id: 'wave-patterns',
  displayName: 'Wave Patterns',
  description: 'Linear wave patterns (sine, cosine, square, triangle) that complement rings',
  category: 'Pattern',
  elementType: 'content-generator',
  order: 1,
  
  uniforms: [
    'uniform float uWaveScale;',
    'uniform float uWaveFrequency;',
    'uniform float uWaveAmplitude;',
    'uniform int uWaveType;',
    'uniform float uWaveDirection;',
    'uniform float uWavePhaseSpeed;',
    'uniform float uWavePhaseOffset;',
    'uniform float uWaveTimeSpeed;',
    'uniform float uWaveIntensity;',
    'uniform float uWaveTimeOffset;'
  ],
  
  functions: `
float wavePattern(vec2 p, float frequency, float amplitude, float phase, int waveType) {
  float value = 0.0;
  
  if (waveType == 0) {
    // Sine wave
    value = sin(p.x * frequency + phase) * amplitude;
  } else if (waveType == 1) {
    // Cosine wave
    value = cos(p.x * frequency + phase) * amplitude;
  } else if (waveType == 2) {
    // Square wave
    value = sign(sin(p.x * frequency + phase)) * amplitude;
  } else if (waveType == 3) {
    // Triangle wave
    value = abs(mod(p.x * frequency + phase, 2.0) - 1.0) * amplitude * 2.0 - amplitude;
  }
  
  return value * 0.5 + 0.5; // Normalize to 0-1
}

// Rotate point
vec2 rotate(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}
`,
  
  mainCode: `
  float waveTime = (uTime + uWaveTimeOffset) * uWaveTimeSpeed;
  float wavePhase = waveTime * uWavePhaseSpeed + uWavePhaseOffset;
  
  // Rotate coordinates based on direction
  vec2 waveRotatedP = rotate(p, uWaveDirection * 3.14159 / 180.0);
  
  float waveVal = wavePattern(
    waveRotatedP * uWaveScale,
    uWaveFrequency,
    uWaveAmplitude,
    wavePhase,
    uWaveType
  );
  result += waveVal * uWaveIntensity;
`,
  
  parameters: {
    waveScale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Scale'
    },
    waveFrequency: {
      type: 'float',
      default: 5.0,
      min: 0.1,
      max: 50.0,
      step: 0.1,
      label: 'Frequency'
    },
    waveAmplitude: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Amplitude'
    },
    waveType: {
      type: 'int',
      default: 0,
      min: 0,
      max: 3,
      step: 1,
      label: 'Wave Type (0=Sine, 1=Cosine, 2=Square, 3=Triangle)'
    },
    waveDirection: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Direction (degrees)'
    },
    wavePhaseSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 10.0,
      step: 0.01,
      label: 'Phase Speed'
    },
    wavePhaseOffset: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 6.28,
      step: 0.05,
      label: 'Phase Offset'
    },
    waveTimeSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    waveIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    waveTimeOffset: {
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
      id: 'wave-main',
      label: 'Wave Pattern',
      parameters: ['waveScale', 'waveFrequency', 'waveAmplitude', 'waveType', 'waveDirection', 'waveIntensity'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'wave-animation',
      label: 'Animation',
      parameters: ['wavePhaseSpeed', 'wavePhaseOffset', 'waveTimeSpeed', 'waveTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
