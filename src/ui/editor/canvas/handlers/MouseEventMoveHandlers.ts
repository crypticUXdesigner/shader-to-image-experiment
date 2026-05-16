/**
 * Mouse move handlers: interaction manager updates, node drag position, parameter drag, bezier drag,
 * connection hover, potential pan/node-drag start, and port hover + cursor. Used by MouseEventHandler.handleMouseMove.
 */

import type { ToolType } from '../../../../types/editor';
import type { NodeGraph } from '../../../../data-model/types';
import { InteractionType } from '../../../interactions/InteractionTypes';
import type { ParameterValue } from '../../../../data-model/types';
import { getCSSVariableAsNumber } from '../../../../utils/cssTokens';
import { snapParameterValue } from '../../../../utils/parameterValueCalculator';
import { RenderLayer } from '../../rendering/RenderState';
import { FREQ_MIN, FREQ_MAX, normToHz } from '../../rendering/layout/elements/FrequencyRangeElement';
import type { MouseEventMoveContext, MouseEventFullState } from './MouseEventHandlerTypes';
import { getCursorForHover, type CursorHoverHits } from './MouseEventHandlerCursor';

/**
 * Run interaction manager updates (pan, node drag, port connect, param drag, bezier, selection, pan) and
 * update port hover + cursor when no handler consumed the event. Returns true if caller should return (panning).
 */
export function runInteractionUpdatesAndHover(
  ctx: MouseEventMoveContext,
  e: MouseEvent,
  mouseX: number,
  mouseY: number,
  getActiveTool: () => ToolType,
  getIsSpacePressed: () => boolean
): boolean {
  const state = ctx.getState();
  if (state.pan.isPanning && ctx.deps.interactionManager) {
    const eventPan = ctx.deps.createInteractionEvent(InteractionType.CanvasPan, e);
    ctx.deps.interactionManager.update(eventPan);
    return true;
  }
  if (state.interaction.isDraggingNode && ctx.deps.interactionManager) {
    const eventNodeDrag = ctx.deps.createInteractionEvent(InteractionType.NodeDrag, e, null);
    ctx.deps.interactionManager.update(eventNodeDrag);
    return false;
  }
  if (ctx.deps.interactionManager) {
    let eventHandled = false;
    const nodeHit = ctx.deps.hitTestManager.hitTestNode(mouseX, mouseY);
    if (ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.NodeDrag, e, nodeHit))) eventHandled = true;
    const portHit = ctx.deps.hitTestManager.hitTestPort(mouseX, mouseY);
    if (ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.PortConnect, e, portHit))) eventHandled = true;
    const paramHit = ctx.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
    if (ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.ParameterDrag, e, paramHit))) eventHandled = true;
    const bezierHit = ctx.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
    if (ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.BezierControlDrag, e, bezierHit))) eventHandled = true;
    if (getActiveTool() === 'select' && ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.RectangleSelection, e))) eventHandled = true;
    if (ctx.deps.interactionManager.update(ctx.deps.createInteractionEvent(InteractionType.CanvasPan, e))) eventHandled = true;
    if (!eventHandled) applyPortHoverAndCursor(ctx, mouseX, mouseY, getActiveTool, getIsSpacePressed, e.altKey);
  }
  return false;
}

/**
 * Apply fallback potential background pan and potential node-drag start (threshold crossing).
 */
export function applyPotentialPanAndNodeDragStart(
  ctx: MouseEventMoveContext,
  graph: NodeGraph,
  mouseX: number,
  mouseY: number,
  backgroundDragThreshold: number,
  nodeDragThreshold: number
): void {
  const state = ctx.getState();
  if (state.pan.potentialBackgroundPan && !state.pan.isPanning) {
    const dx = mouseX - state.pan.backgroundDragStartX;
    const dy = mouseY - state.pan.backgroundDragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > backgroundDragThreshold) {
      const viewState = ctx.deps.getViewStateInternal();
      ctx.setState({
        pan: {
          isPanning: true,
          potentialBackgroundPan: false,
          panStartX: state.pan.backgroundDragStartX - viewState.panX,
          panStartY: state.pan.backgroundDragStartY - viewState.panY
        }
      });
      ctx.deps.canvas.style.cursor = 'grabbing';
    }
  }
  if (state.interaction.potentialNodeDrag && !state.interaction.isDraggingNode && state.interaction.potentialNodeDragId) {
    const dx = mouseX - state.interaction.nodeDragStartX;
    const dy = mouseY - state.interaction.nodeDragStartY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > nodeDragThreshold) {
      const selection = ctx.deps.getSelectionState();
      const draggedInSelection = selection.selectedNodeIds.has(state.interaction.potentialNodeDragId);
      const nodesToMove = draggedInSelection
        ? new Set(selection.selectedNodeIds)
        : new Set([state.interaction.potentialNodeDragId]);
      const selectedNodesInitialPositions = new Map<string, { x: number; y: number }>();
      const draggedNode = graph.nodes.find(n => n.id === state.interaction.potentialNodeDragId);
      if (draggedNode) {
        for (const nid of nodesToMove) {
          const n = graph.nodes.find(nd => nd.id === nid);
          if (n) selectedNodesInitialPositions.set(nid, { x: n.position.x, y: n.position.y });
        }
        const draggingNodeInitialPos = { x: draggedNode.position.x, y: draggedNode.position.y };
        ctx.setState({
          interaction: {
            isDraggingNode: true,
            draggingNodeId: state.interaction.potentialNodeDragId,
            potentialNodeDrag: false,
            draggingNodeInitialPos,
            selectedNodesInitialPositions
          }
        });
      }
      ctx.deps.canvas.style.cursor = 'grabbing';
    }
  }
}

/**
 * Update port hover state and canvas cursor when no active drag/pan. Uses getCursorForHover.
 */
export function applyPortHoverAndCursor(
  ctx: MouseEventMoveContext,
  mouseX: number,
  mouseY: number,
  getActiveTool: () => ToolType,
  getIsSpacePressed: () => boolean,
  altKey = false
): void {
  const state = ctx.getState();
  const portHit = ctx.deps.hitTestManager.hitTestPort(mouseX, mouseY);
  const previousHoveredPort = state.connection.hoveredPort;
  let hoverChanged = false;
  if (portHit) {
    if (!previousHoveredPort || previousHoveredPort.nodeId !== portHit.nodeId || previousHoveredPort.port !== portHit.port) {
      hoverChanged = true;
    }
    ctx.deps.setConnectionState({ hoveredPort: portHit });
    ctx.deps.canvas.style.cursor = 'crosshair';
  } else {
    if (previousHoveredPort !== null) hoverChanged = true;
    ctx.deps.setConnectionState({ hoveredPort: null });
  }
  if (hoverChanged) ctx.deps.handlerContext.render();

  const bezierHit = ctx.deps.hitTestManager.hitTestBezierControlPoint(mouseX, mouseY);
  const modeHit = ctx.deps.hitTestManager.hitTestParameterMode(mouseX, mouseY);
  const paramHit = ctx.deps.hitTestManager.hitTestParameter(mouseX, mouseY);
  const nodeBodyHit = !!ctx.deps.hitTestManager.hitTestNode(mouseX, mouseY);
  let isToggle = false;
  if (paramHit && !paramHit.isString && !paramHit.frequencyBand) {
    const node = (ctx.deps.getGraph?.() ?? ctx.deps.graph).nodes.find(n => n.id === paramHit.nodeId);
    const spec = ctx.deps.nodeSpecs.get(node?.type ?? '');
    const paramSpec = spec?.parameters[paramHit.paramName];
    isToggle = !!(paramSpec && paramSpec.type === 'int' && paramSpec.min === 0 && paramSpec.max === 1);
  }
  const hits: CursorHoverHits = {
    paramHit: paramHit
      ? {
          nodeId: paramHit.nodeId,
          paramName: paramHit.paramName,
          isString: paramHit.isString,
          frequencyBand: paramHit.frequencyBand,
          isToggle
        }
      : null,
    portHit,
    bezierHit: !!bezierHit,
    modeHit: !!modeHit
  };
  const cursor = getCursorForHover(getActiveTool(), getIsSpacePressed(), hits, altKey, nodeBodyHit);
  ctx.deps.canvas.style.cursor = cursor;
}

/**
 * Apply node drag position update (move nodes, mark dirty, request render).
 */
export function applyNodeDragPosition(
  ctx: MouseEventMoveContext,
  graph: NodeGraph,
  mouseX: number,
  mouseY: number
): void {
  const state = ctx.getState();
  if (!state.interaction.isDraggingNode || !state.interaction.draggingNodeId || !state.interaction.draggingNodeInitialPos) return;
  const node = graph.nodes.find(n => n.id === state.interaction.draggingNodeId);
  if (!node) return;
  const canvasPos = ctx.deps.screenToCanvas(mouseX - state.interaction.dragOffsetX, mouseY - state.interaction.dragOffsetY);
  // No snapping/alignment guides: move nodes based on raw canvas cursor position.
  const deltaX = canvasPos.x - state.interaction.draggingNodeInitialPos.x;
  const deltaY = canvasPos.y - state.interaction.draggingNodeInitialPos.y;
  const movedNodeIds: string[] = [];
  for (const [nodeId, initialPos] of state.interaction.selectedNodesInitialPositions.entries()) {
    const selectedNode = graph.nodes.find(n => n.id === nodeId);
    if (selectedNode) {
      selectedNode.position.x = Math.round(initialPos.x + deltaX);
      selectedNode.position.y = Math.round(initialPos.y + deltaY);
      ctx.deps.onNodeMoved?.(nodeId, selectedNode.position.x, selectedNode.position.y);
      movedNodeIds.push(nodeId);
    }
  }
  ctx.deps.renderState.markNodesDirty(movedNodeIds);
  ctx.deps.renderState.markLayerDirty(RenderLayer.Overlays);
  const connectionsToUpdate: string[] = [];
  for (const nodeId of movedNodeIds) {
    for (const conn of graph.connections) {
      if (conn.sourceNodeId === nodeId || conn.targetNodeId === nodeId) connectionsToUpdate.push(conn.id);
    }
  }
  if (connectionsToUpdate.length > 0) ctx.deps.renderState.markConnectionsDirty(connectionsToUpdate);
  for (const nodeId of movedNodeIds) {
    ctx.deps.connectionLayerRenderer?.invalidateNodeConnections(nodeId);
    ctx.deps.parameterConnectionLayerRenderer?.invalidateNodeConnections(nodeId);
  }
  ctx.deps.renderState.markLayerDirty(RenderLayer.Ports);
  ctx.deps.renderState.markLayerDirty(RenderLayer.Connections);
  ctx.deps.renderState.markLayerDirty(RenderLayer.ParameterConnections);
  ctx.deps.handlerContext.requestRender();
}

/**
 * Apply parameter drag (frequency band or float/int). Updates node params and calls flushParameterChangeAndRender.
 */
export function applyParameterDrag(
  ctx: MouseEventMoveContext,
  state: MouseEventFullState,
  e: MouseEvent,
  mouseX: number,
  mouseY: number
): void {
  if (!state.interaction.isDraggingParameter || !state.interaction.draggingParameterNodeId || !state.interaction.draggingParameterName) return;
  const graph = ctx.deps.getGraph?.() ?? ctx.deps.graph;
  const node = graph.nodes.find(n => n.id === state.interaction.draggingParameterNodeId);
  const spec = ctx.deps.nodeSpecs.get(node?.type ?? '');
  const fb = state.interaction.draggingFrequencyBand;
  if (node && spec && fb) {
    const raw = node.parameters[state.interaction.draggingParameterName];
    const bands: number[][] = (Array.isArray(raw) ? raw : []).map((b: unknown) =>
      Array.isArray(b) && b.length >= 2 ? [Number(b[0]) ?? FREQ_MIN, Number(b[1]) ?? FREQ_MAX] : [FREQ_MIN, FREQ_MAX]
    );
    const bandIndex = fb.bandIndex;
    const idx = fb.field === 'start' || fb.field === 'sliderLow' ? 0 : 1;
    if (bands[bandIndex] == null) bands[bandIndex] = [FREQ_MIN, FREQ_MAX];
    if (fb.field === 'sliderLow' || fb.field === 'sliderHigh') {
      const metrics = ctx.deps.nodeMetrics.get(node.id);
      const layout = spec.parameterLayout?.elements ?? [];
      let em: { x?: number; width?: number } | undefined;
      for (let i = 0; i < layout.length; i++) {
        const el = layout[i] as { type?: string; bandIndex?: number };
        if (el?.type === 'frequency-range' && (el.bandIndex ?? 0) === bandIndex) {
          em = metrics?.elementMetrics?.get(`frequency-range-${i}-${bandIndex}`);
          break;
        }
      }
      if (em?.x != null && em?.width != null) {
        const pd = getCSSVariableAsNumber('embed-slot-pd', 12);
        const sliderX = em.x + pd;
        const sliderW = em.width - pd * 2;
        const canvasPos = ctx.deps.screenToCanvas(mouseX, mouseY);
        let norm = (canvasPos.x - sliderX) / sliderW;
        norm = Math.max(0, Math.min(1, norm));
        const newHz = Math.round(normToHz(norm, fb.scale));
        bands[bandIndex][idx] = Math.max(FREQ_MIN, Math.min(FREQ_MAX, newHz));
      }
    } else {
      const deltaY = state.interaction.dragParamStartY - mouseY;
      const modifier = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 10 : 1;
      const range = FREQ_MAX - FREQ_MIN;
      const valueDelta = (deltaY / 150) * range * modifier;
      const newHz = Math.max(FREQ_MIN, Math.min(FREQ_MAX, state.interaction.dragParamStartValue + valueDelta));
      bands[bandIndex][idx] = Math.round(newHz);
    }
    const newBands: ParameterValue = bands;
    node.parameters[state.interaction.draggingParameterName] = newBands;
    ctx.deps.nodeMetrics.delete(state.interaction.draggingParameterNodeId);
    ctx.deps.nodeRenderer.invalidateMetrics(state.interaction.draggingParameterNodeId);
    ctx.flushParameterChangeAndRender(state.interaction.draggingParameterNodeId, state.interaction.draggingParameterName, newBands, false);
    return;
  }
  if (node && spec) {
    const paramSpec = spec.parameters[state.interaction.draggingParameterName];
    if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
      const deltaY = state.interaction.dragParamStartY - mouseY;
      const modifier = e.shiftKey ? 'fine' : e.ctrlKey || e.metaKey ? 'coarse' : 'normal';
      const min = paramSpec.min ?? 0;
      const max = paramSpec.max ?? 1;
      const range = max - min;
      const p = state.interaction.draggingParameterName;
      const isRangeSliderParam =
        ['inMin', 'inMax', 'outMin', 'outMax'].includes(p) || /^band\d+Remap(InMin|InMax|OutMin|OutMax)$/.test(p);
      const baseSensitivity = isRangeSliderParam
        ? (() => {
            const sliderUIHeight = getCSSVariableAsNumber('range-editor-height', 260);
            const sliderHeight = sliderUIHeight - 12 * 2 - 12 - 12;
            return sliderHeight * ctx.deps.getViewStateInternal().zoom;
          })()
        : 100;
      const multipliers = { normal: 1.0, fine: 0.1, coarse: 10.0 };
      const sensitivity = baseSensitivity / multipliers[modifier as keyof typeof multipliers];
      const valueDelta = (deltaY / sensitivity) * range;
      const newValue = snapParameterValue(state.interaction.dragParamStartValue + valueDelta, paramSpec);
      node.parameters[state.interaction.draggingParameterName] = newValue;
      ctx.deps.nodeMetrics.delete(state.interaction.draggingParameterNodeId);
      ctx.deps.nodeRenderer.invalidateMetrics(state.interaction.draggingParameterNodeId);
      ctx.flushParameterChangeAndRender(state.interaction.draggingParameterNodeId, state.interaction.draggingParameterName, newValue, false);
    }
  }
}

/**
 * Apply bezier control point drag: map mouse to 0–1 and update x1/y1 or x2/y2.
 */
export function applyBezierDrag(ctx: MouseEventMoveContext, state: MouseEventFullState, mouseX: number, mouseY: number): void {
  if (
    !state.interaction.isDraggingBezierControl ||
    state.interaction.draggingBezierNodeId === null ||
    state.interaction.draggingBezierControlIndex === null
  )
    return;
  const graph = ctx.deps.getGraph?.() ?? ctx.deps.graph;
  const node = graph.nodes.find(n => n.id === state.interaction.draggingBezierNodeId);
  const spec = ctx.deps.nodeSpecs.get(node?.type ?? '');
  const metrics = ctx.deps.nodeMetrics.get(node?.id ?? '');
  if (!node || !spec || !metrics) return;
  const x1Pos = metrics.parameterGridPositions.get('x1');
  if (!x1Pos) return;
  const bezierEditorPadding = getCSSVariableAsNumber('bezier-editor-padding', 12);
  const drawX = x1Pos.cellX + bezierEditorPadding;
  const drawY = x1Pos.cellY + bezierEditorPadding;
  const drawWidth = x1Pos.cellWidth - bezierEditorPadding * 2;
  const drawHeight = x1Pos.cellHeight - bezierEditorPadding * 2;
  const canvasPos = ctx.deps.screenToCanvas(mouseX, mouseY);
  let newX = (canvasPos.x - drawX) / drawWidth;
  let newY = 1 - (canvasPos.y - drawY) / drawHeight;
  newX = Math.max(0, Math.min(1, newX));
  newY = Math.max(0, Math.min(1, newY));
  if (state.interaction.draggingBezierControlIndex === 0) {
    node.parameters.x1 = newX;
    node.parameters.y1 = newY;
    ctx.deps.onParameterChanged?.(state.interaction.draggingBezierNodeId, 'x1', newX, { recordUndo: false });
    ctx.deps.onParameterChanged?.(state.interaction.draggingBezierNodeId, 'y1', newY, { recordUndo: false });
  } else if (state.interaction.draggingBezierControlIndex === 1) {
    node.parameters.x2 = newX;
    node.parameters.y2 = newY;
    ctx.deps.onParameterChanged?.(state.interaction.draggingBezierNodeId, 'x2', newX, { recordUndo: false });
    ctx.deps.onParameterChanged?.(state.interaction.draggingBezierNodeId, 'y2', newY, { recordUndo: false });
  }
  ctx.deps.handlerContext.render();
}

/**
 * Update connection drag state: mouse position and hovered port when connecting.
 */
export function applyConnectionHover(ctx: MouseEventMoveContext, state: MouseEventFullState, mouseX: number, mouseY: number): void {
  if (!state.connection.isConnecting) return;
  ctx.setState({ connection: { connectionMouseX: mouseX, connectionMouseY: mouseY } });
  if (state.connection.connectionStartIsOutput) {
    const portHit = ctx.deps.hitTestManager.hitTestPort(mouseX, mouseY);
    if (portHit && !portHit.isOutput && portHit.nodeId !== state.connection.connectionStartNodeId) {
      ctx.setState({ connection: { hoveredPort: portHit } });
    } else {
      ctx.setState({ connection: { hoveredPort: null } });
    }
  } else {
    ctx.setState({ connection: { hoveredPort: null } });
  }
  ctx.deps.handlerContext.render();
}
