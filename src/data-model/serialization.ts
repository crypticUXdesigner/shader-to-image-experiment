/**
 * Serialization and Deserialization for Node-Based Shader System (v2.0)
 * 
 * This module provides functions to serialize node graphs to JSON and
 * deserialize JSON back to node graphs, with error handling and validation.
 */

import type {
  NodeGraph,
  SerializedGraphFile,
} from './types';
import { validateGraph } from './validation';
import type { NodeSpecification } from './validation';

/**
 * Serializes a node graph to JSON string.
 * 
 * @param graph - The graph to serialize
 * @param pretty - Whether to pretty-print the JSON (default: true)
 * @returns JSON string representation of the graph
 */
export function serializeGraph(graph: NodeGraph, pretty: boolean = true): string {
  const wrapper: SerializedGraphFile = {
    format: 'shader-composer-node-graph',
    formatVersion: '2.0',
    graph,
  };

  return JSON.stringify(wrapper, null, pretty ? 2 : 0);
}

/**
 * Result of deserialization operation.
 */
export interface DeserializationResult {
  graph: NodeGraph | null;
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

    // Validate format
    if (data.format !== 'shader-composer-node-graph') {
      errors.push('Invalid file format: expected "shader-composer-node-graph"');
      return { graph: null, errors, warnings };
    }

    // Validate format version
    if (data.formatVersion !== '2.0') {
      errors.push(`Unsupported format version: ${data.formatVersion} (expected "2.0")`);
      return { graph: null, errors, warnings };
    }

    // Check graph exists
    if (!data.graph) {
      errors.push('Missing graph data in file');
      return { graph: null, errors, warnings };
    }

    const graph = data.graph as NodeGraph;

    // Validate graph structure
    const validationResult = validateGraph(graph, nodeSpecs);
    errors.push(...validationResult.errors);
    warnings.push(...validationResult.warnings);

    // If there are critical errors, return null graph
    if (validationResult.errors.length > 0) {
      return { graph: null, errors, warnings };
    }

    return { graph, errors, warnings };
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

    // Validate format
    if (data.format !== 'shader-composer-node-graph') {
      errors.push('Invalid file format: expected "shader-composer-node-graph"');
      return { graph: null, errors, warnings };
    }

    // Validate format version
    if (data.formatVersion !== '2.0') {
      errors.push(`Unsupported format version: ${data.formatVersion} (expected "2.0")`);
      return { graph: null, errors, warnings };
    }

    // Check graph exists
    if (!data.graph) {
      errors.push('Missing graph data in file');
      return { graph: null, errors, warnings };
    }

    const graph = data.graph as NodeGraph;

    return { graph, errors, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`JSON parse error: ${message}`);
    return { graph: null, errors, warnings };
  }
}
