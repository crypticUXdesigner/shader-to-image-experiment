import { elementLibrary } from './shaders/elements/index';
import { ShaderCompiler } from './shaders/ShaderCompiler';
import { ShaderInstance } from './shaders/ShaderInstance';
import { StaticRenderer } from './shaders/StaticRenderer';
import { CombinedPanel } from './ui/components/CombinedPanel';
import { ColorSystem } from './ui/components/ColorSystem';
import { TimelineScrubber } from './ui/components/TimelineScrubber';
import { BlendControls } from './ui/components/BlendControls';
import { ExportManager } from './utils/export';
import { ConfigManager } from './utils/config';
import type { ColorConfig, TimelineConfig, ExportConfig, SavedConfig, Layer, FXLayer, ColorMode } from './types';

class App {
  private canvas: HTMLCanvasElement;
  private renderer: StaticRenderer;
  private compiler: ShaderCompiler;
  private shaderInstance: ShaderInstance | null = null;
  
  private layers: Layer[] = [];
  private activeLayerId: string = 'layer-1';
  private hiddenElements: Map<string, Set<string>> = new Map(); // layerId -> Set<elementId>
  private fxLayer!: FXLayer;
  private fxHiddenElements: Set<string> = new Set(); // FX element IDs that are hidden
  private colorConfig: ColorConfig;
  private timelineConfig: TimelineConfig;
  private exportConfig: ExportConfig;
  
  private combinedPanel: CombinedPanel;
  private fxPanel: CombinedPanel;
  private colorSystem: ColorSystem;
  private timelineScrubber: TimelineScrubber;
  private blendControls!: BlendControls;
  private exportManager: ExportManager;
  private configManager: ConfigManager;
  private availableConfigs: string[] = [];
  private needsRender: boolean = true;
  
  constructor() {
    // Initialize canvas and renderer
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!this.canvas) {
      throw new Error('Canvas not found');
    }
    
    this.renderer = new StaticRenderer(this.canvas);
    this.compiler = new ShaderCompiler();
    this.exportManager = new ExportManager();
    this.configManager = new ConfigManager();
    
    // Initialize default configs
    this.colorConfig = {
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
    
    this.timelineConfig = {
      value: 0.0,
      min: 0.0,
      max: 100.0,
      step: 0.01
    };
    
    this.exportConfig = {
      resolution: [1920, 1080],
      format: 'png',
      quality: 1.0
    };
    
    // Initialize UI components
    this.combinedPanel = new CombinedPanel(
      document.getElementById('combined-panel')!,
      (id, enabled) => this.handleElementToggle(id, enabled),
      (newOrder) => this.handleElementReorder(newOrder),
      (elementId, paramName, value) => this.handleParameterChange(elementId, paramName, value),
      (id, hidden) => this.handleElementVisibilityToggle(id, hidden)
    );
    
    // Initialize FX panel (only shows post-processors)
    this.fxPanel = new CombinedPanel(
      document.getElementById('fx-panel')!,
      (id, enabled) => this.handleFXElementToggle(id, enabled),
      (newOrder) => this.handleFXElementReorder(newOrder),
      (elementId, paramName, value) => this.handleFXParameterChange(elementId, paramName, value),
      (id, hidden) => this.handleFXElementVisibilityToggle(id, hidden)
    );
    
    this.colorSystem = new ColorSystem(
      document.getElementById('color-system')!,
      this.colorConfig,
      (config) => this.handleColorChange(config)
    );
    
    this.timelineScrubber = new TimelineScrubber(
      document.getElementById('timeline-scrubber')!,
      this.timelineConfig,
      (time) => this.handleTimeChange(time)
    );
    
    // Initialize layer UI components
    const blendControlsContainer = document.getElementById('blend-controls');
    if (blendControlsContainer) {
      this.blendControls = new BlendControls(
        blendControlsContainer,
        (layer) => this.handleLayerUpdate(layer)
      );
    }
    
    // Initialize layers
    this.initializeLayers();
    
    // Initialize FX layer
    this.initializeFXLayer();
    
    // Initialize UI with active layer
    const activeLayer = this.getActiveLayer();
    this.combinedPanel.setElements(elementLibrary);
    this.updateCombinedPanelForActiveLayer();
    
    // Initialize FX panel with post-processors only
    const postProcessorElements = elementLibrary.filter(el => (el.elementType || 'content-generator') === 'post-processor');
    this.fxPanel.setElements(postProcessorElements);
    // fxLayer is initialized in initializeFXLayer() above
    this.fxPanel.setActiveElements(this.fxLayer.activeElements);
    this.fxPanel.setElementOrder(this.fxLayer.elementOrder);
    this.fxPanel.setHiddenElements(this.fxHiddenElements);
    this.updateFXPanelParameters();
    
    // Update color system with active layer's color config
    this.colorSystem.setConfig(activeLayer.colorConfig);
    
    // Update layer UI
    this.updateLayerUI();
    
    this.recompileShader();
    
    // Set up export button
    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.handleExport());
    }
    
    // Set up hardsave button
    const hardsaveBtn = document.getElementById('hardsave-btn');
    if (hardsaveBtn) {
      hardsaveBtn.addEventListener('click', () => this.handleHardsave());
    }
    
    // Set up config selector
    this.initializeConfigSelector();
    
    // Set up tab switching (Layers/Edit/Color)
    this.initializeTabs();
    
    // Start render loop
    requestAnimationFrame(() => this.renderLoop());
  }
  
  private getActiveLayer(): Layer {
    const layer = this.layers.find(l => l.id === this.activeLayerId);
    if (!layer) {
      throw new Error(`Active layer ${this.activeLayerId} not found`);
    }
    return layer;
  }
  
  private initializeLayers(): void {
    // Initialize with 2 default layers
    this.layers = [
      {
        id: 'layer-1',
        activeElements: ['fbm-noise'],
        elementOrder: elementLibrary.map(el => el.id),
        parameters: {},
        blendingMode: 0,
        opacity: 1.0,
        visible: true,
        colorConfig: { ...this.colorConfig }
      },
      {
        id: 'layer-2',
        activeElements: [],
        elementOrder: elementLibrary.map(el => el.id),
        parameters: {},
        blendingMode: 0,
        opacity: 1.0,
        visible: true,  // Make visible by default so user can see it
        colorConfig: { ...this.colorConfig }
      }
    ];
    
    // Initialize parameters for Layer 1 default element
    const layer1 = this.layers[0];
    const fbmElement = elementLibrary.find(el => el.id === 'fbm-noise');
    if (fbmElement) {
      Object.entries(fbmElement.parameters).forEach(([paramName, config]) => {
        layer1.parameters[`fbm-noise.${paramName}`] = config.default;
      });
    }
    
    // Initialize hidden elements map
    this.hiddenElements.set('layer-1', new Set());
    this.hiddenElements.set('layer-2', new Set());
  }
  
  private initializeFXLayer(): void {
    // Initialize FX layer with empty post-processors
    const postProcessorIds = elementLibrary
      .filter(el => (el.elementType || 'content-generator') === 'post-processor')
      .map(el => el.id);
    
    this.fxLayer = {
      id: 'fx',
      activeElements: [],
      elementOrder: postProcessorIds,
      parameters: {}
    };
  }
  
  private updateCombinedPanelForActiveLayer(): void {
    const layer = this.getActiveLayer();
    const hidden = this.hiddenElements.get(layer.id) || new Set();
    
    this.combinedPanel.setActiveElements(layer.activeElements);
    this.combinedPanel.setElementOrder(layer.elementOrder);
    this.combinedPanel.setHiddenElements(hidden);
    
    // Update parameter values in UI
    Object.entries(layer.parameters).forEach(([key, value]) => {
      const [elementId, paramName] = key.split('.');
      this.combinedPanel.setParameterValue(elementId, paramName, value);
    });
  }
  
  private updateLayerUI(): void {
    const activeLayer = this.getActiveLayer();
    const isLayer1 = activeLayer.id === 'layer-1';
    
    // Update blend controls (only for layer 2)
    if (this.blendControls) {
      if (!isLayer1) {
        this.blendControls.setLayer(activeLayer);
      }
    }
    
    // Update visibility switch (only for layer 2)
    const visibilitySwitch = document.getElementById('layer-visibility-switch') as HTMLButtonElement;
    const visibilitySwitchContainer = document.getElementById('layer-visibility-switch-container');
    if (visibilitySwitch && visibilitySwitchContainer) {
      if (isLayer1) {
        visibilitySwitchContainer.style.display = 'none';
      } else {
        visibilitySwitchContainer.style.display = 'flex';
        if (activeLayer.visible) {
          visibilitySwitch.classList.add('is-active');
        } else {
          visibilitySwitch.classList.remove('is-active');
        }
      }
    }
  }
  
  private handleLayerUpdate(layer: Layer): void {
    const index = this.layers.findIndex(l => l.id === layer.id);
    if (index !== -1) {
      // Layer 1 is always visible
      if (layer.id === 'layer-1') {
        layer.visible = true;
      }
      this.layers[index] = { ...layer };
      this.recompileShader();
      this.updateLayerUI();
    }
  }
  
  private renderLoop(): void {
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
    requestAnimationFrame(() => this.renderLoop());
  }
  
  private handleElementToggle(elementId: string, enabled: boolean): void {
    const layer = this.getActiveLayer();
    
    if (enabled) {
      if (!layer.activeElements.includes(elementId)) {
        layer.activeElements.push(elementId);
        
        // When turning on an element, also make it visible (remove from hidden set)
        const hiddenSet = this.hiddenElements.get(layer.id) || new Set();
        hiddenSet.delete(elementId);
        this.hiddenElements.set(layer.id, hiddenSet);
        
        // Initialize default parameters for newly enabled element
        const element = elementLibrary.find(el => el.id === elementId);
        if (element) {
          Object.entries(element.parameters).forEach(([paramName, paramConfig]) => {
            const key = `${elementId}.${paramName}`;
            if (!layer.parameters[key]) {
              layer.parameters[key] = paramConfig.default;
              this.combinedPanel.setParameterValue(elementId, paramName, paramConfig.default);
            }
          });
        }
        
        // Special handling: if block-color-glitch is enabled, sync parameters from block-displacement
        if (elementId === 'block-color-glitch' && layer.activeElements.includes('block-displacement')) {
          const blockDisplacementElement = elementLibrary.find(el => el.id === 'block-displacement');
          if (blockDisplacementElement) {
            const paramMapping: Record<string, string> = {
              'blockDirection': 'blockGlitchDirection',
              'blockCount': 'blockGlitchCount',
              'blockMinSize': 'blockGlitchMinSize',
              'blockMaxSize': 'blockGlitchMaxSize',
              'blockSeed': 'blockGlitchSeed',
            };
            
            Object.entries(paramMapping).forEach(([blockParam, glitchParam]) => {
              const blockValue = layer.parameters[`block-displacement.${blockParam}`];
              if (blockValue !== undefined) {
                layer.parameters[`block-color-glitch.${glitchParam}`] = blockValue;
                this.combinedPanel.setParameterValue('block-color-glitch', glitchParam, blockValue);
              }
            });
          }
        }
      }
    } else {
      layer.activeElements = layer.activeElements.filter(id => id !== elementId);
    }
    
    this.updateCombinedPanelForActiveLayer();
    this.recompileShader();
    
    // Note: recompileShader() already sets all parameters from all layers, so no need to set again here
  }
  
  private handleElementVisibilityToggle(elementId: string, hidden: boolean): void {
    const layer = this.getActiveLayer();
    const hiddenSet = this.hiddenElements.get(layer.id) || new Set();
    
    if (hidden) {
      hiddenSet.add(elementId);
    } else {
      hiddenSet.delete(elementId);
    }
    
    this.hiddenElements.set(layer.id, hiddenSet);
    this.combinedPanel.setHiddenElements(hiddenSet);
    this.recompileShader();
    
    // Note: recompileShader() already sets all parameters from all layers, so no need to set again here
  }
  
  private handleElementReorder(newOrder: string[]): void {
    const layer = this.getActiveLayer();
    layer.elementOrder = newOrder;
    this.combinedPanel.setElementOrder(layer.elementOrder);
    this.recompileShader();
  }
  
  // FX layer handlers
  private handleFXElementToggle(elementId: string, enabled: boolean): void {
    if (enabled) {
      if (!this.fxLayer.activeElements.includes(elementId)) {
        this.fxLayer.activeElements.push(elementId);
        
        // When turning on an element, also make it visible (remove from hidden set)
        this.fxHiddenElements.delete(elementId);
        
        // Initialize default parameters for newly enabled element
        const element = elementLibrary.find(el => el.id === elementId);
        if (element) {
          Object.entries(element.parameters).forEach(([paramName, paramConfig]) => {
            const key = `${elementId}.${paramName}`;
            if (!this.fxLayer.parameters[key]) {
              this.fxLayer.parameters[key] = paramConfig.default;
              this.fxPanel.setParameterValue(elementId, paramName, paramConfig.default);
            }
          });
        }
      }
    } else {
      this.fxLayer.activeElements = this.fxLayer.activeElements.filter(id => id !== elementId);
    }
    
    this.fxPanel.setActiveElements(this.fxLayer.activeElements);
    this.fxPanel.setHiddenElements(this.fxHiddenElements);
    this.recompileShader();
  }
  
  private handleFXElementReorder(newOrder: string[]): void {
    this.fxLayer.elementOrder = newOrder;
    this.fxPanel.setElementOrder(this.fxLayer.elementOrder);
    this.recompileShader();
  }
  
  private handleFXElementVisibilityToggle(elementId: string, hidden: boolean): void {
    if (hidden) {
      this.fxHiddenElements.add(elementId);
    } else {
      this.fxHiddenElements.delete(elementId);
    }
    
    this.fxPanel.setHiddenElements(this.fxHiddenElements);
    this.recompileShader();
  }
  
  private handleFXParameterChange(elementId: string, paramName: string, value: number): void {
    this.fxLayer.parameters[`${elementId}.${paramName}`] = value;
    
    // Update shader parameter immediately (FX uses global uniforms, no layer number)
    if (this.shaderInstance && this.fxLayer.activeElements.includes(elementId)) {
      this.shaderInstance.setParameter(elementId, paramName, value);
    }
    this.needsRender = true;
  }
  
  private updateFXPanelParameters(): void {
    Object.entries(this.fxLayer.parameters).forEach(([key, value]) => {
      const [elementId, paramName] = key.split('.');
      this.fxPanel.setParameterValue(elementId, paramName, value);
    });
  }
  
  private handleParameterChange(elementId: string, paramName: string, value: number): void {
    const layer = this.getActiveLayer();
    layer.parameters[`${elementId}.${paramName}`] = value;
    
    // Auto-sync block-color-glitch parameters from block-displacement
    if (elementId === 'block-displacement' && layer.activeElements.includes('block-color-glitch')) {
      const paramMapping: Record<string, string> = {
        'blockDirection': 'blockGlitchDirection',
        'blockCount': 'blockGlitchCount',
        'blockMinSize': 'blockGlitchMinSize',
        'blockMaxSize': 'blockGlitchMaxSize',
        'blockSeed': 'blockGlitchSeed',
      };
      
      const glitchParamName = paramMapping[paramName];
      if (glitchParamName) {
        layer.parameters[`block-color-glitch.${glitchParamName}`] = value;
        // Update UI
        this.combinedPanel.setParameterValue('block-color-glitch', glitchParamName, value);
      }
    }
    
    if (this.shaderInstance) {
      // Get layer number (1 or 2) for this layer
      const layerNum = this.layers.indexOf(layer) + 1;
      // Set the parameter with layer information for layer-specific uniforms
      this.shaderInstance.setParameter(elementId, paramName, value, layerNum);
      
      // Also set synced block-color-glitch parameter if applicable
      if (elementId === 'block-displacement' && layer.activeElements.includes('block-color-glitch')) {
        const paramMapping: Record<string, string> = {
          'blockDirection': 'blockGlitchDirection',
          'blockCount': 'blockGlitchCount',
          'blockMinSize': 'blockGlitchMinSize',
          'blockMaxSize': 'blockGlitchMaxSize',
          'blockSeed': 'blockGlitchSeed',
        };
        const glitchParamName = paramMapping[paramName];
        if (glitchParamName) {
          this.shaderInstance.setParameter('block-color-glitch', glitchParamName, value, layerNum);
        }
      }
    }
    this.needsRender = true;
  }
  
  private handleColorChange(config: ColorConfig): void {
    // Update color config for active layer
    const layer = this.getActiveLayer();
    layer.colorConfig = config;
    
    // Also update global color config for backward compatibility
    this.colorConfig = config;
    
    // Update shader with new color config for active layer
    if (this.shaderInstance) {
      const layerNum = this.layers.indexOf(layer) + 1;
      this.shaderInstance.setLayerColorConfig(layerNum, config);
    }
    
    this.needsRender = true;
  }
  
  private handleTimeChange(time: number): void {
    this.timelineConfig.value = time;
    // Update time synchronously to ensure it's set before the next render
    if (this.renderer) {
      this.renderer.setTime(time);
    }
    // Mark that we need to render on the next frame
    this.needsRender = true;
  }
  
  private recompileShader(): void {
    const shaderSource = this.compiler.compileShaderWithLayers(this.layers, elementLibrary, this.hiddenElements, this.fxLayer, this.fxHiddenElements);
    
    // Destroy old shader
    if (this.shaderInstance) {
      this.shaderInstance.destroy();
    }
    
    // Create new shader
    const gl = this.canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    
    this.shaderInstance = new ShaderInstance(gl, shaderSource);
    this.renderer.setShader(this.shaderInstance);
    
    // Set all parameters from all layers with layer-specific uniform names
    this.layers.forEach((layer, layerIndex) => {
      const layerNum = layerIndex + 1;
      Object.entries(layer.parameters).forEach(([key, value]) => {
        const [elementId, paramName] = key.split('.');
        
        // Only set if element is active in this layer
        if (layer.activeElements.includes(elementId)) {
          // Set parameter with layer number for layer-specific uniforms
          this.shaderInstance!.setParameter(elementId, paramName, value, layerNum);
        }
      });
    });
    
    // Set FX layer parameters (no layer number - FX uses global uniforms)
    if (this.fxLayer) {
      Object.entries(this.fxLayer.parameters).forEach(([key, value]) => {
        const [elementId, paramName] = key.split('.');
        
        // Only set if element is active in FX layer
        if (this.fxLayer.activeElements.includes(elementId)) {
          // Set parameter without layer number for FX (global uniforms)
          this.shaderInstance!.setParameter(elementId, paramName, value);
        }
      });
    }
    
    // Set layer uniforms and color configs
    this.layers.forEach((layer, index) => {
      const layerNum = index + 1;
      this.shaderInstance!.setLayerProperties(layerNum, layer.blendingMode, layer.opacity, layer.visible);
      this.shaderInstance!.setLayerColorConfig(layerNum, layer.colorConfig);
    });
    
    // Set time
    this.renderer.setTime(this.timelineConfig.value);
    
    this.needsRender = true;
  }
  
  private render(): void {
    if (this.shaderInstance) {
      this.renderer.render();
    }
  }
  
  private async handleExport(): Promise<void> {
    try {
      await this.exportManager.exportImage(
        this.renderer,
        this.exportConfig,
        this.layers,
        this.timelineConfig,
        this.hiddenElements
      );
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed: ' + (error as Error).message);
    }
  }
  
  private async handleHardsave(): Promise<void> {
    const config: SavedConfig = {
      version: '2.0',
      timestamp: new Date().toISOString(),
      layers: this.layers.map(layer => ({ ...layer })),
      fxLayer: { ...this.fxLayer },
      colorConfig: this.colorConfig,
      timelineConfig: this.timelineConfig,
      exportConfig: this.exportConfig
    };
    
    const configText = this.configManager.exportConfig(config);
    
    try {
      await this.configManager.copyToClipboard(configText);
      alert('Configuration copied to clipboard! Paste it into a file in the configs/ directory.');
    } catch (error) {
      console.error('Copy failed:', error);
      // Fallback: show in textarea
      const textarea = document.createElement('textarea');
      textarea.value = configText;
      textarea.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 80%; height: 80%; background: #1a1a1a; color: #e0e0e0; padding: 1rem; border: 1px solid #3a3a3a; border-radius: 4px; z-index: 1000;';
      document.body.appendChild(textarea);
      textarea.select();
      alert('Select all and copy the configuration text.');
    }
  }
  
  private async initializeConfigSelector(): Promise<void> {
    const selector = document.getElementById('config-selector') as HTMLSelectElement;
    if (!selector) return;
    
    // Discover available configs
    this.availableConfigs = ConfigManager.discoverConfigs();
    
    // Populate dropdown
    selector.innerHTML = '';
    if (this.availableConfigs.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No configs found';
      selector.appendChild(option);
      return;
    }
    
    this.availableConfigs.forEach(configName => {
      const option = document.createElement('option');
      option.value = configName;
      option.textContent = configName.replace('.json', '');
      selector.appendChild(option);
    });
    
    // Auto-load first config
    if (this.availableConfigs.length > 0) {
      selector.value = this.availableConfigs[0];
      await this.loadConfig(this.availableConfigs[0]);
    }
    
    // Set up change handler
    selector.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.value) {
        await this.loadConfig(target.value);
      }
    });
  }
  
  private initializeTabs(): void {
    const tabLayer1 = document.getElementById('tab-layer-1');
    const tabLayer2 = document.getElementById('tab-layer-2');
    const tabFX = document.getElementById('tab-fx');
    const tabCombined = document.getElementById('tab-combined');
    const tabColor = document.getElementById('tab-color');
    const tabBlend = document.getElementById('tab-blend');
    const combinedContent = document.getElementById('combined-tab-content');
    const colorContent = document.getElementById('color-tab-content');
    const blendContent = document.getElementById('blend-tab-content');
    const fxContent = document.getElementById('fx-tab-content');
    const visibilitySwitch = document.getElementById('layer-visibility-switch') as HTMLInputElement;
    
    if (!tabLayer1 || !tabLayer2 || !tabFX || !tabCombined || !tabColor || !combinedContent || !colorContent || !tabBlend || !blendContent || !fxContent) return;

    // Layer tab handlers - switch active layer
    const selectLayer1 = () => {
      tabLayer1.classList.add('active');
      tabLayer2.classList.remove('active');
      tabFX.classList.remove('active');
      this.activeLayerId = 'layer-1';
      this.updateCombinedPanelForActiveLayer();
      const activeLayer = this.getActiveLayer();
      this.colorSystem.setConfig(activeLayer.colorConfig);
      // Hide Blend tab for layer 1
      tabBlend.style.display = 'none';
      // Show mode tabs row when not on FX
      const modeTabsRow = document.querySelector('.tabs-row-mode');
      if (modeTabsRow) {
        (modeTabsRow as HTMLElement).style.display = 'flex';
      }
      // Always switch to Edit tab when selecting layer 1
      showCombined();
      this.updateLayerUI();
    };
    
    const selectLayer2 = () => {
      tabLayer1.classList.remove('active');
      tabLayer2.classList.add('active');
      tabFX.classList.remove('active');
      this.activeLayerId = 'layer-2';
      this.updateCombinedPanelForActiveLayer();
      const activeLayer = this.getActiveLayer();
      this.colorSystem.setConfig(activeLayer.colorConfig);
      // Show Blend tab for layer 2
      tabBlend.style.display = 'block';
      // Show mode tabs row when not on FX
      const modeTabsRow = document.querySelector('.tabs-row-mode');
      if (modeTabsRow) {
        (modeTabsRow as HTMLElement).style.display = 'flex';
      }
      // Always switch to Edit tab when selecting layer 2
      showCombined();
      this.updateLayerUI();
    };
    
    const selectFX = () => {
      tabLayer1.classList.remove('active');
      tabLayer2.classList.remove('active');
      tabFX.classList.add('active');
      // Hide Blend tab when on FX
      tabBlend.style.display = 'none';
      // Hide the entire mode tabs row when FX is active
      const modeTabsRow = document.querySelector('.tabs-row-mode');
      if (modeTabsRow) {
        (modeTabsRow as HTMLElement).style.display = 'none';
      }
      // Switch to Edit tab if on Blend
      if (tabBlend.classList.contains('active')) {
        showCombined();
      }
      // Show FX content, hide others
      combinedContent.style.display = 'none';
      colorContent.style.display = 'none';
      blendContent.style.display = 'none';
      fxContent.style.display = 'flex';
    };

    // Mode tab handlers - switch between Edit, Color, and Blend views
    const showCombined = () => {
      tabCombined.classList.add('active');
      tabColor.classList.remove('active');
      tabBlend.classList.remove('active');
      combinedContent.style.display = 'flex';
      colorContent.style.display = 'none';
      blendContent.style.display = 'none';
      fxContent.style.display = 'none';
    };
    
    const showColor = () => {
      tabCombined.classList.remove('active');
      tabColor.classList.add('active');
      tabBlend.classList.remove('active');
      combinedContent.style.display = 'none';
      colorContent.style.display = 'flex';
      blendContent.style.display = 'none';
      fxContent.style.display = 'none';
    };
    
    const showBlend = () => {
      tabCombined.classList.remove('active');
      tabColor.classList.remove('active');
      tabBlend.classList.add('active');
      combinedContent.style.display = 'none';
      colorContent.style.display = 'none';
      blendContent.style.display = 'flex';
      fxContent.style.display = 'none';
    };

    tabLayer1.addEventListener('click', selectLayer1);
    tabLayer2.addEventListener('click', selectLayer2);
    tabFX.addEventListener('click', selectFX);
    tabCombined.addEventListener('click', showCombined);
    tabColor.addEventListener('click', showColor);
    tabBlend.addEventListener('click', showBlend);
    
    // Visibility switch handler
    if (visibilitySwitch) {
      visibilitySwitch.addEventListener('click', () => {
        const activeLayer = this.getActiveLayer();
        if (activeLayer.id === 'layer-2') {
          const newState = !activeLayer.visible;
          activeLayer.visible = newState;
          visibilitySwitch.classList.toggle('is-active', newState);
          this.handleLayerUpdate(activeLayer);
        }
      });
    }
    
    // Initialize active layer tab based on current activeLayerId
    if (this.activeLayerId === 'layer-2') {
      tabLayer2.classList.add('active');
      tabLayer1.classList.remove('active');
      tabBlend.style.display = 'block';
    } else {
      tabLayer1.classList.add('active');
      tabLayer2.classList.remove('active');
      tabBlend.style.display = 'none';
    }
  }
  
  private async loadConfig(configName: string): Promise<void> {
    try {
      // Use import.meta.glob for loading (works with Vite base path)
      const config = await this.configManager.loadConfigByName(configName);
      this.applyConfig(config);
    } catch (error) {
      console.error('Failed to load config:', error);
      alert(`Failed to load config: ${(error as Error).message}`);
    }
  }
  
  private applyConfig(config: SavedConfig): void {
    // Migrate config if needed
    const migratedConfig = this.configManager.migrateConfig(config, elementLibrary);
    
    // Apply layers
    if (migratedConfig.layers && migratedConfig.layers.length >= 2) {
      this.layers = migratedConfig.layers.map(layer => ({ ...layer }));
      
      // Layer 1 is always visible
      const layer1 = this.layers.find(l => l.id === 'layer-1');
      if (layer1) {
        layer1.visible = true;
      }
      
      // Set active layer to Layer 1 by default
      this.activeLayerId = 'layer-1';
      
      // Initialize hidden elements map
      this.hiddenElements.clear();
      this.layers.forEach(layer => {
        this.hiddenElements.set(layer.id, new Set());
      });
      
      // Initialize missing parameters with defaults for active elements in each layer
      this.layers.forEach(layer => {
        layer.activeElements.forEach(elementId => {
          const element = elementLibrary.find(el => el.id === elementId);
          if (element) {
            Object.entries(element.parameters).forEach(([paramName, paramConfig]) => {
              const key = `${elementId}.${paramName}`;
              if (!layer.parameters[key]) {
                layer.parameters[key] = paramConfig.default;
              }
            });
          }
        });
      });
      
      // Update UI for active layer
      this.updateCombinedPanelForActiveLayer();
    } else {
      // Fallback: initialize with defaults
      this.initializeLayers();
    }
    
    // Apply FX layer
    if (migratedConfig.fxLayer) {
      this.fxLayer = { ...migratedConfig.fxLayer };
      // Initialize missing parameters
      this.fxLayer.activeElements.forEach(elementId => {
        const element = elementLibrary.find(el => el.id === elementId);
        if (element) {
          Object.entries(element.parameters).forEach(([paramName, paramConfig]) => {
            const key = `${elementId}.${paramName}`;
            if (!this.fxLayer.parameters[key]) {
              this.fxLayer.parameters[key] = paramConfig.default;
            }
          });
        }
      });
      // Update FX panel
      const postProcessorElements = elementLibrary.filter(el => (el.elementType || 'content-generator') === 'post-processor');
      this.fxPanel.setElements(postProcessorElements);
      this.fxPanel.setActiveElements(this.fxLayer.activeElements);
      this.fxPanel.setElementOrder(this.fxLayer.elementOrder);
      this.updateFXPanelParameters();
    } else {
      // Initialize FX layer with defaults
      this.initializeFXLayer();
      const postProcessorElements = elementLibrary.filter(el => (el.elementType || 'content-generator') === 'post-processor');
      this.fxPanel.setElements(postProcessorElements);
      this.fxPanel.setActiveElements(this.fxLayer.activeElements);
      this.fxPanel.setElementOrder(this.fxLayer.elementOrder);
    }
    
    // Apply color config to layers (per-layer colors)
    // Handle legacy 'stops' mode (which was renamed to 'thresholds')
    const legacyMode = (migratedConfig.colorConfig.mode as any) === 'stops' ? 'thresholds' : migratedConfig.colorConfig.mode;
    const mode: ColorMode = (legacyMode === 'thresholds' || legacyMode === 'bezier') ? legacyMode : 'bezier';
    
    // Destructure to exclude mode from spread to avoid duplicate
    const { mode: _, ...colorConfigWithoutMode } = migratedConfig.colorConfig;
    const defaultColorConfig: ColorConfig = { 
      mode: mode,
      transitionWidth: migratedConfig.colorConfig.transitionWidth ?? 0.005,
      ditherStrength: migratedConfig.colorConfig.ditherStrength ?? 0.0,
      pixelSize: migratedConfig.colorConfig.pixelSize ?? 1.0,
      ...colorConfigWithoutMode 
    };
    
    // If layers don't have colorConfig, assign the migrated one
    this.layers.forEach(layer => {
      if (!layer.colorConfig) {
        layer.colorConfig = { ...defaultColorConfig };
      }
    });
    
    // Set global color config for backward compatibility
    this.colorConfig = defaultColorConfig;
    
    // Update color system with active layer's color config
    const activeLayer = this.getActiveLayer();
    this.colorSystem.setConfig(activeLayer.colorConfig);
    
    // Apply timeline config
    this.timelineConfig = { ...migratedConfig.timelineConfig };
    this.timelineScrubber.setConfig(this.timelineConfig);
    if (this.renderer) {
      this.renderer.setTime(this.timelineConfig.value);
    }
    
    // Apply export config
    this.exportConfig = { ...migratedConfig.exportConfig };
    
    // Recompile shader with new configuration
    this.recompileShader();
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}

