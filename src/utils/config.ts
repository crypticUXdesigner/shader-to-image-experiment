import type { SavedConfig, Layer } from '../types';
import type { VisualElement } from '../types';

export class ConfigManager {
  exportConfig(config: SavedConfig): string {
    return JSON.stringify(config, null, 2);
  }
  
  async loadConfig(file: File): Promise<SavedConfig> {
    const text = await file.text();
    return JSON.parse(text) as SavedConfig;
  }
  
  async loadConfigFromUrl(url: string): Promise<SavedConfig> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load config: ${response.statusText}`);
    }
    return await response.json() as SavedConfig;
  }
  
  copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
  }
  
  // Discover all config files using Vite's import.meta.glob
  static discoverConfigs(): string[] {
    const configModules = import.meta.glob('/src/configs/*.json', { eager: false });
    return Object.keys(configModules).map(path => {
      // Extract filename from path like '/src/configs/liquid-ring.json'
      const parts = path.split('/');
      return parts[parts.length - 1];
    }).sort();
  }
  
  migrateConfig(config: SavedConfig, elementLibrary: VisualElement[]): SavedConfig {
    const allElementIds = elementLibrary.map(el => el.id);
    
    // If config already has layers, it's new format
    if (config.layers && config.layers.length > 0) {
      // Merge missing elements into each layer's elementOrder
      const updatedLayers = config.layers.map(layer => {
        const configOrderSet = new Set(layer.elementOrder || []);
        const missingElements = allElementIds.filter(id => !configOrderSet.has(id));
        const elementOrder = [...(layer.elementOrder || []), ...missingElements];
        return {
          ...layer,
          elementOrder: elementOrder
        };
      });
      
      // Validate layers structure
      if (updatedLayers.length < 2) {
        // Add missing Layer 2 if only one layer exists
        // Get color config from existing layer or use default
        const existingColorConfig = updatedLayers[0]?.colorConfig || config.colorConfig;
        return {
          ...config,
          layers: [
            ...updatedLayers,
            {
              id: 'layer-2',
              activeElements: [],
              elementOrder: allElementIds,
              parameters: {},
              blendingMode: 0,
              opacity: 1.0,
              visible: false,
              colorConfig: { ...existingColorConfig }
            }
          ]
        };
      }
      return {
        ...config,
        layers: updatedLayers
      };
    }
    
    // Old format - migrate to Layer 1
    // Get active elements from old config
    const activeElements = config.activeElements || [];
    
    // Get element order from old config, merge with missing elements
    const configOrderSet = new Set(config.elementOrder || []);
    const missingElements = allElementIds.filter(id => !configOrderSet.has(id));
    const elementOrder = [...(config.elementOrder || []), ...missingElements];
    
    // Get parameters from old config
    const parameters = config.parameters || {};
    
    // Get color config from old config
    const mode = config.colorConfig?.mode === 'stops' ? 'thresholds' : (config.colorConfig?.mode || 'bezier');
    const colorConfig = config.colorConfig ? {
      mode: mode,
      transitionWidth: config.colorConfig.transitionWidth ?? 0.005,
      ditherStrength: config.colorConfig.ditherStrength ?? 0.0,
      pixelSize: config.colorConfig.pixelSize ?? 1.0,
      ...config.colorConfig
    } : {
      mode: 'bezier',
      startColor: { l: 0.2, c: 0.1, h: 200 },
      endColor: { l: 0.8, c: 0.2, h: 300 },
      stops: 12,
      transitionWidth: 0.005,
      ditherStrength: 0.0,
      pixelSize: 1.0,
      lCurve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 },
      cCurve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 },
      hCurve: { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 }
    };
    
    return {
      ...config,
      version: '2.0',  // Update version
      layers: [
        {
          id: 'layer-1',
          activeElements: activeElements,
          elementOrder: elementOrder,
          parameters: parameters,
          blendingMode: 0,  // Normal
          opacity: 1.0,
          visible: true,
          colorConfig: { ...colorConfig }
        },
        {
          id: 'layer-2',
          activeElements: [],
          elementOrder: allElementIds,
          parameters: {},
          blendingMode: 0,  // Normal
          opacity: 1.0,
          visible: false,  // Start hidden
          colorConfig: { ...colorConfig }
        }
      ]
    };
  }
}

