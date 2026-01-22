import type { NodeSpec } from '../../types';

/**
 * Blending Nodes
 */

export const blendModeNodeSpec: NodeSpec = {
  id: 'blend-mode',
  category: 'Blend',
  displayName: 'Blend Mode',
  description: 'Applies blending mode between two values',
  inputs: [
    { name: 'base', type: 'float' },
    { name: 'blend', type: 'float' },
    { name: 'opacity', type: 'float' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {
    mode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 11
    }
  },
  functions: `
    float blendMultiply(float base, float blend) {
      return base * blend;
    }
    
    float blendScreen(float base, float blend) {
      return 1.0 - (1.0 - base) * (1.0 - blend);
    }
    
    float blendOverlay(float base, float blend) {
      return base < 0.5 
        ? 2.0 * base * blend 
        : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    }
    
    float blendSoftLight(float base, float blend) {
      return (blend < 0.5) 
        ? base - (1.0 - 2.0 * blend) * base * (1.0 - base)
        : base + (2.0 * blend - 1.0) * (sqrt(base) - base);
    }
    
    float blendHardLight(float base, float blend) {
      return blend < 0.5 
        ? 2.0 * base * blend 
        : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    }
    
    float blendColorDodge(float base, float blend) {
      return base / (1.0 - blend + 0.001);
    }
    
    float blendColorBurn(float base, float blend) {
      return 1.0 - (1.0 - base) / (blend + 0.001);
    }
    
    float blendLinearDodge(float base, float blend) {
      return min(base + blend, 1.0);
    }
    
    float blendLinearBurn(float base, float blend) {
      return max(base + blend - 1.0, 0.0);
    }
    
    float blendDifference(float base, float blend) {
      return abs(base - blend);
    }
    
    float blendExclusion(float base, float blend) {
      return base + blend - 2.0 * base * blend;
    }
    
    float applyBlendMode(float base, float blend, int mode) {
      if (mode == 0) return base; // Normal (no blend, handled separately)
      else if (mode == 1) return blendMultiply(base, blend);
      else if (mode == 2) return blendScreen(base, blend);
      else if (mode == 3) return blendOverlay(base, blend);
      else if (mode == 4) return blendSoftLight(base, blend);
      else if (mode == 5) return blendHardLight(base, blend);
      else if (mode == 6) return blendColorDodge(base, blend);
      else if (mode == 7) return blendColorBurn(base, blend);
      else if (mode == 8) return blendLinearDodge(base, blend);
      else if (mode == 9) return blendLinearBurn(base, blend);
      else if (mode == 10) return blendDifference(base, blend);
      else if (mode == 11) return blendExclusion(base, blend);
      else return base;
    }
  `,
  mainCode: `
    float blended = applyBlendMode($input.base, $input.blend, $param.mode);
    $output.out = mix($input.base, blended, $input.opacity);
  `
};
