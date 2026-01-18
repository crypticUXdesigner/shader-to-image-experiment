import type { VisualElement } from '../../types';

export const kaleidoscopeElement: VisualElement = {
  id: 'kaleidoscope',
  displayName: 'Kaleidoscope',
  description: 'Creates symmetric patterns by mirroring/reflecting sections of the image',
  category: 'Transform',
  elementType: 'coordinate-modifier',
  order: 1,
  
  uniforms: [
    'uniform float uKaleidCenterX;',
    'uniform float uKaleidCenterY;',
    'uniform int uKaleidSegments;',
    'uniform float uKaleidRotation;'
  ],
  
  functions: `
vec2 kaleidoscope(vec2 p, int segments, float rotation) {
  float angle = atan(p.y, p.x);
  float radius = length(p);
  
  // Normalize angle to 0..2PI
  angle = mod(angle + rotation, 6.28318);
  
  // Calculate segment angle
  float segmentAngle = 6.28318 / float(max(segments, 2));
  
  // Find which segment we're in
  int segment = int(angle / segmentAngle);
  
  // Mirror to first segment
  float segmentStart = float(segment) * segmentAngle;
  float localAngle = angle - segmentStart;
  
  // Mirror if in second half of segment
  if (localAngle > segmentAngle * 0.5) {
    localAngle = segmentAngle - localAngle;
  }
  
  // Reconstruct position
  angle = segmentStart + localAngle;
  return vec2(cos(angle), sin(angle)) * radius;
}
`,
  
  mainCode: `
  vec2 kaleidCenter = vec2(uKaleidCenterX, uKaleidCenterY);
  vec2 offsetP = p - kaleidCenter;
  offsetP = kaleidoscope(offsetP, uKaleidSegments, uKaleidRotation);
  p = kaleidCenter + offsetP;
`,
  
  parameters: {
    kaleidCenterX: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center X'
    },
    kaleidCenterY: {
      type: 'float',
      default: 0.0,
      min: -2.0,
      max: 2.0,
      step: 0.1,
      label: 'Center Y'
    },
    kaleidSegments: {
      type: 'int',
      default: 6,
      min: 2,
      max: 32,
      step: 1,
      label: 'Segments'
    },
    kaleidRotation: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 6.28,
      step: 0.01,
      label: 'Rotation'
    }
  },
  
  parameterGroups: [
    {
      id: 'kaleidoscope-main',
      label: 'Kaleidoscope',
      parameters: ['kaleidCenterX', 'kaleidCenterY', 'kaleidSegments', 'kaleidRotation'],
      collapsible: true,
      defaultCollapsed: false
    }
  ]
};
