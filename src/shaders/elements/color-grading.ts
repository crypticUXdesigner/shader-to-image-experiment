import type { VisualElement } from '../../types';

export const colorGradingElement: VisualElement = {
  id: 'color-grading',
  displayName: 'Color Grading',
  description: 'Provides fine control over color curves (shadows, midtones, highlights) for final color adjustment',
  category: 'Post-Processing',
  elementType: 'post-processor',
  order: 94,
  
  uniforms: [
    'uniform float uColorShadowsR;',
    'uniform float uColorShadowsG;',
    'uniform float uColorShadowsB;',
    'uniform float uColorMidtonesR;',
    'uniform float uColorMidtonesG;',
    'uniform float uColorMidtonesB;',
    'uniform float uColorHighlightsR;',
    'uniform float uColorHighlightsG;',
    'uniform float uColorHighlightsB;',
    'uniform float uLevelsInMin;',
    'uniform float uLevelsInMax;',
    'uniform float uLevelsOutMin;',
    'uniform float uLevelsOutMax;',
    'uniform float uLevelsGamma;'
  ],
  
  functions: `
// Color curve adjustment (simplified - works on value before color mapping)
float applyColorCurve(float value, float shadows, float midtones, float highlights) {
  float luminance = value;
  
  float adjustedValue = value;
  
  // Shadows (dark areas)
  float shadowMask = 1.0 - smoothstep(0.0, 0.33, luminance);
  adjustedValue = mix(adjustedValue, adjustedValue * shadows, shadowMask);
  
  // Midtones
  float midtoneMask = smoothstep(0.0, 0.33, luminance) * (1.0 - smoothstep(0.33, 0.66, luminance));
  adjustedValue = mix(adjustedValue, adjustedValue * midtones, midtoneMask);
  
  // Highlights (bright areas)
  float highlightMask = smoothstep(0.33, 1.0, luminance);
  adjustedValue = mix(adjustedValue, adjustedValue * highlights, highlightMask);
  
  return adjustedValue;
}

// Levels adjustment
float applyLevels(float value, float inMin, float inMax, float outMin, float outMax, float gamma) {
  value = clamp((value - inMin) / (inMax - inMin), 0.0, 1.0);
  value = pow(value, 1.0 / gamma);
  value = value * (outMax - outMin) + outMin;
  return value;
}
`,
  
  mainCode: `
  // Apply color grading before color mapping
  // Note: Full color grading works on RGB channels after color mapping
  // This is a simplified version that works on the value
  
  // Calculate average multipliers
  float shadows = (uColorShadowsR + uColorShadowsG + uColorShadowsB) / 3.0;
  float midtones = (uColorMidtonesR + uColorMidtonesG + uColorMidtonesB) / 3.0;
  float highlights = (uColorHighlightsR + uColorHighlightsG + uColorHighlightsB) / 3.0;
  
  result = applyColorCurve(result, shadows, midtones, highlights);
  result = applyLevels(result, uLevelsInMin, uLevelsInMax, uLevelsOutMin, uLevelsOutMax, uLevelsGamma);
`,
  
  parameters: {
    colorShadowsR: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Shadows R'
    },
    colorShadowsG: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Shadows G'
    },
    colorShadowsB: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Shadows B'
    },
    colorMidtonesR: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Midtones R'
    },
    colorMidtonesG: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Midtones G'
    },
    colorMidtonesB: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Midtones B'
    },
    colorHighlightsR: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Highlights R'
    },
    colorHighlightsG: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Highlights G'
    },
    colorHighlightsB: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Highlights B'
    },
    levelsInMin: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Input Black Point'
    },
    levelsInMax: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Input White Point'
    },
    levelsOutMin: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Output Black Point'
    },
    levelsOutMax: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Output White Point'
    },
    levelsGamma: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 5.0,
      step: 0.01,
      label: 'Gamma'
    }
  },
  
  parameterGroups: [
    {
      id: 'color-shadows',
      label: 'Shadows',
      parameters: ['colorShadowsR', 'colorShadowsG', 'colorShadowsB'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'color-midtones',
      label: 'Midtones',
      parameters: ['colorMidtonesR', 'colorMidtonesG', 'colorMidtonesB'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'color-highlights',
      label: 'Highlights',
      parameters: ['colorHighlightsR', 'colorHighlightsG', 'colorHighlightsB'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'color-levels',
      label: 'Levels',
      parameters: ['levelsInMin', 'levelsInMax', 'levelsOutMin', 'levelsOutMax', 'levelsGamma'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
