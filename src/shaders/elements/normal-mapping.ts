import type { VisualElement } from '../../types';

export const normalMappingElement: VisualElement = {
  id: 'normal-mapping',
  displayName: 'Normal Mapping',
  description: 'Simulates surface detail using normal mapping for added depth and texture',
  category: 'Geometry',
  elementType: 'post-processor',
  order: 4,
  
  uniforms: [
    'uniform float uNormalScale;',
    'uniform float uNormalStrength;',
    'uniform float uNormalLightX;',
    'uniform float uNormalLightY;',
    'uniform float uNormalLightZ;'
  ],
  
  functions: `
// Calculate normal from height map (simplified approximation)
vec3 calculateNormal(vec2 p, float scale, float currentValue) {
  // Simplified normal calculation using gradient approximation
  // Since we can't sample neighbors, use position-based approximation
  float gradient = length(p) * 0.1;
  vec3 normal = normalize(vec3(p.x * gradient, p.y * gradient, 1.0));
  
  return normal;
}

// Apply normal mapping to result
float applyNormalMapping(float baseValue, vec3 normal, vec3 lightDir) {
  float lightLen = length(lightDir);
  vec3 lightNorm = lightLen > 0.001 ? normalize(lightDir) : vec3(0.0, 0.0, 1.0);
  float lighting = max(dot(normal, lightNorm), 0.0);
  return baseValue * (0.5 + 0.5 * lighting);
}
`,
  
  mainCode: `
  vec3 lightDir = normalize(vec3(uNormalLightX, uNormalLightY, uNormalLightZ));
  vec3 normal = calculateNormal(p * uNormalScale, uNormalScale, result);
  float normalEffect = applyNormalMapping(result, normal, lightDir);
  result = mix(result, normalEffect, uNormalStrength);
`,
  
  parameters: {
    normalScale: {
      type: 'float',
      default: 5.0,
      min: 0.1,
      max: 20.0,
      step: 0.1,
      label: 'Scale'
    },
    normalStrength: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Strength'
    },
    normalLightX: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Light Direction X'
    },
    normalLightY: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Light Direction Y'
    },
    normalLightZ: {
      type: 'float',
      default: 1.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Light Direction Z'
    }
  },
  
  parameterGroups: [
    {
      id: 'normal-main',
      label: 'Normal Mapping',
      parameters: ['normalScale', 'normalStrength'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'normal-lighting',
      label: 'Lighting',
      parameters: ['normalLightX', 'normalLightY', 'normalLightZ'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
