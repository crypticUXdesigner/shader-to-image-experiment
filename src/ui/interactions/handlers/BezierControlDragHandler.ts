/**
 * Bezier Control Drag Handler
 * 
 * Handles bezier control point dragging:
 * - Click and drag on bezier control points to adjust curve
 * - Updates x1, y1, x2, y2 parameters together
 * - Throttles parameter updates for smooth performance (Phase 3.4)
 */

import { InteractionType } from '../InteractionTypes';
import type { InteractionEvent, InteractionHandler } from '../InteractionHandler';
import type { HandlerContext } from '../HandlerContext';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { Throttler } from '../../../utils/Throttler';

export class BezierControlDragHandler implements InteractionHandler {
  priority = 35; // High priority - bezier control dragging is specific interaction
  
  private isDraggingBezierControl: boolean = false;
  private draggingBezierNodeId: string | null = null;
  private draggingBezierControlIndex: number | null = null;
  private draggingParamNames: [string, string, string, string] | null = null; // [x1, y1, x2, y2]
  private dragBezierStartValues: { x1: number; y1: number; x2: number; y2: number } | null = null;
  private hadThrottledParameterUpdates = false;
  
  // Phase 3.4: Throttle parameter updates for smooth performance
  private bezierThrottler: Throttler;
  
  constructor(private context: HandlerContext) {
    // Throttle at ~60fps (16ms) for smooth updates
    this.bezierThrottler = new Throttler(16);
  }
  
  canHandle(event: InteractionEvent): boolean {
    // If we're currently dragging a bezier control, we can handle end events
    if (this.isDraggingBezierControl) {
      return true;
    }
    
    if (event.type === InteractionType.BezierControlDrag) {
      return true;
    }
    
    // Check if spacebar is pressed - if so, don't handle (let pan handler take it)
    if (this.context.isSpacePressed?.()) {
      return false;
    }
    
    // Check if clicking on a bezier control point
    const bezierHit = this.context.hitTestBezierControlPoint?.(event.screenPosition.x, event.screenPosition.y);
    if (bezierHit) {
      return true;
    }
    
    return false;
  }
  
  onStart(event: InteractionEvent): void {
    const raw = event.target ?? this.context.hitTestBezierControlPoint?.(event.screenPosition.x, event.screenPosition.y);
    const bezierHit = raw && typeof raw === 'object' && 'paramNames' in raw
      ? raw as { nodeId: string; paramNames: [string, string, string, string]; controlIndex: number }
      : null;
    if (!bezierHit) return;
    
    const graph = this.context.getGraph();
    const node = graph.nodes.find(n => n.id === bezierHit.nodeId);
    const nodeSpecs = this.context.getNodeSpecs();
    const spec = nodeSpecs.get(node?.type || '');
    
    if (!node || !spec) return;
    
    const [x1Name, y1Name, x2Name, y2Name] = bezierHit.paramNames;
    
    this.isDraggingBezierControl = true;
    this.draggingBezierNodeId = bezierHit.nodeId;
    this.draggingBezierControlIndex = bezierHit.controlIndex;
    this.draggingParamNames = bezierHit.paramNames;
    
    const x1 = (node.parameters[x1Name] ?? spec.parameters[x1Name]?.default ?? 0) as number;
    const y1 = (node.parameters[y1Name] ?? spec.parameters[y1Name]?.default ?? 0) as number;
    const x2 = (node.parameters[x2Name] ?? spec.parameters[x2Name]?.default ?? 1) as number;
    const y2 = (node.parameters[y2Name] ?? spec.parameters[y2Name]?.default ?? 1) as number;
    this.dragBezierStartValues = { x1, y1, x2, y2 };
    this.hadThrottledParameterUpdates = false;
    
    this.context.setCursor('move');
  }
  
  onUpdate(event: InteractionEvent): void {
    if (!this.isDraggingBezierControl || 
        this.draggingBezierNodeId === null || 
        this.draggingBezierControlIndex === null || 
        !this.dragBezierStartValues) {
      return;
    }
    
    const paramNames = this.draggingParamNames;
    if (!paramNames) return;

    const graph = this.context.getGraph();
    const node = graph.nodes.find(n => n.id === this.draggingBezierNodeId);
    const nodeSpecs = this.context.getNodeSpecs();
    const spec = nodeSpecs.get(node?.type || '');
    const metrics = this.context.getNodeMetrics?.(this.draggingBezierNodeId);
    
    if (!node || !spec || !metrics) return;
    
    const [x1Name, y1Name, x2Name, y2Name] = paramNames;
    const x1Pos = metrics.parameterGridPositions.get(x1Name);
    if (!x1Pos) return;
    
    const bezierEditorPadding = getCSSVariableAsNumber('bezier-editor-padding', 12);
    const drawX = x1Pos.cellX + bezierEditorPadding;
    const drawY = x1Pos.cellY + bezierEditorPadding;
    const drawWidth = x1Pos.cellWidth - bezierEditorPadding * 2;
    const drawHeight = x1Pos.cellHeight - bezierEditorPadding * 2;
    
    const canvasPos = this.context.screenToCanvas(event.screenPosition.x, event.screenPosition.y);
    let newX = (canvasPos.x - drawX) / drawWidth;
    let newY = 1 - (canvasPos.y - drawY) / drawHeight;
    newX = Math.max(0, Math.min(1, newX));
    newY = Math.max(0, Math.min(1, newY));
    
    if (this.draggingBezierControlIndex === 0) {
      node.parameters[x1Name] = newX;
      node.parameters[y1Name] = newY;
      this.bezierThrottler.schedule(`${this.draggingBezierNodeId!}:${x1Name}`, newX, () => {
        this.hadThrottledParameterUpdates = true;
        this.context.onParameterChanged?.(this.draggingBezierNodeId!, x1Name, newX, { recordUndo: false });
      });
      this.bezierThrottler.schedule(`${this.draggingBezierNodeId!}:${y1Name}`, newY, () => {
        this.hadThrottledParameterUpdates = true;
        this.context.onParameterChanged?.(this.draggingBezierNodeId!, y1Name, newY, { recordUndo: false });
      });
      this.context.requestRender();
    } else if (this.draggingBezierControlIndex === 1) {
      node.parameters[x2Name] = newX;
      node.parameters[y2Name] = newY;
      this.bezierThrottler.schedule(`${this.draggingBezierNodeId!}:${x2Name}`, newX, () => {
        this.hadThrottledParameterUpdates = true;
        this.context.onParameterChanged?.(this.draggingBezierNodeId!, x2Name, newX, { recordUndo: false });
      });
      this.bezierThrottler.schedule(`${this.draggingBezierNodeId!}:${y2Name}`, newY, () => {
        this.hadThrottledParameterUpdates = true;
        this.context.onParameterChanged?.(this.draggingBezierNodeId!, y2Name, newY, { recordUndo: false });
      });
      this.context.requestRender();
    }
  }
  
  onEnd(_event: InteractionEvent): void {
    // Flush any pending throttled updates before ending drag
    if (this.bezierThrottler.hasPending()) {
      // Force flush to ensure final values are applied
      this.bezierThrottler.flush();
    }
    
    if (this.hadThrottledParameterUpdates) {
      this.context.onParameterGestureCommit?.();
    }
    this.hadThrottledParameterUpdates = false;

    // Clean up drag state
    this.isDraggingBezierControl = false;
    this.draggingBezierNodeId = null;
    this.draggingBezierControlIndex = null;
    this.draggingParamNames = null;
    this.dragBezierStartValues = null;
    
    this.context.setCursor('default');
  }
  
  handle(_event: InteractionEvent): void {
    // This method is called for immediate handling
    // For bezier control dragging, we use onStart/onUpdate/onEnd lifecycle
    // This is a no-op as dragging is handled through lifecycle methods
  }
}
