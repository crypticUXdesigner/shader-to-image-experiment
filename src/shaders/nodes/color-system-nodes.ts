import type { NodeSpec } from '../../types';

/**
 * Color System Nodes
 * OKLCH color space nodes for advanced color mapping
 */

export const oklchColorNodeSpec: NodeSpec = {
  id: 'oklch-color',
  category: 'Inputs',
  displayName: 'OKLCH Color',
  description: 'Defines an OKLCH color value',
  inputs: [],
  outputs: [
    { name: 'out', type: 'vec3' }
  ],
  parameters: {
    l: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    c: {
      type: 'float',
      default: 0.1,
      min: 0.0,
      max: 0.4,
      step: 0.01
    },
    h: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 360.0,
      step: 1.0
    }
  },
  mainCode: `
    $output.out = vec3($param.l, $param.c, $param.h);
  `
};

export const bezierCurveNodeSpec: NodeSpec = {
  id: 'bezier-curve',
  category: 'Inputs',
  displayName: 'Bezier Curve',
  description: 'Defines a cubic bezier curve for color interpolation',
  inputs: [],
  outputs: [
    { name: 'out', type: 'vec4' }
  ],
  parameters: {
    x1: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    y1: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    x2: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    y2: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01
    }
  },
  mainCode: `
    $output.out = vec4($param.x1, $param.y1, $param.x2, $param.y2);
  `
};

export const bayerDitherNodeSpec: NodeSpec = {
  id: 'bayer-dither',
  category: 'Effects',
  displayName: 'Bayer Dither',
  description: 'Applies Bayer dithering to a float value using fragment coordinates',
  inputs: [
    { name: 'in', type: 'float' },
    { name: 'fragCoord', type: 'vec2' },
    { name: 'resolution', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {
    strength: {
      type: 'float',
      default: 0.5,
      min: 0.0,
      max: 10.0,
      step: 0.01
    },
    pixelSize: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.5
    }
  },
  functions: `
    float Bayer2(vec2 a) {
      a = floor(a);
      return fract(a.x / 2. + a.y * a.y * .75);
    }
    
    float Bayer4(vec2 a) {
      return Bayer2(.5*(a))*0.25 + Bayer2(a);
    }
    
    float Bayer8(vec2 a) {
      return Bayer4(.5*(a))*0.25 + Bayer2(a);
    }
  `,
  mainCode: `
    vec2 fragCoordCentered = $input.fragCoord - $input.resolution * 0.5;
    float bayer = (Bayer8(fragCoordCentered / $param.pixelSize) - 0.5) * $param.strength;
    $output.out = clamp($input.in + bayer, 0.0, 1.0);
  `
};

export const oklchColorMapBezierNodeSpec: NodeSpec = {
  id: 'oklch-color-map-bezier',
  category: 'Blend',
  displayName: 'OKLCH Color Map (Bezier Mode)',
  description: 'Converts float value to RGB color using OKLCH color space with cubic bezier curve interpolation',
  inputs: [
    { name: 'in', type: 'float' },
    { name: 'startColor', type: 'vec3' },
    { name: 'endColor', type: 'vec3' },
    { name: 'lCurve', type: 'vec4' },
    { name: 'cCurve', type: 'vec4' },
    { name: 'hCurve', type: 'vec4' }
  ],
  outputs: [
    { name: 'out', type: 'vec3' }
  ],
  parameters: {
    stops: {
      type: 'int',
      default: 10,
      min: 2,
      max: 50
    }
  },
  functions: `
    // OKLCH to RGB conversion
    vec3 oklchToRgb(vec3 oklch) {
      float l = oklch.x;
      float c = oklch.y;
      float h = oklch.z * 3.14159265359 / 180.0;
      
      float a = c * cos(h);
      float b = c * sin(h);
      
      // OKLab to linear RGB
      float l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      float m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      float s_ = l - 0.0894841775 * a - 1.2914855480 * b;
      
      float l3 = l_ * l_ * l_;
      float m3 = m_ * m_ * m_;
      float s3 = s_ * s_ * s_;
      
      float r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      float g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      float bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
      
      return clamp(vec3(r, g, bl), 0.0, 1.0);
    }
    
    // Cubic bezier evaluation
    float cubicBezier(float x, vec4 curve) {
      if (x <= 0.0) return 0.0;
      if (x >= 1.0) return 1.0;
      
      float t0 = 0.0;
      float t1 = 1.0;
      
      for (int i = 0; i < 10; i++) {
        float t = (t0 + t1) * 0.5;
        float u = 1.0 - t;
        float tt = t * t;
        float uu = u * u;
        float xt = 3.0 * uu * t * curve.x + 3.0 * u * tt * curve.z + tt * t;
        if (xt < x) {
          t0 = t;
        } else {
          t1 = t;
        }
      }
      
      float t = (t0 + t1) * 0.5;
      float u = 1.0 - t;
      float tt = t * t;
      float uu = u * u;
      return 3.0 * uu * t * curve.y + 3.0 * u * tt * curve.w + tt * t;
    }
  `,
  mainCode: `
    float value = clamp($input.in, 0.0, 1.0);
    
    // Evaluate bezier curves
    float lT = cubicBezier(value, $input.lCurve);
    float cT = cubicBezier(value, $input.cCurve);
    float hT = cubicBezier(value, $input.hCurve);
    
    // Interpolate L and C normally
    float l = mix($input.startColor.x, $input.endColor.x, lT);
    float c = mix($input.startColor.y, $input.endColor.y, cT);
    
    // Handle circular hue interpolation (always increasing)
    float startH = $input.startColor.z;
    float endH = $input.endColor.z;
    float adjustedEndH = (endH < startH) ? endH + 360.0 : endH;
    float h = mix(startH, adjustedEndH, hT);
    h = mod(h, 360.0);
    if (h < 0.0) h += 360.0;
    
    vec3 oklch = vec3(l, c, h);
    $output.out = oklchToRgb(oklch);
  `
};

export const oklchColorMapThresholdNodeSpec: NodeSpec = {
  id: 'oklch-color-map-threshold',
  category: 'Blend',
  displayName: 'OKLCH Color Map (Threshold Mode)',
  description: 'Converts float value to RGB color using OKLCH color space with threshold-based color stops and optional dithering',
  inputs: [
    { name: 'in', type: 'float' },
    { name: 'startColor', type: 'vec3' },
    { name: 'endColor', type: 'vec3' },
    { name: 'lCurve', type: 'vec4' },
    { name: 'cCurve', type: 'vec4' },
    { name: 'hCurve', type: 'vec4' },
    { name: 'fragCoord', type: 'vec2' },
    { name: 'resolution', type: 'vec2' }
  ],
  outputs: [
    { name: 'out', type: 'vec3' }
  ],
  parameters: {
    stops: {
      type: 'int',
      default: 6,
      min: 2,
      max: 50
    },
    transitionWidth: {
      type: 'float',
      default: 0.005,
      min: 0.0,
      max: 0.5,
      step: 0.01
    },
    ditherStrength: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 10.0,
      step: 0.01
    },
    pixelSize: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.5
    }
  },
  functions: `
    // OKLCH to RGB conversion
    vec3 oklchToRgb(vec3 oklch) {
      float l = oklch.x;
      float c = oklch.y;
      float h = oklch.z * 3.14159265359 / 180.0;
      
      float a = c * cos(h);
      float b = c * sin(h);
      
      // OKLab to linear RGB
      float l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      float m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      float s_ = l - 0.0894841775 * a - 1.2914855480 * b;
      
      float l3 = l_ * l_ * l_;
      float m3 = m_ * m_ * m_;
      float s3 = s_ * s_ * s_;
      
      float r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
      float g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
      float bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
      
      return clamp(vec3(r, g, bl), 0.0, 1.0);
    }
    
    // Cubic bezier evaluation (same as bezier mode)
    float cubicBezier(float x, vec4 curve) {
      if (x <= 0.0) return 0.0;
      if (x >= 1.0) return 1.0;
      
      float t0 = 0.0;
      float t1 = 1.0;
      
      for (int i = 0; i < 10; i++) {
        float t = (t0 + t1) * 0.5;
        float u = 1.0 - t;
        float tt = t * t;
        float uu = u * u;
        float xt = 3.0 * uu * t * curve.x + 3.0 * u * tt * curve.z + tt * t;
        if (xt < x) {
          t0 = t;
        } else {
          t1 = t;
        }
      }
      
      float t = (t0 + t1) * 0.5;
      float u = 1.0 - t;
      float tt = t * t;
      float uu = u * u;
      return 3.0 * uu * t * curve.y + 3.0 * u * tt * curve.w + tt * t;
    }
    
    // Interpolate hue with circular wrapping
    float interpolateHue(float startH, float endH, float t) {
      float adjustedEndH = (endH < startH) ? endH + 360.0 : endH;
      float h = mix(startH, adjustedEndH, t);
      h = mod(h, 360.0);
      if (h < 0.0) h += 360.0;
      return h;
    }
    
    // Generate color stop at position t (0-1) from start to end
    vec3 generateColorStop(float t, vec3 startColor, vec3 endColor, vec4 lCurve, vec4 cCurve, vec4 hCurve) {
      // Evaluate bezier curves
      float lT = cubicBezier(t, lCurve);
      float cT = cubicBezier(t, cCurve);
      float hT = cubicBezier(t, hCurve);
      
      // Interpolate L and C
      float l = mix(startColor.x, endColor.x, lT);
      float c = mix(startColor.y, endColor.y, cT);
      
      // Interpolate hue with circular wrapping
      float h = interpolateHue(startColor.z, endColor.z, hT);
      
      return vec3(l, c, h);
    }
    
    // Bayer8 dithering
    float Bayer2(vec2 a) {
      a = floor(a);
      return fract(a.x / 2. + a.y * a.y * .75);
    }
    
    float Bayer4(vec2 a) {
      return Bayer2(.5*(a))*0.25 + Bayer2(a);
    }
    
    float Bayer8(vec2 a) {
      return Bayer4(.5*(a))*0.25 + Bayer2(a);
    }
  `,
  mainCode: `
    float value = clamp($input.in, 0.0, 1.0);
    int stops = $param.stops;
    
    // Calculate Bayer dither value if dithering is enabled
    float bayer = 0.0;
    if ($param.ditherStrength > 0.001) {
      vec2 fragCoordCentered = $input.fragCoord - $input.resolution * 0.5;
      bayer = (Bayer8(fragCoordCentered / $param.pixelSize) - 0.5) * $param.ditherStrength;
    }
    
    float transWidth = $param.transitionWidth > 0.0 ? $param.transitionWidth : 0.005;
    
    // Apply dithering to the value
    float ditheredValue = clamp(value + bayer, 0.0, 1.0);
    
    // Map value to color index: 0.0 -> 0 (darkest/startColor), 1.0 -> stops-1 (brightest/endColor)
    float stopT = ditheredValue; // t value for color stop generation (0 = start, 1 = end)
    
    // For threshold mode, we need to find which two stops to blend between
    // Generate the two color stops on-the-fly
    float colorIndex = stopT * float(stops - 1);
    int lowerIndex = int(floor(colorIndex));
    int upperIndex = min(lowerIndex + 1, stops - 1);
    
    lowerIndex = clamp(lowerIndex, 0, stops - 1);
    upperIndex = clamp(upperIndex, 0, stops - 1);
    
    // Calculate t values for the two stops
    float lowerT = float(lowerIndex) / float(stops - 1);
    float upperT = float(upperIndex) / float(stops - 1);
    
    // Generate the two color stops
    vec3 oklch1 = generateColorStop(lowerT, $input.startColor, $input.endColor, $input.lCurve, $input.cCurve, $input.hCurve);
    vec3 oklch2 = generateColorStop(upperT, $input.startColor, $input.endColor, $input.lCurve, $input.cCurve, $input.hCurve);
    
    // Calculate blend factor
    float blendFactor = fract(colorIndex);
    
    if (lowerIndex < stops - 1) {
      float threshold = float(lowerIndex + 1) / float(stops);
      threshold += bayer * 0.05;
      threshold = clamp(threshold, 0.0, 1.0);
      float smoothBlend = smoothstep(threshold - transWidth, threshold + transWidth, ditheredValue);
      blendFactor = smoothBlend;
    } else {
      blendFactor = 0.0;
    }
    
    // Convert OKLCH to RGB and mix
    vec3 color1 = oklchToRgb(oklch1);
    vec3 color2 = oklchToRgb(oklch2);
    $output.out = mix(color1, color2, blendFactor);
  `
};

export const toneMappingNodeSpec: NodeSpec = {
  id: 'tone-mapping',
  category: 'Effects',
  displayName: 'Tone Mapping',
  description: 'Applies tone mapping adjustments (exposure, contrast, saturation) to color',
  inputs: [
    { name: 'in', type: 'vec3' }
  ],
  outputs: [
    { name: 'out', type: 'vec3' }
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
    }
  },
  mainCode: `
    vec3 color = $input.in;
    
    // Exposure (brightness)
    color *= $param.exposure;
    
    // Contrast (center around 0.5)
    color = (color - 0.5) * $param.contrast + 0.5;
    
    // Saturation (desaturate by mixing with luminance)
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luminance), color, $param.saturation);
    
    // Clamp to valid range
    $output.out = clamp(color, 0.0, 1.0);
  `
};
