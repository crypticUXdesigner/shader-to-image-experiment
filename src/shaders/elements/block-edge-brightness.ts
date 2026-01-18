import type { VisualElement } from '../../types';

export const blockEdgeBrightnessElement: VisualElement = {
  id: 'block-edge-brightness',
  displayName: 'Edge Brightness',
  description: 'Adds brightness variation at block edges (use with block-displacement)',
  category: 'Glitch',
  elementType: 'post-processor',
  order: 95,
  
  uniforms: [
    'uniform int uBlockEdgeDirection;',
    'uniform float uBlockEdgeCount;',
    'uniform float uBlockEdgeBrightness;',
    'uniform float uBlockEdgeWidth;',
    'uniform float uBlockEdgeSpacingChaos;',
    'uniform float uBlockEdgeTimeSpeed;',
    'uniform float uBlockEdgeTimeOffset;'
  ],
  
  functions: `
// Hash function for deterministic block boundaries
float hashBlockEdge(float n) {
  return fract(sin(n) * 43758.5453);
}

// Hash function for 2D
float hash2DBlockEdge(vec2 p) {
  return hashBlockEdge(dot(p, vec2(12.9898, 78.233)));
}

// Calculate edge brightness effect
float blockEdgeBrightnessEffect(float value, vec2 p, int direction, float numBlocks, float brightnessAmount, float edgeWidth, float spacingChaos, float time) {
  float edgeBrightness = 1.0;
  
  if (direction == 0) {
    // Horizontal blocks
    float blockWidth = 2.0 / numBlocks;
    float baseX = p.x + 1.0;
    float blockIndexFloat = baseX / blockWidth;
    float blockIndex = floor(blockIndexFloat);
    
    // Apply spacing chaos if needed
    if (spacingChaos > 0.001) {
      float spacingHash = hash2DBlockEdge(vec2(blockIndex, 2.0));
      float spacingOffset = (spacingHash * 2.0 - 1.0) * spacingChaos * blockWidth * 0.5;
      blockIndexFloat = (baseX + spacingOffset) / blockWidth;
      blockIndex = floor(blockIndexFloat);
    }
    
    float localPos = fract(blockIndexFloat);
    float edgeDist = min(localPos, 1.0 - localPos);
    float edgeFactor = 1.0 - smoothstep(0.0, edgeWidth, edgeDist);
    edgeBrightness = 1.0 + edgeFactor * brightnessAmount;
    
  } else {
    // Vertical blocks
    float blockHeight = 2.0 / numBlocks;
    float baseY = p.y + 1.0;
    float blockIndexFloat = baseY / blockHeight;
    float blockIndex = floor(blockIndexFloat);
    
    if (spacingChaos > 0.001) {
      float spacingHash = hash2DBlockEdge(vec2(blockIndex, 2.0));
      float spacingOffset = (spacingHash * 2.0 - 1.0) * spacingChaos * blockHeight * 0.5;
      blockIndexFloat = (baseY + spacingOffset) / blockHeight;
      blockIndex = floor(blockIndexFloat);
    }
    
    float localPos = fract(blockIndexFloat);
    float edgeDist = min(localPos, 1.0 - localPos);
    float edgeFactor = 1.0 - smoothstep(0.0, edgeWidth, edgeDist);
    edgeBrightness = 1.0 + edgeFactor * brightnessAmount;
  }
  
  return value * edgeBrightness;
}
`,
  
  mainCode: `
  float blockEdgeTime = (uTime + uBlockEdgeTimeOffset) * uBlockEdgeTimeSpeed;
  result = blockEdgeBrightnessEffect(result, p, uBlockEdgeDirection, uBlockEdgeCount, uBlockEdgeBrightness, uBlockEdgeWidth, uBlockEdgeSpacingChaos, blockEdgeTime);
`,
  
  parameters: {
    blockEdgeDirection: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Direction (0=Horizontal, 1=Vertical)'
    },
    blockEdgeCount: {
      type: 'float',
      default: 10.0,
      min: 2.0,
      max: 100.0,
      step: 1.0,
      label: 'Block Count (match block-displacement)'
    },
    blockEdgeBrightness: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Edge Brightness'
    },
    blockEdgeWidth: {
      type: 'float',
      default: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01,
      label: 'Edge Width'
    },
    blockEdgeSpacingChaos: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Spacing Chaos (match block-displacement)'
    },
    blockEdgeTimeSpeed: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    blockEdgeTimeOffset: {
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
      id: 'block-edge-main',
      label: 'Block Edge Brightness',
      parameters: ['blockEdgeDirection', 'blockEdgeCount', 'blockEdgeBrightness', 'blockEdgeWidth', 'blockEdgeSpacingChaos'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'block-edge-animation',
      label: 'Animation',
      parameters: ['blockEdgeTimeSpeed', 'blockEdgeTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
