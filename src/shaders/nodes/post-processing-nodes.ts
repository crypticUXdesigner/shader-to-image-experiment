import type { NodeSpec } from '../../types';

/**
 * Post-Processing Nodes
 * These nodes process final color output (vec4 → vec4 or vec3 → vec3)
 */

export const glowBloomNodeSpec: NodeSpec = {
  id: 'glow-bloom',
  category: 'Effects',
  displayName: 'Glow Bloom',
  description: 'Applies glow/bloom effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    intensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    radius: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },
    threshold: {
      type: 'float',
      default: 0.8,
      min: 0.0,
      max: 1.0,
      step: 0.01
    }
  },
  functions: `
    float glowEffect(float value, float threshold, float intensity) {
      float bright = max(0.0, value - threshold);
      return bright * intensity;
    }
  `,
  mainCode: `
    vec4 color = $input.in;
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float glow = glowEffect(luminance, $param.threshold, $param.intensity);
    color.rgb += glow * $param.radius;
    $output.out = clamp(color, 0.0, 1.0);
  `
};

export const blurNodeSpec: NodeSpec = {
  id: 'blur',
  category: 'Effects',
  displayName: 'Blur',
  description: 'Applies blur effect (simplified - full blur requires multi-pass)',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    radius: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    samples: {
      type: 'int',
      default: 8,
      min: 4,
      max: 32
    }
  },
  mainCode: `
    // Simplified blur - full implementation requires texture sampling
    // This is a placeholder that softens the image
    vec4 color = $input.in;
    float amount = $param.radius * 0.1;
    color.rgb = mix(color.rgb, vec3(0.5), amount);
    $output.out = color;
  `
};

export const edgeDetectionNodeSpec: NodeSpec = {
  id: 'edge-detection',
  category: 'Effects',
  displayName: 'Edge Detection',
  description: 'Detects edges in image',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    threshold: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    intensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01
    }
  },
  mainCode: `
    // Simplified edge detection - full implementation requires texture sampling
    vec4 color = $input.in;
    float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    float edge = step($param.threshold, luminance) * $param.intensity;
    $output.out = vec4(vec3(edge), color.a);
  `
};

export const chromaticAberrationNodeSpec: NodeSpec = {
  id: 'chromatic-aberration',
  category: 'Effects',
  displayName: 'Chromatic Aberration',
  description: 'Applies chromatic aberration effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    strength: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    direction: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 6.28,
      step: 0.05
    }
  },
  mainCode: `
    // Simplified chromatic aberration - full implementation requires texture sampling
    vec4 color = $input.in;
    vec2 offset = vec2(cos($param.direction), sin($param.direction)) * $param.strength * 0.01;
    // In a full implementation, we would sample RGB channels with different offsets
    // For now, apply a simple color shift
    color.r += offset.x * $param.strength;
    color.b -= offset.x * $param.strength;
    $output.out = clamp(color, 0.0, 1.0);
  `
};

export const colorGradingNodeSpec: NodeSpec = {
  id: 'color-grading',
  category: 'Effects',
  displayName: 'Color Grading',
  description: 'Applies color grading adjustments',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    exposure: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    contrast: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },
    saturation: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01
    },
    brightness: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01
    }
  },
  mainCode: `
    vec3 color = $input.in.rgb;
    
    // Exposure
    color *= $param.exposure;
    
    // Contrast (center around 0.5)
    color = (color - 0.5) * $param.contrast + 0.5;
    
    // Brightness
    color += $param.brightness;
    
    // Saturation
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, $param.saturation);
    
    $output.out = vec4(clamp(color, 0.0, 1.0), $input.in.a);
  `
};

export const rgbSeparationNodeSpec: NodeSpec = {
  id: 'rgb-separation',
  category: 'Effects',
  displayName: 'RGB Separation',
  description: 'Separates RGB channels with offset',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    offset: {
      type: 'float',
      default: 0.01,
      min: 0.0,
      max: 0.1,
      step: 0.01
    },
    strength: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01
    }
  },
  mainCode: `
    // Simplified RGB separation - full implementation requires texture sampling
    vec4 color = $input.in;
    vec2 offset = vec2($param.offset, 0.0) * $param.strength;
    // In a full implementation, we would sample R, G, B channels with different offsets
    // For now, apply a simple shift
    color.r += offset.x;
    color.b -= offset.x;
    $output.out = clamp(color, 0.0, 1.0);
  `
};

export const scanlinesNodeSpec: NodeSpec = {
  id: 'scanlines',
  category: 'Effects',
  displayName: 'Scanlines',
  description: 'Applies scanline effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    frequency: {
      type: 'float',
      default: 100.0,
      min: 1.0,
      max: 500.0,
      step: 1.0
    },
    intensity: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 1.0,
      step: 0.01
    }
  },
  mainCode: `
    vec4 color = $input.in;
    // Note: This requires fragCoord input - simplified version for now
    // Full implementation would need fragCoord as input port
    vec2 uv = vec2(0.5, 0.5); // Placeholder - should use fragCoord / resolution
    float scanline = sin(uv.y * $param.frequency * 3.14159) * 0.5 + 0.5;
    scanline = 1.0 - scanline * $param.intensity;
    color.rgb *= scanline;
    $output.out = color;
  `
};

export const blockEdgeBrightnessNodeSpec: NodeSpec = {
  id: 'block-edge-brightness',
  category: 'Effects',
  displayName: 'Block Edge Brightness',
  description: 'Variable-size block edge brightness effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    direction: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1
    },
    blockCount: {
      type: 'float',
      default: 10.0,
      min: 2.0,
      max: 100.0,
      step: 1.0
    },
    brightness: {
      type: 'float',
      default: 1.5,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    width: {
      type: 'float',
      default: 0.1,
      min: 0.01,
      max: 0.5,
      step: 0.01
    }
  },
  mainCode: `
    vec4 color = $input.in;
    // Note: This requires fragCoord input - simplified version for now
    vec2 uv = vec2(0.5, 0.5); // Placeholder - should use fragCoord / resolution
    float coord = ($param.direction == 0) ? uv.x : uv.y;
    float blockSize = 1.0 / $param.blockCount;
    float blockIndex = floor(coord / blockSize);
    float localCoord = mod(coord, blockSize) / blockSize;
    
    // Detect edges
    float edge = step(1.0 - $param.width, localCoord) + step(localCoord, $param.width);
    color.rgb *= (1.0 + edge * ($param.brightness - 1.0));
    $output.out = clamp(color, 0.0, 1.0);
  `
};

export const blockColorGlitchNodeSpec: NodeSpec = {
  id: 'block-color-glitch',
  category: 'Effects',
  displayName: 'Block Color Glitch',
  description: 'Variable-size block color glitch effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    direction: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1
    },
    blockCount: {
      type: 'float',
      default: 10.0,
      min: 2.0,
      max: 100.0,
      step: 1.0
    },
    hueShift: {
      type: 'float',
      default: 0.3,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    saturation: {
      type: 'float',
      default: 1.5,
      min: 0.0,
      max: 3.0,
      step: 0.01
    }
  },
  mainCode: `
    vec4 color = $input.in;
    // Note: This requires fragCoord input - simplified version for now
    vec2 uv = vec2(0.5, 0.5); // Placeholder - should use fragCoord / resolution
    float coord = ($param.direction == 0) ? uv.x : uv.y;
    float blockSize = 1.0 / $param.blockCount;
    float blockIndex = floor(coord / blockSize);
    
    // Apply hue shift based on block index
    float hue = mod(blockIndex * $param.hueShift, 1.0);
    vec3 hsv = rgbToHsv(color.rgb);
    hsv.x = mod(hsv.x + hue, 1.0);
    hsv.y *= $param.saturation;
    color.rgb = hsvToRgb(hsv);
    $output.out = clamp(color, 0.0, 1.0);
  `,
  functions: `
    vec3 rgbToHsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }
    
    vec3 hsvToRgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }
  `
};

export const normalMappingNodeSpec: NodeSpec = {
  id: 'normal-mapping',
  category: 'Effects',
  displayName: 'Normal Mapping',
  description: 'Applies normal mapping effect',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    strength: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    scale: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01
    }
  },
  mainCode: `
    // Simplified normal mapping - full implementation requires texture sampling
    vec4 color = $input.in;
    // Note: This requires fragCoord input - simplified version for now
    vec2 uv = vec2(0.5, 0.5); // Placeholder - should use fragCoord / resolution
    vec2 gradient = vec2(
      sin(uv.x * $param.scale * 10.0),
      sin(uv.y * $param.scale * 10.0)
    ) * $param.strength * 0.1;
    color.rgb += gradient.xyx;
    $output.out = clamp(color, 0.0, 1.0);
  `
};

export const lightingShadingNodeSpec: NodeSpec = {
  id: 'lighting-shading',
  category: 'Effects',
  displayName: 'Lighting Shading',
  description: 'Applies lighting and shading',
  inputs: [
    { name: 'in', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    lightDirectionX: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01
    },
    lightDirectionY: {
      type: 'float',
      default: 0.5,
      min: -1.0,
      max: 1.0,
      step: 0.01
    },
    lightIntensity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01
    },
    ambient: {
      type: 'float',
      default: 0.2,
      min: 0.0,
      max: 1.0,
      step: 0.01
    }
  },
  mainCode: `
    vec4 color = $input.in;
    // Note: This requires fragCoord input - simplified version for now
    vec2 uv = vec2(0.5, 0.5); // Placeholder - should use fragCoord / resolution
    vec2 lightDir = normalize(vec2($param.lightDirectionX, $param.lightDirectionY));
    
    // Simple gradient-based lighting
    vec2 normal = normalize(vec2(uv.x - 0.5, uv.y - 0.5));
    float light = dot(normal, lightDir) * $param.lightIntensity + $param.ambient;
    color.rgb *= light;
    $output.out = clamp(color, 0.0, 1.0);
  `
};
