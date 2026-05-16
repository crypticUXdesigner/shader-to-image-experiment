/**
 * Migrates legacy `arrangement-notes` graphs:
 * - `backgroundR/G/B` → OKLCH (`backgroundL/C/H`), rewires parameter-input connections accordingly.
 * - Removes deprecated `viewportMode` / `fixedStartSeconds` (always-follow timeline) and drops wires to those params.
 * - Drops legacy `uvInputMode` (notes always interpret **in** as **UV Coords** **p**, remapped to 0–1).
 */

import type { NodeGraph, NodeInstance, Connection } from './types';
import { linearRgbToOklch } from '../utils/colorConversion';

const NODE_TYPE = 'arrangement-notes';

/** Removed from node spec — strip from saved graphs and drop parameter wires. */
const REMOVED_ARR_NOTES_PARAMS = new Set(['viewportMode', 'fixedStartSeconds', 'uvInputMode']);

const CONNECTION_PARAM_MAP: Record<string, string> = {
  backgroundR: 'backgroundL',
  backgroundG: 'backgroundC',
  backgroundB: 'backgroundH',
};

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function migrateNode(node: NodeInstance): NodeInstance {
  if (node.type !== NODE_TYPE) return node;

  const params = node.parameters ?? {};
  const nextParams: Record<string, unknown> = { ...params };

  const hasOklchBg =
    'backgroundL' in nextParams && 'backgroundC' in nextParams && 'backgroundH' in nextParams;

  const r = asNumber(params.backgroundR);
  const g = asNumber(params.backgroundG);
  const b = asNumber(params.backgroundB);

  if (!hasOklchBg && r != null && g != null && b != null) {
    const oklch = linearRgbToOklch(r, g, b);
    nextParams.backgroundL = oklch.l;
    nextParams.backgroundC = oklch.c;
    nextParams.backgroundH = oklch.h;
  }

  delete nextParams.backgroundR;
  delete nextParams.backgroundG;
  delete nextParams.backgroundB;

  for (const key of REMOVED_ARR_NOTES_PARAMS) {
    delete nextParams[key];
  }

  const prevModes = node.parameterInputModes;
  let cleanedModes =
    prevModes && Object.keys(prevModes).length > 0 ? { ...prevModes } : undefined;

  if (cleanedModes) {
    const channelMap: Array<[string, string]> = [
      ['backgroundR', 'backgroundL'],
      ['backgroundG', 'backgroundC'],
      ['backgroundB', 'backgroundH'],
    ];
    for (const [from, to] of channelMap) {
      if (from in cleanedModes && !(to in cleanedModes)) {
        cleanedModes[to] = cleanedModes[from];
      }
      delete cleanedModes[from];
    }
    for (const key of REMOVED_ARR_NOTES_PARAMS) {
      delete cleanedModes[key];
    }
    if (Object.keys(cleanedModes).length === 0) cleanedModes = undefined;
  }

  const { parameterInputModes: _dropModes, ...nodeRest } = node;

  return {
    ...nodeRest,
    parameters: nextParams as NodeInstance['parameters'],
    ...(cleanedModes ? { parameterInputModes: cleanedModes } : {}),
  };
}

export function migrateArrangementNotesParameters(graph: NodeGraph): NodeGraph {
  const ids = new Set(graph.nodes.filter((n) => n.type === NODE_TYPE).map((n) => n.id));
  if (ids.size === 0) return graph;

  const hasLegacyParams = graph.nodes.some((n) => {
    if (n.type !== NODE_TYPE) return false;
    const p = n.parameters ?? {};
    return (
      'backgroundR' in p ||
      'backgroundG' in p ||
      'backgroundB' in p ||
      [...REMOVED_ARR_NOTES_PARAMS].some((k) => k in p)
    );
  });

  const hasLegacyConnections = graph.connections.some((c) => {
    if (!ids.has(c.targetNodeId)) return false;
    if (!c.targetParameter) return false;
    if (c.targetParameter in CONNECTION_PARAM_MAP) return true;
    return REMOVED_ARR_NOTES_PARAMS.has(c.targetParameter);
  });

  if (!hasLegacyParams && !hasLegacyConnections) return graph;

  const nodes = graph.nodes.map((n) => (ids.has(n.id) ? migrateNode(n) : n));

  const connections: Connection[] = graph.connections
    .map((c) => {
      if (!ids.has(c.targetNodeId)) return c;
      if (!c.targetParameter) return c;
      const mapped = CONNECTION_PARAM_MAP[c.targetParameter];
      if (mapped) return { ...c, targetParameter: mapped };
      return c;
    })
    .filter((c) => {
      if (!ids.has(c.targetNodeId)) return true;
      if (!c.targetParameter) return true;
      return !REMOVED_ARR_NOTES_PARAMS.has(c.targetParameter);
    });

  return { ...graph, nodes, connections };
}
