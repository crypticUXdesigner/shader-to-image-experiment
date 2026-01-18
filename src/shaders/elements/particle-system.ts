import type { VisualElement } from '../../types';

export const particleSystemElement: VisualElement = {
  id: 'particle-system',
  displayName: 'Particle System',
  description: 'Point-based particle effects for texture and detail enhancement',
  category: 'Pattern',
  elementType: 'content-generator',
  order: 1,
  
  uniforms: [
    'uniform float uParticleScale;',
    'uniform float uParticleCellSize;',
    'uniform int uParticleCount;',
    'uniform float uParticleSize;',
    'uniform float uParticleIntensity;',
    'uniform float uParticleFalloff;',
    'uniform float uParticleTimeSpeed;',
    'uniform float uParticleTimeOffset;'
  ],
  
  functions: `
// Hash function for particle positions
float hash(float n) {
  return fract(sin(n) * 43758.5453);
}

vec2 hash2(float n) {
  return fract(sin(vec2(n, n + 1.0)) * vec2(43758.5453, 22578.1459));
}

// Particle cell calculation
vec2 particleCell(vec2 p, float cellSize) {
  return floor(p / cellSize);
}

// Particle position within cell
vec2 particlePos(vec2 cell, float time) {
  vec2 pos = hash2(dot(cell, vec2(12.9898, 78.233)) + time);
  return pos;
}

// Particle distance and influence
float particleInfluence(vec2 p, vec2 particlePos, float size, float intensity) {
  float dist = length(p - particlePos);
  return exp(-dist * dist / (2.0 * size * size)) * intensity;
}

// Particle system calculation
float particleSystem(vec2 p, float time, float cellSize, int particlesPerCell) {
  vec2 cell = particleCell(p, cellSize);
  float value = 0.0;
  
  // Check neighboring cells for particles
  for (int x = -1; x <= 1; x++) {
    for (int y = -1; y <= 1; y++) {
      vec2 neighborCell = cell + vec2(float(x), float(y));
      
      for (int i = 0; i < 4; i++) {
        if (i >= particlesPerCell) break;
        
        float particleId = float(i) + dot(neighborCell, vec2(12.9898, 78.233));
        vec2 particleLocalPos = particlePos(neighborCell, time + particleId * 0.1);
        vec2 worldPos = neighborCell * cellSize + particleLocalPos * cellSize;
        
        float influence = particleInfluence(p, worldPos, uParticleSize, uParticleIntensity);
        value += influence;
      }
    }
  }
  
  return min(value, 1.0);
}
`,
  
  mainCode: `
  float particleTime = (uTime + uParticleTimeOffset) * uParticleTimeSpeed;
  float particles = particleSystem(p * uParticleScale, particleTime, uParticleCellSize, uParticleCount);
  result += particles * uParticleIntensity;
`,
  
  parameters: {
    particleScale: {
      type: 'float',
      default: 2.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      label: 'Scale'
    },
    particleCellSize: {
      type: 'float',
      default: 0.5,
      min: 0.1,
      max: 2.0,
      step: 0.01,
      label: 'Cell Size'
    },
    particleCount: {
      type: 'int',
      default: 1,
      min: 1,
      max: 4,
      step: 1,
      label: 'Particles Per Cell'
    },
    particleSize: {
      type: 'float',
      default: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      label: 'Particle Size'
    },
    particleIntensity: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Intensity'
    },
    particleFalloff: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Falloff'
    },
    particleTimeSpeed: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    particleTimeOffset: {
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
      id: 'particle-main',
      label: 'Particle System',
      parameters: ['particleScale', 'particleCellSize', 'particleCount', 'particleSize', 'particleIntensity'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'particle-animation',
      label: 'Animation',
      parameters: ['particleTimeSpeed', 'particleTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'particle-advanced',
      label: 'Advanced',
      parameters: ['particleFalloff'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
