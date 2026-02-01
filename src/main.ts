/**
 * Main entry point for Node-Based Shader Composer
 * 
 * This replaces the old layer-based system with the new node-based system.
 */

import { NodeShaderCompiler } from './shaders/NodeShaderCompiler';
import { NodeEditor } from './ui/components/NodeEditor';
import { NodeEditorLayout } from './ui/components/NodeEditorLayout';
import { BottomBar } from './ui/components/BottomBar';
import { ErrorDisplay } from './ui/components/ErrorDisplay';
import { RuntimeManager } from './runtime/RuntimeManager';
import { createRuntimeManager } from './runtime/factories';
import { nodeSystemSpecs } from './shaders/nodes/index';
import { listPresets, loadPreset, copyGraphToClipboard } from './utils/presetManager';
import { exportImage } from './utils/export';
import { runVideoExportFlow, isSupported as isVideoExportSupported } from './video-export';
import { getCSSColor } from './utils/cssTokens';
import { loadTablerIconData } from './utils/tabler-icons-loader';
import { globalErrorHandler } from './utils/errorHandling';
import { safeDestroy } from './utils/Disposable';
import type { Disposable } from './utils/Disposable';
import type { NodeGraph } from './data-model/types';
import type { NodeSpec } from './types';

class App {
  private layout!: NodeEditorLayout;
  private bottomBar!: BottomBar;
  private nodeEditor!: NodeEditor;
  private runtimeManager!: RuntimeManager;
  private compiler!: NodeShaderCompiler;
  private nodeSpecs!: NodeSpec[];
  private animationFrameId: number | null = null;
  private errorDisplay!: ErrorDisplay;
  
  // Visibility detection for conditional rendering
  private isVisible: boolean = true;
  private intersectionObserver: IntersectionObserver | null = null;
  
  constructor() {
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    // Wait for icon data to load before creating UI components
    await loadTablerIconData();
    
    // Get main container
    const mainContainer = document.getElementById('main');
    if (!mainContainer) {
      throw new Error('Main container not found');
    }
    
    // Clear old UI
    mainContainer.innerHTML = '';
    const layoutBg = getCSSColor('layout-bg', '#1a1a1a');
    mainContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${layoutBg};
    `;
    
    // Create layout
    this.layout = new NodeEditorLayout(mainContainer);
    
    // Create bottom bar
    this.bottomBar = new BottomBar(mainContainer);
    
    // Connect bottom bar to layout for panel offset
    this.layout.setBottomBar(this.bottomBar);
    
    // Create error display component
    const errorDisplayContainer = document.createElement('div');
    errorDisplayContainer.id = 'error-display-container';
    mainContainer.appendChild(errorDisplayContainer);
    this.errorDisplay = new ErrorDisplay(errorDisplayContainer);
    
    // Set up error handler to display errors
    globalErrorHandler.onError((error: import('./utils/errorHandling').AppError) => {
      this.errorDisplay.showError(error);
    });
    
    // All node specs are now native NodeSpecs (VisualElements have been migrated)
    this.nodeSpecs = nodeSystemSpecs;
    
    // Create compiler
    const nodeSpecsMap = new Map<string, NodeSpec>();
    for (const spec of this.nodeSpecs) {
      nodeSpecsMap.set(spec.id, spec);
    }
    this.compiler = new NodeShaderCompiler(nodeSpecsMap);
    
    // Create preview canvas
    const previewCanvas = document.createElement('canvas');
    previewCanvas.style.cssText = `
      width: 100%;
      height: 100%;
      display: block;
    `;
    this.layout.getPreviewContainer().appendChild(previewCanvas);
    
    // Create runtime manager using factory function with error handler
    this.runtimeManager = createRuntimeManager(
      previewCanvas,
      this.compiler,
      undefined, // Old error callback (deprecated, kept for backward compatibility)
      globalErrorHandler // New error handler
    );
    
    // Automatically load first available preset
    let initialGraph: NodeGraph | null = null;
    let loadedPresetName: string | null = null;
    
    try {
      const presets = await listPresets();
      if (presets.length > 0) {
        // Prefer "glue" preset, otherwise load the first preset alphabetically
        let selectedPreset = presets.find(p => p.name === 'glue');
        if (!selectedPreset) {
          selectedPreset = presets[0];
        }
        console.log(`[App] Loading preset: ${selectedPreset.displayName} (${selectedPreset.name})`);
        initialGraph = await loadPreset(selectedPreset.name);
        if (initialGraph) {
          loadedPresetName = selectedPreset.name;
          // Generate new IDs to avoid conflicts
          const newGraphId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          initialGraph.id = newGraphId;
          
          const nodeIdMap = new Map<string, string>();
          for (const node of initialGraph.nodes) {
            const oldId = node.id;
            const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            nodeIdMap.set(oldId, newId);
            node.id = newId;
          }
          
          for (const conn of initialGraph.connections) {
            conn.id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            conn.sourceNodeId = nodeIdMap.get(conn.sourceNodeId) || conn.sourceNodeId;
            conn.targetNodeId = nodeIdMap.get(conn.targetNodeId) || conn.targetNodeId;
          }
          
          // Preserve viewState from preset if it exists, otherwise it will be set to default
          // The viewState will be applied when setGraph is called on the canvas
          if (!initialGraph.viewState) {
            initialGraph.viewState = {
              zoom: 1.0,
              panX: 0,
              panY: 0,
              selectedNodeIds: []
            };
          } else {
            // Clear selectedNodeIds to avoid conflicts with new node IDs
            initialGraph.viewState.selectedNodeIds = [];
          }
        }
      }
    } catch (error) {
      console.warn('[App] Failed to load preset:', error);
    }
    
    // Fallback to empty graph if no preset was loaded
    if (!initialGraph) {
      console.log('[App] No presets found, creating empty graph');
      initialGraph = {
        id: 'graph-1',
        name: 'New Shader',
        version: '2.0',
        nodes: [],
        connections: [],
        viewState: {
          zoom: 1.0,
          panX: 0,
          panY: 0,
          selectedNodeIds: []
        }
      };
    }
    
    // Create node editor
    this.nodeEditor = new NodeEditor(
      this.layout.getNodeEditorContainer(),
      initialGraph,
      this.nodeSpecs,
      {
        onGraphChanged: async (graph) => {
          await this.runtimeManager.setGraph(graph);
        },
        onConnectionRemoved: (connectionId) => {
          this.runtimeManager.onConnectionRemoved(connectionId);
        },
        onParameterChanged: async (nodeId, paramName, value, graph) => {
          this.runtimeManager.updateParameter(nodeId, paramName, value, graph);
          // Force full runtime sync when audio-analyzer config changes so visualizer and output
          // update immediately (same path as when adding a node), without requiring an extra action.
          if (graph) {
            const node = graph.nodes.find((n) => n.id === nodeId);
            const isAudioAnalyzerRuntimeParam =
              node?.type === 'audio-analyzer' &&
              (paramName === 'frequencyBands' ||
                paramName === 'smoothing' ||
                paramName === 'fftSize' ||
                /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(paramName));
            if (isAudioAnalyzerRuntimeParam) {
              await this.runtimeManager.setGraph(graph);
              this.runtimeManager.syncAudioAnalyzers();
              this.nodeEditor.getCanvasComponent().requestRender();
            }
          }
        },
        onFileParameterChanged: async (nodeId, paramName, file) => {
          console.log(`[main] onFileParameterChanged callback: nodeId=${nodeId}, paramName=${paramName}, file=`, file.name);
          try {
            await this.runtimeManager.onAudioFileParameterChange(nodeId, paramName, file);
            console.log(`[main] Audio file parameter change completed`);
          } catch (error) {
            console.error(`[main] Error in onAudioFileParameterChange:`, error);
            throw error;
          }
        },
        onSelectionChanged: (selectedNodeIds) => {
          this.layout.updateHelpButtonState(selectedNodeIds);
        }
      }
    );
    
    // Set audio manager reference in canvas for real-time value display
    this.nodeEditor.getCanvasComponent().setAudioManager(this.runtimeManager.getAudioManager());
    
    // When a project is loaded, always zoom out to fit all nodes in view
    if (initialGraph.nodes.length > 0) {
      setTimeout(() => {
        this.nodeEditor.getCanvasComponent().fitToView();
      }, 0);
    }
    
    // Setup bottom bar callbacks
    this.bottomBar.setCallbacks({
      onPlayToggle: () => {
        this.runtimeManager.toggleGlobalAudioPlayback();
      },
      onTimeChange: (time) => {
        this.runtimeManager.seekGlobalAudio(time);
      },
      getState: () => {
        return this.runtimeManager.getGlobalAudioState();
      },
      onToolChange: (tool) => {
        // Pass tool change to canvas
        this.nodeEditor.getCanvasComponent().setActiveTool(tool);
      }
    });
    
    // Connect spacebar state changes to bottom bar for visual feedback
    this.nodeEditor.getCanvasComponent().setSpacebarStateChangeCallback((isPressed) => {
      this.bottomBar.setSpacebarPressed(isPressed);
    });
    
    // Setup copy preset callback (must be after nodeEditor is created)
    this.layout.setCopyPresetCallback(async () => {
      const currentGraph = this.nodeEditor.getGraph();
      await copyGraphToClipboard(currentGraph);
    });
    
    // Setup export callback
    this.layout.setExportCallback(async () => {
      const currentGraph = this.nodeEditor.getGraph();
      await exportImage(currentGraph, this.compiler, {
        resolution: [1600, 1600],
        format: 'png',
        quality: 1.0
      });
    });

    // Setup video export callback
    this.layout.setVideoExportCallback(async () => {
      if (!isVideoExportSupported()) {
        throw new Error('Video export is not supported in this browser. WebCodecs (VideoEncoder/AudioEncoder) is required.');
      }
      const graph = this.nodeEditor.getGraph();
      const audioManager = this.runtimeManager.getAudioManager();
      const getPrimaryAudio = (): { nodeId: string; buffer: AudioBuffer } | null => {
        for (const node of graph.nodes) {
          if (node.type !== 'audio-file-input') continue;
          const state = audioManager.getAudioNodeState(node.id);
          if (state?.audioBuffer) {
            return { nodeId: node.id, buffer: state.audioBuffer };
          }
        }
        return null;
      };
      await runVideoExportFlow({
        graph,
        compiler: this.compiler,
        getPrimaryAudio,
      });
    });

    // Setup panel toggle callback and add panel to layout
    const panel = this.nodeEditor.getNodePanel();
    const panelContainer = this.layout.getPanelContainer();
    panelContainer.appendChild(panel.getPanelElement());
    
    this.layout.setPanelToggleCallback(() => {
      panel.toggle();
      this.layout.setPanelToggleActive(panel.isPanelVisible());
    });
    
    this.nodeEditor.setOpenPanelAndFocusSearchCallback(() => {
      if (!panel.isPanelVisible()) {
        panel.show();
        this.layout.setPanelToggleActive(true);
      }
      panel.focusSearch();
    });
    
    // Set initial panel state to match default (panel is visible by default)
    this.layout.setPanelToggleActive(panel.isPanelVisible());
    
    // Setup load preset callback
    this.layout.setLoadPresetCallback(async (presetName: string) => {
      const presetGraph = await loadPreset(presetName);
      if (presetGraph) {
        // Generate new IDs for the loaded graph to avoid conflicts
        const newGraphId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        presetGraph.id = newGraphId;
        
        // Generate new IDs for all nodes and connections
        const nodeIdMap = new Map<string, string>();
        for (const node of presetGraph.nodes) {
          const oldId = node.id;
          const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          nodeIdMap.set(oldId, newId);
          node.id = newId;
        }
        
        // Update connection IDs and references
        for (const conn of presetGraph.connections) {
          conn.id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          conn.sourceNodeId = nodeIdMap.get(conn.sourceNodeId) || conn.sourceNodeId;
          conn.targetNodeId = nodeIdMap.get(conn.targetNodeId) || conn.targetNodeId;
        }
        
        // Preserve viewState from preset if it exists, otherwise use fitToView
        if (!presetGraph.viewState) {
          presetGraph.viewState = {
            zoom: 1.0,
            panX: 0,
            panY: 0,
            selectedNodeIds: []
          };
        } else {
          // Clear selectedNodeIds to avoid conflicts with new node IDs
          presetGraph.viewState.selectedNodeIds = [];
        }
        
        // Load the graph into the editor
        this.nodeEditor.setGraph(presetGraph);
        await this.runtimeManager.setGraph(presetGraph);
        
        // When a project is loaded, always zoom out to fit all nodes in view
        if (presetGraph.nodes.length > 0) {
          setTimeout(() => {
            this.nodeEditor.getCanvasComponent().fitToView();
          }, 0);
        }
        
        // Update the dropdown to reflect the loaded preset
        this.layout.setSelectedPreset(presetName);
      } else {
        throw new Error(`Failed to load preset: ${presetName}`);
      }
    });
    
    // Setup zoom callbacks
    this.layout.setZoomCallbacks({
      onZoomChange: (zoom: number) => {
        const canvas = this.nodeEditor.getCanvasComponent();
        // setZoom will use canvas center if no coordinates provided
        canvas.setZoom(zoom);
      },
      getZoom: () => {
        return this.nodeEditor.getCanvasComponent().getViewState().zoom;
      }
    });
    
    // Setup Help button (enabled when exactly one node is selected)
    this.layout.setHelpCallbacks({
      isHelpEnabled: () => {
        const ids = this.nodeEditor.getCanvasComponent().getViewState().selectedNodeIds;
        return ids.length === 1;
      },
      onHelpClick: () => {
        this.nodeEditor.showHelpForSelection();
      }
    });
    this.layout.updateHelpButtonState();
    
    // Load and populate preset list
    await this.loadPresetList();
    
    // Set the selected preset in the dropdown if a preset was loaded
    if (loadedPresetName) {
      this.layout.setSelectedPreset(loadedPresetName);
    }
    
    // Set initial graph in runtime (await to ensure audio files load)
    await this.runtimeManager.setGraph(initialGraph);
    
    // Setup visibility detection
    this.setupVisibilityDetection();
    
    // Start animation loop
    this.startAnimation();
  }
  
  private setupVisibilityDetection(): void {
    // Detect tab visibility
    document.addEventListener('visibilitychange', () => {
      this.isVisible = !document.hidden;
      if (!this.isVisible) {
        // Pause animation when tab is hidden
        this.stopAnimation();
      } else {
        // Resume animation when tab becomes visible
        this.startAnimation();
      }
    });
    
    // Detect canvas visibility (IntersectionObserver)
    const previewCanvas = this.layout.getPreviewContainer().querySelector('canvas');
    if (previewCanvas) {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        const isVisible = entries[0].isIntersecting;
        this.isVisible = isVisible && !document.hidden;
        
        if (!this.isVisible) {
          this.stopAnimation();
        } else {
          this.startAnimation();
        }
      }, {
        threshold: 0.1 // Consider visible if 10% is visible
      });
      
      this.intersectionObserver.observe(previewCanvas);
    }
  }
  
  private startAnimation(): void {
    // Don't start if not visible
    if (!this.isVisible) {
      return;
    }
    
    // Cancel existing animation if running
    if (this.animationFrameId !== null) {
      return;
    }
    
    let lastFrameTime = performance.now();
    let lastZoomUpdate = performance.now();
    const ZOOM_UPDATE_INTERVAL = 100; // Update zoom display every 100ms
    
    const animate = (currentTime: number) => {
      // Check visibility before continuing
      if (!this.isVisible) {
        this.animationFrameId = null;
        return;
      }
      
      // Calculate frame time for FPS tracking
      const frameTime = currentTime - lastFrameTime;
      lastFrameTime = currentTime;
      
      // Update FPS counter
      this.layout.updateFPS(frameTime);
      
      // Update zoom display periodically
      if (currentTime - lastZoomUpdate >= ZOOM_UPDATE_INTERVAL) {
        lastZoomUpdate = currentTime;
        const zoom = this.nodeEditor.getCanvasComponent().getViewState().zoom;
        this.layout.updateZoomDisplay(zoom);
      }
      
      // Update time uniform (only if visible and dirty)
      const time = (currentTime / 1000.0) % 1000.0;
      this.runtimeManager.setTime(time);
      
      // Request node editor canvas redraw so audio-reactive UI (e.g. remap needles) animates every frame
      this.nodeEditor.getCanvasComponent().requestRender();
      
      // Continue animation loop
      this.animationFrameId = requestAnimationFrame(animate);
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  private stopAnimation(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  private async loadPresetList(): Promise<void> {
    try {
      const presets = await listPresets();
      await this.layout.updatePresetList(presets);
    } catch (error) {
      console.error('Failed to load preset list:', error);
    }
  }
  
  destroy(): void {
    // Stop animation first
    this.stopAnimation();
    
    // Cleanup visibility observer
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
      this.intersectionObserver = null;
    }
    
    // Clean up components in reverse order of creation
    // RuntimeManager depends on other components, so clean it up first
    safeDestroy(this.runtimeManager);
    
    // Then clean up UI components
    safeDestroy(this.nodeEditor as unknown as Disposable);
    safeDestroy(this.bottomBar as unknown as Disposable);
    safeDestroy(this.layout as unknown as Disposable);
    
    // Clear references
    this.runtimeManager = null as any;
    this.nodeEditor = null as any;
    this.bottomBar = null as any;
    this.layout = null as any;
    this.compiler = null as any;
    this.nodeSpecs = null as any;
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
