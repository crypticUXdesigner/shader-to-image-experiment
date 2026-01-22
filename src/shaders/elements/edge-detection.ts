import type { VisualElement } from '../../types';

export const edgeDetectionElement: VisualElement = {
  id: 'edge-detection',
  displayName: 'Edge Detection',
  description: 'Detects edges and creates outline effects for structural definition',
  category: 'Post-Processing',
  elementType: 'post-processor',
  order: 97,
  
  uniforms: [
    'uniform float uEdgeThreshold;',
    'uniform float uEdgeWidth;',
    'uniform float uEdgeIntensity;',
    'uniform float uEdgeStrength;'
  ],
  
  functions: `
// Simplified edge detection using threshold-based approach
float edgeEffect(float value, float threshold, float width) {
  float edge = abs(value - threshold);
  return smoothstep(0.0, width, edge);
}
`,
  
  mainCode: `
  // Apply edge detection
  float edges = edgeEffect(result, uEdgeThreshold, uEdgeWidth);
  result = mix(result, edges * uEdgeIntensity, uEdgeStrength);
`,
  
  parameters: {
    edgeThreshold: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Threshold'
    },
    edgeWidth: {
      type: 'float',
      default: 0.01,
      min: 0.0,
      max: 0.1,
      step: 0.01,
      label: 'Width'
    },
    edgeIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    edgeStrength: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength'
    }
  },
  
  parameterGroups: [
    {
      id: 'edge-main',
      label: 'Edge Detection',
      parameters: ['edgeThreshold', 'edgeWidth', 'edgeIntensity', 'edgeStrength'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
