import type { VisualElement } from '../../types';

export const blockDisplacementElement: VisualElement = {
  id: 'block-displacement',
  displayName: 'Block Displacement',
  description: 'Creates variable-size blocks/strips with offset. Larger blocks get less offset, smaller blocks get more offset',
  category: 'Glitch',
  elementType: 'coordinate-modifier',
  order: 1,
  
  uniforms: [
    'uniform int uBlockDirection;',
    'uniform float uBlockCount;',
    'uniform float uBlockMaxOffsetX;',
    'uniform float uBlockMaxOffsetY;',
    'uniform float uBlockMinSize;',
    'uniform float uBlockMaxSize;',
    'uniform float uBlockTimeSpeed;',
    'uniform float uBlockTimeOffset;',
    'uniform float uBlockSeed;'
  ],
  
  functions: `
// Hash function for deterministic block boundaries
float hashBlock(float n) {
  return fract(sin(n) * 43758.5453);
}

// Hash function for 2D
float hash2DBlock(vec2 p) {
  return hashBlock(dot(p, vec2(12.9898, 78.233)));
}

// Calculate block displacement with spacing chaos and variable block sizes
// Returns offset and size multiplier for coordinate warping
vec2 blockDisplacement(vec2 p, int direction, float numBlocks, float maxOffsetX, float maxOffsetY, float minSize, float maxSize, float spacingChaos, float time, out float sizeMultiplier) {
  vec2 offset = vec2(0.0);
  sizeMultiplier = 1.0;
  
  if (direction == 0) {
    // Horizontal blocks (primarily vertical displacement, but can also use X)
    float baseBlockWidth = 2.0 / numBlocks;
    float baseX = p.x + 1.0; // Convert to 0-2 range
    
    // Determine block index using even division (for block identification)
    float blockIndexFloat = baseX / baseBlockWidth;
    float blockIndex = floor(blockIndexFloat);
    blockIndex = clamp(blockIndex, 0.0, numBlocks - 1.0);
    
    // Calculate spacing chaos offset
    float spacingHash = hash2DBlock(vec2(blockIndex, 2.0));
    float spacingOffset = (spacingHash * 2.0 - 1.0) * spacingChaos * baseBlockWidth * 0.5;
    float adjustedX = baseX + spacingOffset;
    blockIndexFloat = adjustedX / baseBlockWidth;
    blockIndex = floor(blockIndexFloat);
    blockIndex = clamp(blockIndex, 0.0, numBlocks - 1.0);
    
    // Calculate block size variation using min/max
    float blockHash = hash2DBlock(vec2(blockIndex, 0.0));
    sizeMultiplier = mix(minSize, maxSize, blockHash);
    
    // Inverse relationship: larger blocks = less offset
    float normalizedRatio = (sizeMultiplier - minSize) / max(maxSize - minSize, 0.001);
    float offsetFactor = 1.0 - normalizedRatio;
    
    // Apply Y offset (vertical displacement for horizontal blocks)
    float offsetAmountY = maxOffsetY * offsetFactor;
    float offsetHashY = hash2DBlock(vec2(blockIndex, 1.0));
    offset.y = (offsetHashY * 2.0 - 1.0) * offsetAmountY;
    offset.y += sin(time * 0.5 + blockIndex) * offsetAmountY * 0.1;
    
    // Apply X offset (optional horizontal displacement)
    float offsetAmountX = maxOffsetX * offsetFactor;
    float offsetHashX = hash2DBlock(vec2(blockIndex, 3.0));
    offset.x = (offsetHashX * 2.0 - 1.0) * offsetAmountX;
    offset.x += sin(time * 0.3 + blockIndex) * offsetAmountX * 0.1;
    
  } else {
    // Vertical blocks (primarily horizontal displacement, but can also use Y)
    float baseBlockHeight = 2.0 / numBlocks;
    float baseY = p.y + 1.0;
    
    // Determine block index
    float blockIndexFloat = baseY / baseBlockHeight;
    float blockIndex = floor(blockIndexFloat);
    blockIndex = clamp(blockIndex, 0.0, numBlocks - 1.0);
    
    // Calculate spacing chaos offset
    float spacingHash = hash2DBlock(vec2(blockIndex, 2.0));
    float spacingOffset = (spacingHash * 2.0 - 1.0) * spacingChaos * baseBlockHeight * 0.5;
    float adjustedY = baseY + spacingOffset;
    blockIndexFloat = adjustedY / baseBlockHeight;
    blockIndex = floor(blockIndexFloat);
    blockIndex = clamp(blockIndex, 0.0, numBlocks - 1.0);
    
    // Calculate block size variation
    float blockHash = hash2DBlock(vec2(0.0, blockIndex));
    sizeMultiplier = mix(minSize, maxSize, blockHash);
    
    // Inverse relationship: larger blocks = less offset
    float normalizedRatio = (sizeMultiplier - minSize) / max(maxSize - minSize, 0.001);
    float offsetFactor = 1.0 - normalizedRatio;
    
    // Apply X offset (horizontal displacement for vertical blocks)
    float offsetAmountX = maxOffsetX * offsetFactor;
    float offsetHashX = hash2DBlock(vec2(1.0, blockIndex));
    offset.x = (offsetHashX * 2.0 - 1.0) * offsetAmountX;
    offset.x += sin(time * 0.5 + blockIndex) * offsetAmountX * 0.1;
    
    // Apply Y offset (optional vertical displacement)
    float offsetAmountY = maxOffsetY * offsetFactor;
    float offsetHashY = hash2DBlock(vec2(3.0, blockIndex));
    offset.y = (offsetHashY * 2.0 - 1.0) * offsetAmountY;
    offset.y += sin(time * 0.3 + blockIndex) * offsetAmountY * 0.1;
  }
  
  return offset;
}
`,
  
  mainCode: `
  // Store original position for size calculation
  vec2 originalP = p;
  
  float blockTime = (uTime + uBlockTimeOffset) * uBlockTimeSpeed;
  
  // Screen is divided into VARIABLE-SIZED blocks (not equal blocks)
  // Direction 0 (horizontal): blocks vary in WIDTH (X dimension)
  // Direction 1 (vertical): blocks vary in HEIGHT (Y dimension)
  // Each block's size is between minSize and maxSize
  
  float blockSizeMultiplier = 1.0;
  float blockIndex = 0.0;
  float localPosInBlock = 0.0;
  
  if (uBlockDirection == 0) {
    // Horizontal blocks: find which variable-width block contains this X position
    float baseX = originalP.x + 1.0; // Convert to 0-2 range
    float cumulativeSize = 0.0;
    float totalSize = 0.0;
    
    // First pass: calculate total size
    for (int i = 0; i < 100; i++) {
      if (float(i) >= uBlockCount) break;
      float hash = hash2DBlock(vec2(float(i), uBlockSeed));
      float size = mix(uBlockMinSize, uBlockMaxSize, hash);
      totalSize += size;
    }
    
    // Second pass: find which block contains this X position
    float normalizedX = baseX / 2.0; // 0 to 1 range
    float targetPos = normalizedX * totalSize; // Position in size units
    
    cumulativeSize = 0.0;
    for (int i = 0; i < 100; i++) {
      if (float(i) >= uBlockCount) break;
      float hash = hash2DBlock(vec2(float(i), uBlockSeed));
      float size = mix(uBlockMinSize, uBlockMaxSize, hash);
      
      if (targetPos < cumulativeSize + size) {
        // This pixel is in block i
        blockIndex = float(i);
        blockSizeMultiplier = size;
        localPosInBlock = (targetPos - cumulativeSize) / size; // 0 to 1 within block
        break;
      }
      cumulativeSize += size;
    }
    
    // Clamp to valid range
    blockIndex = clamp(blockIndex, 0.0, uBlockCount - 1.0);
    
  } else {
    // Vertical blocks: find which variable-height block contains this Y position
    float baseY = originalP.y + 1.0; // Convert to 0-2 range
    float cumulativeSize = 0.0;
    float totalSize = 0.0;
    
    // First pass: calculate total size
    for (int i = 0; i < 100; i++) {
      if (float(i) >= uBlockCount) break;
      float hash = hash2DBlock(vec2(uBlockSeed, float(i)));
      float size = mix(uBlockMinSize, uBlockMaxSize, hash);
      totalSize += size;
    }
    
    // Second pass: find which block contains this Y position
    float normalizedY = baseY / 2.0; // 0 to 1 range
    float targetPos = normalizedY * totalSize; // Position in size units
    
    cumulativeSize = 0.0;
    for (int i = 0; i < 100; i++) {
      if (float(i) >= uBlockCount) break;
      float hash = hash2DBlock(vec2(uBlockSeed, float(i)));
      float size = mix(uBlockMinSize, uBlockMaxSize, hash);
      
      if (targetPos < cumulativeSize + size) {
        // This pixel is in block i
        blockIndex = float(i);
        blockSizeMultiplier = size;
        localPosInBlock = (targetPos - cumulativeSize) / size; // 0 to 1 within block
        break;
      }
      cumulativeSize += size;
    }
    
    // Clamp to valid range
    blockIndex = clamp(blockIndex, 0.0, uBlockCount - 1.0);
  }
  
  // Calculate offset based on the block we found
  float normalizedRatio = (blockSizeMultiplier - uBlockMinSize) / max(uBlockMaxSize - uBlockMinSize, 0.001);
  float offsetFactor = 1.0 - normalizedRatio; // Inverse: larger blocks = less offset
  
  vec2 blockOffset = vec2(0.0);
  
  if (uBlockDirection == 0) {
    // Horizontal blocks: apply Y offset (vertical displacement)
    float offsetAmountY = uBlockMaxOffsetY * offsetFactor;
    float offsetHashY = hash2DBlock(vec2(blockIndex, 1.0));
    blockOffset.y = (offsetHashY * 2.0 - 1.0) * offsetAmountY;
    blockOffset.y += sin(blockTime * 0.5 + blockIndex) * offsetAmountY * 0.1;
    
    // Optional X offset
    float offsetAmountX = uBlockMaxOffsetX * offsetFactor;
    float offsetHashX = hash2DBlock(vec2(blockIndex, 3.0));
    blockOffset.x = (offsetHashX * 2.0 - 1.0) * offsetAmountX;
    blockOffset.x += sin(blockTime * 0.3 + blockIndex) * offsetAmountX * 0.1;
  } else {
    // Vertical blocks: apply X offset (horizontal displacement)
    float offsetAmountX = uBlockMaxOffsetX * offsetFactor;
    float offsetHashX = hash2DBlock(vec2(1.0, blockIndex));
    blockOffset.x = (offsetHashX * 2.0 - 1.0) * offsetAmountX;
    blockOffset.x += sin(blockTime * 0.5 + blockIndex) * offsetAmountX * 0.1;
    
    // Optional Y offset
    float offsetAmountY = uBlockMaxOffsetY * offsetFactor;
    float offsetHashY = hash2DBlock(vec2(3.0, blockIndex));
    blockOffset.y = (offsetHashY * 2.0 - 1.0) * offsetAmountY;
    blockOffset.y += sin(blockTime * 0.3 + blockIndex) * offsetAmountY * 0.1;
  }
  
  // Apply offset
  p += blockOffset;
`,
  
  parameters: {
    blockDirection: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Direction (0=Horizontal, 1=Vertical)'
    },
    blockCount: {
      type: 'float',
      default: 10.0,
      min: 2.0,
      max: 100.0,
      step: 1.0,
      label: 'Block Count'
    },
    blockMaxOffsetX: {
      type: 'float',
      default: 0.2,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Max Offset X'
    },
    blockMaxOffsetY: {
      type: 'float',
      default: 0.2,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Max Offset Y'
    },
    blockMinSize: {
      type: 'float',
      default: 0.1,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: 'Min Block Size (multiplier)'
    },
    blockMaxSize: {
      type: 'float',
      default: 5.0,
      min: 1.0,
      max: 20.0,
      step: 0.1,
      label: 'Max Block Size (multiplier)'
    },
    blockTimeSpeed: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Time Speed'
    },
    blockTimeOffset: {
      type: 'float',
      default: 0.0,
      min: -100.0,
      max: 100.0,
      step: 0.05,
      label: 'Time Offset'
    },
    blockSeed: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1000.0,
      step: 0.1,
      label: 'Block Seed'
    }
  },
  
  parameterGroups: [
    {
      id: 'block-main',
      label: 'Block Displacement',
      parameters: ['blockDirection', 'blockCount', 'blockMaxOffsetX', 'blockMaxOffsetY', 'blockMinSize', 'blockMaxSize', 'blockSeed'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'block-animation',
      label: 'Animation',
      parameters: ['blockTimeSpeed', 'blockTimeOffset'],
      collapsible: true,
      defaultCollapsed: true
    }
  ]
};
