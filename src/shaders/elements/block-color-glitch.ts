import type { VisualElement } from '../../types';

export const blockColorGlitchElement: VisualElement = {
  id: 'block-color-glitch',
  displayName: 'Block Color Glitch',
  description: 'Applies color-based visual glitches using block structure. Works in pre-color-mapping (modifies result value) or post-color-mapping (modifies RGB colors) modes.',
  category: 'Glitch',
  elementType: 'post-processor',
  postColorMapping: false, // Default to pre-color-mapping, but can be changed via parameter
  order: 96,
  
  uniforms: [
    // Block parameters (auto-synced from block-displacement, but declared here)
    'uniform int uBlockGlitchDirection;',
    'uniform float uBlockGlitchCount;',
    'uniform float uBlockGlitchMinSize;',
    'uniform float uBlockGlitchMaxSize;',
    'uniform float uBlockGlitchSeed;',
    // Mode and effect selection
    'uniform int uBlockGlitchMode;', // 0 = pre-color-mapping, 1 = post-color-mapping
    'uniform int uBlockGlitchEffect;', // 0-7: Invert, Brightness Shift, Threshold Offset, RGB Separation, Hue Rotation, Saturation Shift, Color Tint, Noise
    // Effect parameters
    'uniform float uBlockGlitchIntensity;', // Overall effect strength (0.0-1.0)
    'uniform float uBlockGlitchAmount;', // Effect-specific amount
    'uniform int uBlockGlitchBlockSelection;', // 0 = all, 1 = small only, 2 = large only
    'uniform float uBlockGlitchSelectionThreshold;', // Size threshold for selection
    'uniform float uBlockGlitchTintR;', // Tint color red (for Color Tint effect)
    'uniform float uBlockGlitchTintG;', // Tint color green
    'uniform float uBlockGlitchTintB;', // Tint color blue
    'uniform float uBlockGlitchNoiseIntensity;', // Noise amount (for Noise Injection)
  ],
  
  functions: `
// RGB to HSV conversion
vec3 rgbToHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB conversion
vec3 hsvToRgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Determine if a block should be affected based on selection mode
bool shouldAffectBlock(float blockIndex, float blockSize, int selectionMode, 
                       float minSize, float maxSize, float threshold) {
  if (selectionMode == 0) return true; // All blocks
  
  float normalizedSize = (blockSize - minSize) / max(maxSize - minSize, 0.001);
  
  if (selectionMode == 1) {
    // Small blocks only
    return normalizedSize < threshold;
  } else {
    // Large blocks only
    return normalizedSize > threshold;
  }
}

// Hash function for block calculation (duplicated from base for use in element functions)
float hashBlockGlitch(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2DBlockGlitch(vec2 p) {
  return hashBlockGlitch(dot(p, vec2(12.9898, 78.233)));
}

// Calculate effect amount for a block
float calculateEffectAmount(float blockIndex, float blockSize, float minSize, float maxSize) {
  // Use hash to determine per-block effect strength (0-1 range)
  float hash = hash2DBlockGlitch(vec2(blockIndex, 5.0));
  
  // Can be based on block size (inverse relationship like offset)
  float normalizedSize = (blockSize - minSize) / max(maxSize - minSize, 0.001);
  float sizeFactor = 1.0 - normalizedSize; // Small blocks get more effect
  
  // Return hash value (0-1) - this determines which blocks are affected and by how much
  // Using just hash gives more consistent effect, sizeFactor can make it vary by block size
  return hash; // Simple: all blocks have equal chance of being affected
}
`,
  
  mainCode: `
  // Pre-color-mapping mode: modify result value
  // Only execute if mode is 0 (pre-color-mapping)
  if (uBlockGlitchMode == 0) {
    // Calculate block info using shared function
    float blockIndex, blockSize, localPos;
    getBlockInfo(originalP, uBlockGlitchDirection, uBlockGlitchCount, 
                 uBlockGlitchMinSize, uBlockGlitchMaxSize, uBlockGlitchSeed,
                 blockIndex, blockSize, localPos);
    
    // Determine if this block should be affected
    bool shouldAffect = shouldAffectBlock(blockIndex, blockSize, uBlockGlitchBlockSelection,
                                          uBlockGlitchMinSize, uBlockGlitchMaxSize, 
                                          uBlockGlitchSelectionThreshold);
    
    if (shouldAffect) {
      float effectAmount = calculateEffectAmount(blockIndex, blockSize, 
                                                 uBlockGlitchMinSize, uBlockGlitchMaxSize);
      
      if (uBlockGlitchEffect == 0) {
        // Invert Blocks - use effectAmount to determine if this block should be inverted
        // effectAmount is 0-1, so we can use it as a probability or threshold
        if (effectAmount > (1.0 - uBlockGlitchIntensity)) {
          result = 1.0 - result;
        }
      } else if (uBlockGlitchEffect == 1) {
        // Brightness Shift - apply shift based on effectAmount
        float shift = effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity;
        result = clamp(result + shift, 0.0, 1.0);
      } else if (uBlockGlitchEffect == 2) {
        // Threshold Offset - shift result value
        float offset = effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity;
        result = clamp(result + offset, 0.0, 1.0);
      } else if (uBlockGlitchEffect == 7) {
        // Noise Injection
        float noise = hash2DBlockGlitch(vec2(blockIndex, 10.0)) * 2.0 - 1.0;
        result = clamp(result + noise * uBlockGlitchNoiseIntensity * uBlockGlitchIntensity, 0.0, 1.0);
      }
    }
  }
`,
  
  postColorCode: `
  // Post-color-mapping mode: modify RGB color
  // Only execute if mode is 1 (post-color-mapping)
  if (uBlockGlitchMode == 1) {
    // Calculate block info using shared function (using originalP)
    float blockIndex, blockSize, localPos;
    getBlockInfo(originalP, uBlockGlitchDirection, uBlockGlitchCount, 
                 uBlockGlitchMinSize, uBlockGlitchMaxSize, uBlockGlitchSeed,
                 blockIndex, blockSize, localPos);
    
    // Determine if this block should be affected
    bool shouldAffect = shouldAffectBlock(blockIndex, blockSize, uBlockGlitchBlockSelection,
                                          uBlockGlitchMinSize, uBlockGlitchMaxSize, 
                                          uBlockGlitchSelectionThreshold);
    
    if (shouldAffect) {
      float effectAmount = calculateEffectAmount(blockIndex, blockSize, 
                                                 uBlockGlitchMinSize, uBlockGlitchMaxSize);
      
      if (uBlockGlitchEffect == 0) {
        // Invert Color - use effectAmount to determine if this block should be inverted
        if (effectAmount > (1.0 - uBlockGlitchIntensity)) {
          layerColor = vec3(1.0) - layerColor;
        }
      } else if (uBlockGlitchEffect == 1) {
        // Brightness Shift (post-color) - apply shift based on effectAmount
        float shift = effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity;
        layerColor = clamp(layerColor + vec3(shift), 0.0, 1.0);
      } else if (uBlockGlitchEffect == 3) {
        // RGB Channel Separation (approximation)
        vec2 offset = vec2(
          hash2DBlockGlitch(vec2(blockIndex, 11.0)) * 2.0 - 1.0,
          hash2DBlockGlitch(vec2(blockIndex, 12.0)) * 2.0 - 1.0
        ) * uBlockGlitchAmount * uBlockGlitchIntensity;
        layerColor.r = clamp(layerColor.r + offset.x, 0.0, 1.0);
        layerColor.b = clamp(layerColor.b + offset.y, 0.0, 1.0);
      } else if (uBlockGlitchEffect == 4) {
        // Hue Rotation
        vec3 hsv = rgbToHsv(layerColor);
        hsv.x = mod(hsv.x + effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity, 1.0);
        layerColor = hsvToRgb(hsv);
      } else if (uBlockGlitchEffect == 5) {
        // Saturation Shift
        vec3 hsv = rgbToHsv(layerColor);
        hsv.y = clamp(hsv.y * (1.0 + effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity), 0.0, 1.0);
        layerColor = hsvToRgb(hsv);
      } else if (uBlockGlitchEffect == 6) {
        // Color Tint
        vec3 tint = vec3(uBlockGlitchTintR, uBlockGlitchTintG, uBlockGlitchTintB);
        layerColor = mix(layerColor, layerColor * tint, 
                        effectAmount * uBlockGlitchAmount * uBlockGlitchIntensity);
      } else if (uBlockGlitchEffect == 7) {
        // Noise Injection (post-color)
        float noise = hash2DBlockGlitch(vec2(blockIndex, 10.0)) * 2.0 - 1.0;
        layerColor = clamp(layerColor + vec3(noise) * uBlockGlitchNoiseIntensity * uBlockGlitchIntensity, 
                          0.0, 1.0);
      }
    }
  }
`,
  
  parameters: {
    // Block parameters (read-only, auto-synced from block-displacement)
    blockGlitchDirection: {
      type: 'int',
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      label: 'Direction',
      readOnly: true,
    },
    blockGlitchCount: {
      type: 'float',
      default: 10,
      min: 2,
      max: 100,
      step: 1,
      label: 'Block Count',
      readOnly: true,
    },
    blockGlitchMinSize: {
      type: 'float',
      default: 0.1,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      label: 'Min Block Size',
      readOnly: true,
    },
    blockGlitchMaxSize: {
      type: 'float',
      default: 5.0,
      min: 1.0,
      max: 20.0,
      step: 0.1,
      label: 'Max Block Size',
      readOnly: true,
    },
    blockGlitchSeed: {
      type: 'float',
      default: 0,
      min: 0,
      max: 1000,
      step: 1.0,
      label: 'Block Seed',
      readOnly: true,
    },
    // Mode and effect
    blockGlitchMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Mode',
    },
    blockGlitchEffect: {
      type: 'int',
      default: 0,
      min: 0,
      max: 7,
      step: 1,
      label: 'Effect',
    },
    // Effect parameters
    blockGlitchIntensity: {
      type: 'float',
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Intensity',
    },
    blockGlitchAmount: {
      type: 'float',
      default: 0.3,
      min: -1,
      max: 1,
      step: 0.01,
      label: 'Amount',
    },
    blockGlitchBlockSelection: {
      type: 'int',
      default: 0,
      min: 0,
      max: 2,
      step: 1,
      label: 'Block Selection',
    },
    blockGlitchSelectionThreshold: {
      type: 'float',
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Selection Threshold',
    },
    blockGlitchTintR: {
      type: 'float',
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Tint Red',
    },
    blockGlitchTintG: {
      type: 'float',
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Tint Green',
    },
    blockGlitchTintB: {
      type: 'float',
      default: 1.0,
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Tint Blue',
    },
    blockGlitchNoiseIntensity: {
      type: 'float',
      default: 0.1,
      min: 0,
      max: 0.5,
      step: 0.01,
      label: 'Noise Intensity',
    },
  },
  
  parameterGroups: [
    {
      id: 'block-sync',
      label: 'Block Parameters (Synced)',
      parameters: [
        'blockGlitchDirection',
        'blockGlitchCount',
        'blockGlitchMinSize',
        'blockGlitchMaxSize',
        'blockGlitchSeed',
      ],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'mode-effect',
      label: 'Mode & Effect',
      parameters: [
        'blockGlitchMode',
        'blockGlitchEffect',
        'blockGlitchIntensity',
        'blockGlitchAmount',
      ],
      collapsible: false,
      defaultCollapsed: false,
    },
    {
      id: 'block-selection',
      label: 'Block Selection',
      parameters: [
        'blockGlitchBlockSelection',
        'blockGlitchSelectionThreshold',
      ],
      collapsible: true,
      defaultCollapsed: true,
    },
    {
      id: 'effect-specific',
      label: 'Effect-Specific Parameters',
      parameters: [
        'blockGlitchTintR',
        'blockGlitchTintG',
        'blockGlitchTintB',
        'blockGlitchNoiseIntensity',
      ],
      collapsible: true,
      defaultCollapsed: true,
    },
  ],
};
