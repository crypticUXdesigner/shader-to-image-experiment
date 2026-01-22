// Utility for managing default/starting state
// Allows saving the current graph state to become the new starting point

import type { NodeGraph } from '../types/nodeGraph';
import { serializeGraph, deserializeGraph } from './nodeGraphSerialization';

const DEFAULT_STATE_KEY = 'shader-composer-default-state';

/**
 * Save the current graph as the default starting state
 */
export function saveDefaultState(graph: NodeGraph): void {
  try {
    const serialized = serializeGraph(graph, true);
    localStorage.setItem(DEFAULT_STATE_KEY, serialized);
    console.log('[DefaultState] Saved current state as default');
  } catch (error) {
    console.error('[DefaultState] Failed to save default state:', error);
    throw error;
  }
}

/**
 * Load the default starting state from localStorage
 * Returns null if no default state is saved
 */
export function loadDefaultState(): NodeGraph | null {
  try {
    const serialized = localStorage.getItem(DEFAULT_STATE_KEY);
    if (!serialized) {
      return null;
    }
    
    const result = deserializeGraph(serialized);
    if (result.graph) {
      console.log('[DefaultState] Loaded default state from localStorage');
      return result.graph;
    } else {
      console.warn('[DefaultState] Failed to deserialize default state:', result.errors);
      // Clear invalid state
      localStorage.removeItem(DEFAULT_STATE_KEY);
      return null;
    }
  } catch (error) {
    console.error('[DefaultState] Failed to load default state:', error);
    // Clear corrupted state
    localStorage.removeItem(DEFAULT_STATE_KEY);
    return null;
  }
}

/**
 * Clear the saved default state
 */
export function clearDefaultState(): void {
  localStorage.removeItem(DEFAULT_STATE_KEY);
  console.log('[DefaultState] Cleared default state');
}

/**
 * Check if a default state exists
 */
export function hasDefaultState(): boolean {
  return localStorage.getItem(DEFAULT_STATE_KEY) !== null;
}
