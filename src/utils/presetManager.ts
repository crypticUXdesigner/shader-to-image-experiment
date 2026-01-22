/**
 * Preset Manager for Node-Based Shader System
 * 
 * Handles listing, loading, and managing preset files for the node-based system.
 * Presets are stored as JSON files in the src/presets/ directory.
 */

import type { NodeGraph } from '../data-model/types';
import { serializeGraph } from '../data-model/serialization';

/**
 * Preset metadata (filename without extension)
 */
export interface PresetInfo {
  name: string;  // Filename without .json extension
  displayName: string;  // Human-readable name (derived from filename)
}

/**
 * List all available presets
 * Uses Vite's import.meta.glob to discover preset files at build time
 */
export async function listPresets(): Promise<PresetInfo[]> {
  // Use import.meta.glob to get all preset files
  // This works because Vite bundles JSON files from src/ as modules
  const presetModules = import.meta.glob('/src/presets/*.json', { eager: false });
  
  const presets: PresetInfo[] = [];
  
  for (const path in presetModules) {
    // Extract filename from path (e.g., "/src/presets/sphere.json" -> "sphere")
    const match = path.match(/\/([^/]+)\.json$/);
    if (match) {
      const name = match[1];
      presets.push({
        name,
        displayName: formatPresetName(name)
      });
    }
  }
  
  // Sort alphabetically by display name
  presets.sort((a, b) => a.displayName.localeCompare(b.displayName));
  
  return presets;
}

/**
 * Load a preset by name
 * @param presetName - Name of the preset (filename without .json extension)
 * @returns The loaded node graph, or null if not found/invalid
 */
export async function loadPreset(presetName: string): Promise<NodeGraph | null> {
  try {
    // Use import.meta.glob to dynamically import the preset
    const presetModules = import.meta.glob('/src/presets/*.json', { eager: false });
    const presetPath = `/src/presets/${presetName}.json`;
    
    if (!(presetPath in presetModules)) {
      console.error(`Preset not found: ${presetName}`);
      return null;
    }
    
    // Dynamically import the preset module
    const module = await presetModules[presetPath]();
    // Vite imports JSON files as default exports
    const data = (module as { default: any }).default;
    
    // Check if it's already a NodeGraph or a SerializedGraphFile
    if (data.format === 'shader-composer-node-graph') {
      // It's a serialized graph file, extract the graph
      return data.graph as NodeGraph;
    } else if (data.id && data.nodes && data.connections) {
      // It's already a NodeGraph
      return data as NodeGraph;
    } else {
      console.error(`Invalid preset format: ${presetName}`);
      return null;
    }
  } catch (error) {
    console.error(`Failed to load preset ${presetName}:`, error);
    return null;
  }
}

/**
 * Copy current graph to clipboard as JSON
 * @param graph - The graph to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyGraphToClipboard(graph: NodeGraph): Promise<void> {
  try {
    const json = serializeGraph(graph, true);
    
    // Check if clipboard API is available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(json);
    } else {
      throw new Error('Clipboard API not available');
    }
  } catch (error) {
    // Fallback for browsers that don't support clipboard API
    const textarea = document.createElement('textarea');
    textarea.value = serializeGraph(graph, true);
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      const success = document.execCommand('copy');
      if (!success) {
        throw new Error('execCommand copy failed');
      }
    } catch (err) {
      document.body.removeChild(textarea);
      throw new Error('Failed to copy to clipboard');
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

/**
 * Format preset filename to display name
 * Converts "my-preset" to "My Preset"
 */
function formatPresetName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
