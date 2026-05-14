import type { Connection, NodeGraph } from './types';
import { isPortConnection } from './connectionUtils';
import {
  GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES,
  genericRaymarcherWebGpuMvpSdfAllowedListSentence,
} from '../shaders/compilation/genericRaymarcherWebGpuMvpAllowlist';
import type { ConnectionValidationContext } from './connectionValidationContext';
import type { NodeSpecification } from './validationTypes';
import { getDownstreamExpectedInputType, getUpstreamOutputType } from './connectionWireTypes';

/**
 * WebGPU-session-only wire rules (Phase 1 + Phase 2 slices). Called from `validateConnection` after structural checks.
 */
export function validateWebGpuExclusiveWireRules(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: NodeSpecification[],
  connectionValidation: ConnectionValidationContext | undefined,
  errors: string[]
): void {
  if (connectionValidation?.exclusiveRasterGpu !== 'webgpu') return;
  if (!isPortConnection(connection)) return;

  const targetNode = graph.nodes.find((n) => n.id === connection.targetNodeId);
  const sourceNode = graph.nodes.find((n) => n.id === connection.sourceNodeId);
  if (targetNode && sourceNode && targetNode.type === 'generic-raymarcher') {
    if (connection.targetPort === 'sdf') {
      if (connection.sourcePort !== 'out') {
        errors.push(
          'WebGPU preview: connect an SDF node’s “out” port to Generic raymarcher’s sdf input, or switch to WebGL2 (?renderBackend=webgl).'
        );
        return;
      }
      if (!GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES.has(sourceNode.type)) {
        errors.push(
          `WebGPU preview: Generic raymarcher’s sdf input only supports these node types on WebGPU right now: ${genericRaymarcherWebGpuMvpSdfAllowedListSentence()}. (Got “${sourceNode.type}”.) Switch to WebGL2 preview (?renderBackend=webgl) to use this SDF, or pick a supported SDF.`
        );
      }
    }

    if (connection.targetPort === 'displacement') {
      if (sourceNode.type !== 'displacement-3d' || connection.sourcePort !== 'out') {
        errors.push(
          'WebGPU preview: Generic raymarcher’s displacement input only accepts displacement-3d’s “out”. Switch to WebGL2 (?renderBackend=webgl) for other setups.'
        );
      }
    }
  }

  if (errors.length > 0) return;

  validateWebGpuExclusiveBoolPortStrictness(connection, graph, nodeSpecs, errors);
}

/**
 * Phase 2: WGSL path is stricter than GLSL for mixing bool with numeric vector wires on ports.
 * Reject bool ↔ non-bool port pairs in WebGPU-exclusive sessions only.
 */
function validateWebGpuExclusiveBoolPortStrictness(
  connection: Connection,
  graph: NodeGraph,
  nodeSpecs: NodeSpecification[],
  errors: string[]
): void {
  if (!isPortConnection(connection)) return;
  const outType = getUpstreamOutputType(graph, connection, nodeSpecs);
  const inType = getDownstreamExpectedInputType(graph, connection, nodeSpecs);
  if (!outType || !inType) return;
  if (outType !== 'bool' && inType !== 'bool') return;
  if (outType === inType) return;
  errors.push(
    `WebGPU preview: bool ports only connect to bool (this wire is “${outType}” → “${inType}”). Rewire, adjust the node setup, or switch to WebGL2 preview (?renderBackend=webgl).`
  );
}
