/**
 * Main entry point for Node-Based Shader Composer
 * 
 * This replaces the old layer-based system with the new node-based system.
 */

import { elementLibrary } from './shaders/elements/index';
import { NodeShaderCompiler } from './shaders/NodeShaderCompiler';
import { NodeEditor } from './ui/components/NodeEditor';
import { NodeEditorLayout } from './ui/components/NodeEditorLayout';
import { RuntimeManager } from './runtime/RuntimeManager';
import { visualElementToNodeSpec } from './utils/nodeSpecAdapter';
import { nodeSystemSpecs } from './shaders/nodes/index';
import { saveDefaultState } from './utils/defaultState';
import { listPresets, loadPreset, copyGraphToClipboard } from './utils/presetManager';
import { exportImage } from './utils/export';
import { getCSSColor } from './utils/cssTokens';
import type { NodeGraph } from './data-model/types';
import type { NodeSpec } from './types';

class App {
  private layout!: NodeEditorLayout;
  private nodeEditor!: NodeEditor;
  private runtimeManager!: RuntimeManager;
  private compiler!: NodeShaderCompiler;
  private nodeSpecs!: NodeSpec[];
  private animationFrameId: number | null = null;
  
  constructor() {
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
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
    
    // Convert visual elements to node specs and add node system specific specs
    const elementSpecs = elementLibrary.map(visualElementToNodeSpec);
    this.nodeSpecs = [...elementSpecs, ...nodeSystemSpecs];
    
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
    
    // Create runtime manager
    this.runtimeManager = new RuntimeManager(
      previewCanvas,
      this.compiler,
      (error) => {
        console.error('Shader error:', error);
        // TODO: Display error in UI
      }
    );
    
    // Automatically load first available preset
    let initialGraph: NodeGraph | null = null;
    
    try {
      const presets = await listPresets();
      if (presets.length > 0) {
        // Load the first preset alphabetically
        const firstPreset = presets[0];
        console.log(`[App] Loading first preset: ${firstPreset.displayName} (${firstPreset.name})`);
        initialGraph = await loadPreset(firstPreset.name);
        if (initialGraph) {
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
          
          // Reset view state
          initialGraph.viewState = {
            zoom: 1.0,
            panX: 0,
            panY: 0,
            selectedNodeIds: []
          };
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
        onGraphChanged: (graph) => {
          this.runtimeManager.setGraph(graph);
        },
        onParameterChanged: (nodeId, paramName, value) => {
          this.runtimeManager.updateParameter(nodeId, paramName, value);
        }
      }
    );
    
    // Setup save as default callback
    this.layout.setSaveAsDefaultCallback(() => {
      const currentGraph = this.nodeEditor.getGraph();
      try {
        saveDefaultState(currentGraph);
        // Success feedback is handled by the layout's toast system
      } catch (error) {
        // Error feedback is handled by the layout's toast system
        throw error;
      }
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
        
        // Reset view state
        presetGraph.viewState = {
          zoom: 1.0,
          panX: 0,
          panY: 0,
          selectedNodeIds: []
        };
        
        // Load the graph into the editor
        this.nodeEditor.setGraph(presetGraph);
        this.runtimeManager.setGraph(presetGraph);
      } else {
        throw new Error(`Failed to load preset: ${presetName}`);
      }
    });
    
    // Load and populate preset list
    this.loadPresetList();
    
    // Set initial graph in runtime
    this.runtimeManager.setGraph(initialGraph);
    
    // Start animation loop
    this.startAnimation();
  }
  
  private startAnimation(): void {
    const animate = (currentTime: number) => {
      
      // Update time uniform
      const time = (currentTime / 1000.0) % 1000.0;
      this.runtimeManager.setTime(time);
      
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
    this.stopAnimation();
    // Cleanup if needed
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
