import type { VisualElement } from '../../types';

export const lightingShadingElement: VisualElement = {
  id: 'lighting-shading',
  displayName: 'Lighting',
  description: 'Adds directional or point lighting to create depth and dimension',
  category: 'Geometry',
  elementType: 'post-processor',
  order: 5,
  
  uniforms: [
    'uniform int uLightType;',
    'uniform float uLightDirX;',
    'uniform float uLightDirY;',
    'uniform float uLightDirZ;',
    'uniform float uLightPosX;',
    'uniform float uLightPosY;',
    'uniform float uLightPosZ;',
    'uniform float uLightIntensity;',
    'uniform float uLightAmbient;',
    'uniform float uLightFalloff;',
    'uniform float uLightColorR;',
    'uniform float uLightColorG;',
    'uniform float uLightColorB;'
  ],
  
  functions: `
// Directional light
float directionalLight(vec3 normal, vec3 lightDir) {
  return max(dot(normal, normalize(lightDir)), 0.0);
}

// Point light
float pointLight(vec3 p, vec3 lightPos, float intensity, float falloff) {
  vec3 toLight = lightPos - p;
  float dist = length(toLight);
  float attenuation = intensity / max(1.0 + falloff * dist * dist, 0.001);
  return attenuation;
}

// Calculate surface normal from gradient (simplified)
vec3 surfaceNormal(vec2 p) {
  // Approximate normal from result value
  // In full implementation, would sample neighboring pixels
  vec3 normal = vec3(0.0, 0.0, 1.0);
  
  // Simple approximation based on position
  float gradient = length(p) * 0.1;
  normal = normalize(vec3(p.x * gradient, p.y * gradient, 1.0));
  
  return normal;
}
`,
  
  mainCode: `
  // Calculate lighting
  float lighting = 0.0;
  vec3 lightColor = vec3(uLightColorR, uLightColorG, uLightColorB);
  
  if (uLightType == 0) {
    // Directional
    vec3 normal = surfaceNormal(p);
    vec3 lightDirVec = vec3(uLightDirX, uLightDirY, uLightDirZ);
    float lightLen = length(lightDirVec);
    vec3 lightDir = lightLen > 0.001 ? normalize(lightDirVec) : vec3(0.0, 0.0, 1.0);
    lighting = directionalLight(normal, lightDir);
  } else if (uLightType == 1) {
    // Point light
    vec3 lightPos = vec3(uLightPosX, uLightPosY, uLightPosZ);
    lighting = pointLight(vec3(p, 0.0), lightPos, uLightIntensity, uLightFalloff);
  }
  
  // Apply lighting to result
  result = result * (uLightAmbient + lighting * uLightIntensity);
`,
  
  parameters: {
    lightType: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Type (0=Directional, 1=Point)'
    },
    lightDirX: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Direction X (Directional)'
    },
    lightDirY: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Direction Y (Directional)'
    },
    lightDirZ: {
      type: 'float',
      default: 1.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Direction Z (Directional)'
    },
    lightPosX: {
      type: 'float',
      default: 2.0,
      min: -5.0,
      max: 5.0,
      step: 0.1,
      label: 'Position X (Point)'
    },
    lightPosY: {
      type: 'float',
      default: 2.0,
      min: -5.0,
      max: 5.0,
      step: 0.1,
      label: 'Position Y (Point)'
    },
    lightPosZ: {
      type: 'float',
      default: 3.0,
      min: -5.0,
      max: 5.0,
      step: 0.1,
      label: 'Position Z (Point)'
    },
    lightIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    lightAmbient: {
      type: 'float',
      default: 0.2,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Ambient'
    },
    lightFalloff: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Falloff (Point)'
    },
    lightColorR: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Light Color R'
    },
    lightColorG: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Light Color G'
    },
    lightColorB: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Light Color B'
    }
  },
  
  parameterGroups: [
    {
      id: 'light-main',
      label: 'Lighting',
      parameters: ['lightType', 'lightIntensity', 'lightAmbient'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'light-directional',
      label: 'Directional',
      parameters: ['lightDirX', 'lightDirY', 'lightDirZ'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'light-point',
      label: 'Point',
      parameters: ['lightPosX', 'lightPosY', 'lightPosZ', 'lightFalloff'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'light-color',
      label: 'Color',
      parameters: ['lightColorR', 'lightColorG', 'lightColorB'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
