/**
 * Data Model Types for Node-Based Shader System (v2.0)
 * 
 * This module defines the core data structures for the node-based shader system,
 * including NodeInstance, Connection, and NodeGraph interfaces.
 */

import type { ParameterInputMode } from '../types/nodeSpec';
import type { AudioSetup } from './audioSetupTypes';

/**
 * Parameter value types that can be stored in a node instance.
 * These correspond to the parameter types defined in the Node Specification.
 */
export type ParameterValue =
  | number                        // For float/int parameters
  | string                        // For string parameters (swizzle, etc.)
  | [number, number, number, number]  // For vec4 parameters (bezier curves)
  | number[]                      // For array parameters (color stops)
  | number[][];                   // For array-of-arrays (e.g. frequencyBands)

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
  parameterInputModes?: Record<string, ParameterInputMode>;  // Parameter name → input mode (overrides spec default)
  
  // Metadata
  label?: string;                 // Optional custom label (overrides displayName)
  color?: string;                 // Optional node color (hex, e.g., "#FF0000")

  /**
   * Optional. When true, the node's effect is removed from the compiled output per the global Power rules.
   * See docs/implementation/node-power/_OVERVIEW.md.
   */
  bypassed?: boolean;
}

/**
 * A connection links a node output to a node input.
 *
 * **Invariant**: Exactly one of `targetPort` or `targetParameter` must be set; `sourcePort` is always set.
 * - Port connection: targets a node input port → use `targetPort`.
 * - Parameter connection: targets a node parameter (e.g. for live values) → use `targetParameter`.
 */
export interface Connection {
  id: string;                     // Unique connection ID (UUID recommended)
  
  // Source (output)
  sourceNodeId: string;           // Source node ID
  sourcePort: string;              // Source port name (from Node Specification)
  
  // Target (input)
  targetNodeId: string;           // Target node ID
  targetPort?: string;            // Target port name (from Node Specification) — set only for port connections
  targetParameter?: string;       // Target parameter name — set only for parameter connections

  /**
   * Optional. When true, this connection is kept for UX (can be re-enabled) but is ignored by
   * compilation and effective-value evaluation, so downstream behaves as if no wire exists.
   */
  disabled?: boolean;
}

/**
 * Timeline automation: curve within a region (normalized time 0–1).
 */
export type AutomationCurveInterpolation = 'linear' | 'stepped' | 'bezier';

export interface AutomationKeyframe {
  time: number;   // Normalized in [0, 1]
  value: number;
}

export interface AutomationCurve {
  keyframes: AutomationKeyframe[];
  interpolation: AutomationCurveInterpolation;
}

/**
 * Timeline automation: one region on a lane (start, duration, loop, curve).
 */
export interface AutomationRegion {
  id: string;
  startTime: number;   // Seconds, >= 0
  duration: number;   // Seconds, >= 0
  loop: boolean;
  curve: AutomationCurve;
}

/**
 * Timeline automation: one lane (node param); holds non-overlapping regions.
 */
export interface AutomationLane {
  id: string;
  nodeId: string;
  paramName: string;
  regions: AutomationRegion[];
}

/**
 * Timeline automation state at graph level (optional).
 */
export interface AutomationState {
  bpm: number;
  durationSeconds: number;
  lanes: AutomationLane[];
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
  
  // Timeline automation (optional; lanes/regions/curves)
  automation?: AutomationState;
}

/** Canonical on-disk format for new saves (ShaderNoice). */
export const GRAPH_FILE_FORMAT = 'shadernoice-node-graph' as const;
/** Legacy format (Shader Composer); still accepted when loading. */
export const LEGACY_GRAPH_FILE_FORMAT = 'shader-composer-node-graph' as const;

export function isKnownGraphFileFormat(
  format: unknown
): format is typeof GRAPH_FILE_FORMAT | typeof LEGACY_GRAPH_FILE_FORMAT {
  return format === GRAPH_FILE_FORMAT || format === LEGACY_GRAPH_FILE_FORMAT;
}

/**
 * Serialized graph file format wrapper.
 * Optional audioSetup: panel audio configuration (files, bands, remappers, primarySource, playlistState).
 * startingTrackId: optional track id for preset/copy so paste restores current track.
 */
export interface SerializedGraphFile {
  format: typeof GRAPH_FILE_FORMAT;
  formatVersion: '2.0';
  graph: NodeGraph;
  audioSetup?: AudioSetup;
  /** Optional starting track id for preset/copy (playlist); used to set current track on load. */
  startingTrackId?: string;
}

/**
 * Validation result from graph validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
