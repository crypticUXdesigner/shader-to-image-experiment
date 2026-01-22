/**
 * Data Model Module for Node-Based Shader System (v2.0)
 * 
 * This module provides the complete data model implementation for the node-based
 * shader system, including types, validation, serialization, and utilities.
 */

// Types
export type {
  ParameterValue,
  NodePosition,
  NodeInstance,
  Connection,
  GraphMetadata,
  GraphViewState,
  NodeGraph,
  SerializedGraphFile,
  ValidationResult,
} from './types';

// Validation
export {
  validateGraph,
  validateUniqueNodeIds,
  validateUniqueConnectionIds,
  validateConnectionNodeReferences,
  validateNoDuplicateConnections,
  type NodeSpecification,
} from './validation';

// Serialization
export {
  serializeGraph,
  deserializeGraph,
  deserializeGraphUnvalidated,
  type DeserializationResult,
} from './serialization';

// Utilities
export {
  generateUUID,
  generateNodeId,
  generateConnectionId,
  generateGraphId,
  getParameterValue,
  coerceParameterValue,
  clampParameterValue,
  getNodeIds,
  getConnectionIds,
  findNode,
  findConnection,
  getConnectionsFromNode,
  getConnectionsToNode,
  getConnectionToPort,
  createEmptyGraph,
  createDefaultViewState,
} from './utils';
