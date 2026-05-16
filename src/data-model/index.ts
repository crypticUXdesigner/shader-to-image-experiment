/**
 * Data Model Module for Node-Based Shader System (v2.0)
 * 
 * This module provides the complete data model implementation for the node-based
 * shader system, including types, validation, serialization, and utilities.
 */

// Types
export type {
  AudioSetup,
  AudioFileEntry,
  AudioBandEntry,
  AudioRemapperEntry,
  AudioSignalId,
  PrimarySource,
  PlaylistPrimarySource,
  PlaylistDisplayNameSource,
  PlaylistTrackPickMeta,
  PlaylistState,
} from './audioSetupTypes';
export { getPrimaryFileId } from './audioSetupTypes';
export type {
  ParameterValue,
  GraphUndoRecordingOptions,
  NodePosition,
  NodeInstance,
  Connection,
  GraphMetadata,
  GraphViewState,
  NodeGraph,
  SerializedGraphFile,
  ValidationResult,
  AutomationCurveInterpolation,
  AutomationKeyframe,
  AutomationCurve,
  AutomationRegion,
  AutomationLane,
  AutomationState,
} from './types';
export {
  GRAPH_FILE_FORMAT,
  LEGACY_GRAPH_FILE_FORMAT,
  isKnownGraphFileFormat,
} from './types';
export type {
  SignalId,
  SignalValue,
  SignalSourceKind,
  BaseSignalSource,
  AudioSignalSource,
  AutomationSignalSource,
  LfoSignalSource,
  SignalSource,
  SignalBinding,
  SignalBindingList,
} from './signals';

// Connection helpers (03B: invariant and duplicate keys)
export {
  isPortConnection,
  isParameterConnection,
  getConnectionTargetKey,
} from './connectionUtils';

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

// Immutable Updates
export {
  deepCopyGraph,
  addNode,
  removeNode,
  updateNode,
  updateNodePosition,
  updateNodeParameter,
  updateNodeParameterInputMode,
  resetNodeParametersToDefaults,
  updateNodeLabel,
  setNodeBypassed,
  addConnection,
  removeConnection,
  removeConnections,
  updateViewState,
  addNodes,
  addConnections,
  addAutomationLane,
  addAutomationRegion,
  updateAutomationRegion,
  removeAutomationRegion,
  removeAutomationLane,
  setAutomationBpm,
  setAutomationDuration,
  addConnectionWithValidation,
} from './immutableUpdates';
export type {
  AddConnectionWithValidationResult,
  AddConnectionWithValidationOptions,
  RemoveNodeOptions,
} from './immutableUpdates';
export {
  insertNodeIntoConnection,
  type InsertNodeIntoConnectionResult,
  type InsertNodeIntoConnectionErrorCode,
  type InsertNodeIntoConnectionOptions,
} from './insertNodeIntoConnection';
export type {
  ConnectionValidationExclusiveGpu,
  ConnectionValidationContext,
} from './connectionValidationContext';
export {
  addFile as addAudioFile,
  updateFile as updateAudioFile,
  removeFile as removeAudioFile,
  addBand as addAudioBand,
  updateBand as updateAudioBand,
  removeBand as removeAudioBand,
  addRemapper as addAudioRemapper,
  updateRemapper as updateAudioRemapper,
  removeRemapper as removeAudioRemapper,
  setPrimarySource,
  setArrangementSnapshot,
  clearArrangementSnapshot,
  clearArrangementSnapshotIfPrimaryMismatch,
  setPlaylistOrder,
  setPlaylistCurrentIndex,
  setLoopCurrentTrack,
  retargetBandsToPrimary,
} from './audioSetupUpdates';

// Virtual nodes for named audio signals.
export {
  VIRTUAL_NODE_PREFIX,
  isVirtualNodeId,
  getSignalIdFromVirtualNodeId,
  getVirtualNodeId,
  getNamedSignalsFromAudioSetup,
  getVirtualNodeIdsFromAudioSetup,
} from '../utils/virtualNodes';
export type { NamedSignal } from '../utils/virtualNodes';

// Audio state/values for parameter ports.
export {
  getParamPortConnectionState,
  getParamPortLiveValue,
} from '../utils/paramPortAudioState';
export type { ParamPortConnectionState, ParamPortConnectionInfo } from '../utils/paramPortAudioState';

// Noise nodes migration
export {
  migrateNoiseNodes,
  hasLegacyNoiseNodes,
  LEGACY_NOISE_NODE_TYPES,
} from './noiseNodesMigration';

// Bloom sphere colors migration (RGB -> OKLCH)
export { migrateBloomSphereColors } from './bloomSphereColorsMigration';

// Inflated icosahedron background colors migration (RGB -> OKLCH)
export { migrateInflatedIcosahedronColors } from './inflatedIcosahedronColorsMigration';

// Glass shell inner / background colors migration (RGB -> OKLCH)
export { migrateGlassShellColors } from './glassShellColorsMigration';

// Iridescent tunnel colors migration (RGB -> OKLCH)
export { migrateIridescentTunnelColors } from './iridescentTunnelColorsMigration';

// Drive home lights: single sky OKLCH -> horizon + zenith gradient
export { migrateDriveHomeLightsSkyGradient } from './driveHomeLightsSkyGradientMigration';

// Distort: kaleidoscope-smooth -> kaleidoscope + edge smooth
export {
  migrateKaleidoscopeSmooth,
  hasLegacyKaleidoscopeSmoothNodes,
} from './kaleidoscopeMergeMigration';

// Distort: translate + directional-displace -> displace (modes)
export { migrateDisplace2dUnify, hasLegacyDisplace2dNodes } from './displace2dUnifyMigration';
export { migrateDisplaceRemoveLegacyInputPorts } from './displaceRemoveLegacyInputPortsMigration';
export {
  migrateTransform2dUnify,
  hasLegacyTransform2dNodes,
} from './transform2dUnifyMigration';

// Particle system: fold legacy UV scale into grid spacing
export { migrateParticleSystemFoldScale } from './particleSystemGrainMigration';

// Streak: streakAngle (rad) → streakAngleDeg (deg)
export { migrateStreakNodeAngleToDegrees } from './streakNodeMigration';

// Preset/import/default-state: compose legacy node migrations before validation
export { migrateLegacyNodeGraph } from './graphLegacyMigrations';

// Radial repeat SDF: period/halfPeriod → shellSpacing/ringPhase
export { migrateRadialRepeatSdfParameters } from './radialRepeatSdfMigration';

// Mixed wave signal: cosine toggles -> per-wave shape enum
export { migrateMixedWaveSignalShapes } from './mixedWaveSignalShapeMigration';

// Legacy color-map (float→vec3 broadcast) removal — splice through on load
export { migrateRemoveColorMapNodes } from './colorMapNodeRemovalMigration';
