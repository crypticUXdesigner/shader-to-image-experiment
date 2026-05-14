import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Blending Nodes
 */

/** Photoshop-style scalar blend primitives (shared by Blend Channel and Blend Color). */
export const BLEND_MODE_PHOTOSHOP_FLOAT_GLSL = `
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
      if (mode == 0) return blend; // Normal: blend-side is the layer value; opacity mixes in mainCode
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
  `;

export const blendModeNodeSpec: NodeSpec = {
  id: 'blend-mode',
  category: 'Blend',
  displayName: 'Blend Channel',
  description:
    'Blends two scalar (float) values with Photoshop-style modes—use on luminance or masks, then Color Map for RGB',
  inputs: [
    { name: 'base', type: 'float', label: 'Background' },
    { name: 'blend', type: 'float', label: 'Blend' }
  ],
  outputs: [
    { name: 'out', type: 'float', label: 'Result' }
  ],
  parameters: {
    mode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 11,
      label: 'Mode'
    },
    opacity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity'
    }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['mode', 'opacity'],
        layout: { columns: 2 }
      }
    ]
  },
  functions: BLEND_MODE_PHOTOSHOP_FLOAT_GLSL,
  mainCode: `
    float blended = applyBlendMode($input.base, $input.blend, $param.mode);
    $output.out = mix($input.base, blended, $param.opacity);
  `
};

/** Per-channel blend of two RGBA colors; same mode index order as Blend Channel (float). */
export const blendColorNodeSpec: NodeSpec = {
  id: 'blend-color',
  category: 'Blend',
  displayName: 'Blend Color',
  description:
    'Blends two RGBA colors with the same Photoshop-style modes as Blend Channel, applied per channel; alpha is mixed separately by Opacity',
  inputs: [
    { name: 'base', type: 'vec4', label: 'Background' },
    { name: 'blend', type: 'vec4', label: 'Blend' }
  ],
  outputs: [{ name: 'out', type: 'vec4', label: 'Color' }],
  parameters: {
    mode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 11,
      label: 'Mode'
    },
    opacity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity'
    }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['mode', 'opacity'],
        layout: { columns: 2 }
      }
    ]
  },
  functions: BLEND_MODE_PHOTOSHOP_FLOAT_GLSL,
  mainCode: `
    vec4 baseColor = $input.base;
    vec4 blendLayer = $input.blend;
    vec3 blended = vec3(
      applyBlendMode(baseColor.r, blendLayer.r, $param.mode),
      applyBlendMode(baseColor.g, blendLayer.g, $param.mode),
      applyBlendMode(baseColor.b, blendLayer.b, $param.mode)
    );
    vec3 rgb = mix(baseColor.rgb, blended, $param.opacity);
    float alpha = mix(baseColor.a, blendLayer.a, $param.opacity);
    $output.out = vec4(rgb, alpha);
  `
};
