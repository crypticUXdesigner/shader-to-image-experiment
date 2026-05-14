/**
 * Removes deprecated `polarEnabled` from polar-coordinates nodes (transform is always applied).
 * Drops parameter wires and automation lanes targeting `polarEnabled`.
 */

import type { AutomationLane, Connection, NodeGraph, NodeInstance } from './types';

export function migratePolarCoordinatesRemoveEnabled(graph: NodeGraph): NodeGraph {
  const polarIds = new Set(
    graph.nodes.filter((n) => n.type === 'polar-coordinates').map((n) => n.id)
  );
  if (polarIds.size === 0) return graph;

  const nodes = graph.nodes.map((node): NodeInstance => {
    if (node.type !== 'polar-coordinates') return node;
    const parameters = { ...node.parameters };
    delete parameters.polarEnabled;

    if (node.parameterInputModes && 'polarEnabled' in node.parameterInputModes) {
      const parameterInputModes = { ...node.parameterInputModes };
      delete parameterInputModes.polarEnabled;
      if (Object.keys(parameterInputModes).length === 0) {
        const next: NodeInstance = { ...node, parameters };
        delete next.parameterInputModes;
        return next;
      }
      return { ...node, parameters, parameterInputModes };
    }
    return { ...node, parameters };
  });

  const connections = graph.connections.filter((c: Connection) => {
    if (!c.targetParameter || !polarIds.has(c.targetNodeId)) return true;
    return c.targetParameter !== 'polarEnabled';
  });

  let automation = graph.automation;
  if (automation) {
    const lanes = automation.lanes.filter((lane: AutomationLane) => {
      if (!polarIds.has(lane.nodeId)) return true;
      return lane.paramName !== 'polarEnabled';
    });
    if (lanes.length !== automation.lanes.length) {
      automation = { ...automation, lanes };
    }
  }

  const automationChanged = automation !== graph.automation;
  return { ...graph, nodes, connections, ...(automationChanged ? { automation } : {}) };
}
