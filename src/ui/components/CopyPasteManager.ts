// Copy/Paste Manager
// Handles copying and pasting nodes with connections

import type { NodeInstance, Connection } from '../../types/nodeGraph';

export interface ClipboardData {
  nodes: NodeInstance[];
  connections: Connection[];
  offset: { x: number; y: number };
}

export class CopyPasteManager {
  private clipboard: ClipboardData | null = null;
  
  copy(nodes: NodeInstance[], connections: Connection[]): void {
    if (nodes.length === 0) return;
    
    // Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
    }
    
    // Create node copies with new IDs
    const nodeCopies = nodes.map(node => ({
      ...node,
      id: this.generateId('node'),
      position: {
        x: node.position.x - minX,
        y: node.position.y - minY
      }
    }));
    
    // Create connection copies (only internal connections)
    const nodeIdMap = new Map<string, string>();
    nodes.forEach((node, index) => {
      nodeIdMap.set(node.id, nodeCopies[index].id);
    });
    
    const connectionCopies: Connection[] = [];
    for (const conn of connections) {
      const sourceInSelection = nodeIdMap.has(conn.sourceNodeId);
      const targetInSelection = nodeIdMap.has(conn.targetNodeId);
      
      if (sourceInSelection && targetInSelection) {
        // Internal connection - keep it
        connectionCopies.push({
          ...conn,
          id: this.generateId('conn'),
          sourceNodeId: nodeIdMap.get(conn.sourceNodeId)!,
          targetNodeId: nodeIdMap.get(conn.targetNodeId)!
        });
      }
    }
    
    this.clipboard = {
      nodes: nodeCopies,
      connections: connectionCopies,
      offset: { x: minX, y: minY }
    };
  }
  
  paste(targetX: number, targetY: number): ClipboardData | null {
    if (!this.clipboard) return null;
    
    // Create new copies with offset
    const pastedNodes = this.clipboard.nodes.map(node => ({
      ...node,
      id: this.generateId('node'),
      position: {
        x: node.position.x + targetX,
        y: node.position.y + targetY
      }
    }));
    
    // Create new node ID mapping
    const nodeIdMap = new Map<string, string>();
    this.clipboard.nodes.forEach((node, index) => {
      nodeIdMap.set(node.id, pastedNodes[index].id);
    });
    
    // Create connection copies with new IDs
    const pastedConnections = this.clipboard.connections.map(conn => ({
      ...conn,
      id: this.generateId('conn'),
      sourceNodeId: nodeIdMap.get(conn.sourceNodeId)!,
      targetNodeId: nodeIdMap.get(conn.targetNodeId)!
    }));
    
    return {
      nodes: pastedNodes,
      connections: pastedConnections,
      offset: { x: targetX, y: targetY }
    };
  }
  
  hasClipboard(): boolean {
    return this.clipboard !== null && this.clipboard.nodes.length > 0;
  }
  
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
