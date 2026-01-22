/**
 * Data Model Types for Node-Based Shader System (v2.0)
 * 
 * This module defines the core data structures for the node-based shader system,
 * including NodeInstance, Connection, and NodeGraph interfaces.
 */

/**
 * Parameter value types that can be stored in a node instance.
 * These correspond to the parameter types defined in the Node Specification.
 */
export type ParameterValue =
  | number                        // For float/int parameters
  | string                        // For string parameters (swizzle, etc.)
  | [number, number, number, number]  // For vec4 parameters (bezier curves)
  | number[];                     // For array parameters (color stops)

/**
 * Node position in the canvas (pixels).
 */
export interface NodePosition {
  x: number;  // Integer, can be negative
  y: number;  // Integer, can be negative
}

/**
 * A node instance represents a single node in the graph.
 */
export interface NodeInstance {
  // Identity
  id: string;                    // Unique node ID (UUID recommended)
  type: string;                   // Node type ID (from Node Specification)
  
  // Position and layout
  position: NodePosition;        // Node position in canvas (pixels)
  
  // Parameters
  parameters: Record<string, ParameterValue>;  // Parameter name → value
  
  // Metadata
  label?: string;                 // Optional custom label (overrides displayName)
  collapsed?: boolean;            // Whether node UI is collapsed (default: false)
  color?: string;                 // Optional node color (hex, e.g., "#FF0000")
}

/**
 * A connection links a node output to a node input.
 */
export interface Connection {
  id: string;                     // Unique connection ID (UUID recommended)
  
  // Source (output)
  sourceNodeId: string;           // Source node ID
  sourcePort: string;              // Source port name (from Node Specification)
  
  // Target (input)
  targetNodeId: string;           // Target node ID
  targetPort: string;              // Target port name (from Node Specification)
}

/**
 * Graph metadata (optional information about the graph).
 */
export interface GraphMetadata {
  description?: string;         // Optional description
  author?: string;              // Optional author
  createdAt?: string;          // ISO 8601 timestamp
  modifiedAt?: string;         // ISO 8601 timestamp
  tags?: string[];             // Optional tags
}

/**
 * View state (UI state, not part of graph logic).
 */
export interface GraphViewState {
  zoom: number;                 // Canvas zoom level (default: 1.0)
  panX: number;                 // Canvas pan X (pixels, default: 0)
  panY: number;                 // Canvas pan Y (pixels, default: 0)
  selectedNodeIds?: string[];   // Currently selected nodes
}

/**
 * The complete graph structure.
 */
export interface NodeGraph {
  // Identity
  id: string;                     // Unique graph ID (UUID recommended)
  name: string;                   // Graph name (user-defined)
  version: string;                // Graph format version ("2.0")
  
  // Graph data
  nodes: NodeInstance[];          // All nodes in the graph
  connections: Connection[];      // All connections in the graph
  
  // Metadata
  metadata?: GraphMetadata;
  
  // View state (UI state, not part of graph logic)
  viewState?: GraphViewState;
}

/**
 * Serialized graph file format wrapper.
 */
export interface SerializedGraphFile {
  format: 'shader-composer-node-graph';
  formatVersion: '2.0';
  graph: NodeGraph;
}

/**
 * Validation result from graph validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
