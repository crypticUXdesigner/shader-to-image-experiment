import type { VisualElement } from '../../types';

export const sphereRaymarchElement: VisualElement = {
  id: 'sphere-raymarch',
  displayName: 'Raymarch Sphere',
  description: '3D sphere rendered using raymarching technique with vector field distortion and glow effects',
  category: 'Geometry',
  elementType: 'content-generator',
  order: 3,
  
  uniforms: [
    'uniform float uSphereRadius;',
    'uniform float uSphereGlowIntensity;',
    'uniform float uSphereBrightness;',
    'uniform int uRaymarchSteps;',
    'uniform float uVectorFieldFrequencyX;',
    'uniform float uVectorFieldFrequencyY;',
    'uniform float uVectorFieldFrequencyZ;',
    'uniform float uVectorFieldAmplitude;',
    'uniform float uVectorFieldRadialStrength;',
    'uniform float uVectorFieldHarmonicAmplitude;',
    'uniform float uVectorFieldComplexity;',
    'uniform float uVectorFieldDistanceContribution;',
    'uniform float uVectorFieldSpeed;',
    'uniform float uAnimationSpeed;'
  ],
  
  functions: ``,
  
  mainCode: `
  // Use app's coordinate system (p is normalized screen space from base shader)
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(p, -1.0));
  
  // Vector field speed
  float vectorFieldSpeed = uVectorFieldSpeed;
  float vectorFieldTime = uTime * uAnimationSpeed * vectorFieldSpeed;
  
  // Sphere radius in normalized coordinate space
  float sphereRadius = uSphereRadius;
  
  vec4 o = vec4(0.0);
  
  // Use mediump for intermediate raymarch calculations
  mediump float z = 0.0;
  mediump float d = 1.0;
  
  // Pre-calculate all uniform-dependent values outside the loop
  mediump vec3 frequencies = vec3(uVectorFieldFrequencyX, uVectorFieldFrequencyY, uVectorFieldFrequencyZ);
  float radialStrength = uVectorFieldRadialStrength;
  float amplitude = uVectorFieldAmplitude;
  float complexity = clamp(uVectorFieldComplexity, 1.0, 15.0);
  float harmonicAmp = uVectorFieldHarmonicAmplitude;
  float distContrib = uVectorFieldDistanceContribution;
  
  // Apply glow intensity and brightness
  float glowMultiplier = uSphereGlowIntensity * uSphereBrightness;
  
  // Calculate raymarch steps
  float maxSteps = float(uRaymarchSteps);
  maxSteps = clamp(maxSteps, 20.0, 200.0);
  
  // Use constant maximum for loop bound (GLSL requirement)
  for(float i = 0.0; i < 200.0; i++) {
    // Early break if we've reached the desired step count
    if (i >= maxSteps) break;
    
    // Calculate position along ray
    mediump vec3 pos = ro + z * rd;
    
    // Vector field calculation (adapted from reference)
    mediump vec3 a = normalize(cos(frequencies + vectorFieldTime - d * radialStrength));
    pos.z += 0.5; // Adjusted for normalized coordinate space
    
    a = a * dot(a, pos) - cross(a, pos) * amplitude;
    
    // Harmonic layers
    for(float j = 1.0; j < 15.0; j++) {
      if (j >= complexity) break;
      a += sin(a * j + vectorFieldTime).yzx / j * harmonicAmp;
    }
    
    // Distance to sphere with vector field distortion
    mediump float pLen = length(pos);
    d = 0.05 * abs(pLen - sphereRadius) + distContrib * abs(a.y);
    
    // Accumulate glow (fix: use max(z, 0.01) to avoid zero on first iteration)
    o += (cos(d / 0.1 + vec4(0.0, 2.0, 4.0, 0.0)) + 1.0) / d * max(z, 0.01) * glowMultiplier;
    z += d;
    
    // Early exit if we've gone too far
    if (z > 100.0) break;
  }
  
  // Normalize accumulated value to 0-1 range
  // Use a more appropriate divisor based on typical accumulated glow values
  // Typical values range from tens to low hundreds, so 100-200 is more appropriate than 10000
  // Adjust normalization based on glow multiplier to prevent overflow
  float accumulatedGlow = length(o.rgb);
  float normalizationDivisor = 200.0 / max(glowMultiplier, 0.1);
  float normalizedValue = clamp(accumulatedGlow / normalizationDivisor, 0.0, 1.0);
  result += normalizedValue;
`,
  
  parameters: {
    sphereRadius: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.1,
      label: 'Radius'
    },
    sphereGlowIntensity: {
      type: 'float',
      default: 0.2,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Glow Intensity'
    },
    sphereBrightness: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 3.0,
      step: 0.1,
      label: 'Brightness'
    },
    raymarchSteps: {
      type: 'int',
      default: 30.0,
      min: 20.0,
      max: 200.0,
      step: 1.0,
      label: 'Raymarch Steps'
    },
    vectorFieldFrequencyX: {
      type: 'float',
      default: 4.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Frequency X'
    },
    vectorFieldFrequencyY: {
      type: 'float',
      default: 2.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Frequency Y'
    },
    vectorFieldFrequencyZ: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Frequency Z'
    },
    vectorFieldAmplitude: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      label: 'Amplitude'
    },
    vectorFieldRadialStrength: {
      type: 'float',
      default: 8.0,
      min: 0.0,
      max: 20.0,
      step: 0.1,
      label: 'Radial Strength'
    },
    vectorFieldHarmonicAmplitude: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 3.0,
      step: 0.1,
      label: 'Harmonic Amplitude'
    },
    vectorFieldComplexity: {
      type: 'float',
      default: 6.0,
      min: 1.0,
      max: 15.0,
      step: 0.1,
      label: 'Complexity'
    },
    vectorFieldDistanceContribution: {
      type: 'float',
      default: 0.04,
      min: 0.0,
      max: 0.2,
      step: 0.01,
      label: 'Distance Contribution'
    },
    vectorFieldSpeed: {
      type: 'float',
      default: 0.3,
      min: 0.0,
      max: 2.0,
      step: 0.1,
      label: 'Vector Field Speed'
    },
    animationSpeed: {
      type: 'float',
      default: 0.3,
      min: 0.0,
      max: 2.0,
      step: 0.1,
      label: 'Animation Speed'
    }
  },
  
  parameterGroups: [
    {
      id: 'sphere-main',
      label: 'Sphere',
      parameters: ['sphereRadius', 'sphereGlowIntensity', 'sphereBrightness', 'raymarchSteps'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'vector-field',
      label: 'Vector Field',
      parameters: [
        'vectorFieldFrequencyX',
        'vectorFieldFrequencyY',
        'vectorFieldFrequencyZ',
        'vectorFieldAmplitude',
        'vectorFieldRadialStrength',
        'vectorFieldHarmonicAmplitude',
        'vectorFieldComplexity',
        'vectorFieldDistanceContribution'
      ],
      collapsible: true,
      defaultCollapsed: true
    },
    {
      id: 'animation',
      label: 'Animation',
      parameters: ['vectorFieldSpeed', 'animationSpeed'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
