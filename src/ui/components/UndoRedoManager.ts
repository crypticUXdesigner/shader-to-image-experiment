// Undo/Redo Manager
// Manages undo/redo history for graph operations

import type { NodeGraph } from '../../types/nodeGraph';

export class UndoRedoManager {
  private history: NodeGraph[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number = 50;
  
  pushState(graph: NodeGraph): void {
    // Remove any states after current index (when undoing then making new change)
    this.history = this.history.slice(0, this.currentIndex + 1);
    
    // Add new state (deep copy)
    const stateCopy = this.deepCopyGraph(graph);
    this.history.push(stateCopy);
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }
  
  undo(): NodeGraph | null {
    if (this.currentIndex <= 0) {
      return null; // Nothing to undo
    }
    
    this.currentIndex--;
    return this.deepCopyGraph(this.history[this.currentIndex]);
  }
  
  redo(): NodeGraph | null {
    if (this.currentIndex >= this.history.length - 1) {
      return null; // Nothing to redo
    }
    
    this.currentIndex++;
    return this.deepCopyGraph(this.history[this.currentIndex]);
  }
  
  canUndo(): boolean {
    return this.currentIndex > 0;
  }
  
  canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }
  
  private deepCopyGraph(graph: NodeGraph): NodeGraph {
    return JSON.parse(JSON.stringify(graph));
  }
  
  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}
