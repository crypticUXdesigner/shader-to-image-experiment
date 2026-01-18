import type { VisualElement } from '../../types';

export const chromaticAberrationElement: VisualElement = {
  id: 'chromatic-aberration',
  displayName: 'Chromatic Aberration',
  description: 'Separates RGB channels to create stylized color fringing effects',
  category: 'Post-Processing',
  elementType: 'post-processor',
  order: 95,
  
  uniforms: [
    'uniform float uChromaticStrength;',
    'uniform float uChromaticDirection;',
    'uniform float uChromaticCenterX;',
    'uniform float uChromaticCenterY;',
    'uniform float uChromaticFalloff;'
  ],
  
  functions: `
// Chromatic aberration effect (simplified - approximates RGB separation)
float applyChromaticAberration(float value, vec2 p, float strength) {
  vec2 center = vec2(uChromaticCenterX, uChromaticCenterY);
  vec2 dir = normalize(p - center);
  float dist = length(p - center);
  
  // Shift channels based on distance and direction
  // This is an approximation - full implementation needs texture sampling
  float rOffset = strength * dist * dir.x * 0.1;
  float bOffset = -strength * dist * dir.x * 0.1;
  
  // Approximate channel separation by modifying value
  float r = value + rOffset;
  float g = value;
  float b = value + bOffset;
  
  // Combine channels (weighted average)
  return (r * 0.3 + g * 0.4 + b * 0.3);
}
`,
  
  mainCode: `
  // Apply chromatic aberration before color mapping
  // Note: Full chromatic aberration requires texture sampling of RGB channels
  // This is a simplified approximation
  vec2 chromaticCenter = vec2(uChromaticCenterX, uChromaticCenterY);
  vec2 offset = p - chromaticCenter;
  float dist = length(offset);
  vec2 dir = dist > 0.001 ? normalize(offset) : vec2(1.0, 0.0);
  float falloff = 1.0 / max(1.0 + dist * uChromaticFalloff, 0.001);
  
  float rOffset = uChromaticStrength * dist * dir.x * 0.1 * falloff;
  float bOffset = -uChromaticStrength * dist * dir.x * 0.1 * falloff;
  
  // Approximate RGB separation
  result = result + (rOffset + bOffset) * 0.1;
`,
  
  parameters: {
    chromaticStrength: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength'
    },
    chromaticDirection: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0,
      label: 'Direction (degrees)'
    },
    chromaticCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    chromaticCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    chromaticFalloff: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Falloff'
    }
  },
  
  parameterGroups: [
    {
      id: 'chromatic-main',
      label: 'Chromatic Aberration',
      parameters: ['chromaticStrength', 'chromaticDirection'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'chromatic-center',
      label: 'Center',
      parameters: ['chromaticCenterX', 'chromaticCenterY', 'chromaticFalloff'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
