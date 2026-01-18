import type { VisualElement, Layer, FXLayer } from '../types';
import { baseFragmentShaderTemplate } from './elements/base';

export class ShaderCompiler {
  compileShader(elements: VisualElement[], elementOrder: string[]): string {
    // Get elements in order
    let orderedElements = elementOrder
      .map(id => elements.find(el => el.id === id))
      .filter((el): el is VisualElement => el !== undefined);
    
    // Sort by element type: coordinate-modifier -> content-generator -> post-processor
    // Within each type, maintain user's order
    const typeOrder: Record<string, number> = {
      'coordinate-modifier': 0,
      'content-generator': 1,
      'post-processor': 2
    };
    
    orderedElements = orderedElements.sort((a, b) => {
      const typeA = a.elementType || 'content-generator';
      const typeB = b.elementType || 'content-generator';
      const orderA = typeOrder[typeA] ?? 1;
      const orderB = typeOrder[typeB] ?? 1;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      // Within same type, maintain original order
      const indexA = elementOrder.indexOf(a.id);
      const indexB = elementOrder.indexOf(b.id);
      return indexA - indexB;
    });
    
    // Collect all uniforms
    const uniforms = new Set<string>();
    orderedElements.forEach(el => {
      el.uniforms.forEach(u => uniforms.add(u));
    });
    
    // Collect all functions
    const functions = orderedElements.map(el => el.functions).join('\n');
    
    // Build main code - wrap each element's code in a block scope to prevent variable name conflicts
    const mainCode = orderedElements.map(el => `{\n${el.mainCode}\n}`).join('\n');
    
    // Build shader
    let shader = baseFragmentShaderTemplate;
    shader = shader.replace('{{UNIFORMS}}', Array.from(uniforms).join('\n'));
    shader = shader.replace('{{FUNCTIONS}}', functions);
    shader = shader.replace('{{MAIN_CODE}}', mainCode);
    
    return shader;
  }
  
  getUniformNames(elements: VisualElement[], elementOrder: string[]): string[] {
    const orderedElements = elementOrder
      .map(id => elements.find(el => el.id === id))
      .filter((el): el is VisualElement => el !== undefined);
    
    const uniformNames: string[] = [];
    orderedElements.forEach(el => {
      Object.keys(el.parameters).forEach(paramName => {
        uniformNames.push(`${el.id}.${paramName}`);
      });
    });
    
    return uniformNames;
  }
  
  compileShaderWithLayers(layers: Layer[], elementLibrary: VisualElement[], hiddenElements: Map<string, Set<string>> = new Map(), fxLayer?: FXLayer, fxHiddenElements: Set<string> = new Set()): string {
    // Helper function to transform uniform name to layer-specific name
    // e.g., "uFbmScale" -> "uLayer1FbmScale" for layer 1
    const makeLayerUniformName = (uniformName: string, layerNum: number): string => {
      // Extract the base uniform name (remove "uniform " prefix and type)
      // Uniform format: "uniform float uFbmScale;" -> "uFbmScale"
      const match = uniformName.match(/uniform\s+\w+\s+(u\w+);/);
      if (!match) return uniformName; // If format doesn't match, return as-is
      
      const baseName = match[1]; // e.g., "uFbmScale"
      const layerPrefix = layerNum === 1 ? 'uLayer1' : 'uLayer2';
      
      // Extract type from original uniform
      const typeMatch = uniformName.match(/uniform\s+(\w+)/);
      const type = typeMatch ? typeMatch[1] : 'float';
      
      // Create layer-specific name: "uLayer1FbmScale"
      const layerSpecificName = baseName.replace(/^u/, layerPrefix);
      return `uniform ${type} ${layerSpecificName};`;
    };
    
    // Helper function to replace uniform references in code
    const replaceUniformInCode = (code: string, originalName: string, layerNum: number): string => {
      // Extract base uniform name from declaration: "uniform float uFbmScale;" -> "uFbmScale"
      const match = originalName.match(/uniform\s+\w+\s+(u\w+);/);
      if (!match) return code; // If format doesn't match, return code as-is
      
      const baseName = match[1]; // e.g., "uFbmScale"
      const layerPrefix = layerNum === 1 ? 'uLayer1' : 'uLayer2';
      const layerSpecificName = baseName.replace(/^u/, layerPrefix); // e.g., "uLayer1FbmScale"
      
      // Replace all occurrences of the uniform name (with word boundaries to avoid partial matches)
      const regex = new RegExp(`\\b${baseName}\\b`, 'g');
      return code.replace(regex, layerSpecificName);
    };
    
    // Always add layer uniforms (blend mode, opacity, visibility)
    const layerUniforms = new Set<string>([
      'uniform int uLayer1BlendMode;',
      'uniform float uLayer1Opacity;',
      'uniform int uLayer1Visible;',
      'uniform int uLayer2BlendMode;',
      'uniform float uLayer2Opacity;',
      'uniform int uLayer2Visible;'
    ]);
    
    // Per-layer color uniforms are already in base template, so we don't need to add them here
    
    // Collect all layer-specific uniforms from all elements in all layers
    const elementUniforms = new Set<string>();
    const allElementFunctions = new Map<string, string>(); // Map: function code -> processed function code per layer
    const functionNameMappings = new Map<string, Map<string, string>>(); // Map: elementId_layerNum -> originalName -> layerSpecificName
    
    // First pass: collect all unique elements and their uniforms
    const uniqueElements = new Map<string, VisualElement>();
    layers.forEach(layer => {
      const layerElements = elementLibrary.filter(el => 
        layer.activeElements.includes(el.id)
      );
      layerElements.forEach(el => {
        if (!uniqueElements.has(el.id)) {
          uniqueElements.set(el.id, el);
        }
      });
    });
    
    // Second pass: generate layer-specific uniforms and process functions
    layers.forEach((layer, layerIndex) => {
      const layerNum = layerIndex + 1;
      const layerElements = elementLibrary.filter(el => 
        layer.activeElements.includes(el.id)
      );
      
      layerElements.forEach(el => {
        // Generate layer-specific uniforms
        el.uniforms.forEach(u => {
          const layerUniform = makeLayerUniformName(u, layerNum);
          elementUniforms.add(layerUniform);
        });
        
        // Process functions with layer-specific uniform names
        if (el.functions) {
          let processedFunctions = el.functions;
          const functionNameMap = new Map<string, string>();
          
          // Extract and rename function definitions to be layer-specific
          // Pattern: returnType functionName(parameters) { ... }
          processedFunctions = processedFunctions.replace(/\b(vec2|vec3|vec4|float|int|void|bool|mat2|mat3|mat4|sampler2D)\s+(\w+)\s*\(/g, (_match, returnType, funcName) => {
            const layerSpecificName = `${funcName}Layer${layerNum}`;
            functionNameMap.set(funcName, layerSpecificName);
            return `${returnType} ${layerSpecificName}(`;
          });
          
          // Replace function calls with layer-specific names in the function code itself
          functionNameMap.forEach((layerSpecificName, originalName) => {
            const regex = new RegExp(`\\b${originalName}\\s*\\(`, 'g');
            processedFunctions = processedFunctions.replace(regex, `${layerSpecificName}(`);
          });
          
          // Store function name mappings for use in mainCode
          const mappingsKey = `${el.id}_layer${layerNum}`;
          functionNameMappings.set(mappingsKey, functionNameMap);
          
          // Replace all uniform references in functions
          el.uniforms.forEach(u => {
            processedFunctions = replaceUniformInCode(processedFunctions, u, layerNum);
          });
          
          // Replace global uniforms with layer-specific names in functions
          const timeUniform = layerNum === 1 ? 'uLayer1Time' : 'uLayer2Time';
          processedFunctions = processedFunctions.replace(/\buTime\b/g, timeUniform);
          
          const pixelSizeUniform = layerNum === 1 ? 'uLayer1PixelSize' : 'uLayer2PixelSize';
          processedFunctions = processedFunctions.replace(/\buPixelSize\b/g, pixelSizeUniform);
          
          const ditherStrengthUniform = layerNum === 1 ? 'uLayer1DitherStrength' : 'uLayer2DitherStrength';
          processedFunctions = processedFunctions.replace(/\buDitherStrength\b/g, ditherStrengthUniform);
          
          // Store processed functions with layer-specific function names
          const functionKey = `${el.id}_layer${layerNum}`;
          allElementFunctions.set(functionKey, processedFunctions);
        }
      });
    });
    
    // Build layer code blocks
    const layerCodes: string[] = [];
    const layerPostColorCodes: string[] = [];
    
    layers.forEach((layer, layerIndex) => {
      if (!layer.visible) {
        // Hidden layer - empty code block
        layerCodes.push('');
        layerPostColorCodes.push('');
        return;
      }
      
      const layerNum = layerIndex + 1;
      
      // Get hidden elements for this layer
      const layerHiddenElements = hiddenElements.get(layer.id) || new Set<string>();
      
      // Get elements for this layer, filtering out hidden ones
      let layerElements = layer.activeElements
        .filter(id => !layerHiddenElements.has(id)) // Filter out hidden elements
        .map(id => elementLibrary.find(el => el.id === id))
        .filter((el): el is VisualElement => el !== undefined);
      
      // Sort by element type
      const typeOrder: Record<string, number> = {
        'coordinate-modifier': 0,
        'content-generator': 1,
        'post-processor': 2
      };
      
      layerElements = layerElements.sort((a, b) => {
        const typeA = a.elementType || 'content-generator';
        const typeB = b.elementType || 'content-generator';
        const orderA = typeOrder[typeA] ?? 1;
        const orderB = typeOrder[typeB] ?? 1;
        
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        
        const indexA = layer.elementOrder.indexOf(a.id);
        const indexB = layer.elementOrder.indexOf(b.id);
        return indexA - indexB;
      });
      
      // Separate elements into pre-color and post-color processors
      const preColorElements = layerElements.filter(el => !el.postColorMapping);
      const postColorElements = layerElements.filter(el => el.postColorMapping);
      
      // Build code for this layer
      // Use p1 for layer 1, p2 for layer 2
      const coordVar = layerIndex === 0 ? 'p1' : 'p2';
      const resultVar = layerIndex === 0 ? 'layer1Result' : 'layer2Result';
      const originalPVar = layerIndex === 0 ? 'originalP1' : 'originalP2';
      const colorVar = layerIndex === 0 ? 'layer1Color' : 'layer2Color';
      
      // Helper function to process element code
      const processElementCode = (el: VisualElement) => {
        let code = el.mainCode;
        
        // Replace function calls with layer-specific names
        const mappingsKey = `${el.id}_layer${layerNum}`;
        const functionNameMap = functionNameMappings.get(mappingsKey);
        if (functionNameMap) {
          functionNameMap.forEach((layerSpecificName, originalName) => {
            const regex = new RegExp(`\\b${originalName}\\s*\\(`, 'g');
            code = code.replace(regex, `${layerSpecificName}(`);
          });
        }
        
        // Replace 'p' with coordVar, 'result' with resultVar
        code = code.replace(/\bp\b/g, coordVar);
        code = code.replace(/\bresult\b/g, resultVar);
        
        // Replace references to original position (available in both pre and post color stages)
        code = code.replace(/\boriginalP\b/g, originalPVar);
        
        // For post-color-mapping, also replace references to color
        if (el.postColorMapping) {
          code = code.replace(/\blayerColor\b/g, colorVar);
        }
        
        // Replace uniform references with layer-specific names
        el.uniforms.forEach(u => {
          code = replaceUniformInCode(code, u, layerNum);
        });
        
        // Replace global uniforms with layer-specific names
        // uTime -> uLayer1Time or uLayer2Time
        const timeUniform = layerNum === 1 ? 'uLayer1Time' : 'uLayer2Time';
        code = code.replace(/\buTime\b/g, timeUniform);
        
        // uPixelSize -> uLayer1PixelSize or uLayer2PixelSize
        const pixelSizeUniform = layerNum === 1 ? 'uLayer1PixelSize' : 'uLayer2PixelSize';
        code = code.replace(/\buPixelSize\b/g, pixelSizeUniform);
        
        // uDitherStrength -> uLayer1DitherStrength or uLayer2DitherStrength
        const ditherStrengthUniform = layerNum === 1 ? 'uLayer1DitherStrength' : 'uLayer2DitherStrength';
        code = code.replace(/\buDitherStrength\b/g, ditherStrengthUniform);
        
        return `{\n${code}\n}`;
      };
      
      // Build pre-color code (coordinate-modifiers, content-generators, pre-color post-processors)
      const preColorCode = preColorElements.map(processElementCode).join('\n');
      
      // Build post-color code (post-color-mapping post-processors)
      // Also include postColorCode from elements that have it (for mode-dependent elements)
      const postColorCodeParts: string[] = [];
      postColorElements.forEach(el => {
        postColorCodeParts.push(processElementCode(el));
      });
      // Also add postColorCode from elements that have it (like block-color-glitch with mode switching)
      layerElements.forEach(el => {
        if (el.postColorCode) {
          let code = el.postColorCode;
          
          // Replace function calls with layer-specific names
          const mappingsKey = `${el.id}_layer${layerNum}`;
          const functionNameMap = functionNameMappings.get(mappingsKey);
          if (functionNameMap) {
            functionNameMap.forEach((layerSpecificName, originalName) => {
              const regex = new RegExp(`\\b${originalName}\\s*\\(`, 'g');
              code = code.replace(regex, `${layerSpecificName}(`);
            });
          }
          
          // Replace references to original position and color
          code = code.replace(/\boriginalP\b/g, originalPVar);
          code = code.replace(/\blayerColor\b/g, colorVar);
          
          // Replace uniform references with layer-specific names
          el.uniforms.forEach(u => {
            code = replaceUniformInCode(code, u, layerNum);
          });
          
          // Replace global uniforms with layer-specific names
          const timeUniform = layerNum === 1 ? 'uLayer1Time' : 'uLayer2Time';
          code = code.replace(/\buTime\b/g, timeUniform);
          const pixelSizeUniform = layerNum === 1 ? 'uLayer1PixelSize' : 'uLayer2PixelSize';
          code = code.replace(/\buPixelSize\b/g, pixelSizeUniform);
          const ditherStrengthUniform = layerNum === 1 ? 'uLayer1DitherStrength' : 'uLayer2DitherStrength';
          code = code.replace(/\buDitherStrength\b/g, ditherStrengthUniform);
          
          postColorCodeParts.push(`{\n${code}\n}`);
        }
      });
      const postColorCode = postColorCodeParts.join('\n');
      
      layerCodes.push(preColorCode);
      layerPostColorCodes.push(postColorCode);
    });
    
    // Ensure we have 2 layer codes (pad with empty if needed)
    while (layerCodes.length < 2) {
      layerCodes.push('');
    }
    while (layerPostColorCodes.length < 2) {
      layerPostColorCodes.push('');
    }
    
    // Process FX layer (post-processors applied to final composited result)
    let fxCode = '';
    if (fxLayer && fxLayer.activeElements.length > 0) {
      // Get FX elements (only post-processors), filtering out hidden ones
      let fxElements = fxLayer.activeElements
        .filter(id => !fxHiddenElements.has(id))
        .map(id => elementLibrary.find(el => el.id === id))
        .filter((el): el is VisualElement => el !== undefined)
        .filter(el => (el.elementType || 'content-generator') === 'post-processor');
      
      // Sort by element order
      fxElements = fxElements.sort((a, b) => {
        const indexA = fxLayer.elementOrder.indexOf(a.id);
        const indexB = fxLayer.elementOrder.indexOf(b.id);
        return indexA - indexB;
      });
      
      // Process each FX element
      fxElements.forEach(el => {
        // Add uniforms for FX elements (no layer prefix needed - FX uses global uniforms)
        el.uniforms.forEach(u => {
          elementUniforms.add(u);
        });
        
        // Add functions for FX elements (no layer-specific renaming needed)
        if (el.functions) {
          const functionKey = `fx_${el.id}`;
          if (!allElementFunctions.has(functionKey)) {
            allElementFunctions.set(functionKey, el.functions);
          }
        }
        
        // Process FX element code - it operates on the final 'color' variable
        let code = el.mainCode;
        
        // Replace uniform references first (before variable replacements)
        // Replace uTime with uLayer1Time (use Layer 1 time for FX)
        code = code.replace(/\buTime\b/g, 'uLayer1Time');
        
        // For post-processors that work on float result, we need to adapt them to work on vec3 color
        // Check if this post-processor uses 'result' (float) - if so, adapt it for color
        const usesFloatResult = /\bresult\b/.test(code) && !el.postColorMapping;
        
        if (usesFloatResult) {
          // This post-processor works on float result - adapt it for vec3 color
          // Special handling for specific post-processors
          if (el.id === 'scanlines') {
            // Scanlines: apply per-channel
            // Match: float scanlineTime = (uTime + uScanlineTimeOffset) * uScanlineTimeSpeed;
            //        result = scanlineEffect(result, p, uScanlineFrequency, uScanlineThickness, uScanlineOpacity, scanlineTime);
            const scanlineMatch = code.match(/result\s*=\s*scanlineEffect\s*\(\s*result\s*,\s*p\s*,\s*([^)]+)\)/);
            if (scanlineMatch) {
              const args = scanlineMatch[1];
              code = `float scanlineTime = (uLayer1Time + uScanlineTimeOffset) * uScanlineTimeSpeed;
  color.r = scanlineEffect(color.r, p, ${args});
  color.g = scanlineEffect(color.g, p, ${args});
  color.b = scanlineEffect(color.b, p, ${args});`;
            } else {
              // Fallback: just replace result with color
              code = code.replace(/\bresult\b/g, 'color');
            }
          } else if (el.id === 'normal-mapping') {
            // Normal mapping: adapt to work on vec3 color
            // Convert color to luminance, apply normal mapping, then apply to all channels
            code = `float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 lightDir = normalize(vec3(uNormalLightX, uNormalLightY, uNormalLightZ));
  vec3 normal = calculateNormal(p * uNormalScale, uNormalScale, luminance);
  float normalEffect = applyNormalMapping(luminance, normal, lightDir);
  float normalMix = mix(luminance, normalEffect, uNormalStrength);
  color = color * (normalMix / max(luminance, 0.001));`;
          } else if (el.id === 'color-grading') {
            // Color grading: adapt to work on vec3 color
            // Apply color grading per-channel (using each channel's value as luminance for mask calculation)
            code = `float shadows = (uColorShadowsR + uColorShadowsG + uColorShadowsB) / 3.0;
  float midtones = (uColorMidtonesR + uColorMidtonesG + uColorMidtonesB) / 3.0;
  float highlights = (uColorHighlightsR + uColorHighlightsG + uColorHighlightsB) / 3.0;
  color.r = applyColorCurve(color.r, shadows, midtones, highlights);
  color.g = applyColorCurve(color.g, shadows, midtones, highlights);
  color.b = applyColorCurve(color.b, shadows, midtones, highlights);
  color.r = applyLevels(color.r, uLevelsInMin, uLevelsInMax, uLevelsOutMin, uLevelsOutMax, uLevelsGamma);
  color.g = applyLevels(color.g, uLevelsInMin, uLevelsInMax, uLevelsOutMin, uLevelsOutMax, uLevelsGamma);
  color.b = applyLevels(color.b, uLevelsInMin, uLevelsInMax, uLevelsOutMin, uLevelsOutMax, uLevelsGamma);`;
          } else if (el.id === 'block-edge-brightness') {
            // Block edge brightness: apply per-channel
            code = `float blockEdgeTime = (uLayer1Time + uBlockEdgeTimeOffset) * uBlockEdgeTimeSpeed;
  color.r = blockEdgeBrightnessEffect(color.r, p, uBlockEdgeDirection, uBlockEdgeCount, uBlockEdgeBrightness, uBlockEdgeWidth, uBlockEdgeSpacingChaos, blockEdgeTime);
  color.g = blockEdgeBrightnessEffect(color.g, p, uBlockEdgeDirection, uBlockEdgeCount, uBlockEdgeBrightness, uBlockEdgeWidth, uBlockEdgeSpacingChaos, blockEdgeTime);
  color.b = blockEdgeBrightnessEffect(color.b, p, uBlockEdgeDirection, uBlockEdgeCount, uBlockEdgeBrightness, uBlockEdgeWidth, uBlockEdgeSpacingChaos, blockEdgeTime);`;
          } else if (el.id === 'glow-bloom') {
            // Glow: apply per-channel
            code = `float glowR = glowEffect(color.r, uGlowThreshold, uGlowIntensity);
  float glowG = glowEffect(color.g, uGlowThreshold, uGlowIntensity);
  float glowB = glowEffect(color.b, uGlowThreshold, uGlowIntensity);
  color.r += glowR * uGlowStrength;
  color.g += glowG * uGlowStrength;
  color.b += glowB * uGlowStrength;`;
          } else if (el.id === 'rgb-separation') {
            // RGB separation: preserve variable declarations and apply per-channel
            // Replace the function call line while preserving variable declarations
            // The regex matches: result = rgbSeparation(result, p, rOffset, gOffset, bOffset, strength);
            code = code.replace(
              /result\s*=\s*rgbSeparation\s*\(\s*result\s*,\s*p\s*,\s*rOffset\s*,\s*gOffset\s*,\s*bOffset\s*,\s*([^)]+)\)\s*;?/,
              `float rValue = rgbSeparation(color.r, p, rOffset, gOffset, bOffset, $1);
  float gValue = rgbSeparation(color.g, p, rOffset, gOffset, bOffset, $1);
  float bValue = rgbSeparation(color.b, p, rOffset, gOffset, bOffset, $1);
  color = vec3(rValue, gValue, bValue);`
            );
          } else {
            // Generic fallback: try to apply per-channel
            // Replace "result = func(result, ...)" with per-channel version
            const funcMatch = code.match(/(\w+)\s*=\s*(\w+)\s*\(\s*result\s*,\s*([^)]+)\)/);
            if (funcMatch) {
              const funcName = funcMatch[2];
              const funcArgs = funcMatch[3];
              code = `color.r = ${funcName}(color.r, ${funcArgs});
  color.g = ${funcName}(color.g, ${funcArgs});
  color.b = ${funcName}(color.b, ${funcArgs});`;
            } else {
              // Fallback: convert to luminance, apply, then scale back
              code = `float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  ${code.replace(/\bresult\b/g, 'luminance')}
  color = color * (luminance / max(dot(color, vec3(0.299, 0.587, 0.114)), 0.001));`;
            }
          }
        } else if (el.postColorMapping) {
          // Post-color-mapping post-processors work on 'color' variable
          code = code.replace(/\blayerColor\b/g, 'color');
          code = code.replace(/\bresult\b/g, 'color');
        } else {
          // Pre-color post-processors - replace result with color
          code = code.replace(/\bresult\b/g, 'color');
        }
        
        // Replace originalP with p (FX uses the base coordinate)
        code = code.replace(/\boriginalP\b/g, 'p');
        code = code.replace(/\bp1\b/g, 'p');
        code = code.replace(/\bp2\b/g, 'p');
        
        fxCode += `{\n${code}\n}`;
      });
    }
    
    // Combine all uniforms (after FX processing so FX uniforms are included)
    const allUniforms = Array.from(new Set([...Array.from(layerUniforms), ...Array.from(elementUniforms)]));
    
    // Build shader
    let shader = baseFragmentShaderTemplate;
    
    // Replace uniforms
    shader = shader.replace('{{UNIFORMS}}', allUniforms.join('\n'));
    
    // Replace functions - combine all processed element functions
    // Note: Functions may have layer-specific uniform references, so we include all versions
    // Functions are already renamed per layer, so no duplicates should occur
    const allFunctions = Array.from(allElementFunctions.values()).join('\n');
    shader = shader.replace('{{FUNCTIONS}}', allFunctions);
    
    // Replace layer code blocks
    shader = shader.replace('{{LAYER1_CODE}}', layerCodes[0] || '');
    shader = shader.replace('{{LAYER2_CODE}}', layerCodes[1] || '');
    shader = shader.replace('{{LAYER1_POST_COLOR_CODE}}', layerPostColorCodes[0] || '');
    shader = shader.replace('{{LAYER2_POST_COLOR_CODE}}', layerPostColorCodes[1] || '');
    shader = shader.replace('{{FX_CODE}}', fxCode);
    
    return shader;
  }
}

