// Node Graph Data Model Types
// Based on DATA_MODEL_SPECIFICATION.md

export type ParameterValue = 
  | number                        // For float/int parameters
  | string                        // For string parameters (swizzle, etc.)
  | [number, number, number, number]  // For vec4 parameters (bezier curves)
  | number[];                     // For array parameters (color stops)

export interface NodeInstance {
  // Identity
  id: string;                    // Unique node ID (UUID recommended)
  type: string;                   // Node type ID (from Node Specification)
  
  // Position and layout
  position: {                     // Node position in canvas (pixels)
    x: number;                    // Integer, can be negative
    y: number;                    // Integer, can be negative
  };
  
  // Parameters
  parameters: Record<string, ParameterValue>;  // Parameter name → value
  
  // Metadata
  label?: string;                 // Optional custom label (overrides displayName)
  collapsed?: boolean;            // Whether node UI is collapsed (default: false)
  color?: string;                 // Optional node color (hex, e.g., "#FF0000")
}

export interface Connection {
  id: string;                     // Unique connection ID (UUID recommended)
  
  // Source (output)
  sourceNodeId: string;            // Source node ID
  sourcePort: string;              // Source port name (from Node Specification)
  
  // Target (input)
  targetNodeId: string;            // Target node ID
  targetPort: string;              // Target port name (from Node Specification)
}

export interface NodeGraph {
  // Identity
  id: string;                     // Unique graph ID (UUID recommended)
  name: string;                   // Graph name (user-defined)
  version: string;                // Graph format version ("2.0")
  
  // Graph data
  nodes: NodeInstance[];          // All nodes in the graph
  connections: Connection[];      // All connections in the graph
  
  // Metadata
  metadata?: {
    description?: string;         // Optional description
    author?: string;              // Optional author
    createdAt?: string;         // ISO 8601 timestamp
    modifiedAt?: string;         // ISO 8601 timestamp
    tags?: string[];             // Optional tags
  };
  
  // View state (UI state, not part of graph logic)
  viewState?: {
    zoom: number;                 // Canvas zoom level (default: 1.0)
    panX: number;                 // Canvas pan X (pixels, default: 0)
    panY: number;                 // Canvas pan Y (pixels, default: 0)
    selectedNodeIds?: string[];   // Currently selected nodes
  };
}

// Serialization format wrapper
export interface SerializedNodeGraph {
  format: string;                  // "shader-composer-node-graph"
  formatVersion: string;           // "2.0"
  graph: NodeGraph;
}
