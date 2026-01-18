import type { VisualElement, ParameterConfig } from '../../types';

export class ParameterPanel {
  private container: HTMLElement;
  private onParameterChange: (elementId: string, paramName: string, value: number) => void;
  // Removed unused onToggle - visibility is handled by onVisibilityToggle
  private onVisibilityToggle: (elementId: string, hidden: boolean) => void;
  private elements: VisualElement[] = [];
  private activeElements: Set<string> = new Set();
  private hiddenElements: Set<string> = new Set();
  private elementOrder: string[] = [];
  private parameterValues: Map<string, number> = new Map();
  private collapsedGroups: Set<string> = new Set();
  private collapsedCategories: Set<string> = new Set();
  
  constructor(
    container: HTMLElement,
    onParameterChange: (elementId: string, paramName: string, value: number) => void,
    _onToggle: (elementId: string, enabled: boolean) => void,
    onVisibilityToggle: (elementId: string, hidden: boolean) => void
  ) {
    this.container = container;
    this.onParameterChange = onParameterChange;
    // onToggle parameter kept for API compatibility but not used
    this.onVisibilityToggle = onVisibilityToggle;
  }
  
  setElements(elements: VisualElement[], active: string[]): void {
    this.elements = elements;
    this.activeElements = new Set(active);
    this.render();
  }
  
  setHiddenElements(hidden: Set<string>): void {
    this.hiddenElements = new Set(hidden);
    this.render();
  }
  
  setElementOrder(order: string[]): void {
    this.elementOrder = order;
    this.render();
  }
  
  setParameterValue(elementId: string, paramName: string, value: number): void {
    this.parameterValues.set(`${elementId}.${paramName}`, value);
    this.render();
  }
  
  private render(): void {
    this.container.innerHTML = '';
    
    // Group active elements by type
    const elementsByType: Record<string, { element: VisualElement; orderIndex: number }[]> = {
      'coordinate-modifier': [],
      'content-generator': [],
      'post-processor': []
    };
    
    let activeElements = this.elements.filter(el => this.activeElements.has(el.id));
    if (this.elementOrder.length) {
      activeElements = activeElements.slice().sort((a, b) =>
        this.elementOrder.indexOf(a.id) - this.elementOrder.indexOf(b.id)
      );
    }
    
    activeElements.forEach((element) => {
      const elementType = element.elementType || 'content-generator';
      elementsByType[elementType].push({ element, orderIndex: this.elementOrder.indexOf(element.id) });
    });
    
    // Render each type group
    const typeOrder = ['coordinate-modifier', 'content-generator', 'post-processor'];
    const typeLabels = {
      'coordinate-modifier': {
        title: 'Coordinate Modifiers',
        icon: '↻',
        color: '#4a5568',
        textColor: '#e2e8f0'
      },
      'content-generator': {
        title: 'Content Generators',
        icon: '+',
        color: '#22543d',
        textColor: '#c6f6d5'
      },
      'post-processor': {
        title: 'Post-Processors',
        icon: '◇',
        color: '#553c9a',
        textColor: '#e9d5ff'
      }
    };
    
    typeOrder.forEach(type => {
      const elements = elementsByType[type];
      if (elements.length === 0) return;
      
      const typeInfo = typeLabels[type as keyof typeof typeLabels];
      
      // Category box
      const categoryBox = document.createElement('div');
      categoryBox.className = 'category-box';
      
      const isCategoryCollapsed = this.collapsedCategories.has(type);
      
      // Category header
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'category-header';
      
      const typeIcon = document.createElement('span');
      typeIcon.textContent = typeInfo.icon;
      typeIcon.className = 'type-icon';
      typeIcon.style.background = typeInfo.color;
      typeIcon.style.color = typeInfo.textColor;
      
      const typeTitle = document.createElement('span');
      typeTitle.textContent = typeInfo.title;
      typeTitle.className = 'type-title';
      typeTitle.style.color = typeInfo.textColor;
      
      const toggle = document.createElement('span');
      toggle.textContent = isCategoryCollapsed ? '▶' : '▼';
      toggle.className = 'category-toggle';
      
      categoryHeader.appendChild(typeIcon);
      categoryHeader.appendChild(typeTitle);
      categoryHeader.appendChild(toggle);
      
      // Toggle category collapse
      categoryHeader.addEventListener('click', () => {
        if (this.collapsedCategories.has(type)) {
          this.collapsedCategories.delete(type);
        } else {
          this.collapsedCategories.add(type);
        }
        this.render();
      });
      
      categoryBox.appendChild(categoryHeader);
      
      // Container for element boxes (can be hidden when category is collapsed)
      const elementsContainer = document.createElement('div');
      elementsContainer.className = 'category-box-elements';
      if (isCategoryCollapsed) {
        elementsContainer.classList.add('is-collapsed');
      }
      
      // Sort elements by their order in elementOrder
      elements.sort((a, b) => a.orderIndex - b.orderIndex);
      
      // Render elements in this category
      elements.forEach(({ element }) => {
        // Create a box for each element
        const elementBox = document.createElement('div');
        elementBox.className = 'element-box';
        
        // Add parameter groups for this element
        element.parameterGroups.forEach(group => {
          // Only show groups for active elements - if element is active, group is open by default
          const isCollapsed = this.collapsedGroups.has(group.id);
          
          const groupDiv = document.createElement('div');
          groupDiv.className = 'param-group';
          
          const header = document.createElement('div');
          header.className = 'param-group-header';
          
          const title = document.createElement('h4');
          title.textContent = group.label;
          title.className = 'param-group-title';
          
          // Eye icon button to toggle element visibility (temporary hide, keeps element active)
          const eyeButton = document.createElement('button');
          eyeButton.className = 'eye-button';
          const isElementHidden = this.hiddenElements.has(element.id);
          if (isElementHidden) {
            eyeButton.classList.add('is-hidden');
          }
          eyeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const newHiddenState = !isElementHidden;
            eyeButton.classList.toggle('is-hidden', newHiddenState);
            this.onVisibilityToggle(element.id, newHiddenState);
          });
          
          const toggle = document.createElement('span');
          toggle.textContent = isCollapsed ? '▶' : '▼';
          toggle.className = 'param-group-toggle';
          
          header.appendChild(title);
          header.appendChild(eyeButton);
          header.appendChild(toggle);
          
          if (group.collapsible) {
            header.addEventListener('click', () => {
              if (this.collapsedGroups.has(group.id)) {
                this.collapsedGroups.delete(group.id);
              } else {
                this.collapsedGroups.add(group.id);
              }
              this.render();
            });
          }
          
          groupDiv.appendChild(header);
          
          if (!isCollapsed) {
            const paramsContainer = document.createElement('div');
            paramsContainer.className = 'param-group-content';
            
            group.parameters.forEach(paramName => {
              const param = element.parameters[paramName];
              if (!param) return;
              
              const paramDiv = this.createParameterControl(element.id, paramName, param);
              paramsContainer.appendChild(paramDiv);
            });
            
            groupDiv.appendChild(paramsContainer);
          }
          
          elementBox.appendChild(groupDiv);
        });
        
        elementsContainer.appendChild(elementBox);
      });
      
      categoryBox.appendChild(elementsContainer);
      this.container.appendChild(categoryBox);
    });
  }
  
  private createParameterControl(elementId: string, paramName: string, config: ParameterConfig): HTMLElement {
    const div = document.createElement('div');
    div.className = 'param-control';
    if (config.readOnly || config.disabled) {
      div.classList.add('param-disabled');
    }
    
    const value = this.parameterValues.get(`${elementId}.${paramName}`) ?? config.default;
    
    // Check if this is a block-color-glitch block parameter (should be read-only)
    const isBlockParam = elementId === 'block-color-glitch' && [
      'blockGlitchDirection', 'blockGlitchCount', 'blockGlitchMinSize', 
      'blockGlitchMaxSize', 'blockGlitchSeed'
    ].includes(paramName);
    
    const label = document.createElement('label');
    label.textContent = config.label || paramName;
    label.className = 'param-label';
    if (config.readOnly) {
      label.title = 'This parameter is read-only';
    }
    if (isBlockParam) {
      label.title = 'This parameter is synced from Block Displacement';
    }
    
    // Check if effect is unavailable based on mode
    const isEffectUnavailable = elementId === 'block-color-glitch' && paramName === 'blockGlitchEffect';
    const mode = this.parameterValues.get('block-color-glitch.blockGlitchMode') ?? 0;
    const effect = this.parameterValues.get('block-color-glitch.blockGlitchEffect') ?? 0;
    
    // Effects unavailable in pre-mode (mode 0): 3, 4, 5, 6 (RGB Separation, Hue Rotation, Saturation Shift, Color Tint)
    // Effects unavailable in post-mode (mode 1): 2 (Threshold Offset)
    const unavailableInPreMode = [3, 4, 5, 6];
    const unavailableInPostMode = [2];
    const isEffectDisabled = isEffectUnavailable && (
      (mode === 0 && unavailableInPreMode.includes(effect)) ||
      (mode === 1 && unavailableInPostMode.includes(effect))
    );
    
    if (config.disabled || isEffectDisabled) {
      label.title = 'This effect is not available in the current mode';
    }
    
    const isReadOnly = config.readOnly || isBlockParam;
    const isDisabled = config.disabled || isEffectDisabled;
    const shouldDisable = isReadOnly || isDisabled;
    
    if (config.type === 'float' && config.min !== undefined && config.max !== undefined && config.step === 1.0 && config.min === 0.0 && config.max === 1.0) {
      // Toggle
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = value === 1.0;
      checkbox.className = 'param-checkbox';
      checkbox.disabled = shouldDisable;
      if (shouldDisable) {
        checkbox.style.pointerEvents = 'none';
        checkbox.style.opacity = '0.5';
        checkbox.style.cursor = 'not-allowed';
        checkbox.setAttribute('tabindex', '-1');
        checkbox.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }, true);
        checkbox.addEventListener('change', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }, true);
      }
      if (!isReadOnly && !isDisabled) {
        checkbox.addEventListener('change', () => {
          const newValue = checkbox.checked ? 1.0 : 0.0;
          this.setParameterValue(elementId, paramName, newValue);
          this.onParameterChange(elementId, paramName, newValue);
        });
      }
      div.appendChild(label);
      div.appendChild(checkbox);
    } else {
      // Slider
      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'slider-container';
      
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(config.min ?? 0);
      slider.max = String(config.max ?? 100);
      slider.step = String(config.step ?? 0.1);
      slider.className = 'param-slider';
      slider.disabled = shouldDisable;
      if (shouldDisable) {
        slider.style.opacity = '0.5';
      }
      // Snap initial value to step
      let initialValue = value;
      if (config.step && config.type !== 'int') {
        const step = config.step;
        initialValue = Math.round(value / step) * step;
        if (config.min !== undefined) initialValue = Math.max(initialValue, config.min);
        if (config.max !== undefined) initialValue = Math.min(initialValue, config.max);
      }
      slider.value = String(initialValue);
      
      // Format number based on step size to avoid long decimal displays
      const formatValue = (val: number): string => {
        if (config.type === 'int') {
          return String(val);
        }
        const step = config.step ?? 0.1;
        // Determine decimal places based on step
        const stepStr = String(step);
        const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
        // Cap at 3 decimal places max for display
        const displayPlaces = Math.min(decimalPlaces, 3);
        return val.toFixed(displayPlaces);
      };
      
      const valueDisplay = document.createElement('span');
      valueDisplay.textContent = formatValue(initialValue);
      valueDisplay.className = 'param-value-display';
      
      // Step buttons for all controls
      const stepBackBtn = document.createElement('button');
      stepBackBtn.textContent = '◀';
      stepBackBtn.className = 'step-button';
      stepBackBtn.disabled = shouldDisable;
      if (shouldDisable) {
        stepBackBtn.style.pointerEvents = 'none';
        stepBackBtn.style.opacity = '0.5';
        stepBackBtn.style.cursor = 'not-allowed';
        stepBackBtn.setAttribute('tabindex', '-1');
        stepBackBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }, true);
      }
      if (!isReadOnly && !isDisabled) {
        stepBackBtn.addEventListener('click', () => {
        // Double-check disabled state before processing
        if (shouldDisable) return;
        
        const step = config.step ?? 0.1;
        let newValue = (config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value)) - step;
        if (config.min !== undefined) newValue = Math.max(newValue, config.min);
        if (config.max !== undefined) newValue = Math.min(newValue, config.max);
        // Snap to step
        if (config.type !== 'int') {
          newValue = Math.round(newValue / step) * step;
        }
        slider.value = String(newValue);
        valueDisplay.textContent = formatValue(newValue);
        this.parameterValues.set(`${elementId}.${paramName}`, newValue);
        this.onParameterChange(elementId, paramName, newValue);
        });
      }
      
      const stepForwardBtn = document.createElement('button');
      stepForwardBtn.textContent = '▶';
      stepForwardBtn.className = 'step-button';
      stepForwardBtn.disabled = shouldDisable;
      if (shouldDisable) {
        stepForwardBtn.style.pointerEvents = 'none';
        stepForwardBtn.style.opacity = '0.5';
        stepForwardBtn.style.cursor = 'not-allowed';
        stepForwardBtn.setAttribute('tabindex', '-1');
        stepForwardBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        }, true);
      }
      if (!isReadOnly && !isDisabled) {
        stepForwardBtn.addEventListener('click', () => {
        // Double-check disabled state before processing
        if (shouldDisable) return;
        
        const step = config.step ?? 0.1;
        let newValue = (config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value)) + step;
        if (config.min !== undefined) newValue = Math.max(newValue, config.min);
        if (config.max !== undefined) newValue = Math.min(newValue, config.max);
        // Snap to step
        if (config.type !== 'int') {
          newValue = Math.round(newValue / step) * step;
        }
        slider.value = String(newValue);
        valueDisplay.textContent = formatValue(newValue);
        this.parameterValues.set(`${elementId}.${paramName}`, newValue);
        this.onParameterChange(elementId, paramName, newValue);
        });
      }
      
      // Update stored value if it was snapped
      if (initialValue !== value) {
        this.parameterValues.set(`${elementId}.${paramName}`, initialValue);
      }
      
      // Add wrapper to block all interactions if disabled/read-only
      if (shouldDisable) {
        // Block all pointer events
        slider.style.pointerEvents = 'none';
        slider.style.cursor = 'not-allowed';
        slider.setAttribute('tabindex', '-1');
        slider.setAttribute('aria-disabled', 'true');
        
        // Prevent all possible interactions
        const blockInteraction = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        };
        
        slider.addEventListener('mousedown', blockInteraction, true);
        slider.addEventListener('mouseup', blockInteraction, true);
        slider.addEventListener('click', blockInteraction, true);
        slider.addEventListener('touchstart', blockInteraction, true);
        slider.addEventListener('touchend', blockInteraction, true);
        slider.addEventListener('touchmove', blockInteraction, true);
        slider.addEventListener('input', blockInteraction, true);
        slider.addEventListener('change', blockInteraction, true);
        slider.addEventListener('keydown', blockInteraction, true);
        slider.addEventListener('keyup', blockInteraction, true);
        slider.addEventListener('focus', (e) => {
          e.preventDefault();
          (e.target as HTMLElement).blur();
        }, true);
      }
      
      // Stop propagation to prevent parent handlers from interfering (only if not disabled)
      if (!isReadOnly && !isDisabled) {
        slider.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        });
        
        slider.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        });
        
        // Also stop mousemove events from being captured by any drag handlers
        slider.addEventListener('mousemove', (e) => {
          e.stopPropagation();
        });
        
        slider.addEventListener('input', () => {
        // Double-check disabled state before processing
        if (shouldDisable) return;
        
        let newValue = config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value);
        // Snap to step to prevent drift
        if (config.step && config.type !== 'int') {
          const step = config.step;
          newValue = Math.round(newValue / step) * step;
          // Clamp to min/max
          if (config.min !== undefined) newValue = Math.max(newValue, config.min);
          if (config.max !== undefined) newValue = Math.min(newValue, config.max);
          // Update slider value to snapped value
          slider.value = String(newValue);
        }
        valueDisplay.textContent = formatValue(newValue);
        // Update internal value without triggering full re-render
        this.parameterValues.set(`${elementId}.${paramName}`, newValue);
        // Immediately update shader
        this.onParameterChange(elementId, paramName, newValue);
        });
        
        // Also handle change event for when slider is released (optional, for final update)
        slider.addEventListener('change', () => {
        // Double-check disabled state before processing
        if (shouldDisable) return;
        
        let newValue = config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value);
        // Snap to step to prevent drift
        if (config.step && config.type !== 'int') {
          const step = config.step;
          newValue = Math.round(newValue / step) * step;
          // Clamp to min/max
          if (config.min !== undefined) newValue = Math.max(newValue, config.min);
          if (config.max !== undefined) newValue = Math.min(newValue, config.max);
          // Update slider value to snapped value
          slider.value = String(newValue);
        }
        valueDisplay.textContent = formatValue(newValue);
        this.parameterValues.set(`${elementId}.${paramName}`, newValue);
        this.onParameterChange(elementId, paramName, newValue);
        });
      }
      
      sliderContainer.appendChild(stepBackBtn);
      sliderContainer.appendChild(slider);
      sliderContainer.appendChild(stepForwardBtn);
      sliderContainer.appendChild(valueDisplay);
      
      div.appendChild(label);
      div.appendChild(sliderContainer);
    }
    
    return div;
  }
}

