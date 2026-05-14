/**
 * Serialization and Deserialization for Node-Based Shader System (v2.0)
 * 
 * This module provides functions to serialize node graphs to JSON and
 * deserialize JSON back to node graphs, with error handling and validation.
 */

import {
  type NodeGraph,
  type SerializedGraphFile,
  GRAPH_FILE_FORMAT,
  isKnownGraphFileFormat,
} from './types';
import type { AudioSetup } from './audioSetupTypes';
import { validateGraph } from './validation';
import type { NodeSpecification } from './validation';
import { migrateBandRemapToRemappers } from './audioBandRemapMigration';
import { migrateMixedWaveSignalShapes } from './mixedWaveSignalShapeMigration';
import { migrateShapesNodeMerges } from './shapesNodeMergeMigration';
import { ensureBandAttackReleaseHalfLives } from './audioSmoothingMigration';
import { ensureBandMode } from './audioBandModeMigration';
import { migrateDomainRepetitionToTiling } from './tilingUnifyMigration';
import { migrateRemoveColorMapNodes } from './colorMapNodeRemovalMigration';

const CURRENT_FORMAT_VERSION = '2.0' as const;

function isSupportedFormatVersion(val: unknown): val is typeof CURRENT_FORMAT_VERSION {
  return val === CURRENT_FORMAT_VERSION;
}

interface MigrationContext {
  graph: NodeGraph;
  audioSetup?: AudioSetup;
}

/**
 * Registry for file-format–level migrations keyed by SerializedGraphFile.formatVersion.
 *
 * Today we only support formatVersion "2.0". The registry is structured so future versions
 * (e.g. "2.1", "3.0") can add ordered MigrationStep lists without changing deserializeGraph.
 * To add a new version: add a key (e.g. "2.1") with an array of MigrationStep functions;
 * then extend isSupportedFormatVersion and CURRENT_FORMAT_VERSION as needed so the new
 * version is accepted and migrations run.
 *
 * Only migrations that depend on the on-disk formatVersion belong here. App-level graph
 * migrations that are independent of formatVersion (e.g. noise-node shape changes or
 * stripping legacy audio nodes for presets) are composed at a higher layer (see presetManager)
 * and intentionally remain outside this registry.
 */
type MigrationStep = (ctx: MigrationContext) => MigrationContext;

const MIGRATIONS_BY_VERSION: Record<string, MigrationStep[]> = {
  [CURRENT_FORMAT_VERSION]: [
    (ctx: MigrationContext): MigrationContext => ({
      ...ctx,
      graph: migrateDomainRepetitionToTiling(ctx.graph),
    }),
    (ctx: MigrationContext): MigrationContext => ({
      ...ctx,
      graph: migrateShapesNodeMerges(ctx.graph),
    }),
    (ctx: MigrationContext): MigrationContext => ({
      ...ctx,
      graph: migrateMixedWaveSignalShapes(ctx.graph),
    }),
    (ctx: MigrationContext): MigrationContext => {
      const audio = ctx.audioSetup;
      if (!audio || audio.bands.length === 0) return ctx;
      const migrated = migrateBandRemapToRemappers(ctx.graph, audio);
      return { graph: migrated.graph, audioSetup: migrated.audioSetup };
    },
    (ctx: MigrationContext): MigrationContext => {
      const audio = ctx.audioSetup;
      if (!audio || audio.bands.length === 0) return ctx;
      return { ...ctx, audioSetup: ensureBandAttackReleaseHalfLives(audio) };
    },
    (ctx: MigrationContext): MigrationContext => {
      const audio = ctx.audioSetup;
      if (!audio || audio.bands.length === 0) return ctx;
      return { ...ctx, audioSetup: ensureBandMode(audio) };
    },
    (ctx: MigrationContext): MigrationContext => ({
      ...ctx,
      graph: migrateRemoveColorMapNodes(ctx.graph),
    }),
  ],
};

function applyMigrationsForVersion(
  formatVersion: unknown,
  ctx: MigrationContext
): MigrationContext {
  if (!isSupportedFormatVersion(formatVersion)) {
    return ctx;
  }
  const steps = MIGRATIONS_BY_VERSION[CURRENT_FORMAT_VERSION] ?? [];
  return steps.reduce((acc, step) => step(acc), ctx);
}

export interface SerializeGraphOptions {
  /** Optional starting track id for preset/copy (playlist); stored so paste/load can restore current track. */
  startingTrackId?: string;
}

/**
 * Serializes a node graph to JSON string.
 * Includes audioSetup when provided (panel audio configuration, primarySource, playlistState).
 *
 * @param graph - The graph to serialize
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @param audioSetup - Optional panel audio setup (files, bands, remappers, primarySource, playlistState)
 * @param options - Optional startingTrackId for preset/copy
 * @returns JSON string representation of the graph
 */
export function serializeGraph(
  graph: NodeGraph,
  pretty: boolean = true,
  audioSetup?: AudioSetup,
  options?: SerializeGraphOptions
): string {
  const wrapper: SerializedGraphFile = {
    format: GRAPH_FILE_FORMAT,
    formatVersion: CURRENT_FORMAT_VERSION,
    graph,
    ...(audioSetup && { audioSetup }),
    ...(options?.startingTrackId && { startingTrackId: options.startingTrackId }),
  };

  return JSON.stringify(wrapper, null, pretty ? 2 : 0);
}

/**
 * Result of deserialization operation.
 */
export interface DeserializationResult {
  graph: NodeGraph | null;
  /** Present when file included audioSetup; undefined when absent or invalid. */
  audioSetup?: AudioSetup;
  /** Starting track id from file (for preset/copy); app may set playlist currentIndex from this. */
  startingTrackId?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Deserializes a JSON string to a node graph.
 * 
 * @param json - JSON string to deserialize
 * @param nodeSpecs - Optional array of node specifications for validation
 * @returns Deserialization result with graph and any errors/warnings
 */
export function deserializeGraph(
  json: string,
  nodeSpecs: NodeSpecification[] = []
): DeserializationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const data = JSON.parse(json);

    if (!isKnownGraphFileFormat(data.format)) {
      errors.push(
        'Invalid file format: expected "shadernoice-node-graph" (or legacy "shader-composer-node-graph")'
      );
      return { graph: null, errors, warnings };
    }

    if (!isSupportedFormatVersion(data.formatVersion)) {
      errors.push(`Unsupported format version: ${data.formatVersion} (expected "${CURRENT_FORMAT_VERSION}")`);
      return { graph: null, errors, warnings };
    }

    if (!data.graph) {
      errors.push('Missing graph data in file');
      return { graph: null, errors, warnings };
    }

    let graphResult = data.graph as NodeGraph;
    let audioSetup = isValidAudioSetup(data.audioSetup) ? data.audioSetup : undefined;

    // Apply format-version migrations *before* validation so legacy node types can be rewritten
    // into current specs (e.g. node merges / renames).
    const migrated = applyMigrationsForVersion(data.formatVersion, {
      graph: graphResult,
      audioSetup,
    });
    graphResult = migrated.graph;
    audioSetup = migrated.audioSetup;

    const validationResult = validateGraph(graphResult, nodeSpecs);
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);

    if (validationResult.errors.length > 0) {
      return { graph: null, errors, warnings };
    }

    const startingTrackId = typeof data.startingTrackId === 'string' ? data.startingTrackId : undefined;
    if (audioSetup && startingTrackId && audioSetup.playlistState?.order) {
      const idx = audioSetup.playlistState.order.indexOf(startingTrackId);
      if (idx >= 0) {
        audioSetup = { ...audioSetup, playlistState: { ...audioSetup.playlistState, currentIndex: idx } };
      }
    }

    return { graph: graphResult, audioSetup, startingTrackId, errors, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`JSON parse error: ${message}`);
    return { graph: null, errors, warnings };
  }
}

/**
 * Deserializes a JSON string to a node graph without validation.
 * Use this when you want to load a graph and validate it separately.
 * 
 * @param json - JSON string to deserialize
 * @returns Deserialization result with graph and any parse errors
 */
export function deserializeGraphUnvalidated(json: string): DeserializationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const data = JSON.parse(json);

    if (!isKnownGraphFileFormat(data.format)) {
      errors.push(
        'Invalid file format: expected "shadernoice-node-graph" (or legacy "shader-composer-node-graph")'
      );
      return { graph: null, errors, warnings };
    }

    if (!isSupportedFormatVersion(data.formatVersion)) {
      errors.push(`Unsupported format version: ${data.formatVersion} (expected "${CURRENT_FORMAT_VERSION}")`);
      return { graph: null, errors, warnings };
    }

    if (!data.graph) {
      errors.push('Missing graph data in file');
      return { graph: null, errors, warnings };
    }

    let graphResult = data.graph as NodeGraph;
    let audioSetup = isValidAudioSetup(data.audioSetup) ? data.audioSetup : undefined;

    const migrated = applyMigrationsForVersion(data.formatVersion, {
      graph: graphResult,
      audioSetup,
    });
    graphResult = migrated.graph;
    audioSetup = migrated.audioSetup;

    const startingTrackId = typeof data.startingTrackId === 'string' ? data.startingTrackId : undefined;
    if (audioSetup && startingTrackId && audioSetup.playlistState?.order) {
      const idx = audioSetup.playlistState.order.indexOf(startingTrackId);
      if (idx >= 0) {
        audioSetup = { ...audioSetup, playlistState: { ...audioSetup.playlistState, currentIndex: idx } };
      }
    }

    return { graph: graphResult, audioSetup, startingTrackId, errors, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`JSON parse error: ${message}`);
    return { graph: null, errors, warnings };
  }
}

function isValidAudioSetup(val: unknown): val is AudioSetup {
  if (!val || typeof val !== 'object') return false;
  const o = val as Record<string, unknown>;
  // primarySource and playlistState are optional (legacy presets omit them)
  return (
    Array.isArray(o.files) &&
    Array.isArray(o.bands) &&
    Array.isArray(o.remappers)
  );
}
