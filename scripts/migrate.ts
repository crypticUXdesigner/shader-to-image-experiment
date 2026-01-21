import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import element library and types
import { elementLibrary } from '../src/shaders/elements/index.ts';
import type { SavedConfig, Layer, FXLayer, ColorConfig, ParameterConfig, VisualElement } from '../src/types/index.ts';

// Deprecated elements that should be removed
const DEPRECATED_ELEMENTS = ['bayer-dither'];

// Invalid parameters that should be removed
const INVALID_PARAMETERS = ['blockSpacingChaos'];

interface ElementParamMap {
  [elementId: string]: Set<string>;
}

interface ElementParamMetadata {
  [elementId: string]: {
    [paramName: string]: ParameterConfig;
  };
}

interface ElementMetadata {
  [elementId: string]: {
    elementType?: string;
    isPostProcessor: boolean;
  };
}

function buildElementParamMap(): ElementParamMap {
  const paramMap: ElementParamMap = {};
  
  for (const element of elementLibrary) {
    paramMap[element.id] = new Set(Object.keys(element.parameters));
  }
  
  return paramMap;
}

function buildElementParamMetadata(): ElementParamMetadata {
  const metadata: ElementParamMetadata = {};
  
  for (const element of elementLibrary) {
    metadata[element.id] = { ...element.parameters };
  }
  
  return metadata;
}

function buildElementMetadata(): ElementMetadata {
  const metadata: ElementMetadata = {};
  
  for (const element of elementLibrary) {
    metadata[element.id] = {
      elementType: element.elementType,
      isPostProcessor: element.elementType === 'post-processor' || element.postColorMapping === true
    };
  }
  
  return metadata;
}

function isValidElement(elementId: string, validElementIds: Set<string>): boolean {
  return validElementIds.has(elementId) && !DEPRECATED_ELEMENTS.includes(elementId);
}

function isValidParameter(elementId: string, paramName: string, paramMap: ElementParamMap): boolean {
  if (INVALID_PARAMETERS.includes(paramName)) {
    return false;
  }
  
  const validParams = paramMap[elementId];
  if (!validParams) {
    return false; // Element doesn't exist
  }
  
  return validParams.has(paramName);
}

function validateAndClampParameter(
  elementId: string,
  paramName: string,
  value: number,
  paramMetadata: ElementParamMetadata
): { value: number; wasClamped: boolean; wasTypeFixed: boolean } {
  const elementParams = paramMetadata[elementId];
  if (!elementParams) {
    return { value, wasClamped: false, wasTypeFixed: false };
  }
  
  const paramConfig = elementParams[paramName];
  if (!paramConfig) {
    return { value, wasClamped: false, wasTypeFixed: false };
  }
  
  let finalValue = value;
  let wasClamped = false;
  let wasTypeFixed = false;
  
  // Fix type (int vs float)
  if (paramConfig.type === 'int') {
    const intValue = Math.round(finalValue);
    if (intValue !== finalValue) {
      finalValue = intValue;
      wasTypeFixed = true;
    }
  }
  
  // Clamp to min/max
  if (paramConfig.min !== undefined && finalValue < paramConfig.min) {
    finalValue = paramConfig.min;
    wasClamped = true;
  }
  if (paramConfig.max !== undefined && finalValue > paramConfig.max) {
    finalValue = paramConfig.max;
    wasClamped = true;
  }
  
  return { value: finalValue, wasClamped, wasTypeFixed };
}

function validateColorConfig(colorConfig: ColorConfig): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Validate mode
  if (colorConfig.mode !== 'bezier' && colorConfig.mode !== 'thresholds') {
    issues.push(`Invalid color mode: ${colorConfig.mode}`);
  }
  
  // Validate colors
  if (colorConfig.startColor) {
    if (colorConfig.startColor.l < 0 || colorConfig.startColor.l > 1) {
      issues.push('startColor.l out of range [0, 1]');
    }
    if (colorConfig.startColor.c < 0 || colorConfig.startColor.c > 1) {
      issues.push('startColor.c out of range [0, 1]');
    }
    if (colorConfig.startColor.h < 0 || colorConfig.startColor.h > 360) {
      issues.push('startColor.h out of range [0, 360]');
    }
  }
  
  if (colorConfig.endColor) {
    if (colorConfig.endColor.l < 0 || colorConfig.endColor.l > 1) {
      issues.push('endColor.l out of range [0, 1]');
    }
    if (colorConfig.endColor.c < 0 || colorConfig.endColor.c > 1) {
      issues.push('endColor.c out of range [0, 1]');
    }
    if (colorConfig.endColor.h < 0 || colorConfig.endColor.h > 360) {
      issues.push('endColor.h out of range [0, 360]');
    }
  }
  
  // Validate toneMapping
  if (colorConfig.toneMapping) {
    if (colorConfig.toneMapping.exposure !== undefined && colorConfig.toneMapping.exposure < 0) {
      issues.push('toneMapping.exposure should be >= 0');
    }
    if (colorConfig.toneMapping.contrast !== undefined && colorConfig.toneMapping.contrast < 0) {
      issues.push('toneMapping.contrast should be >= 0');
    }
    if (colorConfig.toneMapping.saturation !== undefined && colorConfig.toneMapping.saturation < 0) {
      issues.push('toneMapping.saturation should be >= 0');
    }
  }
  
  return { isValid: issues.length === 0, issues };
}

function cleanLayer(
  layer: Layer,
  validElementIds: Set<string>,
  paramMap: ElementParamMap,
  paramMetadata: ElementParamMetadata,
  elementMetadata: ElementMetadata
): { layer: Layer; changes: string[] } {
  const changes: string[] = [];
  
  // Remove deprecated elements from activeElements
  const cleanedActiveElements = layer.activeElements.filter(id => isValidElement(id, validElementIds));
  if (cleanedActiveElements.length !== layer.activeElements.length) {
    const removed = layer.activeElements.filter(id => !cleanedActiveElements.includes(id));
    changes.push(`Removed invalid elements from activeElements: ${removed.join(', ')}`);
  }
  
  // Remove duplicates from activeElements
  const uniqueActiveElements = Array.from(new Set(cleanedActiveElements));
  if (uniqueActiveElements.length !== cleanedActiveElements.length) {
    changes.push('Removed duplicate elements from activeElements');
  }
  
  // Remove deprecated elements from elementOrder
  const cleanedElementOrder = layer.elementOrder.filter(id => isValidElement(id, validElementIds));
  if (cleanedElementOrder.length !== layer.elementOrder.length) {
    const removed = layer.elementOrder.filter(id => !cleanedElementOrder.includes(id));
    changes.push(`Removed invalid elements from elementOrder: ${removed.join(', ')}`);
  }
  
  // Remove duplicates from elementOrder
  const uniqueElementOrder = Array.from(new Set(cleanedElementOrder));
  if (uniqueElementOrder.length !== cleanedElementOrder.length) {
    changes.push('Removed duplicate elements from elementOrder');
  }
  
  // Ensure all valid elements are in elementOrder
  const allElementIds = Array.from(validElementIds);
  const missingElements = allElementIds.filter(id => !uniqueElementOrder.includes(id));
  if (missingElements.length > 0) {
    const fullElementOrder = [...uniqueElementOrder, ...missingElements];
    changes.push(`Added missing elements to elementOrder: ${missingElements.join(', ')}`);
    uniqueElementOrder.push(...missingElements);
  }
  
  // Ensure activeElements are in elementOrder
  const missingFromOrder = uniqueActiveElements.filter(id => !uniqueElementOrder.includes(id));
  if (missingFromOrder.length > 0) {
    uniqueElementOrder.push(...missingFromOrder);
    changes.push(`Added activeElements to elementOrder: ${missingFromOrder.join(', ')}`);
  }
  
  // Clean and validate parameters
  const cleanedParameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(layer.parameters)) {
    const [elementId, paramName] = key.split('.');
    if (isValidElement(elementId, validElementIds) && isValidParameter(elementId, paramName, paramMap)) {
      const validation = validateAndClampParameter(elementId, paramName, value, paramMetadata);
      cleanedParameters[key] = validation.value;
      
      if (validation.wasClamped) {
        changes.push(`Clamped ${key} to valid range`);
      }
      if (validation.wasTypeFixed) {
        changes.push(`Fixed type for ${key} (rounded to int)`);
      }
    }
  }
  
  // Validate opacity
  let opacity = layer.opacity;
  if (opacity < 0 || opacity > 1) {
    opacity = Math.max(0, Math.min(1, opacity));
    changes.push(`Clamped opacity to [0, 1]: ${layer.opacity} -> ${opacity}`);
  }
  
  // Validate blendingMode (0-11)
  let blendingMode = layer.blendingMode;
  if (blendingMode < 0 || blendingMode > 11) {
    blendingMode = Math.max(0, Math.min(11, Math.round(blendingMode)));
    changes.push(`Clamped blendingMode to [0, 11]: ${layer.blendingMode} -> ${blendingMode}`);
  }
  
  // Ensure colorConfig has toneMapping
  const colorConfig: ColorConfig = {
    ...layer.colorConfig,
    toneMapping: layer.colorConfig.toneMapping || {
      exposure: 1,
      contrast: 1,
      saturation: 1
    }
  };
  
  // Validate colorConfig
  const colorValidation = validateColorConfig(colorConfig);
  if (!colorValidation.isValid) {
    changes.push(`ColorConfig issues: ${colorValidation.issues.join(', ')}`);
  }
  
  return {
    layer: {
      ...layer,
      activeElements: uniqueActiveElements,
      elementOrder: uniqueElementOrder,
      parameters: cleanedParameters,
      opacity,
      blendingMode,
      colorConfig
    },
    changes
  };
}

function cleanFXLayer(
  fxLayer: FXLayer | undefined,
  validElementIds: Set<string>,
  paramMap: ElementParamMap,
  paramMetadata: ElementParamMetadata,
  elementMetadata: ElementMetadata
): { fxLayer: FXLayer | undefined; changes: string[] } {
  const changes: string[] = [];
  
  if (!fxLayer) return { fxLayer: undefined, changes };
  
  // Remove deprecated elements
  const cleanedActiveElements = fxLayer.activeElements.filter(id => isValidElement(id, validElementIds));
  if (cleanedActiveElements.length !== fxLayer.activeElements.length) {
    const removed = fxLayer.activeElements.filter(id => !cleanedActiveElements.includes(id));
    changes.push(`Removed invalid elements from FX activeElements: ${removed.join(', ')}`);
  }
  
  // Remove duplicates
  const uniqueActiveElements = Array.from(new Set(cleanedActiveElements));
  if (uniqueActiveElements.length !== cleanedActiveElements.length) {
    changes.push('Removed duplicate elements from FX activeElements');
  }
  
  // Validate FX layer only contains post-processors
  const nonPostProcessors = uniqueActiveElements.filter(id => {
    const meta = elementMetadata[id];
    return meta && !meta.isPostProcessor;
  });
  if (nonPostProcessors.length > 0) {
    const filtered = uniqueActiveElements.filter(id => {
      const meta = elementMetadata[id];
      return !meta || meta.isPostProcessor;
    });
    changes.push(`Removed non-post-processor elements from FX layer: ${nonPostProcessors.join(', ')}`);
    uniqueActiveElements.splice(0, uniqueActiveElements.length, ...filtered);
  }
  
  // Clean elementOrder
  const cleanedElementOrder = fxLayer.elementOrder.filter(id => isValidElement(id, validElementIds));
  const uniqueElementOrder = Array.from(new Set(cleanedElementOrder));
  
  // Ensure all valid post-processor elements are in elementOrder
  const allPostProcessorIds = Array.from(validElementIds).filter(id => {
    const meta = elementMetadata[id];
    return meta && meta.isPostProcessor;
  });
  const missingPostProcessors = allPostProcessorIds.filter(id => !uniqueElementOrder.includes(id));
  if (missingPostProcessors.length > 0) {
    uniqueElementOrder.push(...missingPostProcessors);
    changes.push(`Added missing post-processor elements to FX elementOrder: ${missingPostProcessors.join(', ')}`);
  }
  
  // Clean and validate parameters
  const cleanedParameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(fxLayer.parameters)) {
    const [elementId, paramName] = key.split('.');
    if (isValidElement(elementId, validElementIds) && isValidParameter(elementId, paramName, paramMap)) {
      const validation = validateAndClampParameter(elementId, paramName, value, paramMetadata);
      cleanedParameters[key] = validation.value;
      
      if (validation.wasClamped) {
        changes.push(`Clamped FX ${key} to valid range`);
      }
      if (validation.wasTypeFixed) {
        changes.push(`Fixed type for FX ${key} (rounded to int)`);
      }
    }
  }
  
  return {
    fxLayer: {
      ...fxLayer,
      activeElements: uniqueActiveElements,
      elementOrder: uniqueElementOrder,
      parameters: cleanedParameters
    },
    changes
  };
}

function ensureToneMapping(colorConfig: ColorConfig): ColorConfig {
  return {
    ...colorConfig,
    toneMapping: colorConfig.toneMapping || {
      exposure: 1,
      contrast: 1,
      saturation: 1
    }
  };
}

function updateConfig(
  config: SavedConfig,
  validElementIds: Set<string>,
  paramMap: ElementParamMap,
  paramMetadata: ElementParamMetadata,
  elementMetadata: ElementMetadata
): { config: SavedConfig; changes: string[] } {
  const allChanges: string[] = [];
  
  // Ensure global colorConfig has toneMapping
  const updatedColorConfig = ensureToneMapping(config.colorConfig);
  
  // Validate global colorConfig
  const globalColorValidation = validateColorConfig(updatedColorConfig);
  if (!globalColorValidation.isValid) {
    allChanges.push(`Global ColorConfig issues: ${globalColorValidation.issues.join(', ')}`);
  }
  
  // If config has layers (v2.0 format)
  if (config.layers && config.layers.length > 0) {
    const cleanedLayers: Layer[] = [];
    for (const layer of config.layers) {
      const result = cleanLayer(layer, validElementIds, paramMap, paramMetadata, elementMetadata);
      cleanedLayers.push(result.layer);
      allChanges.push(...result.changes.map(c => `Layer ${layer.id}: ${c}`));
    }
    
    const fxResult = cleanFXLayer(config.fxLayer, validElementIds, paramMap, paramMetadata, elementMetadata);
    allChanges.push(...fxResult.changes.map(c => `FX Layer: ${c}`));
    
    return {
      config: {
        ...config,
        version: '2.0',
        layers: cleanedLayers,
        fxLayer: fxResult.fxLayer,
        colorConfig: updatedColorConfig,
        timestamp: new Date().toISOString()
      },
      changes: allChanges
    };
  }
  
  // Legacy v1.0 format - migrate to v2.0
  const activeElements = (config.activeElements || []).filter(id => isValidElement(id, validElementIds));
  const elementOrder = (config.elementOrder || []).filter(id => isValidElement(id, validElementIds));
  
  // Clean parameters
  const cleanedParameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(config.parameters || {})) {
    const [elementId, paramName] = key.split('.');
    if (isValidElement(elementId, validElementIds) && isValidParameter(elementId, paramName, paramMap)) {
      const validation = validateAndClampParameter(elementId, paramName, value, paramMetadata);
      cleanedParameters[key] = validation.value;
      
      if (validation.wasClamped) {
        allChanges.push(`Clamped ${key} to valid range`);
      }
      if (validation.wasTypeFixed) {
        allChanges.push(`Fixed type for ${key} (rounded to int)`);
      }
    }
  }
  
  // Get all valid element IDs for elementOrder
  const allElementIds = Array.from(validElementIds);
  const missingElements = allElementIds.filter(id => !elementOrder.includes(id));
  const fullElementOrder = [...elementOrder, ...missingElements];
  
  return {
    config: {
      ...config,
      version: '2.0',
      timestamp: new Date().toISOString(),
      layers: [
        {
          id: 'layer-1',
          activeElements,
          elementOrder: fullElementOrder,
          parameters: cleanedParameters,
          blendingMode: 0,
          opacity: 1.0,
          visible: true,
          colorConfig: updatedColorConfig
        },
        {
          id: 'layer-2',
          activeElements: [],
          elementOrder: allElementIds,
          parameters: {},
          blendingMode: 0,
          opacity: 1.0,
          visible: false,
          colorConfig: updatedColorConfig
        }
      ],
      colorConfig: updatedColorConfig
    },
    changes: allChanges
  };
}

function createDefaultConfig(): SavedConfig {
  const allElementIds = Array.from(elementLibrary.map(el => el.id));
  const defaultColorConfig: ColorConfig = {
    mode: 'thresholds',
    startColor: { l: 0.2, c: 0.1, h: 200 },
    endColor: { l: 0.8, c: 0.2, h: 300 },
    stops: 6,
    transitionWidth: 0.005,
    ditherStrength: 0,
    pixelSize: 1,
    lCurve: { x1: 0, y1: 0, x2: 1, y2: 1 },
    cCurve: { x1: 0, y1: 0, x2: 1, y2: 1 },
    hCurve: { x1: 0, y1: 0, x2: 1, y2: 1 },
    toneMapping: { exposure: 1, contrast: 1, saturation: 1 }
  };
  
  return {
    version: '2.0',
    timestamp: new Date().toISOString(),
    layers: [
      {
        id: 'layer-1',
        activeElements: [],
        elementOrder: allElementIds,
        parameters: {},
        blendingMode: 0,
        opacity: 1.0,
        visible: true,
        colorConfig: defaultColorConfig
      },
      {
        id: 'layer-2',
        activeElements: [],
        elementOrder: allElementIds,
        parameters: {},
        blendingMode: 0,
        opacity: 1.0,
        visible: false,
        colorConfig: defaultColorConfig
      }
    ],
    colorConfig: defaultColorConfig,
    timelineConfig: {
      value: 0,
      min: 0,
      max: 100,
      step: 0.01
    },
    exportConfig: {
      resolution: [1600, 1600],
      format: 'png',
      quality: 1
    }
  };
}

function updateConfigFile(
  filePath: string,
  validElementIds: Set<string>,
  paramMap: ElementParamMap,
  paramMetadata: ElementParamMetadata,
  elementMetadata: ElementMetadata
): { success: boolean; changes: string[] } {
  const changes: string[] = [];
  
  try {
    // Read config file
    const fileContent = readFileSync(filePath, 'utf-8');
    
    // Handle empty files - create default config
    if (!fileContent.trim()) {
      const defaultConfig = createDefaultConfig();
      const defaultContent = JSON.stringify(defaultConfig, null, 2) + '\n';
      writeFileSync(filePath, defaultContent, 'utf-8');
      changes.push('File was empty - created default config');
      return { success: true, changes };
    }
    
    const config: SavedConfig = JSON.parse(fileContent);
    
    // Track original state
    const originalVersion = config.version;
    const originalActiveElements = config.layers?.[0]?.activeElements || config.activeElements || [];
    const originalParams = Object.keys(config.layers?.[0]?.parameters || config.parameters || {});
    
    // Update config
    const result = updateConfig(config, validElementIds, paramMap, paramMetadata, elementMetadata);
    const updatedConfig = result.config;
    changes.push(...result.changes);
    
    // Check for version migration
    if (originalVersion !== updatedConfig.version) {
      changes.push(`Migrated from v${originalVersion} to v${updatedConfig.version}`);
    }
    
    // Check for removed elements
    const updatedActiveElements = updatedConfig.layers?.[0]?.activeElements || [];
    const removedElements = originalActiveElements.filter(id => !updatedActiveElements.includes(id));
    if (removedElements.length > 0) {
      changes.push(`Removed deprecated elements: ${removedElements.join(', ')}`);
    }
    
    // Check for removed parameters
    const updatedParams = Object.keys(updatedConfig.layers?.[0]?.parameters || {});
    const removedParams = originalParams.filter(key => !updatedParams.includes(key));
    if (removedParams.length > 0) {
      changes.push(`Removed invalid parameters: ${removedParams.join(', ')}`);
    }
    
    // Check for added toneMapping
    if (!config.colorConfig.toneMapping && updatedConfig.colorConfig.toneMapping) {
      changes.push('Added missing toneMapping');
    }
    
    // Write updated config
    const updatedContent = JSON.stringify(updatedConfig, null, 2) + '\n';
    writeFileSync(filePath, updatedContent, 'utf-8');
    
    return { success: true, changes };
  } catch (error) {
    return { success: false, changes: [`Error: ${error instanceof Error ? error.message : String(error)}`] };
  }
}

function main() {
  try {
    const configsDir = join(__dirname, '../src/configs');
    const validElementIds = new Set(elementLibrary.map(el => el.id));
    const paramMap = buildElementParamMap();
    const paramMetadata = buildElementParamMetadata();
    const elementMetadata = buildElementMetadata();
    
    console.log('🔧 Migrating config files...\n');
    console.log(`Valid elements: ${Array.from(validElementIds).join(', ')}\n`);
  
    // Get all JSON files in configs directory
    const files = readdirSync(configsDir)
      .filter(file => file.endsWith('.json'))
      .sort();
  
    if (files.length === 0) {
      console.log('No config files found!');
      return;
    }
  
    let updatedCount = 0;
    let unchangedCount = 0;
    let failCount = 0;
    let totalChanges = 0;
  
    for (const file of files) {
      const filePath = join(configsDir, file);
      console.log(`📄 Processing ${file}...`);
    
      const result = updateConfigFile(filePath, validElementIds, paramMap, paramMetadata, elementMetadata);
    
      if (result.success) {
        if (result.changes.length > 0) {
          console.log(`  ✅ Updated (${result.changes.length} changes):`);
          result.changes.forEach(change => console.log(`     - ${change}`));
          totalChanges += result.changes.length;
          updatedCount++;
        } else {
          console.log(`  ✅ No changes needed`);
          unchangedCount++;
        }
      } else {
        console.log(`  ❌ Failed:`);
        result.changes.forEach(change => console.log(`     - ${change}`));
        failCount++;
      }
      console.log();
    }
  
    const totalFiles = files.length;
    console.log(`\n✨ Migration Summary:`);
    console.log(`   Total files:     ${totalFiles}`);
    console.log(`   Updated:         ${updatedCount}`);
    console.log(`   Unchanged:       ${unchangedCount}`);
    console.log(`   Failed:          ${failCount}`);
    if (totalChanges > 0) {
      console.log(`   Total changes:   ${totalChanges}`);
    }
  } catch (error) {
    console.error('❌ Fatal error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
