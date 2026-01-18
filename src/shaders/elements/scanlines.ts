import type { VisualElement } from '../../types';

export const scanlinesElement: VisualElement = {
  id: 'scanlines',
  displayName: 'Scanlines',
  description: 'Adds horizontal scanline overlay effect, simulating CRT monitor or digital display artifacts',
  category: 'Glitch',
  elementType: 'post-processor',
  order: 96,
  
  uniforms: [
    'uniform float uScanlineFrequency;',
    'uniform float uScanlineThickness;',
    'uniform float uScanlineOpacity;',
    'uniform float uScanlineTimeSpeed;',
    'uniform float uScanlineTimeOffset;'
  ],
  
  functions: `
float scanlineEffect(float value, vec2 p, float frequency, float thickness, float opacity, float time) {
  // Calculate scanline position with optional scrolling
  float scanlineY = p.y + time * 0.1;
  float scanline = sin(scanlineY * frequency * 3.14159);
  
  // Create sharp lines (not smooth sine)
  scanline = step(1.0 - thickness, scanline);
  
  // Apply opacity
  return mix(value, value * (1.0 - opacity), scanline);
}
`,
  
  mainCode: `
  float scanlineTime = (uTime + uScanlineTimeOffset) * uScanlineTimeSpeed;
  result = scanlineEffect(result, p, uScanlineFrequency, uScanlineThickness, uScanlineOpacity, scanlineTime);
`,
  
  parameters: {
    scanlineFrequency: {
      type: 'float',
      default: 100.0,
      min: 10.0,
      max: 500.0,
      step: 1.0,
      label: 'Frequency'
    },
    scanlineThickness: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      label: 'Thickness'
    },
    scanlineOpacity: {
      type: 'float',
      default: 0.3,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity'
    },
    scanlineTimeSpeed: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 10.0,
      step: 0.1,
      label: 'Time Speed'
    },
    scanlineTimeOffset: {
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
      id: 'scanline-main',
      label: 'Scanlines',
      parameters: ['scanlineFrequency', 'scanlineThickness', 'scanlineOpacity'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'scanline-animation',
      label: 'Animation',
      parameters: ['scanlineTimeSpeed', 'scanlineTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
