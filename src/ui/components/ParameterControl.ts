// Parameter Control Component
// Draggable numeric input for node parameters

import type { ParameterSpec } from '../../types/nodeSpec';
import { getCSSColor, getCSSVariable, getCSSVariableAsNumber } from '../../utils/cssTokens';

export interface ParameterControlCallbacks {
  onValueChange?: (value: number) => void;
}

export class ParameterControl {
  private container: HTMLElement;
  private label!: HTMLElement;
  private valueDisplay!: HTMLElement;
  private dragArea!: HTMLElement;
  private spec: ParameterSpec;
  private value: number;
  private callbacks: ParameterControlCallbacks;
  
  private isDragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartValue: number = 0;
  
  constructor(
    container: HTMLElement,
    spec: ParameterSpec,
    initialValue: number,
    callbacks: ParameterControlCallbacks = {}
  ) {
    this.container = container;
    this.spec = spec;
    this.value = initialValue;
    this.callbacks = callbacks;
    
    this.createUI();
    this.setupEventListeners();
  }
  
  private createUI(): void {
    // Container
    this.container.className = 'param-control';
    
    // Label
    this.label = document.createElement('div');
    this.label.textContent = this.spec.label || 'Parameter';
    this.label.className = 'param-control-label';
    this.container.appendChild(this.label);
    
    // Drag area
    this.dragArea = document.createElement('div');
    this.dragArea.className = 'param-control-drag-area';
    this.container.appendChild(this.dragArea);
    
    // Value display
    this.valueDisplay = document.createElement('div');
    this.valueDisplay.className = 'param-control-value';
    this.updateValueDisplay();
    this.container.appendChild(this.valueDisplay);
  }
  
  private setupEventListeners(): void {
    this.dragArea.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartValue = this.value;
      this.dragArea.classList.add('is-dragging');
      
      document.addEventListener('mousemove', this.handleDrag);
      document.addEventListener('mouseup', this.handleDragEnd);
      e.preventDefault();
    });
    
    // Double-click to edit
    this.valueDisplay.addEventListener('dblclick', () => {
      this.showTextInput();
    });
  }
  
  private handleDrag = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    
    const deltaY = this.dragStartY - e.clientY; // Inverted: up = increase
    const modifier = e.shiftKey ? 'fine' : (e.ctrlKey || e.metaKey ? 'coarse' : 'normal');
    
    const newValue = this.calculateDragValue(this.dragStartValue, deltaY, modifier);
    this.setValue(newValue);
  };
  
  private handleDragEnd = (): void => {
    this.isDragging = false;
    this.dragArea.classList.remove('is-dragging');
    document.removeEventListener('mousemove', this.handleDrag);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };
  
  private calculateDragValue(
    startValue: number,
    pixelDeltaY: number,
    modifier: 'normal' | 'fine' | 'coarse'
  ): number {
    const min = this.spec.min ?? 0;
    const max = this.spec.max ?? 1;
    const range = max - min;
    
    const baseSensitivity = 100; // pixels per full range
    const multipliers = {
      'normal': 1.0,
      'fine': 0.1,
      'coarse': 10.0
    };
    
    const sensitivity = baseSensitivity / multipliers[modifier];
    const valueDelta = (-pixelDeltaY / sensitivity) * range;
    const newValue = startValue + valueDelta;
    
    // Clamp to range
    return Math.max(min, Math.min(max, newValue));
  }
  
  private showTextInput(): void {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.value.toString();
    
    const inputBg = getCSSColor('param-input-bg', '#FFFFFF');
    const inputBorder = getCSSVariable('param-input-border', '2px solid #2196F3');
    const inputColor = getCSSColor('param-input-color', '#333333');
    const inputRadius = getCSSVariable('input-radius', '2px');
    const textSm = getCSSVariable('text-sm', '0.85rem');
    const spacingXs = getCSSVariable('spacing-xs', '0.25rem');
    
    input.style.cssText = `
      position: absolute;
      width: 60px;
      padding: ${spacingXs} ${getCSSVariable('spacing-sm', '0.5rem')};
      font-size: ${textSm};
      font-family: monospace;
      border: ${inputBorder};
      border-radius: ${inputRadius};
      background: ${inputBg};
      color: ${inputColor};
    `;
    
    const rect = this.valueDisplay.getBoundingClientRect();
    input.style.left = `${rect.left}px`;
    input.style.top = `${rect.top}px`;
    document.body.appendChild(input);
    input.focus();
    input.select();
    
    const finish = () => {
      const textValue = parseFloat(input.value);
      if (!isNaN(textValue)) {
        const min = this.spec.min ?? -Infinity;
        const max = this.spec.max ?? Infinity;
        this.setValue(Math.max(min, Math.min(max, textValue)));
      }
      document.body.removeChild(input);
    };
    
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        finish();
      } else if (e.key === 'Escape') {
        document.body.removeChild(input);
      }
    });
  }
  
  private updateValueDisplay(): void {
    if (this.spec.type === 'int') {
      this.valueDisplay.textContent = Math.round(this.value).toString();
    } else {
      this.valueDisplay.textContent = this.value.toFixed(3);
    }
  }
  
  setValue(value: number): void {
    const min = this.spec.min ?? -Infinity;
    const max = this.spec.max ?? Infinity;
    this.value = Math.max(min, Math.min(max, value));
    this.updateValueDisplay();
    this.callbacks.onValueChange?.(this.value);
  }
  
  getValue(): number {
    return this.value;
  }
  
  destroy(): void {
    // Cleanup if needed
  }
}
