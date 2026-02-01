/**
 * Header Flexbox Layout
 * 
 * Calculates header layout using flexbox model. Header is a flexbox row
 * containing: inputs (left) | logo (center) | outputs (right)
 */

import type { NodeInstance } from '../../../types/nodeGraph';
import type { NodeSpec } from '../../../types/nodeSpec';
import { FlexboxLayoutEngine } from './layout/flexbox/FlexboxLayoutEngine';
import type { FlexboxProperties, FlexItem, FlexboxLayoutResult, LayoutResult } from './layout/flexbox/FlexboxTypes';
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';

export interface HeaderLayout {
  container: LayoutResult;
  inputs: LayoutResult;
  logo: LayoutResult;
  outputs: LayoutResult;
  portPositions: Map<string, { x: number; y: number; isOutput: boolean }>;
}

export interface LogoLayout {
  container: LayoutResult;
  iconBox: LayoutResult;
  label: LayoutResult;
}

export class HeaderFlexboxLayout {
  private flexboxEngine: FlexboxLayoutEngine;
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.flexboxEngine = new FlexboxLayoutEngine();
    this.ctx = ctx;
  }

  /**
   * Calculate header layout using flexbox
   */
  calculateLayout(
    nodeX: number,
    nodeY: number,
    nodeWidth: number,
    spec: NodeSpec,
    node: NodeInstance
  ): HeaderLayout {
    const headerProps = this.getHeaderFlexboxProperties();
    const headerPadding = getCSSVariableAsNumber('node-header-padding', 24);
    
    // First, calculate nested container dimensions to determine header height
    // Calculate inputs container layout (to get height)
    let inputsLayout: FlexboxLayoutResult | undefined;
    let inputsWidth = 0;
    let inputsHeight = 0;
    
    if (spec.inputs.length > 0) {
      inputsWidth = this.calculateInputsWidth(spec);
      const inputsProps = this.getInputsFlexboxProperties();
      const inputPortItems = this.createInputPortItems(spec);
      inputsLayout = this.flexboxEngine.calculateLayout(
        0, // Temporary position
        0,
        inputsWidth,
        undefined, // content-based height
        inputsProps,
        inputPortItems
      );
      inputsHeight = inputsLayout.container.height;
    }
    
    // Calculate logo container layout (to get height)
    const logoWidth = this.calculateLogoWidth(spec, node);
    const logoProps = this.getLogoFlexboxProperties();
    const logoItems = this.createLogoItems(spec, node);
    const logoLayout = this.flexboxEngine.calculateLayout(
      0, // Temporary position
      0,
      logoWidth,
      undefined, // content-based height
      logoProps,
      logoItems
    );
    const logoHeight = logoLayout.container.height;
    
    // Calculate outputs container layout (to get height)
    let outputsLayout: FlexboxLayoutResult | undefined;
    let outputsWidth = 0;
    let outputsHeight = 0;
    
    if (spec.outputs.length > 0) {
      outputsWidth = this.calculateOutputsWidth(spec);
      const outputsProps = this.getOutputsFlexboxProperties();
      const outputPortItems = this.createOutputPortItems(spec);
      outputsLayout = this.flexboxEngine.calculateLayout(
        0, // Temporary position
        0,
        outputsWidth,
        undefined, // content-based height
        outputsProps,
        outputPortItems
      );
      outputsHeight = outputsLayout.container.height;
    }
    
    // Header height is max of all nested containers + padding
    const maxNestedHeight = Math.max(inputsHeight, logoHeight, outputsHeight);
    const headerMinHeight = getCSSVariableAsNumber('node-header-min-height', 140);
    const headerHeight = Math.max(headerMinHeight, maxNestedHeight + headerPadding * 2);
    
    // Now calculate header row layout with known dimensions
    const headerItems: FlexItem[] = [];
    
    if (spec.inputs.length > 0) {
      headerItems.push({
        id: 'inputs',
        properties: {
          width: inputsWidth,
          height: headerHeight - headerPadding * 2
        }
      });
    }
    
    headerItems.push({
      id: 'logo',
      properties: {
        width: logoWidth,
        height: headerHeight - headerPadding * 2
      }
    });
    
    if (spec.outputs.length > 0) {
      headerItems.push({
        id: 'outputs',
        properties: {
          width: outputsWidth,
          height: headerHeight - headerPadding * 2
        }
      });
    }
    
    // Calculate header row layout
    const headerRowLayout = this.flexboxEngine.calculateLayout(
      nodeX + headerPadding,
      nodeY + headerPadding,
      nodeWidth - headerPadding * 2,
      headerHeight - headerPadding * 2,
      headerProps,
      headerItems
    );
    
    // Now recalculate nested layouts with actual positions
    const inputsResult = headerRowLayout.items.get('inputs') as LayoutResult | undefined;
    const logoResult = headerRowLayout.items.get('logo') as LayoutResult | undefined;
    const outputsResult = headerRowLayout.items.get('outputs') as LayoutResult | undefined;
    
    // Recalculate inputs with actual position
    if (inputsResult && spec.inputs.length > 0) {
      const inputsProps = this.getInputsFlexboxProperties();
      const inputPortItems = this.createInputPortItems(spec);
      inputsLayout = this.flexboxEngine.calculateLayout(
        inputsResult.x,
        inputsResult.y,
        inputsResult.width,
        inputsResult.height,
        inputsProps,
        inputPortItems
      );
    }
    
    // Recalculate logo with actual position
    let finalLogoLayout: FlexboxLayoutResult;
    if (logoResult) {
      const logoProps = this.getLogoFlexboxProperties();
      const logoItems = this.createLogoItems(spec, node);
      finalLogoLayout = this.flexboxEngine.calculateLayout(
        logoResult.x,
        logoResult.y,
        logoResult.width,
        logoResult.height,
        logoProps,
        logoItems
      );
    } else {
      finalLogoLayout = logoLayout;
    }
    
    // Recalculate outputs with actual position
    if (outputsResult && spec.outputs.length > 0) {
      const outputsProps = this.getOutputsFlexboxProperties();
      const outputPortItems = this.createOutputPortItems(spec);
      outputsLayout = this.flexboxEngine.calculateLayout(
        outputsResult.x,
        outputsResult.y,
        outputsResult.width,
        outputsResult.height,
        outputsProps,
        outputPortItems
      );
    }
    
    // Extract port positions from nested layouts
    const nestedLayouts = new Map<string, FlexboxLayoutResult>();
    if (inputsLayout) nestedLayouts.set('inputs', inputsLayout);
    nestedLayouts.set('logo', finalLogoLayout);
    if (outputsLayout) nestedLayouts.set('outputs', outputsLayout);
    
    const portPositions = this.extractPortPositions(
      {
        container: {
          x: nodeX,
          y: nodeY,
          width: nodeWidth,
          height: headerHeight
        },
        items: nestedLayouts
      },
      spec
    );
    
    return {
      container: {
        x: nodeX,
        y: nodeY,
        width: nodeWidth,
        height: headerHeight
      },
      inputs: inputsLayout?.container || { x: nodeX, y: nodeY, width: 0, height: 0 },
      logo: finalLogoLayout.container,
      outputs: outputsLayout?.container || { x: nodeX, y: nodeY, width: 0, height: 0 },
      portPositions
    };
  }
  
  /**
   * Get flexbox properties for header container from CSS tokens
   */
  private getHeaderFlexboxProperties(): FlexboxProperties {
    return FlexboxLayoutEngine.getFlexboxPropertiesFromTokens('node-header', {
      direction: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12
    });
  }
  
  /**
   * Calculate width needed for inputs container
   */
  private calculateInputsWidth(_spec: NodeSpec): number {
    const portSize = getCSSVariableAsNumber('node-port-size', 12);
    // Inputs container just needs to fit ports (they're stacked vertically)
    return portSize;
  }
  
  /**
   * Calculate width needed for outputs container
   */
  private calculateOutputsWidth(_spec: NodeSpec): number {
    const portSize = getCSSVariableAsNumber('node-port-size', 12);
    // Outputs container just needs to fit ports (they're stacked vertically)
    return portSize;
  }
  
  /**
   * Calculate width needed for logo container
   */
  private calculateLogoWidth(spec: NodeSpec, node: NodeInstance): number {
    const iconBoxWidth = getCSSVariableAsNumber('node-icon-box-width', 90);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
    
    // Measure text width
    this.ctx.font = `${nameWeight} ${nameSize}px "Space Grotesk", sans-serif`;
    const textWidth = this.ctx.measureText(node.label || spec.displayName).width;
    
    // Logo width is max of iconBox width and text width
    return Math.max(iconBoxWidth, textWidth);
  }
  
  /**
   * Get flexbox properties for inputs container
   */
  private getInputsFlexboxProperties(): FlexboxProperties {
    return FlexboxLayoutEngine.getFlexboxPropertiesFromTokens('node-header-inputs', {
      direction: 'column',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      gap: getCSSVariableAsNumber('node-header-inputs-gap', 28)
    });
  }
  
  /**
   * Create flex items for input ports
   */
  private createInputPortItems(spec: NodeSpec): FlexItem[] {
    const portSize = getCSSVariableAsNumber('node-port-size', 12);
    
    return spec.inputs.map((port, index) => ({
      id: `input:${port.name}`,
      properties: {
        width: portSize,
        height: portSize,
        order: index
      }
    }));
  }
  
  /**
   * Get flexbox properties for logo container
   */
  private getLogoFlexboxProperties(): FlexboxProperties {
    return FlexboxLayoutEngine.getFlexboxPropertiesFromTokens('node-header-logo', {
      direction: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      gap: getCSSVariableAsNumber('node-header-logo-gap', 4)
    });
  }
  
  /**
   * Create flex items for logo (iconBox + label)
   */
  private createLogoItems(spec: NodeSpec, node: NodeInstance): FlexItem[] {
    const iconBoxWidth = getCSSVariableAsNumber('node-icon-box-width', 90);
    const iconBoxHeight = getCSSVariableAsNumber('node-icon-box-height', 90);
    const nameSize = getCSSVariableAsNumber('node-header-name-size', 30);
    const nameWeight = getCSSVariableAsNumber('node-header-name-weight', 600);
    
    // Measure text width
    this.ctx.font = `${nameWeight} ${nameSize}px "Space Grotesk", sans-serif`;
    const textWidth = this.ctx.measureText(node.label || spec.displayName).width;
    
    return [
      {
        id: 'iconBox',
        properties: {
          width: iconBoxWidth,
          height: iconBoxHeight
        }
      },
      {
        id: 'label',
        properties: {
          height: nameSize,
          width: textWidth
        }
      }
    ];
  }
  
  /**
   * Get flexbox properties for outputs container
   */
  private getOutputsFlexboxProperties(): FlexboxProperties {
    return FlexboxLayoutEngine.getFlexboxPropertiesFromTokens('node-header-outputs', {
      direction: 'column',
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      gap: getCSSVariableAsNumber('node-header-outputs-gap', 28)
    });
  }
  
  /**
   * Create flex items for output ports
   */
  private createOutputPortItems(spec: NodeSpec): FlexItem[] {
    const portSize = getCSSVariableAsNumber('node-port-size', 12);
    
    return spec.outputs.map((port, index) => ({
      id: `output:${port.name}`,
      properties: {
        width: portSize,
        height: portSize,
        order: index
      }
    }));
  }
  
  /**
   * Extract port positions from nested flexbox layouts
   */
  private extractPortPositions(
    headerLayout: FlexboxLayoutResult,
    spec: NodeSpec
  ): Map<string, { x: number; y: number; isOutput: boolean }> {
    const portPositions = new Map<string, { x: number; y: number; isOutput: boolean }>();
    
    // Extract input port positions
    const inputsLayout = headerLayout.items.get('inputs') as FlexboxLayoutResult | undefined;
    if (inputsLayout && inputsLayout.items) {
      spec.inputs.forEach((port) => {
        const portLayout = inputsLayout.items.get(`input:${port.name}`) as LayoutResult | undefined;
        if (portLayout) {
          portPositions.set(`input:${port.name}`, {
            x: portLayout.x, // Left edge
            y: portLayout.y + portLayout.height / 2, // Center vertically
            isOutput: false
          });
        }
      });
    }
    
    // Extract output port positions
    const outputsLayout = headerLayout.items.get('outputs') as FlexboxLayoutResult | undefined;
    if (outputsLayout && outputsLayout.items) {
      spec.outputs.forEach((port) => {
        const portLayout = outputsLayout.items.get(`output:${port.name}`) as LayoutResult | undefined;
        if (portLayout) {
          portPositions.set(`output:${port.name}`, {
            x: portLayout.x + portLayout.width, // Right edge
            y: portLayout.y + portLayout.height / 2, // Center vertically
            isOutput: true
          });
        }
      });
    }
    
    return portPositions;
  }
}
