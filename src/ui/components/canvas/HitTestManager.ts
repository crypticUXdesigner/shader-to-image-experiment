/**
 * Hit Test Manager
 * Handles all hit testing operations for detecting mouse interactions with canvas elements.
 */

import type { NodeGraph } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { NodeRenderMetrics } from '../NodeRenderer';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import type { ViewStateManager } from './ViewStateManager';
import { FREQ_MIN, FREQ_MAX, hzToNorm } from '../rendering/layout/elements/FrequencyRangeElement';
import { getPortTypeDisplayLabel } from '../rendering/RenderingUtils';
import {
  getParameterControlHitRegions,
  isPointInParameterRegions,
  getRemapHitRegions,
  getAnalyzerBandRemapHitRegions,
  testRemapHit,
  type ParameterGridPosition
} from './ParameterHitRegions';

export interface HitTestManagerDependencies {
  graph: NodeGraph;
  nodeSpecs: Map<string, NodeSpec>;
  nodeMetrics: Map<string, NodeRenderMetrics>;
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  getViewState: () => { panX: number; panY: number; zoom: number };
  getSelectionState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  viewStateManager: ViewStateManager;
}

/**
 * Manages hit testing for all canvas elements (nodes, ports, connections, parameters, etc.)
 */
export class HitTestManager {
  private graph: NodeGraph;
  private nodeSpecs: Map<string, NodeSpec>;
  private nodeMetrics: Map<string, NodeRenderMetrics>;
  private screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  private getViewState: () => { panX: number; panY: number; zoom: number };
  private getSelectionState: () => { selectedNodeIds: Set<string>; selectedConnectionIds: Set<string> };
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private viewStateManager: ViewStateManager;

  constructor(dependencies: HitTestManagerDependencies) {
    this.graph = dependencies.graph;
    this.nodeSpecs = dependencies.nodeSpecs;
    this.nodeMetrics = dependencies.nodeMetrics;
    this.screenToCanvas = dependencies.screenToCanvas;
    this.getViewState = dependencies.getViewState;
    this.getSelectionState = dependencies.getSelectionState;
    this.ctx = dependencies.ctx;
    this.canvas = dependencies.canvas;
    this.viewStateManager = dependencies.viewStateManager;
  }

  /**
   * Update dependencies (called when graph or metrics change)
   */
  updateDependencies(dependencies: Partial<HitTestManagerDependencies>): void {
    if (dependencies.graph !== undefined) this.graph = dependencies.graph;
    if (dependencies.nodeSpecs !== undefined) this.nodeSpecs = dependencies.nodeSpecs;
    if (dependencies.nodeMetrics !== undefined) this.nodeMetrics = dependencies.nodeMetrics;
    if (dependencies.screenToCanvas !== undefined) this.screenToCanvas = dependencies.screenToCanvas;
    if (dependencies.getViewState !== undefined) this.getViewState = dependencies.getViewState;
    if (dependencies.getSelectionState !== undefined) this.getSelectionState = dependencies.getSelectionState;
    if (dependencies.ctx !== undefined) this.ctx = dependencies.ctx;
    if (dependencies.canvas !== undefined) this.canvas = dependencies.canvas;
    if (dependencies.viewStateManager !== undefined) this.viewStateManager = dependencies.viewStateManager;
  }

  /**
   * Hit test for nodes
   * Returns node ID if mouse is over a node, null otherwise
   */
  hitTestNode(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    // Check nodes in reverse order (top to bottom)
    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      const metrics = this.nodeMetrics.get(node.id);
      if (!metrics) continue;
      
      if (
        canvasPos.x >= node.position.x &&
        canvasPos.x <= node.position.x + metrics.width &&
        canvasPos.y >= node.position.y &&
        canvasPos.y <= node.position.y + metrics.height
      ) {
        return node.id;
      }
    }
    
    return null;
  }

  /**
   * Hit test for ports (input/output/parameter)
   * Returns port information if mouse is over a port, null otherwise
   */
  hitTestPort(mouseX: number, mouseY: number): { nodeId: string, port: string, isOutput: boolean, parameter?: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const portRadius = getCSSVariableAsNumber('port-radius', 12); // Visual radius (matches CSS)
    const hitMargin = 10; // Increased from 4 to 10 for easier interaction
    const hitRadius = portRadius + hitMargin;
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      // Check parameter input ports (for float parameters only)
      for (const [paramName, paramPortPos] of metrics.parameterInputPortPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (paramSpec && paramSpec.type === 'float') {
          const dx = canvasPos.x - paramPortPos.x;
          const dy = canvasPos.y - paramPortPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < hitRadius) {
            return { nodeId: node.id, port: '', isOutput: false, parameter: paramName };
          }
        }
      }
      
      // Check input ports
      for (const port of spec.inputs) {
        const pos = metrics.portPositions.get(`input:${port.name}`);
        if (pos) {
          const dx = canvasPos.x - pos.x;
          const dy = canvasPos.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < hitRadius) {
            return { nodeId: node.id, port: port.name, isOutput: false };
          }
        }
      }
      
      // Check output ports
      for (const port of spec.outputs) {
        const pos = metrics.portPositions.get(`output:${port.name}`);
        if (pos) {
          const dx = canvasPos.x - pos.x;
          const dy = canvasPos.y - pos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < hitRadius) {
            return { nodeId: node.id, port: port.name, isOutput: true };
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Hit test for connections
   * Returns connection ID if mouse is over a connection, null otherwise
   */
  hitTestConnection(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    // Increase hit threshold and make it zoom-aware (12 pixels in screen space)
    const viewState = this.getViewState();
    const hitThreshold = 12 / viewState.zoom;
    
    for (const conn of this.graph.connections) {
      const sourceNode = this.graph.nodes.find(n => n.id === conn.sourceNodeId);
      const targetNode = this.graph.nodes.find(n => n.id === conn.targetNodeId);
      
      if (!sourceNode || !targetNode) continue;
      
      const sourceSpec = this.nodeSpecs.get(sourceNode.type);
      const targetSpec = this.nodeSpecs.get(targetNode.type);
      const sourceMetrics = this.nodeMetrics.get(sourceNode.id);
      const targetMetrics = this.nodeMetrics.get(targetNode.id);
      
      if (!sourceSpec || !targetSpec || !sourceMetrics || !targetMetrics) continue;
      
      const sourcePortPos = sourceMetrics.portPositions.get(`output:${conn.sourcePort}`);
      
      // Handle parameter connections
      let targetPortPos: { x: number; y: number } | undefined;
      if (conn.targetParameter) {
        targetPortPos = targetMetrics.parameterInputPortPositions.get(conn.targetParameter);
      } else {
        targetPortPos = targetMetrics.portPositions.get(`input:${conn.targetPort}`);
      }
      
      if (!sourcePortPos || !targetPortPos) continue;
      
      // Test bezier curve distance
      if (this.isPointNearBezier(
        canvasPos.x, canvasPos.y,
        sourcePortPos.x, sourcePortPos.y,
        targetPortPos.x, targetPortPos.y,
        hitThreshold
      )) {
        return conn.id;
      }
    }
    
    return null;
  }

  /**
   * Hit test for delete buttons
   * Returns node ID if mouse is over a delete button, null otherwise
   */
  hitTestDeleteButton(mouseX: number, mouseY: number): string | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      const selection = this.getSelectionState();
      if (!selection.selectedNodeIds.has(node.id)) continue;
      
      const metrics = this.nodeMetrics.get(node.id);
      if (!metrics) continue;
      
      const deleteBtnX = node.position.x + metrics.width - 24;
      const deleteBtnY = node.position.y + 4;
      const deleteBtnSize = 20;
      const deleteBtnCenterX = deleteBtnX + deleteBtnSize / 2;
      const deleteBtnCenterY = deleteBtnY + deleteBtnSize / 2;
      
      const dx = canvasPos.x - deleteBtnCenterX;
      const dy = canvasPos.y - deleteBtnCenterY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < deleteBtnSize / 2) {
        return node.id;
      }
    }
    
    return null;
  }

  /**
   * Hit test for range editor slider handles and input row.
   * Uses getRemapHitRegions / testRemapHit (same token/layout as RemapRangeElement).
   */
  hitTestRangeEditorSlider(mouseX: number, mouseY: number): { nodeId: string, paramName: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const viewState = this.getViewState();

    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;

      const rangeParams = ['inMin', 'inMax', 'outMin', 'outMax'];
      const hasRangeParams = rangeParams.every((p) => spec.parameters[p]?.type === 'float');
      if (!hasRangeParams) continue;

      let remapRangeElementMetrics: { x: number; y: number; width: number; height: number } | null = null;
      if (metrics.elementMetrics) {
        for (const [elementKey, elementMetrics] of metrics.elementMetrics.entries()) {
          if (elementKey.startsWith('remap-range-')) {
            remapRangeElementMetrics = elementMetrics as { x: number; y: number; width: number; height: number };
            break;
          }
        }
      }
      if (!remapRangeElementMetrics) continue;

      const result = getRemapHitRegions(node, spec, remapRangeElementMetrics, viewState.zoom);
      const paramName = testRemapHit(canvasPos.x, canvasPos.y, result);
      if (paramName != null) {
        return { nodeId: node.id, paramName };
      }
    }
    return null;
  }

  /**
   * Hit test for audio-analyzer band remap elements (per-band remap slider + input row).
   */
  hitTestAnalyzerBandRemap(mouseX: number, mouseY: number): { nodeId: string; paramName: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const viewState = this.getViewState();

    for (const node of this.graph.nodes) {
      if (node.type !== 'audio-analyzer') continue;
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics?.elementMetrics) continue;

      const layout = spec.parameterLayout?.elements;
      if (!layout) continue;

      for (let i = 0; i < layout.length; i++) {
        const el = layout[i] as { type?: string; bandIndex?: number };
        if (el?.type !== 'analyzer-band-remap' || typeof el.bandIndex !== 'number') continue;

        const bandIndex = el.bandIndex;
        const key = `analyzer-band-remap-${i}-${bandIndex}`;
        const em = metrics.elementMetrics.get(key);
        if (!em || em.width == null || em.height == null) continue;

        const result = getAnalyzerBandRemapHitRegions(
          node,
          spec,
          em as { x: number; y: number; width: number; height: number },
          bandIndex,
          viewState.zoom
        );
        const paramName = testRemapHit(canvasPos.x, canvasPos.y, result);
        if (paramName != null) {
          return { nodeId: node.id, paramName };
        }
      }
    }
    return null;
  }

  /**
   * Hit test for frequency-range elements (slider + start/end inputs).
   * Returns hit with frequencyBand when over a frequency-range control.
   */
  hitTestFrequencyRange(mouseX: number, mouseY: number): {
    nodeId: string;
    paramName: string;
    frequencyBand: { bandIndex: number; field: 'start' | 'end' | 'sliderLow' | 'sliderHigh' };
    scale: 'linear' | 'audio';
  } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const pd = getCSSVariableAsNumber('embed-slot-pd', 12);
    const gap = pd;
    const labelFontSize = getCSSVariableAsNumber('frequency-range-label-font-size', 18);
    const labelHeight = labelFontSize + 2;
    const scaleHeightToken = getCSSVariableAsNumber('frequency-range-scale-height', 22);
    const sliderHeight = getCSSVariableAsNumber('frequency-range-slider-height', 16);
    const inputRowHeight = getCSSVariableAsNumber('frequency-range-input-row-height', 28);
    const valueFontSize = getCSSVariableAsNumber('knob-value-font-size', 18);
    const valuePaddingH = getCSSVariableAsNumber('knob-value-padding-horizontal', 8);
    const handleRadius = 10;

    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics?.elementMetrics) continue;

      const layout = spec.parameterLayout?.elements;
      if (!layout) continue;

      for (let i = 0; i < layout.length; i++) {
        const el = layout[i] as { type?: string; parameter?: string; bandIndex?: number; scale?: 'linear' | 'audio' };
        if (el?.type !== 'frequency-range' || el.parameter == null) continue;

        const bandIndex = el.bandIndex ?? 0;
        const key = `frequency-range-${i}-${bandIndex}`;
        const em = metrics.elementMetrics.get(key);
        if (!em || em.width == null || em.height == null) continue;

        const param = node.parameters[el.parameter];
        const bands = Array.isArray(param) ? param : (spec.parameters[el.parameter]?.default as number[][]) ?? [];
        const band = bands[bandIndex];
        const arr = Array.isArray(band) && band.length >= 2 ? band : [FREQ_MIN, FREQ_MAX];
        const minHz = Math.max(FREQ_MIN, Math.min(FREQ_MAX, Number(arr[0]) ?? FREQ_MIN));
        const maxHz = Math.max(FREQ_MIN, Math.min(FREQ_MAX, Number(arr[1]) ?? FREQ_MAX));
        const scale = el.scale ?? 'linear';
        const minNorm = Math.max(0, Math.min(1, hzToNorm(minHz, scale)));
        const maxNorm = Math.max(0, Math.min(1, hzToNorm(maxHz, scale)));
        const scaleBlockHeight = scale === 'audio' ? scaleHeightToken + gap : 0;

        const x = em.x;
        const y = em.y;
        const w = em.width;
        const contentWidth = w - pd * 2;
        const sliderX = x + pd;
        const sliderY = y + pd + labelHeight + gap + scaleBlockHeight;
        const rowY = sliderY + sliderHeight + gap;
        const rowLeft = x + pd;
        const rowRight = x + w - pd;

        if (canvasPos.y >= rowY && canvasPos.y <= rowY + inputRowHeight) {
          this.ctx.font = `${valueFontSize}px "JetBrains Mono", monospace`;
          const startW = this.ctx.measureText(minHz.toFixed(0)).width + valuePaddingH * 2;
          const endW = this.ctx.measureText(maxHz.toFixed(0)).width + valuePaddingH * 2;
          if (canvasPos.x >= rowLeft && canvasPos.x <= rowLeft + startW) {
            return { nodeId: node.id, paramName: el.parameter, frequencyBand: { bandIndex, field: 'start' }, scale };
          }
          if (canvasPos.x >= rowRight - endW && canvasPos.x <= rowRight) {
            return { nodeId: node.id, paramName: el.parameter, frequencyBand: { bandIndex, field: 'end' }, scale };
          }
        }

        if (canvasPos.y >= sliderY && canvasPos.y <= sliderY + sliderHeight && canvasPos.x >= sliderX && canvasPos.x <= sliderX + contentWidth) {
          const lowX = sliderX + minNorm * contentWidth;
          const highX = sliderX + maxNorm * contentWidth;
          const dLow = Math.abs(canvasPos.x - lowX);
          const dHigh = Math.abs(canvasPos.x - highX);
          if (dLow <= handleRadius && dLow <= dHigh) {
            return { nodeId: node.id, paramName: el.parameter, frequencyBand: { bandIndex, field: 'sliderLow' }, scale };
          }
          if (dHigh <= handleRadius && dHigh <= dLow) {
            return { nodeId: node.id, paramName: el.parameter, frequencyBand: { bandIndex, field: 'sliderHigh' }, scale };
          }
        }
      }
    }
    return null;
  }

  /**
   * Hit test for color picker (OKLCH swatch on node).
   * Returns nodeId if the point is over a color-picker element's swatch.
   */
  hitTestColorPicker(mouseX: number, mouseY: number): { nodeId: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec?.parameterLayout?.elements || !metrics?.elementMetrics) continue;
      const layout = spec.parameterLayout.elements;
      for (let i = 0; i < layout.length; i++) {
        const el = layout[i] as { type?: string };
        if (el?.type !== 'color-picker') continue;
        const key = `color-picker-${i}`;
        const em = metrics.elementMetrics.get(key);
        if (!em || em.x == null || em.y == null) continue;
        const swatch = em.colorPickerSwatchRect as { x: number; y: number; w: number; h: number } | undefined;
        if (!swatch) continue;
        if (canvasPos.x >= em.x + swatch.x && canvasPos.x <= em.x + swatch.x + swatch.w &&
            canvasPos.y >= em.y + swatch.y && canvasPos.y <= em.y + swatch.y + swatch.h) {
          return { nodeId: node.id };
        }
      }
    }
    return null;
  }

  /**
   * Hit test for parameters
   * Returns parameter information if mouse is over a parameter, null otherwise
   */
  /**
   * Hit test for audio-file-input-slot: upload button (filePath) or auto-play toggle (autoPlay).
   * Returns first hit in reverse node order (topmost first).
   */
  hitTestAudioFileInputSlot(mouseX: number, mouseY: number): {
    nodeId: string;
    paramName: string;
    isString: boolean;
  } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || spec.id !== 'audio-file-input' || !metrics?.elementMetrics) continue;
      const layout = spec.parameterLayout?.elements;
      if (!layout) continue;
      for (let ei = 0; ei < layout.length; ei++) {
        const el = layout[ei] as { type?: string };
        if (el?.type !== 'audio-file-input-slot') continue;
        const key = `audio-file-input-slot-${ei}`;
        const em = metrics.elementMetrics.get(key);
        if (!em) continue;
        const uploadRect = em.audioFileInputUploadButtonRect as { x: number; y: number; w: number; h: number } | undefined;
        const toggleRect = em.audioFileInputToggleRect as { x: number; y: number; w: number; h: number } | undefined;
        if (toggleRect && canvasPos.x >= toggleRect.x && canvasPos.x <= toggleRect.x + toggleRect.w &&
            canvasPos.y >= toggleRect.y && canvasPos.y <= toggleRect.y + toggleRect.h) {
          return { nodeId: node.id, paramName: 'autoPlay', isString: false };
        }
        if (uploadRect && canvasPos.x >= uploadRect.x && canvasPos.x <= uploadRect.x + uploadRect.w &&
            canvasPos.y >= uploadRect.y && canvasPos.y <= uploadRect.y + uploadRect.h) {
          return { nodeId: node.id, paramName: 'filePath', isString: true };
        }
      }
    }
    return null;
  }

  hitTestParameter(mouseX: number, mouseY: number): {
    nodeId: string;
    paramName: string;
    isString?: boolean;
    isArray?: boolean;
    isModeButton?: boolean;
    frequencyBand?: { bandIndex: number; field: 'start' | 'end' | 'sliderLow' | 'sliderHigh' };
    scale?: 'linear' | 'audio';
  } | null {
    const audioFileInputHit = this.hitTestAudioFileInputSlot(mouseX, mouseY);
    if (audioFileInputHit) {
      return {
        nodeId: audioFileInputHit.nodeId,
        paramName: audioFileInputHit.paramName,
        isString: audioFileInputHit.isString
      };
    }
    const freqRangeHit = this.hitTestFrequencyRange(mouseX, mouseY);
    if (freqRangeHit) {
      return {
        nodeId: freqRangeHit.nodeId,
        paramName: freqRangeHit.paramName,
        isString: false,
        frequencyBand: freqRangeHit.frequencyBand,
        scale: freqRangeHit.scale
      };
    }
    const analyzerBandRemapHit = this.hitTestAnalyzerBandRemap(mouseX, mouseY);
    if (analyzerBandRemapHit) {
      return { nodeId: analyzerBandRemapHit.nodeId, paramName: analyzerBandRemapHit.paramName, isString: false };
    }
    const rangeSliderHit = this.hitTestRangeEditorSlider(mouseX, mouseY);
    if (rangeSliderHit) {
      return { nodeId: rangeSliderHit.nodeId, paramName: rangeSliderHit.paramName, isString: false };
    }

    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    // Iterate nodes in reverse order (front to back) so we hit the topmost node first
    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      const hasPort = (paramName: string) =>
        !spec.parameterLayout?.parametersWithoutPorts?.includes(paramName);

      for (const [paramName, gridPos] of metrics.parameterGridPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec) continue;

        // Test mode button first (same position as render: portX, knobY) so it's clickable
        // before the larger knob hit region. Only for float params that have a port.
        // gridPos is in canvas space (slot offset applied in ParameterLayoutManager).
        if (paramSpec.type === 'float' && hasPort(paramName)) {
          const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 20);
          const modeButtonRadius = modeButtonSize / 2;
          const r2 = modeButtonRadius * modeButtonRadius;
          const dx = canvasPos.x - gridPos.portX;
          const dy = canvasPos.y - gridPos.knobY;
          if (dx * dx + dy * dy <= r2) {
            return { nodeId: node.id, paramName, isString: false, isModeButton: true };
          }
        }

        // Parameter and remap hit regions are derived from the same token/size inputs as
        // rendering (see value-box, parameter-cell, port, remap layout in ParameterHitRegions).
        const regions = getParameterControlHitRegions(
          spec,
          paramName,
          gridPos as ParameterGridPosition
        );
        if (regions != null && isPointInParameterRegions(canvasPos.x, canvasPos.y, regions)) {
          return { nodeId: node.id, paramName, isString: false };
        }

        // String and array params use full cell hit (no control regions from registry)
        if (paramSpec.type === 'string') {
          if (
            canvasPos.x >= gridPos.cellX &&
            canvasPos.x <= gridPos.cellX + gridPos.cellWidth &&
            canvasPos.y >= gridPos.cellY &&
            canvasPos.y <= gridPos.cellY + gridPos.cellHeight
          ) {
            return { nodeId: node.id, paramName, isString: true };
          }
        } else if (paramSpec.type === 'array') {
          if (
            canvasPos.x >= gridPos.cellX &&
            canvasPos.x <= gridPos.cellX + gridPos.cellWidth &&
            canvasPos.y >= gridPos.cellY &&
            canvasPos.y <= gridPos.cellY + gridPos.cellHeight
          ) {
            return { nodeId: node.id, paramName, isArray: true };
          }
        }
      }
    }

    return null;
  }

  /**
   * Hit test for bezier control points
   * Returns node ID and control index if mouse is over a control point, null otherwise
   */
  hitTestBezierControlPoint(mouseX: number, mouseY: number): { nodeId: string, controlIndex: number } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      // Check if this is a bezier curve node
      const isBezierNode = spec.id === 'bezier-curve' || (
        spec.parameters.x1 !== undefined &&
        spec.parameters.y1 !== undefined &&
        spec.parameters.x2 !== undefined &&
        spec.parameters.y2 !== undefined
      );
      
      if (!isBezierNode) continue;
      
      // Get bezier editor position from metrics (use x1 parameter position as reference)
      const x1Pos = metrics.parameterGridPositions.get('x1');
      if (!x1Pos) continue;
      
      const bezierEditorX = x1Pos.cellX;
      const bezierEditorY = x1Pos.cellY;
      const bezierEditorWidth = x1Pos.cellWidth;
      const bezierEditorHeight = x1Pos.cellHeight;
      const bezierEditorPadding = getCSSVariableAsNumber('bezier-editor-padding', 12);
      const controlPointSize = getCSSVariableAsNumber('bezier-editor-control-point-size', 8);
      const controlPointHoverSize = getCSSVariableAsNumber('bezier-editor-control-point-hover-size', 12);
      const hitRadius = Math.max(controlPointSize, controlPointHoverSize) / 2 + 4; // Add padding for easier clicking
      
      // Calculate drawing area
      const drawX = bezierEditorX + bezierEditorPadding;
      const drawY = bezierEditorY + bezierEditorPadding;
      const drawWidth = bezierEditorWidth - bezierEditorPadding * 2;
      const drawHeight = bezierEditorHeight - bezierEditorPadding * 2;
      
      // Get parameter values
      const x1 = (node.parameters.x1 ?? spec.parameters.x1?.default ?? 0) as number;
      const y1 = (node.parameters.y1 ?? spec.parameters.y1?.default ?? 0) as number;
      const x2 = (node.parameters.x2 ?? spec.parameters.x2?.default ?? 1) as number;
      const y2 = (node.parameters.y2 ?? spec.parameters.y2?.default ?? 1) as number;
      
      // Convert to screen coordinates (flip Y for screen space)
      const cp1X = drawX + x1 * drawWidth;
      const cp1Y = drawY + (1 - y1) * drawHeight;
      const cp2X = drawX + x2 * drawWidth;
      const cp2Y = drawY + (1 - y2) * drawHeight;
      
      // Check if mouse is near control point 1 (x1, y1)
      const dx1 = canvasPos.x - cp1X;
      const dy1 = canvasPos.y - cp1Y;
      const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
      if (dist1 <= hitRadius) {
        return { nodeId: node.id, controlIndex: 0 };
      }
      
      // Check if mouse is near control point 2 (x2, y2)
      const dx2 = canvasPos.x - cp2X;
      const dy2 = canvasPos.y - cp2Y;
      const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      if (dist2 <= hitRadius) {
        return { nodeId: node.id, controlIndex: 1 };
      }
    }
    
    return null;
  }

  /**
   * Hit test for header labels
   * Returns node ID if mouse is over a header label, null otherwise
   */
  hitTestHeaderLabel(mouseX: number, mouseY: number): { nodeId: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      // Get header dimensions and label position
      const headerHeight = metrics.headerHeight;
      const iconBoxHeight = getCSSVariableAsNumber('node-icon-box-height', 48);
      const iconBoxNameSpacing = getCSSVariableAsNumber('node-icon-box-name-spacing', 4);
      const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
      const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
      
      // Calculate label position (same as in renderHeader)
      const groupHeight = iconBoxHeight + iconBoxNameSpacing + nameSize;
      const iconBoxY = node.position.y + (headerHeight - groupHeight) / 2;
      const nameY = iconBoxY + iconBoxHeight + iconBoxNameSpacing;
      const iconX = node.position.x + metrics.width / 2;
      
      // Measure text to get label bounds
      this.ctx.font = `${nameWeight} ${nameSize}px "Space Grotesk", sans-serif`;
      const labelText = node.label || spec.displayName;
      const textMetrics = this.ctx.measureText(labelText);
      const textWidth = textMetrics.width;
      const textHeight = nameSize;
      
      // Create hit area around the label (with some padding for easier clicking)
      const padding = 4;
      const labelLeft = iconX - textWidth / 2 - padding;
      const labelRight = iconX + textWidth / 2 + padding;
      const labelTop = nameY - padding;
      const labelBottom = nameY + textHeight + padding;
      
      // Check if click is within label bounds
      if (
        canvasPos.x >= labelLeft &&
        canvasPos.x <= labelRight &&
        canvasPos.y >= labelTop &&
        canvasPos.y <= labelBottom
      ) {
        return { nodeId: node.id };
      }
    }
    
    return null;
  }

  /**
   * Hit test for parameter mode selectors
   * Returns node ID and parameter name if mouse is over a mode selector, null otherwise.
   * Uses same dual coordinate system (absolute + node-local) as hitTestParameter mode button test.
   */
  hitTestParameterMode(mouseX: number, mouseY: number): { nodeId: string, paramName: string } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    const hasPort = (spec: NodeSpec, paramName: string) =>
      !spec.parameterLayout?.parametersWithoutPorts?.includes(paramName);

    for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
      const node = this.graph.nodes[i];
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;

      for (const [paramName, gridPos] of metrics.parameterGridPositions.entries()) {
        const paramSpec = spec.parameters[paramName];
        if (!paramSpec || paramSpec.type !== 'float' || !hasPort(spec, paramName)) continue;

        const modeButtonSize = getCSSVariableAsNumber('param-mode-button-size', 20);
        const modeButtonRadius = modeButtonSize / 2;
        const r2 = modeButtonRadius * modeButtonRadius;
        const inCircle = (cx: number, cy: number) => {
          const dx = canvasPos.x - cx;
          const dy = canvasPos.y - cy;
          return dx * dx + dy * dy <= r2;
        };
        if (inCircle(gridPos.portX, gridPos.knobY)) {
          return { nodeId: node.id, paramName };
        }
      }
    }
    
    return null;
  }

  /**
   * Hit test for type labels on ports
   * Returns type information if click is on a type badge
   */
  hitTestTypeLabel(mouseX: number, mouseY: number): { 
    nodeId: string; 
    portName: string; 
    portType: string; 
    isOutput: boolean;
    screenX: number;
    screenY: number;
    typeLabelBounds?: {
      left: number;
      top: number;
      right: number;
      bottom: number;
      width: number;
      height: number;
    };
  } | null {
    const canvasPos = this.screenToCanvas(mouseX, mouseY);
    
    // Get type label dimensions from CSS tokens
    const typeFontSize = getCSSVariableAsNumber('port-type-font-size', 15);
    const typeFontWeight = getCSSVariableAsNumber('port-type-font-weight', 600);
    const typePaddingH = getCSSVariableAsNumber('port-type-padding-horizontal', 8);
    const typePaddingV = getCSSVariableAsNumber('port-type-padding-vertical', 4);
    const portRadius = getCSSVariableAsNumber('port-radius', 12);
    const labelSpacing = getCSSVariableAsNumber('port-label-spacing', 12);
    
    // Set font for text measurement
    this.ctx.font = `${typeFontWeight} ${typeFontSize}px "Space Grotesk", sans-serif`;
    
    for (const node of this.graph.nodes) {
      const spec = this.nodeSpecs.get(node.type);
      const metrics = this.nodeMetrics.get(node.id);
      if (!spec || !metrics) continue;
      
      // Check input ports
      for (const port of spec.inputs) {
        const pos = metrics.portPositions.get(`input:${port.name}`);
        if (!pos) continue;
        
        // Calculate type label position (same as in NodePortRenderer)
        const typeStartX = pos.x + portRadius + labelSpacing;
        const typeWidth = this.ctx.measureText(getPortTypeDisplayLabel(port.type)).width;
        const typeBgWidth = typeWidth + typePaddingH * 2;
        const typeBgHeight = typeFontSize + typePaddingV * 2;
        const typeBgX = typeStartX;
        const typeBgY = pos.y - typeBgHeight / 2;
        
        // Check if click is within type badge bounds
        if (
          canvasPos.x >= typeBgX &&
          canvasPos.x <= typeBgX + typeBgWidth &&
          canvasPos.y >= typeBgY &&
          canvasPos.y <= typeBgY + typeBgHeight
        ) {
          // Convert to screen coordinates for callout positioning
          const rect = this.canvas.getBoundingClientRect();
          const screenPos = this.viewStateManager.canvasToScreen(typeBgX + typeBgWidth / 2, pos.y, rect);
          const screenX = screenPos.x;
          const screenY = screenPos.y;
          
          // Calculate type label bounds in screen coordinates
          const typeLabelTopLeft = this.viewStateManager.canvasToScreen(typeBgX, typeBgY, rect);
          const typeLabelBottomRight = this.viewStateManager.canvasToScreen(typeBgX + typeBgWidth, typeBgY + typeBgHeight, rect);
          const typeLabelBounds = {
            left: typeLabelTopLeft.x,
            top: typeLabelTopLeft.y,
            right: typeLabelBottomRight.x,
            bottom: typeLabelBottomRight.y,
            width: typeLabelBottomRight.x - typeLabelTopLeft.x,
            height: typeLabelBottomRight.y - typeLabelTopLeft.y
          };
          
          console.log('[HitTestManager] Type label hit detected:', {
            portType: port.type,
            portName: port.name,
            nodeId: node.id,
            canvasPos,
            typeBgBounds: { x: typeBgX, y: typeBgY, width: typeBgWidth, height: typeBgHeight },
            screenPos: { x: screenX, y: screenY },
            typeLabelBounds
          });
          
          return {
            nodeId: node.id,
            portName: port.name,
            portType: port.type,
            isOutput: false,
            screenX,
            screenY,
            typeLabelBounds
          };
        }
      }
      
      // Check output ports
      for (const port of spec.outputs) {
        const pos = metrics.portPositions.get(`output:${port.name}`);
        if (!pos) continue;
        
        // Calculate type label position (output ports have type on the left side)
        const typeEndX = pos.x - portRadius - labelSpacing;
        const typeWidth = this.ctx.measureText(getPortTypeDisplayLabel(port.type)).width;
        const typeBgWidth = typeWidth + typePaddingH * 2;
        const typeBgHeight = typeFontSize + typePaddingV * 2;
        const typeBgX = typeEndX - typeBgWidth;
        const typeBgY = pos.y - typeBgHeight / 2;
        
        // Check if click is within type badge bounds
        if (
          canvasPos.x >= typeBgX &&
          canvasPos.x <= typeBgX + typeBgWidth &&
          canvasPos.y >= typeBgY &&
          canvasPos.y <= typeBgY + typeBgHeight
        ) {
          // Convert to screen coordinates for callout positioning
          const rect = this.canvas.getBoundingClientRect();
          const screenPos = this.viewStateManager.canvasToScreen(typeBgX + typeBgWidth / 2, pos.y, rect);
          const screenX = screenPos.x;
          const screenY = screenPos.y;
          
          // Calculate type label bounds in screen coordinates
          const typeLabelTopLeft = this.viewStateManager.canvasToScreen(typeBgX, typeBgY, rect);
          const typeLabelBottomRight = this.viewStateManager.canvasToScreen(typeBgX + typeBgWidth, typeBgY + typeBgHeight, rect);
          const typeLabelBounds = {
            left: typeLabelTopLeft.x,
            top: typeLabelTopLeft.y,
            right: typeLabelBottomRight.x,
            bottom: typeLabelBottomRight.y,
            width: typeLabelBottomRight.x - typeLabelTopLeft.x,
            height: typeLabelBottomRight.y - typeLabelTopLeft.y
          };
          
          console.log('[HitTestManager] Type label hit detected (output):', {
            portType: port.type,
            portName: port.name,
            nodeId: node.id,
            canvasPos,
            typeBgBounds: { x: typeBgX, y: typeBgY, width: typeBgWidth, height: typeBgHeight },
            screenPos: { x: screenX, y: screenY },
            typeLabelBounds
          });
          
          return {
            nodeId: node.id,
            portName: port.name,
            portType: port.type,
            isOutput: true,
            screenX,
            screenY,
            typeLabelBounds
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Check if a point is near a bezier curve
   * Helper method for connection hit testing
   */
  private isPointNearBezier(
    px: number, py: number,
    x0: number, y0: number,
    x3: number, y3: number,
    threshold: number
  ): boolean {
    // Bezier control points (strong horizontal movement: 100px offset)
    const cp1X = x0 + 100;
    const cp1Y = y0;
    const cp2X = x3 - 100;
    const cp2Y = y3;
    
    // Calculate curve length to determine appropriate number of samples
    // Use more samples for longer curves to ensure good coverage
    const dx = x3 - x0;
    const dy = y3 - y0;
    const curveLength = Math.sqrt(dx * dx + dy * dy);
    // At least 50 samples, more for longer curves (roughly 1 sample per 10 pixels)
    const samples = Math.max(50, Math.ceil(curveLength / 10));
    
    let minDistance = Infinity;
    
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const point = this.bezierPoint(x0, y0, cp1X, cp1Y, cp2X, cp2Y, x3, y3, t);
      
      const dx = px - point.x;
      const dy = py - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      minDistance = Math.min(minDistance, distance);
    }
    
    return minDistance < threshold;
  }

  /**
   * Calculate a point on a bezier curve
   * Helper method for bezier curve calculations
   */
  private bezierPoint(
    x0: number, y0: number,
    x1: number, y1: number,
    x2: number, y2: number,
    x3: number, y3: number,
    t: number
  ): { x: number, y: number } {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    
    return {
      x: uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3,
      y: uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3
    };
  }
}
