export const baseVertexShader = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const baseFragmentShaderTemplate = `#version 300 es
precision highp float;

// Shared uniform (same for both layers)
uniform vec2 uResolution;

// Layer-specific uniforms
uniform float uLayer1Time;
uniform float uLayer1PixelSize;
uniform float uLayer1DitherStrength;

uniform float uLayer2Time;
uniform float uLayer2PixelSize;
uniform float uLayer2DitherStrength;

out vec4 fragColor;

// Per-layer color system uniforms
// Layer 1 colors
uniform int uLayer1ColorMode;  // 0 = bezier, 1 = thresholds
uniform vec3 uLayer1ColorStart;
uniform vec3 uLayer1ColorEnd;
uniform int uLayer1ColorStops;
uniform vec4 uLayer1ColorLCurve;
uniform vec4 uLayer1ColorCCurve;
uniform vec4 uLayer1ColorHCurve;
uniform float uLayer1TransitionWidth;
uniform vec3 uLayer1ColorStopsArray[50];
uniform float uLayer1ToneExposure;
uniform float uLayer1ToneContrast;
uniform float uLayer1ToneSaturation;

// Layer 2 colors
uniform int uLayer2ColorMode;
uniform vec3 uLayer2ColorStart;
uniform vec3 uLayer2ColorEnd;
uniform int uLayer2ColorStops;
uniform vec4 uLayer2ColorLCurve;
uniform vec4 uLayer2ColorCCurve;
uniform vec4 uLayer2ColorHCurve;
uniform float uLayer2TransitionWidth;
uniform vec3 uLayer2ColorStopsArray[50];
uniform float uLayer2ToneExposure;
uniform float uLayer2ToneContrast;
uniform float uLayer2ToneSaturation;

{{UNIFORMS}}

{{FUNCTIONS}}

// Bayer dithering functions (always available for threshold mode)
// Bayer2 - 2x2 Bayer matrix dithering
float Bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2. + a.y * a.y * .75);
}

// Bayer4 - 4x4 Bayer matrix dithering
float Bayer4(vec2 a) {
    return Bayer2(.5*(a))*0.25 + Bayer2(a);
}

// Bayer8 - 8x8 Bayer matrix dithering (reference implementation)
float Bayer8(vec2 a) {
    return Bayer4(.5*(a))*0.25 + Bayer2(a);
}

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
  
  // Clamp to valid range
  return clamp(vec3(r, g, bl), 0.0, 1.0);
}

// Cubic bezier evaluation - uses all 4 parameters (x1, y1, x2, y2)
// Input: x (0-1) - the input value to remap through the curve
// Curve: vec4(x1, y1, x2, y2)
// Returns: y value at the point where x(t) = x
float cubicBezier(float x, vec4 curve) {
  // Handle edge cases
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  
  // Binary search to find t where x(t) = x
  float t0 = 0.0;
  float t1 = 1.0;
  
  // Binary search with 10 iterations for good precision
  for (int i = 0; i < 10; i++) {
    float t = (t0 + t1) * 0.5;
    float u = 1.0 - t;
    float tt = t * t;
    float uu = u * u;
    
    // Evaluate x(t) = 3*(1-t)²*t*x1 + 3*(1-t)*t²*x2 + t³
    float xt = 3.0 * uu * t * curve.x + 3.0 * u * tt * curve.z + tt * t;
    
    if (xt < x) {
      t0 = t;
    } else {
      t1 = t;
    }
  }
  
  // Use final t value to compute y(t)
  float t = (t0 + t1) * 0.5;
  float u = 1.0 - t;
  float tt = t * t;
  float uu = u * u;
  
  // Evaluate y(t) = 3*(1-t)²*t*y1 + 3*(1-t)*t²*y2 + t³
  return 3.0 * uu * t * curve.y + 3.0 * u * tt * curve.w + tt * t;
}

// Tone mapping function (per-layer version)
vec3 applyToneMappingLayer(vec3 color, float exposure, float contrast, float saturation) {
  // Exposure (brightness)
  color *= exposure;
  
  // Contrast (center around 0.5)
  color = (color - 0.5) * contrast + 0.5;
  
  // Saturation (desaturate by mixing with luminance)
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luminance), color, saturation);
  
  // Clamp to valid range
  return clamp(color, 0.0, 1.0);
}

// Blending mode functions (always available for layer compositing)
// Blend mode helpers (consistent mode indexing for procedural blend nodes)
// Mode 0 = Normal, 1 = Multiply, 2 = Screen, etc.
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
  if (mode == 0) return blend; // Normal: blend-side is the layer value; opacity mixes at call site
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

// Hash functions for block calculation (shared by block-displacement and block-color-glitch)
float hashBlock(float n) {
  return fract(sin(n) * 43758.5453);
}

float hash2DBlock(vec2 p) {
  return hashBlock(dot(p, vec2(12.9898, 78.233)));
}

// Block calculation function - shared by block-displacement and block-color-glitch
// Calculates which variable-sized block contains a position
// Returns: blockIndex, blockSize, localPosInBlock (0-1 within block)
void getBlockInfo(vec2 p, int direction, float blockCount, float minSize, float maxSize, float seed, 
                  out float blockIndex, out float blockSize, out float localPosInBlock) {
  blockIndex = 0.0;
  blockSize = 1.0;
  localPosInBlock = 0.0;
  
  if (direction == 0) {
    // Horizontal blocks: find which variable-width block contains this X position
    float baseX = p.x + 1.0; // Convert to 0-2 range
    float cumulativeSize = 0.0;
    float totalSize = 0.0;
    
    // First pass: calculate total size
    for (int i = 0; i < 100; i++) {
      if (float(i) >= blockCount) break;
      float hash = hash2DBlock(vec2(float(i), seed));
      float size = mix(minSize, maxSize, hash);
      totalSize += size;
    }
    
    // Second pass: find which block contains this X position
    float normalizedX = baseX / 2.0; // 0 to 1 range
    float targetPos = normalizedX * totalSize; // Position in size units
    
    cumulativeSize = 0.0;
    for (int i = 0; i < 100; i++) {
      if (float(i) >= blockCount) break;
      float hash = hash2DBlock(vec2(float(i), seed));
      float size = mix(minSize, maxSize, hash);
      
      if (targetPos < cumulativeSize + size) {
        // This pixel is in block i
        blockIndex = float(i);
        blockSize = size;
        localPosInBlock = (targetPos - cumulativeSize) / size; // 0 to 1 within block
        break;
      }
      cumulativeSize += size;
    }
    
    // Clamp to valid range
    blockIndex = clamp(blockIndex, 0.0, blockCount - 1.0);
    
  } else {
    // Vertical blocks: find which variable-height block contains this Y position
    float baseY = p.y + 1.0; // Convert to 0-2 range
    float cumulativeSize = 0.0;
    float totalSize = 0.0;
    
    // First pass: calculate total size
    for (int i = 0; i < 100; i++) {
      if (float(i) >= blockCount) break;
      float hash = hash2DBlock(vec2(seed, float(i)));
      float size = mix(minSize, maxSize, hash);
      totalSize += size;
    }
    
    // Second pass: find which block contains this Y position
    float normalizedY = baseY / 2.0; // 0 to 1 range
    float targetPos = normalizedY * totalSize; // Position in size units
    
    cumulativeSize = 0.0;
    for (int i = 0; i < 100; i++) {
      if (float(i) >= blockCount) break;
      float hash = hash2DBlock(vec2(seed, float(i)));
      float size = mix(minSize, maxSize, hash);
      
      if (targetPos < cumulativeSize + size) {
        // This pixel is in block i
        blockIndex = float(i);
        blockSize = size;
        localPosInBlock = (targetPos - cumulativeSize) / size; // 0 to 1 within block
        break;
      }
      cumulativeSize += size;
    }
    
    // Clamp to valid range
    blockIndex = clamp(blockIndex, 0.0, blockCount - 1.0);
  }
}

// Color compositing function (works with vec3 colors)
// Reuses blending functions from above
vec3 compositeLayerColors(
  vec3 layer1Color, vec3 layer2Color,
  int blend1, float opacity1, int visible1,
  int blend2, float opacity2, int visible2
) {
  // If both layers hidden, return black
  if (visible1 == 0 && visible2 == 0) {
    return vec3(0.0);
  }
  
  // Apply opacity to each layer
  vec3 c1 = layer1Color * opacity1;
  vec3 c2 = layer2Color * opacity2;
  
  // If only one layer visible, return it
  if (visible1 == 0) return c2;
  if (visible2 == 0) return c1;
  
  // Composite: layer2 over layer1
  // For Normal mode (blend2 == 0), use standard alpha compositing
  if (blend2 == 0) {
    return c2 + c1 * (1.0 - opacity2);
  }
  
  // For other blend modes, blend layer2 over layer1 per channel, then apply opacity
  vec3 blended = vec3(
    applyBlendMode(c1.r, c2.r, blend2),
    applyBlendMode(c1.g, c2.g, blend2),
    applyBlendMode(c1.b, c2.b, blend2)
  );
  return blended * opacity2 + c1 * (1.0 - opacity2);
}

// Per-layer color mapping - supports both bezier and threshold modes
vec3 mapColorLayer(float value, int layerNum) {
  value = clamp(value, 0.0, 1.0);
  
  vec3 oklch;
  
  if (layerNum == 1) {
    // Layer 1 color mapping
    if (uLayer1ColorMode == 0) {
      // Bezier mode: evaluate curves and interpolate
      float lT = cubicBezier(value, uLayer1ColorLCurve);
      float cT = cubicBezier(value, uLayer1ColorCCurve);
      float hT = cubicBezier(value, uLayer1ColorHCurve);
      
      // Interpolate L and C normally
      float l = mix(uLayer1ColorStart.x, uLayer1ColorEnd.x, lT);
      float c = mix(uLayer1ColorStart.y, uLayer1ColorEnd.y, cT);
      
      // Handle circular hue interpolation - always go "up" (increasing direction)
      float startH = uLayer1ColorStart.z;
      float endH = uLayer1ColorEnd.z;
      
      // To always go "up" (increasing), ensure endH > startH
      // If endH < startH, add 360 to endH to make it go the long way around (always increasing)
      float adjustedEndH = endH;
      if (endH < startH) {
        adjustedEndH = endH + 360.0;
      }
      
      // Interpolate hue (now always in increasing direction: startH -> adjustedEndH)
      float h = mix(startH, adjustedEndH, hT);
      
      // Normalize hue back to 0-360 range using mod
      // mod handles negative values correctly, but we ensure h is positive here
      h = mod(h, 360.0);
      
      // Ensure result is in [0, 360) range (mod should already do this, but be explicit)
      if (h < 0.0) {
        h += 360.0;
      }
      
      oklch = vec3(l, c, h);
    } else {
      // Threshold mode: use stops as colors with threshold-based mapping
      int stops = uLayer1ColorStops;
      if (stops <= 1) {
        oklch = uLayer1ColorStopsArray[0];
      } else {
        // Calculate Bayer dither value if dithering is enabled
        float bayer = 0.0;
        if (uLayer1DitherStrength > 0.001) {
          vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5;
          bayer = (Bayer8(fragCoordCentered / uLayer1PixelSize) - 0.5) * uLayer1DitherStrength;
        }
        
        float transWidth = uLayer1TransitionWidth > 0.0 ? uLayer1TransitionWidth : 0.005;
        
        // Dynamic threshold mode: properly distribute weights across all color stops
        // For N stops, we divide the 0-1 range into N regions
        // High values map to bright colors (index 0), low values to dark colors (index stops-1)
        
        // Apply dithering to the value
        float ditheredValue = clamp(value + bayer, 0.0, 1.0);
        
        // Find which two color stops to blend between
        // Map value to color index: 1.0 -> 0 (brightest), 0.0 -> stops-1 (darkest)
        float normalizedValue = 1.0 - ditheredValue; // Invert so high values map to low indices
        float colorIndex = normalizedValue * float(stops - 1);
        int lowerIndex = int(floor(colorIndex));
        int upperIndex = min(lowerIndex + 1, stops - 1);
        
        // Clamp indices to valid range
        lowerIndex = clamp(lowerIndex, 0, stops - 1);
        upperIndex = clamp(upperIndex, 0, stops - 1);
        
        // Calculate blend factor between the two colors
        float blendFactor = fract(colorIndex);
        
        // If we're at the exact boundary or beyond, use smoothstep for smooth transitions
        if (lowerIndex < stops - 1) {
          // Calculate threshold between lowerIndex and upperIndex
          float threshold = 1.0 - float(lowerIndex + 1) / float(stops);
          threshold += bayer * 0.05; // Apply dithering
          threshold = clamp(threshold, 0.0, 1.0);
          
          // Use smoothstep to create smooth transition at threshold
          float smoothBlend = smoothstep(threshold - transWidth, threshold + transWidth, ditheredValue);
          blendFactor = smoothBlend;
        } else {
          // At the darkest color, no blending needed
          blendFactor = 0.0;
        }
        
        // Get the two colors to blend
        vec3 color1 = oklchToRgb(uLayer1ColorStopsArray[lowerIndex]);
        vec3 color2 = oklchToRgb(uLayer1ColorStopsArray[upperIndex]);
        
        // Mix the two colors
        vec3 color = mix(color1, color2, blendFactor);
        
        return color;
      }
    }
  } else {
    // Layer 2 color mapping
    if (uLayer2ColorMode == 0) {
      // Bezier mode: evaluate curves and interpolate
      float lT = cubicBezier(value, uLayer2ColorLCurve);
      float cT = cubicBezier(value, uLayer2ColorCCurve);
      float hT = cubicBezier(value, uLayer2ColorHCurve);
      
      // Interpolate L and C normally
      float l = mix(uLayer2ColorStart.x, uLayer2ColorEnd.x, lT);
      float c = mix(uLayer2ColorStart.y, uLayer2ColorEnd.y, cT);
      
      // Handle circular hue interpolation - always go "up" (increasing direction)
      float startH = uLayer2ColorStart.z;
      float endH = uLayer2ColorEnd.z;
      
      // To always go "up" (increasing), ensure endH > startH
      float adjustedEndH = endH;
      if (endH < startH) {
        adjustedEndH = endH + 360.0;
      }
      
      // Interpolate hue (now always in increasing direction: startH -> adjustedEndH)
      float h = mix(startH, adjustedEndH, hT);
      
      // Normalize hue back to 0-360 range using mod
      h = mod(h, 360.0);
      if (h < 0.0) {
        h += 360.0;
      }
      
      oklch = vec3(l, c, h);
    } else {
      // Threshold mode: use stops as colors with threshold-based mapping
      int stops = uLayer2ColorStops;
      if (stops <= 1) {
        oklch = uLayer2ColorStopsArray[0];
      } else {
        // Calculate Bayer dither value if dithering is enabled
        float bayer = 0.0;
        if (uLayer2DitherStrength > 0.001) {
          vec2 fragCoordCentered = gl_FragCoord.xy - uResolution * 0.5;
          bayer = (Bayer8(fragCoordCentered / uLayer2PixelSize) - 0.5) * uLayer2DitherStrength;
        }
        
        float transWidth = uLayer2TransitionWidth > 0.0 ? uLayer2TransitionWidth : 0.005;
        
        // Dynamic threshold mode: properly distribute weights across all color stops
        // For N stops, we divide the 0-1 range into N regions
        // High values map to bright colors (index 0), low values to dark colors (index stops-1)
        
        // Apply dithering to the value
        float ditheredValue = clamp(value + bayer, 0.0, 1.0);
        
        // Find which two color stops to blend between
        // Map value to color index: 1.0 -> 0 (brightest), 0.0 -> stops-1 (darkest)
        float normalizedValue = 1.0 - ditheredValue; // Invert so high values map to low indices
        float colorIndex = normalizedValue * float(stops - 1);
        int lowerIndex = int(floor(colorIndex));
        int upperIndex = min(lowerIndex + 1, stops - 1);
        
        // Clamp indices to valid range
        lowerIndex = clamp(lowerIndex, 0, stops - 1);
        upperIndex = clamp(upperIndex, 0, stops - 1);
        
        // Calculate blend factor between the two colors
        float blendFactor = fract(colorIndex);
        
        // If we're at the exact boundary or beyond, use smoothstep for smooth transitions
        if (lowerIndex < stops - 1) {
          // Calculate threshold between lowerIndex and upperIndex
          float threshold = 1.0 - float(lowerIndex + 1) / float(stops);
          threshold += bayer * 0.05; // Apply dithering
          threshold = clamp(threshold, 0.0, 1.0);
          
          // Use smoothstep to create smooth transition at threshold
          float smoothBlend = smoothstep(threshold - transWidth, threshold + transWidth, ditheredValue);
          blendFactor = smoothBlend;
        } else {
          // At the darkest color, no blending needed
          blendFactor = 0.0;
        }
        
        // Get the two colors to blend
        vec3 color1 = oklchToRgb(uLayer2ColorStopsArray[lowerIndex]);
        vec3 color2 = oklchToRgb(uLayer2ColorStopsArray[upperIndex]);
        
        // Mix the two colors
        vec3 color = mix(color1, color2, blendFactor);
        
        return color;
      }
    }
  }
  
  return oklchToRgb(oklch);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  vec2 p = (uv * 2.0 - 1.0) * vec2(uResolution.x / uResolution.y, 1.0);
  
  // Store original positions before coordinate modifiers
  vec2 originalP1 = p;
  vec2 originalP2 = p;
  
  // Layer 1
  vec2 p1 = p;
  float layer1Result = 0.0;
  {
{{LAYER1_CODE}}
  }
  
  // Layer 2
  vec2 p2 = p;
  float layer2Result = 0.0;
  {
{{LAYER2_CODE}}
  }
  
  // Map each layer to color separately
  vec3 layer1Color = mapColorLayer(layer1Result, 1);
  vec3 layer2Color = mapColorLayer(layer2Result, 2);
  
  // Apply tone mapping per layer
  layer1Color = applyToneMappingLayer(
    layer1Color,
    uLayer1ToneExposure,
    uLayer1ToneContrast,
    uLayer1ToneSaturation
  );
  layer2Color = applyToneMappingLayer(
    layer2Color,
    uLayer2ToneExposure,
    uLayer2ToneContrast,
    uLayer2ToneSaturation
  );
  
  // Post-color-mapping effects (per layer)
  {
{{LAYER1_POST_COLOR_CODE}}
  }
  {
{{LAYER2_POST_COLOR_CODE}}
  }
  
  // Composite layer colors
  vec3 color = compositeLayerColors(
    layer1Color, layer2Color,
    uLayer1BlendMode, uLayer1Opacity, uLayer1Visible,
    uLayer2BlendMode, uLayer2Opacity, uLayer2Visible
  );
  
  // Apply FX post-processors to final composited result
  {
{{FX_CODE}}
  }
  
  fragColor = vec4(color, 1.0);
}`;

