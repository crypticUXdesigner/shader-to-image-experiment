import type { VisualElement } from '../../types';

export const vectorFieldElement: VisualElement = {
  id: 'vector-field',
  displayName: 'Vector Field',
  description: 'Vector field that distorts UV coordinates, creating warping effects',
  category: 'Distortion',
  elementType: 'coordinate-modifier',
  order: 2,
  
  uniforms: [
    'uniform float uVfFrequencyX;',
    'uniform float uVfFrequencyY;',
    'uniform float uVfFrequencyZ;',
    'uniform float uVfAmplitude;',
    'uniform float uVfAmplitudeX;',
    'uniform float uVfAmplitudeY;',
    'uniform float uVfAmplitudeZ;',
    'uniform float uVfRadialStrength;',
    'uniform float uVfRadialCenterX;',
    'uniform float uVfRadialCenterY;',
    'uniform float uVfHarmonicAmplitude;',
    'uniform float uVfTimeOffset;'
  ],
  
  functions: `
vec2 vectorField(vec2 p) {
  float t = uTime + uVfTimeOffset;
  vec2 distortion = vec2(0.0);
  
  // Base frequencies with per-axis amplitude
  distortion.x += sin(p.x * uVfFrequencyX + t) * uVfAmplitude * uVfAmplitudeX;
  distortion.y += sin(p.y * uVfFrequencyY + t) * uVfAmplitude * uVfAmplitudeY;
  
  // Rotation component with per-axis amplitude
  float angle = p.x * uVfFrequencyZ + t;
  distortion += vec2(cos(angle), sin(angle)) * uVfAmplitude * uVfAmplitudeZ * 0.5;
  
  // Radial variation (with offsettable center)
  vec2 radialCenter = vec2(uVfRadialCenterX, uVfRadialCenterY);
  float radial = length(p - radialCenter) * uVfRadialStrength;
  distortion *= (1.0 + sin(radial) * 0.5);
  
  // Harmonic layer
  distortion += vec2(
    sin(p.x * uVfFrequencyX * 2.0 + t * 1.5),
    sin(p.y * uVfFrequencyY * 2.0 + t * 1.5)
  ) * uVfHarmonicAmplitude;
  
  return distortion;
}
`,
  
  mainCode: `
  p += vectorField(p) * 0.1;
`,
  
  parameters: {
    vfFrequencyX: {
      type: 'float',
      default: 4.0,
      min: 0.0,
      max: 50.0,
      step: 0.01,
      label: 'Frequency X'
    },
    vfFrequencyY: {
      type: 'float',
      default: 2.0,
      min: 0.0,
      max: 50.0,
      step: 0.01,
      label: 'Frequency Y'
    },
    vfFrequencyZ: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 50.0,
      step: 0.01,
      label: 'Frequency Z (Rotation)'
    },
    vfAmplitude: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 10.0,
      step: 0.01,
      label: 'Amplitude (Global)'
    },
    vfAmplitudeX: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Amplitude X'
    },
    vfAmplitudeY: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Amplitude Y'
    },
    vfAmplitudeZ: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Amplitude Z (Rotation)'
    },
    vfRadialStrength: {
      type: 'float',
      default: 5.0,
      min: 0.0,
      max: 20.0,
      step: 0.01,
      label: 'Radial Strength'
    },
    vfRadialCenterX: {
      type: 'float',
      default: 0.0,
      min: -5.0,
      max: 5.0,
      step: 0.1,
      label: 'Radial Center X'
    },
    vfRadialCenterY: {
      type: 'float',
      default: 0.0,
      min: -5.0,
      max: 5.0,
      step: 0.1,
      label: 'Radial Center Y'
    },
    vfHarmonicAmplitude: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 3.0,
      step: 0.01,
      label: 'Harmonic Amplitude'
    },
    vfTimeOffset: {
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
      id: 'vector-field-main',
      label: 'Vector Field',
      parameters: ['vfFrequencyX', 'vfFrequencyY', 'vfFrequencyZ', 'vfAmplitude', 'vfAmplitudeX', 'vfAmplitudeY', 'vfAmplitudeZ', 'vfRadialStrength', 'vfRadialCenterX', 'vfRadialCenterY', 'vfHarmonicAmplitude', 'vfTimeOffset'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};

