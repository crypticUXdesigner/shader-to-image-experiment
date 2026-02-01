/**
 * Parameter Drag Handler
 *
 * Behavior is driven by getUIType(): enum ⇒ no drag; toggle ⇒ click to flip;
 * knob/input ⇒ drag. Range and bezier params are not draggable in this handler.
 *
 * Handles parameter value adjustment via drag:
 * - Click and drag on parameter to adjust value
 * - Supports different sensitivity modes (normal, fine with shift, coarse with ctrl)
 * - Handles toggle parameters (click instead of drag)
 * - Throttles parameter updates for smooth performance (Phase 3.4)
 */

import { InteractionType } from '../InteractionTypes';
import type { InteractionEvent, InteractionHandler } from '../InteractionHandler';
import type { HandlerContext } from '../HandlerContext';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { Throttler } from '../../../utils/Throttler';
import { snapParameterValue } from '../../../utils/parameterValueCalculator';
import { getParameterUIRegistry } from '../../components/rendering/ParameterUIRegistry';

export class ParameterDragHandler implements InteractionHandler {
  priority = 40; // High priority - parameter dragging is specific interaction
  
  private isDraggingParameter: boolean = false;
  private draggingParameterNodeId: string | null = null;
  private draggingParameterName: string | null = null;
  private dragParamStartY: number = 0;
  private dragParamStartValue: number = 0;
  
  // Phase 3.4: Throttle parameter updates for smooth performance
  private parameterThrottler: Throttler;
  
  constructor(private context: HandlerContext) {
    // Throttle at ~60fps (16ms) for smooth updates
    this.parameterThrottler = new Throttler(16);
  }
  
  canHandle(event: InteractionEvent): boolean {
    // If we're currently dragging a parameter, we can handle end events
    if (this.isDraggingParameter) {
      return true;
    }
    
    if (event.type === InteractionType.ParameterDrag) {
      return true;
    }
    
    // Check if spacebar is pressed - if so, don't handle (let pan handler take it)
    if (this.context.isSpacePressed?.()) {
      return false;
    }
    
    // Check if clicking on a parameter (never handle mode button – that’s a click, not a drag)
    const paramHit = this.context.hitTestParameter?.(event.screenPosition.x, event.screenPosition.y);
    if (paramHit && !paramHit.isString && !paramHit.isModeButton) {
      return true;
    }
    
    return false;
  }
  
  onStart(event: InteractionEvent): void {
    const paramHit = this.context.hitTestParameter?.(event.screenPosition.x, event.screenPosition.y);
    if (!paramHit || paramHit.isString || paramHit.isModeButton) return;
    
    const graph = this.context.getGraph();
    const node = graph.nodes.find(n => n.id === paramHit.nodeId);
    const nodeSpecs = this.context.getNodeSpecs();
    const spec = nodeSpecs.get(node?.type || '');
    
    if (!node || !spec) return;
    
    const paramSpec = spec.parameters[paramHit.paramName];
    if (!paramSpec) return;
    
    const parameterRegistry = getParameterUIRegistry();
    const renderer = parameterRegistry.getRenderer(spec, paramHit.paramName);
    const uiType = renderer.getUIType();

    if (uiType === 'enum') {
      // Don't allow dragging enum parameters - they're only selectable via dropdown
      return;
    }

    if (uiType === 'toggle') {
      const currentValue = (node.parameters[paramHit.paramName] ?? paramSpec.default) as number;
      const newValue = currentValue === 1 ? 0 : 1;
      this.context.onParameterChanged?.(paramHit.nodeId, paramHit.paramName, newValue);
      this.context.requestRender();
      return;
    }

    // Only knob and input support drag in this handler; range/bezier have their own interactions
    if (uiType === 'knob' || uiType === 'input') {
      this.isDraggingParameter = true;
      this.draggingParameterNodeId = paramHit.nodeId;
      this.draggingParameterName = paramHit.paramName;
      // Store screen-space position for consistent drag feel at all zoom levels
      this.dragParamStartY = event.screenPosition.y;
      this.dragParamStartValue = (node.parameters[paramHit.paramName] ?? paramSpec.default) as number;
      
      this.context.setCursor('ns-resize');
    }
  }
  
  onUpdate(event: InteractionEvent): void {
    if (!this.isDraggingParameter || !this.draggingParameterNodeId || !this.draggingParameterName) {
      return;
    }
    
    const graph = this.context.getGraph();
    const node = graph.nodes.find(n => n.id === this.draggingParameterNodeId);
    const nodeSpecs = this.context.getNodeSpecs();
    const spec = nodeSpecs.get(node?.type || '');
    
    if (!node || !spec) return;
    
    const paramSpec = spec.parameters[this.draggingParameterName];
    if (paramSpec && (paramSpec.type === 'float' || paramSpec.type === 'int')) {
      // Calculate delta in screen space (Up = increase, down = decrease)
      const deltaY = this.dragParamStartY - event.screenPosition.y;
      const modifier = event.modifiers.shift ? 'fine' : (event.modifiers.ctrl || event.modifiers.meta ? 'coarse' : 'normal');
      
      const min = paramSpec.min ?? 0;
      const max = paramSpec.max ?? 1;
      const range = max - min;
      
      // For range slider parameters, use the actual visual slider height in screen pixels
      // This ensures that dragging the full height of the slider = full range
      const isRangeSliderParam = ['inMin', 'inMax', 'outMin', 'outMax'].includes(this.draggingParameterName || '');
      let baseSensitivity: number;
      
      if (isRangeSliderParam) {
        // Calculate the visual slider height in screen pixels
        const sliderUIHeight = getCSSVariableAsNumber('range-editor-height', 260);
        const sliderUIPadding = 12;
        const topMargin = 12;
        const bottomMargin = 12;
        const sliderHeight = sliderUIHeight - sliderUIPadding * 2 - topMargin - bottomMargin;
        // Convert canvas height to screen pixels
        const state = this.context.getState();
        baseSensitivity = sliderHeight * state.zoom;
      } else {
        // For regular parameters, use a default sensitivity
        baseSensitivity = 100;
      }
      
      const multipliers = {
        'normal': 1.0,
        'fine': 0.1,
        'coarse': 10.0
      };
      
      const sensitivity = baseSensitivity / multipliers[modifier];
      const valueDelta = (deltaY / sensitivity) * range;
      const rawValue = this.dragParamStartValue + valueDelta;
      const newValue = snapParameterValue(rawValue, paramSpec);

      // Update node parameter immediately for visual feedback
      node.parameters[this.draggingParameterName] = newValue;
      
      // Invalidate metrics cache so controls update during drag
      // The cache key includes parameters, so this ensures fresh metrics are calculated
      // Do this on every update (not throttled) so visual feedback is immediate
      this.context.invalidateNodeMetrics?.(this.draggingParameterNodeId);
      
      // Mark node as dirty for incremental rendering system
      // This ensures the node gets re-rendered even with frame buffer optimization
      this.context.markNodesDirty?.([this.draggingParameterNodeId]);
      
      // Request render (batched via requestRender mechanism)
      // This batches multiple parameter updates into a single frame (60fps max)
      // Uniforms are updated immediately above, so visual feedback is still responsive
      this.context.requestRender();
      
      // Throttle callback (Phase 3.4)
      // Throttle parameter change callbacks to avoid excessive updates
      const key = `${this.draggingParameterNodeId}:${this.draggingParameterName}`;
      this.parameterThrottler.schedule(key, newValue, (throttledValue) => {
        this.context.onParameterChanged?.(this.draggingParameterNodeId!, this.draggingParameterName!, throttledValue);
      });
    }
  }
  
  onEnd(_event: InteractionEvent): void {
    // Flush any pending throttled updates before ending drag
    if (this.parameterThrottler.hasPending()) {
      // Force flush to ensure final value is applied
      this.parameterThrottler.flush();
    }
    
    // Clean up drag state
    this.isDraggingParameter = false;
    this.draggingParameterNodeId = null;
    this.draggingParameterName = null;
    this.dragParamStartY = 0;
    this.dragParamStartValue = 0;
    
    this.context.setCursor('default');
  }
  
  handle(_event: InteractionEvent): void {
    // This method is called for immediate handling
    // For parameter dragging, we use onStart/onUpdate/onEnd lifecycle
    // This is a no-op as dragging is handled through lifecycle methods
  }
}
