/**
 * Migrates `rotate`, `scale`, and `mirror-flip` into unified `transform` (flip → scale → rotate).
 */

import type { ParameterInputMode } from '../types/nodeSpec';
import { normalizeTransformAngleDeg } from './transformAngleToDegreesMigration';
import type { Connection, NodeGraph, NodeInstance } from './types';

const ROTATE_TYPE = 'rotate';
const SCALE_TYPE = 'scale';
const MIRROR_TYPE = 'mirror-flip';
const TARGET_TYPE = 'transform';

const ROTATE_PARAM_MAP: Record<string, string> = {
  centerX: 'pivotX',
  centerY: 'pivotY',
  angle: 'angle',
};

const SCALE_PARAM_MAP: Record<string, string> = {
  centerX: 'pivotX',
  centerY: 'pivotY',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
};

const MIRROR_PARAM_MAP: Record<string, string> = {
  mirrorCenterX: 'pivotX',
  mirrorCenterY: 'pivotY',
  mirrorFlipX: 'flipX',
  mirrorFlipY: 'flipY',
};

const RAD_TO_DEG = 180 / Math.PI;

const TRANSFORM_IDENTITY_PARAMS: Record<string, unknown> = {
  pivotX: 0.0,
  pivotY: 0.0,
  flipX: 0,
  flipY: 0,
  scaleX: 1.0,
  scaleY: 1.0,
  angle: 0.0,
};

export function hasLegacyTransform2dNodes(graph: NodeGraph): boolean {
  return graph.nodes.some(
    (n) => n.type === ROTATE_TYPE || n.type === SCALE_TYPE || n.type === MIRROR_TYPE
  );
}

function remapInputModes(
  node: NodeInstance,
  paramMap: Record<string, string>
): Record<string, ParameterInputMode> | undefined {
  if (!node.parameterInputModes) return undefined;
  const next: Record<string, ParameterInputMode> = {};
  for (const [k, modeVal] of Object.entries(node.parameterInputModes)) {
    const nk = paramMap[k];
    if (
      nk &&
      (modeVal === 'override' ||
        modeVal === 'add' ||
        modeVal === 'subtract' ||
        modeVal === 'multiply')
    ) {
      next[nk] = modeVal;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function migrateRotateNode(node: NodeInstance): NodeInstance {
  const params = node.parameters ?? {};
  const nextParams: Record<string, unknown> = {
    ...TRANSFORM_IDENTITY_PARAMS,
    pivotX: typeof params.centerX === 'number' ? params.centerX : 0.0,
    pivotY: typeof params.centerY === 'number' ? params.centerY : 0.0,
    angle:
      typeof params.angle === 'number'
        ? normalizeTransformAngleDeg(params.angle * RAD_TO_DEG)
        : 0.0,
  };
  const nextInputModes = remapInputModes(node, ROTATE_PARAM_MAP);
  return {
    ...node,
    type: TARGET_TYPE,
    parameters: nextParams as NodeInstance['parameters'],
    ...(nextInputModes ? { parameterInputModes: nextInputModes } : {}),
  };
}

function migrateScaleNode(node: NodeInstance): NodeInstance {
  const params = node.parameters ?? {};
  const nextParams: Record<string, unknown> = {
    ...TRANSFORM_IDENTITY_PARAMS,
    pivotX: typeof params.centerX === 'number' ? params.centerX : 0.0,
    pivotY: typeof params.centerY === 'number' ? params.centerY : 0.0,
    scaleX: typeof params.scaleX === 'number' ? params.scaleX : 1.0,
    scaleY: typeof params.scaleY === 'number' ? params.scaleY : 1.0,
  };
  const nextInputModes = remapInputModes(node, SCALE_PARAM_MAP);
  return {
    ...node,
    type: TARGET_TYPE,
    parameters: nextParams as NodeInstance['parameters'],
    ...(nextInputModes ? { parameterInputModes: nextInputModes } : {}),
  };
}

function migrateMirrorNode(node: NodeInstance): NodeInstance {
  const params = node.parameters ?? {};
  const nextParams: Record<string, unknown> = {
    ...TRANSFORM_IDENTITY_PARAMS,
    pivotX: typeof params.mirrorCenterX === 'number' ? params.mirrorCenterX : 0.0,
    pivotY: typeof params.mirrorCenterY === 'number' ? params.mirrorCenterY : 0.0,
    flipX: typeof params.mirrorFlipX === 'number' ? params.mirrorFlipX : 0,
    flipY: typeof params.mirrorFlipY === 'number' ? params.mirrorFlipY : 0,
  };
  const nextInputModes = remapInputModes(node, MIRROR_PARAM_MAP);
  return {
    ...node,
    type: TARGET_TYPE,
    parameters: nextParams as NodeInstance['parameters'],
    ...(nextInputModes ? { parameterInputModes: nextInputModes } : {}),
  };
}

function remapTargetParameter(
  targetNodeId: string,
  targetParameter: string,
  legacyRotateIds: Set<string>,
  legacyScaleIds: Set<string>,
  legacyMirrorIds: Set<string>
): string {
  if (legacyRotateIds.has(targetNodeId)) {
    return ROTATE_PARAM_MAP[targetParameter] ?? targetParameter;
  }
  if (legacyScaleIds.has(targetNodeId)) {
    return SCALE_PARAM_MAP[targetParameter] ?? targetParameter;
  }
  if (legacyMirrorIds.has(targetNodeId)) {
    return MIRROR_PARAM_MAP[targetParameter] ?? targetParameter;
  }
  return targetParameter;
}

export function migrateTransform2dUnify(graph: NodeGraph): NodeGraph {
  if (!hasLegacyTransform2dNodes(graph)) return graph;

  const legacyRotateIds = new Set(
    graph.nodes.filter((n) => n.type === ROTATE_TYPE).map((n) => n.id)
  );
  const legacyScaleIds = new Set(
    graph.nodes.filter((n) => n.type === SCALE_TYPE).map((n) => n.id)
  );
  const legacyMirrorIds = new Set(
    graph.nodes.filter((n) => n.type === MIRROR_TYPE).map((n) => n.id)
  );

  const nodes = graph.nodes.map((n) => {
    if (n.type === ROTATE_TYPE) return migrateRotateNode(n);
    if (n.type === SCALE_TYPE) return migrateScaleNode(n);
    if (n.type === MIRROR_TYPE) return migrateMirrorNode(n);
    return n;
  });

  const connections: Connection[] = graph.connections.map((c) => {
    if (!c.targetParameter) return c;
    const mapped = remapTargetParameter(
      c.targetNodeId,
      c.targetParameter,
      legacyRotateIds,
      legacyScaleIds,
      legacyMirrorIds
    );
    if (mapped === c.targetParameter) return c;
    return { ...c, targetParameter: mapped };
  });

  const automation =
    graph.automation == null
      ? undefined
      : {
          ...graph.automation,
          lanes: graph.automation.lanes.map((lane) => {
            const mapped = remapTargetParameter(
              lane.nodeId,
              lane.paramName,
              legacyRotateIds,
              legacyScaleIds,
              legacyMirrorIds
            );
            if (mapped === lane.paramName) return lane;
            return { ...lane, paramName: mapped };
          }),
        };

  return { ...graph, nodes, connections, ...(automation !== undefined && { automation }) };
}
