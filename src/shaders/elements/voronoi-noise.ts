import type { VisualElement } from '../../types';

export const voronoiNoiseElement: VisualElement = {
  id: 'voronoi-noise',
  displayName: 'Voronoi',
  description: 'Cell-like patterns using Voronoi diagrams, creating organic crystal-like structures',
  category: 'Background',
  elementType: 'content-generator',
  order: 0,
  
  uniforms: [
    'uniform float uVoronoiScale;',
    'uniform float uVoronoiJitter;',
    'uniform int uVoronoiDistanceMetric;',
    'uniform float uVoronoiTimeSpeed;',
    'uniform float uVoronoiIntensity;',
    'uniform float uVoronoiTimeOffset;'
  ],
  
  functions: `
// Random 2D vector
vec2 random2(vec2 p) {
  return fract(
    sin(vec2(
      dot(p, vec2(127.1, 311.7)),
      dot(p, vec2(269.5, 183.3))
    )) * 43758.5453
  );
}

// Voronoi cell calculation
float voronoi(vec2 p, float jitter, int metric) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  
  float minDist = 8.0;
  
  // Check 3x3 neighborhood
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = random2(i + neighbor) * jitter;
      vec2 diff = neighbor + point - f;
      
      float dist = 0.0;
      if (metric == 0) {
        dist = length(diff);
      } else if (metric == 1) {
        dist = abs(diff.x) + abs(diff.y);
      } else {
        dist = max(abs(diff.x), abs(diff.y));
      }
      
      if (dist < minDist) {
        minDist = dist;
      }
    }
  }
  
  return minDist;
}
`,
  
  mainCode: `
  float voronoiTime = (uTime + uVoronoiTimeOffset) * uVoronoiTimeSpeed;
  float scale = max(uVoronoiScale, 0.001);
  float value = voronoi(p * scale + vec2(voronoiTime * 0.1, voronoiTime * 0.15), uVoronoiJitter, uVoronoiDistanceMetric);
  // Normalize distance to reasonable range (0-1)
  value = clamp(value * 0.7, 0.0, 1.0);
  result += value * uVoronoiIntensity;
`,
  
  parameters: {
    voronoiScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 20.0,
      step: 0.01,
      label: 'Scale'
    },
    voronoiJitter: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Jitter'
    },
    voronoiDistanceMetric: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Distance Metric (0=Euclidean, 1=Manhattan, 2=Chebyshev)'
    },
    voronoiTimeSpeed: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    voronoiIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    voronoiTimeOffset: {
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
      id: 'voronoi-main',
      label: 'Voronoi',
      parameters: ['voronoiScale', 'voronoiJitter', 'voronoiDistanceMetric', 'voronoiIntensity'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'voronoi-animation',
      label: 'Animation',
      parameters: ['voronoiTimeSpeed', 'voronoiTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
