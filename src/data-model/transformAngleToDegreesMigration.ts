/**
 * Migrates `transform` node `angle` from radians (legacy) to degrees on [-180, 180].
 */

import type { AutomationLane, NodeGraph, NodeInstance } from './types';

const TRANSFORM_TYPE = 'transform';
const RAD_TO_DEG = 180 / Math.PI;
/** Values within ±2π were stored as radians before this migration. */
const MAX_RAD_MAGNITUDE = 7.5;

function looksLikeRadians(angle: number): boolean {
  return Number.isFinite(angle) && Math.abs(angle) <= MAX_RAD_MAGNITUDE;
}

/** One full turn, canonical range for rotation (degrees). */
export function normalizeTransformAngleDeg(angleDeg: number): number {
  const a = ((Math.round(angleDeg) % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

function radiansToDegrees(angle: number): number {
  return normalizeTransformAngleDeg(angle * RAD_TO_DEG);
}

function migrateTransformNode(node: NodeInstance): NodeInstance {
  if (node.type !== TRANSFORM_TYPE) return node;

  const params = node.parameters ?? {};
  const raw = params.angle;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return node;
  }

  const nextAngle = looksLikeRadians(raw) ? radiansToDegrees(raw) : normalizeTransformAngleDeg(raw);
  if (nextAngle === raw) {
    return node;
  }

  return {
    ...node,
    parameters: {
      ...params,
      angle: nextAngle,
    },
  };
}

function migrateAutomationLaneRadiansToDegrees(lane: AutomationLane): AutomationLane {
  if (lane.paramName !== 'angle') return lane;
  return {
    ...lane,
    regions: lane.regions.map((region) => ({
      ...region,
      curve: {
        ...region.curve,
        keyframes: region.curve.keyframes.map((kf) => ({
          ...kf,
          value:
            typeof kf.value === 'number' && Number.isFinite(kf.value)
              ? looksLikeRadians(kf.value)
                ? radiansToDegrees(kf.value)
                : normalizeTransformAngleDeg(kf.value)
              : kf.value,
        })),
      },
    })),
  };
}

export function migrateTransformAngleToDegrees(graph: NodeGraph): NodeGraph {
  const transformIds = new Set(
    graph.nodes.filter((n) => n.type === TRANSFORM_TYPE).map((n) => n.id)
  );
  if (transformIds.size === 0) return graph;

  const nodes = graph.nodes.map(migrateTransformNode);

  let automation = graph.automation;
  if (automation) {
    const lanes = automation.lanes.map((lane) => {
      if (!transformIds.has(lane.nodeId)) return lane;
      return migrateAutomationLaneRadiansToDegrees(lane);
    });
    automation = { ...automation, lanes };
  }

  return { ...graph, nodes, ...(automation !== undefined && { automation }) };
}
