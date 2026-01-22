// Parameter Control Component
// Draggable numeric input for node parameters

import type { ParameterSpec } from '../../types/nodeSpec';

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
    this.container.style.cssText = `
      display: flex;
      align-items: center;
      padding: 4px 8px;
      gap: 8px;
    `;
    
    // Label
    this.label = document.createElement('div');
    this.label.textContent = this.spec.label || 'Parameter';
    this.label.style.cssText = `
      font-size: 12px;
      color: #999;
      min-width: 80px;
    `;
    this.container.appendChild(this.label);
    
    // Drag area
    this.dragArea = document.createElement('div');
    this.dragArea.style.cssText = `
      flex: 1;
      height: 24px;
      background: #F5F5F5;
      border: 1px solid #CCCCCC;
      border-radius: 4px;
      cursor: ns-resize;
      position: relative;
    `;
    this.container.appendChild(this.dragArea);
    
    // Value display
    this.valueDisplay = document.createElement('div');
    this.valueDisplay.style.cssText = `
      min-width: 60px;
      text-align: right;
      font-size: 12px;
      font-family: monospace;
      color: #333;
      padding: 0 8px;
    `;
    this.updateValueDisplay();
    this.container.appendChild(this.valueDisplay);
  }
  
  private setupEventListeners(): void {
    this.dragArea.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartY = e.clientY;
      this.dragStartValue = this.value;
      this.dragArea.style.borderColor = '#2196F3';
      this.dragArea.style.cursor = 'grabbing';
      
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
    this.dragArea.style.borderColor = '#CCCCCC';
    this.dragArea.style.cursor = 'ns-resize';
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
    input.style.cssText = `
      position: absolute;
      width: 60px;
      padding: 2px 4px;
      font-size: 12px;
      font-family: monospace;
      border: 1px solid #2196F3;
      border-radius: 2px;
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
