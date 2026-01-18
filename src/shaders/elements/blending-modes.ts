import type { VisualElement } from '../../types';

export const blendingModesElement: VisualElement = {
  id: 'blending-modes',
  displayName: 'Blending Modes',
  description: 'Controls how elements combine using various blending modes (multiply, screen, overlay, etc.)',
  category: 'Compositing',
  elementType: 'post-processor',
  order: 90,
  
  uniforms: [
    'uniform int uBlendMode;',
    'uniform float uBlendOpacity;',
    'uniform int uBlendSource;',
    'uniform float uBlendValue;',
    'uniform float uBlendScale;',
    'uniform float uBlendFrequency;',
    'uniform float uBlendTimeSpeed;',
    'uniform float uBlendTimeOffset;'
  ],
  
  functions: `
// Hash function for noise
float hash(vec2 p) {
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p.xy, p.yx + 19.19);
  return fract(p.x * p.y);
}

// Simple noise for blend source
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Multiply blend
float blendMultiply(float base, float blend) {
  return base * blend;
}

// Screen blend
float blendScreen(float base, float blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}

// Overlay blend
float blendOverlay(float base, float blend) {
  return base < 0.5 
    ? 2.0 * base * blend 
    : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
}

// Soft light blend
float blendSoftLight(float base, float blend) {
  return (blend < 0.5) 
    ? base - (1.0 - 2.0 * blend) * base * (1.0 - base)
    : base + (2.0 * blend - 1.0) * (sqrt(base) - base);
}

// Hard light blend
float blendHardLight(float base, float blend) {
  return blend < 0.5 
    ? 2.0 * base * blend 
    : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
}

// Color dodge
float blendColorDodge(float base, float blend) {
  return base / (1.0 - blend + 0.001);
}

// Color burn
float blendColorBurn(float base, float blend) {
  return 1.0 - (1.0 - base) / (blend + 0.001);
}

// Linear dodge (add)
float blendLinearDodge(float base, float blend) {
  return min(base + blend, 1.0);
}

// Linear burn
float blendLinearBurn(float base, float blend) {
  return max(base + blend - 1.0, 0.0);
}

// Difference
float blendDifference(float base, float blend) {
  return abs(base - blend);
}

// Exclusion
float blendExclusion(float base, float blend) {
  return base + blend - 2.0 * base * blend;
}

// Apply blending mode
float applyBlendMode(float base, float blend, int mode) {
  if (mode == 0) return blendMultiply(base, blend);
  else if (mode == 1) return blendScreen(base, blend);
  else if (mode == 2) return blendOverlay(base, blend);
  else if (mode == 3) return blendSoftLight(base, blend);
  else if (mode == 4) return blendHardLight(base, blend);
  else if (mode == 5) return blendColorDodge(base, blend);
  else if (mode == 6) return blendColorBurn(base, blend);
  else if (mode == 7) return blendLinearDodge(base, blend);
  else if (mode == 8) return blendLinearBurn(base, blend);
  else if (mode == 9) return blendDifference(base, blend);
  else if (mode == 10) return blendExclusion(base, blend);
  else return base; // Normal (no blend)
}
`,
  
  mainCode: `
  // Calculate blend value
  float blendValue = uBlendValue;
  float blendTime = (uTime + uBlendTimeOffset) * uBlendTimeSpeed;
  
  // If blend source is from noise pattern
  if (uBlendSource == 1) {
    blendValue = noise(p * uBlendScale + vec2(blendTime * 0.1, blendTime * 0.15));
  }
  // If blend source is from wave
  else if (uBlendSource == 2) {
    blendValue = sin(p.x * uBlendFrequency + blendTime) * 0.5 + 0.5;
  }
  
  // Apply blending mode
  result = mix(result, applyBlendMode(result, blendValue, uBlendMode), uBlendOpacity);
`,
  
  parameters: {
    blendMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 10,
      step: 1,
      label: 'Mode (0=Multiply, 1=Screen, 2=Overlay, 3=Soft Light, 4=Hard Light, 5=Color Dodge, 6=Color Burn, 7=Linear Dodge, 8=Linear Burn, 9=Difference, 10=Exclusion)'
    },
    blendOpacity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity'
    },
    blendSource: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Source (0=Parameter, 1=Noise, 2=Wave)'
    },
    blendValue: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Blend Value (Parameter)'
    },
    blendScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 20.0,
      step: 0.1,
      label: 'Scale (Noise)'
    },
    blendFrequency: {
      type: 'float',
      default: 5.0,
      min: 0.1,
      max: 50.0,
      step: 0.1,
      label: 'Frequency (Wave)'
    },
    blendTimeSpeed: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    blendTimeOffset: {
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
      id: 'blend-main',
      label: 'Blending Modes',
      parameters: ['blendMode', 'blendOpacity', 'blendSource'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'blend-parameter',
      label: 'Parameter Source',
      parameters: ['blendValue'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'blend-noise',
      label: 'Noise Source',
      parameters: ['blendScale', 'blendTimeSpeed', 'blendTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'blend-wave',
      label: 'Wave Source',
      parameters: ['blendFrequency', 'blendTimeSpeed', 'blendTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
