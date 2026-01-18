import type { VisualElement, ParameterConfig } from '../../types';

export class CombinedPanel {
  private container: HTMLElement;
  private onToggle: (elementId: string, enabled: boolean) => void;
  private onReorder: (newOrder: string[]) => void;
  private onParameterChange: (elementId: string, paramName: string, value: number) => void;
  private onVisibilityToggle: (elementId: string, hidden: boolean) => void;
  private elements: VisualElement[] = [];
  private activeElements: Set<string> = new Set();
  private hiddenElements: Set<string> = new Set();
  private elementOrder: string[] = [];
  private parameterValues: Map<string, number> = new Map();
  private expandedElements: Set<string> = new Set();
  private collapsedGroups: Set<string> = new Set();
  private showAllMode: Map<string, boolean> = new Map(); // Category -> show all (default: true)
  private draggedElement: HTMLElement | null = null;
  private draggedElementId: string | null = null;
  private draggedGroupType: string | null = null;
  private dragPreview: HTMLElement | null = null;
  
  constructor(
    container: HTMLElement,
    onToggle: (elementId: string, enabled: boolean) => void,
    onReorder: (newOrder: string[]) => void,
    onParameterChange: (elementId: string, paramName: string, value: number) => void,
    onVisibilityToggle: (elementId: string, hidden: boolean) => void
  ) {
    this.container = container;
    this.onToggle = onToggle;
    this.onReorder = onReorder;
    this.onParameterChange = onParameterChange;
    this.onVisibilityToggle = onVisibilityToggle;
  }
  
  setElements(elements: VisualElement[]): void {
    this.elements = elements;
    this.elementOrder = elements.map(el => el.id);
    this.render();
  }
  
  setActiveElements(active: string[]): void {
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
    
    // Group elements by type
    const elementsByType: Record<string, { element: VisualElement; orderIndex: number }[]> = {
      'coordinate-modifier': [],
      'content-generator': [],
      'post-processor': []
    };
    
    this.elementOrder.forEach((elementId, index) => {
      const element = this.elements.find(el => el.id === elementId);
      if (!element) return;
      
      const elementType = element.elementType || 'content-generator';
      elementsByType[elementType].push({ element, orderIndex: index });
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
      const showAll = this.showAllMode.get(type) === true; // Default to false (show only active)
      
      // Filter elements based on showAll mode
      const visibleElements = showAll 
        ? elements 
        : elements.filter(({ element }) => this.activeElements.has(element.id));
      
      // Always show category header, even if no visible elements
      // Category box
      const categoryBox = document.createElement('div');
      categoryBox.className = 'category-box';
      
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
      
      // Show All toggle button (Apple-style)
      const showAllButton = document.createElement('button');
      showAllButton.className = 'show-all-button';
      showAllButton.setAttribute('aria-label', showAll ? 'Show active only' : 'Show all');
      showAllButton.textContent = showAll ? '⊟' : '⊞'; // Reduced grid when showing all, grid icon when showing active only
      showAllButton.title = showAll ? 'Show active only' : 'Show all elements';
      showAllButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const newState = !showAll;
        this.showAllMode.set(type, newState);
        this.render();
      });
      
      categoryHeader.appendChild(typeIcon);
      categoryHeader.appendChild(typeTitle);
      categoryHeader.appendChild(showAllButton);
      categoryBox.appendChild(categoryHeader);
      
      // Group container for drag-and-drop
      const groupContainer = document.createElement('div');
      groupContainer.dataset.groupType = type;
      
      // Sort elements by their order in elementOrder
      visibleElements.sort((a, b) => a.orderIndex - b.orderIndex);
      
      visibleElements.forEach(({ element, orderIndex }) => {
        const elementId = element.id;
        const isActive = this.activeElements.has(elementId);
        const isExpanded = this.expandedElements.has(elementId);
        const isHidden = this.hiddenElements.has(elementId);
        
        // Main block container
        const block = document.createElement('div');
        block.className = 'element-box';
        if (isExpanded) {
          block.classList.add('is-expanded');
        }
        block.dataset.elementId = elementId;
        block.dataset.index = String(orderIndex);
        block.dataset.groupType = type;
        
        // Header (always visible)
        const header = document.createElement('div');
        header.className = 'element-box-header';
        
        // Element name (clickable to expand/collapse)
        const nameLabel = document.createElement('div');
        nameLabel.textContent = element.displayName;
        nameLabel.className = 'element-box-name';
        nameLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          // Only allow expand if element is active
          if (!isActive) return;
          if (isExpanded) {
            this.expandedElements.delete(elementId);
          } else {
            this.expandedElements.add(elementId);
          }
          this.render();
        });
        nameLabel.addEventListener('mousedown', (e) => {
          e.stopPropagation();
        });
        
        // Drag handle icon
        const dragHandle = document.createElement('span');
        dragHandle.textContent = '☰';
        dragHandle.className = 'drag-handle';
        
        // In "show all" mode: show plus button (LED style) + eye button (if active)
        if (showAll) {
          // Plus button (LED style) - replaces power button
          const plusButton = document.createElement('button');
          plusButton.className = 'plus-button';
          if (isActive) {
            plusButton.classList.add('is-active');
          }
          plusButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const newState = !isActive;
            plusButton.classList.toggle('is-active', newState);
            // If turning off, collapse and remove from expanded
            if (!newState) {
              this.expandedElements.delete(elementId);
            }
            this.onToggle(elementId, newState);
          });
          
          // Eye button (only visible when element is active/added)
          const eyeButton = document.createElement('button');
          eyeButton.className = 'eye-button';
          if (!isActive) {
            eyeButton.style.visibility = 'hidden';
            eyeButton.style.pointerEvents = 'none';
          }
          if (isHidden) {
            eyeButton.classList.add('is-hidden');
          }
          eyeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isActive) return;
            const newHiddenState = !isHidden;
            eyeButton.classList.toggle('is-hidden', newHiddenState);
            this.onVisibilityToggle(element.id, newHiddenState);
          });
          
          header.appendChild(plusButton);
          header.appendChild(nameLabel);
          header.appendChild(eyeButton); // Always append to maintain consistent spacing
          header.appendChild(dragHandle);
        } else {
          // In "show less" mode: show eye button, label, drag handle (only active elements shown)
          const eyeButton = document.createElement('button');
          eyeButton.className = 'eye-button';
          if (isHidden) {
            eyeButton.classList.add('is-hidden');
          }
          eyeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const newHiddenState = !isHidden;
            eyeButton.classList.toggle('is-hidden', newHiddenState);
            this.onVisibilityToggle(element.id, newHiddenState);
          });
          
          header.appendChild(eyeButton);
          header.appendChild(nameLabel);
          header.appendChild(dragHandle);
        }
        
        // Drag and drop handlers - use a simpler approach
        // Only allow dragging from the drag handle or empty space in header
        const handleHeaderMouseDown = (e: MouseEvent) => {
          const target = e.target as HTMLElement;
          // Get buttons based on showAll mode
          const plusButton = header.querySelector('.plus-button') as HTMLElement;
          const eyeButton = header.querySelector('.eye-button') as HTMLElement;
          
          // If clicking on interactive elements, don't start drag
          if (target === plusButton || 
              target === eyeButton ||
              target === nameLabel ||
              target.closest('input, button, [type="range"]')) {
            return;
          }
          // If clicking on drag handle or empty space, start drag
          if (target === dragHandle || target === header) {
            e.preventDefault();
            this.startDrag(block, orderIndex, e, type);
          }
        };
        
        header.addEventListener('mousedown', handleHeaderMouseDown);
        
        // Drag handle explicitly starts drag
        dragHandle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          this.startDrag(block, orderIndex, e, type);
        });
        
        block.appendChild(header);
        
        // Expanded content with controls (only if active and expanded)
        if (isActive && isExpanded) {
          const contentDiv = document.createElement('div');
          contentDiv.className = 'element-box-content';
          
          // Add parameter groups for this element
          element.parameterGroups.forEach(group => {
            const isCollapsed = this.collapsedGroups.has(group.id);
            
            const groupDiv = document.createElement('div');
            groupDiv.className = 'param-group';
            
            const groupHeader = document.createElement('div');
            groupHeader.className = 'param-group-header';
            
            const title = document.createElement('h4');
            title.textContent = group.label;
            title.className = 'param-group-title';
            
            const toggle = document.createElement('span');
            toggle.textContent = isCollapsed ? '▶' : '▼';
            toggle.className = 'param-group-toggle';
            
            groupHeader.appendChild(title);
            groupHeader.appendChild(toggle);
            
            if (group.collapsible) {
              groupHeader.addEventListener('click', () => {
                if (this.collapsedGroups.has(group.id)) {
                  this.collapsedGroups.delete(group.id);
                } else {
                  this.collapsedGroups.add(group.id);
                }
                this.render();
              });
            }
            
            groupDiv.appendChild(groupHeader);
            
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
            
            contentDiv.appendChild(groupDiv);
          });
          
          block.appendChild(contentDiv);
        }
        
        groupContainer.appendChild(block);
      });
      
      categoryBox.appendChild(groupContainer);
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
    
    const isReadOnly = config.readOnly || isBlockParam;
    const isDisabled = config.disabled || false;
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
      if (!shouldDisable) {
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
      
      // Format number based on step size
      const formatValue = (val: number): string => {
        if (config.type === 'int') {
          return String(val);
        }
        const step = config.step ?? 0.1;
        const stepStr = String(step);
        const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
        const displayPlaces = Math.min(decimalPlaces, 3);
        return val.toFixed(displayPlaces);
      };
      
      const valueDisplay = document.createElement('span');
      valueDisplay.textContent = formatValue(initialValue);
      valueDisplay.className = 'param-value-display';
      
      // Step buttons
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
      if (!shouldDisable) {
        stepBackBtn.addEventListener('click', () => {
          const step = config.step ?? 0.1;
          let newValue = (config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value)) - step;
          if (config.min !== undefined) newValue = Math.max(newValue, config.min);
          if (config.max !== undefined) newValue = Math.min(newValue, config.max);
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
      if (!shouldDisable) {
        stepForwardBtn.addEventListener('click', () => {
          const step = config.step ?? 0.1;
          let newValue = (config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value)) + step;
          if (config.min !== undefined) newValue = Math.max(newValue, config.min);
          if (config.max !== undefined) newValue = Math.min(newValue, config.max);
          if (config.type !== 'int') {
            newValue = Math.round(newValue / step) * step;
          }
          slider.value = String(newValue);
          valueDisplay.textContent = formatValue(newValue);
          this.parameterValues.set(`${elementId}.${paramName}`, newValue);
          this.onParameterChange(elementId, paramName, newValue);
        });
      }
      
      // Prevent any interaction if disabled/read-only
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
      if (!shouldDisable) {
        slider.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        });
        
        slider.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          e.stopImmediatePropagation();
        });
        
        slider.addEventListener('mousemove', (e) => {
          e.stopPropagation();
        });
        
        slider.addEventListener('input', () => {
          // Double-check disabled state before processing
          if (shouldDisable) return;
          
          let newValue = config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value);
          if (config.step && config.type !== 'int') {
            const step = config.step;
            newValue = Math.round(newValue / step) * step;
            if (config.min !== undefined) newValue = Math.max(newValue, config.min);
            if (config.max !== undefined) newValue = Math.min(newValue, config.max);
            slider.value = String(newValue);
          }
          valueDisplay.textContent = formatValue(newValue);
          this.parameterValues.set(`${elementId}.${paramName}`, newValue);
          this.onParameterChange(elementId, paramName, newValue);
        });
        
        slider.addEventListener('change', () => {
          // Double-check disabled state before processing
          if (shouldDisable) return;
          
          let newValue = config.type === 'int' ? parseInt(slider.value) : parseFloat(slider.value);
          if (config.step && config.type !== 'int') {
            const step = config.step;
            newValue = Math.round(newValue / step) * step;
            if (config.min !== undefined) newValue = Math.max(newValue, config.min);
            if (config.max !== undefined) newValue = Math.min(newValue, config.max);
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
  
  private startDrag(element: HTMLElement, index: number, e: MouseEvent, groupType: string): void {
    this.draggedElement = element;
    this.draggedElementId = element.dataset.elementId || null;
    this.draggedGroupType = groupType;
    
    element.classList.add('is-dragging');
    const header = element.querySelector('.element-box-header');
    if (header) {
      header.classList.add('is-dragging');
    }
    
    // Create drag preview
    this.createDragPreview(element, e);
    
    const onMouseMove = (e: MouseEvent) => {
      // Update drag preview position - align right center with cursor
      if (this.dragPreview) {
        // Fixed width is 280px, scaled to 0.85 = 238px
        const scaledWidth = 280 * 0.85; // 238px
        const rect = this.dragPreview.getBoundingClientRect();
        const scaledHeight = rect.height * 0.85;
        this.dragPreview.style.left = `${e.clientX - scaledWidth}px`;
        this.dragPreview.style.top = `${e.clientY - scaledHeight / 2}px`;
      }
      
      const target = e.target as HTMLElement;
      // Don't interfere with interactive elements
      if (target && (
        (target instanceof HTMLInputElement && target.type === 'range') || 
        target.closest('input[type="range"]') ||
        target.closest('button') ||
        target.closest('.show-all-button')
      )) {
        return;
      }
      e.preventDefault();
      if (!this.draggedGroupType) return;
      const elements = Array.from(this.container.querySelectorAll(`[data-element-id][data-group-type="${this.draggedGroupType}"]`)) as HTMLElement[];
      const mouseY = e.clientY;
      
      let targetIndex = -1;
      for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        if (mouseY < centerY) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === -1) {
        targetIndex = elements.length;
      }
      
      elements.forEach((el, idx) => {
        if (el === element) return;
        if (idx === targetIndex || (targetIndex === elements.length && idx === elements.length - 1)) {
          el.classList.add('is-drag-target');
        } else {
          el.classList.remove('is-drag-target');
        }
      });
    };
    
    const onMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Don't interfere with interactive elements (sliders, buttons, etc.)
      if (target && (
        (target instanceof HTMLInputElement && target.type === 'range') || 
        target.closest('input[type="range"]') ||
        target.closest('button') ||
        target.closest('.show-all-button')
      )) {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this.removeDragPreview();
        this.draggedElement = null;
        this.draggedElementId = null;
        this.draggedGroupType = null;
        // Don't prevent default - allow the button click to fire
        return;
      }
      
      e.preventDefault();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      // Remove drag preview
      this.removeDragPreview();
      
      if (this.draggedElement && this.draggedElementId && this.draggedGroupType) {
        // Get ALL visible elements of this group type (not filtered by showAllMode for drag calculation)
        const allVisibleElements = Array.from(this.container.querySelectorAll(`[data-element-id][data-group-type="${this.draggedGroupType}"]`)) as HTMLElement[];
        const mouseY = e.clientY;
        
        // Find target position based on visible elements
        let targetIndex = -1;
        for (let i = 0; i < allVisibleElements.length; i++) {
          const rect = allVisibleElements[i].getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          if (mouseY < centerY) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) {
          targetIndex = allVisibleElements.length;
        }
        
        // Get all elements of this group type from elementOrder (not just visible ones)
        const allGroupElements = this.elementOrder
          .map(elementId => {
            const element = this.elements.find(el => el.id === elementId);
            if (!element) return null;
            const elementType = element.elementType || 'content-generator';
            if (elementType === this.draggedGroupType) {
              return { elementId, orderIndex: this.elementOrder.indexOf(elementId) };
            }
            return null;
          })
          .filter((item): item is { elementId: string; orderIndex: number } => item !== null)
          .sort((a, b) => a.orderIndex - b.orderIndex);
        
        // Find the dragged element's position in the full group list
        const draggedInGroupIndex = allGroupElements.findIndex(g => g.elementId === this.draggedElementId);
        
        if (draggedInGroupIndex === -1) {
          // Element not found in group, clean up and return
          allVisibleElements.forEach(el => {
            el.classList.remove('is-dragging', 'is-drag-target');
            const header = el.querySelector('.element-box-header');
            if (header) {
              header.classList.remove('is-dragging');
            }
          });
          this.draggedElement = null;
          this.draggedElementId = null;
          this.draggedGroupType = null;
          return;
        }
        
        // Map target index from visible elements to full group elements
        // Find which element in the full list corresponds to the target visible element
        if (targetIndex < allVisibleElements.length) {
          const targetVisibleElementId = allVisibleElements[targetIndex].dataset.elementId;
          const targetInFullList = allGroupElements.findIndex(g => g.elementId === targetVisibleElementId);
          if (targetInFullList !== -1) {
            targetIndex = targetInFullList;
          }
        } else {
          // Target is at the end
          targetIndex = allGroupElements.length;
        }
        
        // Adjust target index if dragging down
        if (draggedInGroupIndex < targetIndex) {
          targetIndex--;
        }
        
        if (targetIndex !== draggedInGroupIndex && targetIndex >= 0 && targetIndex <= allGroupElements.length) {
          const reorderedGroup = [...allGroupElements];
          const [draggedItem] = reorderedGroup.splice(draggedInGroupIndex, 1);
          reorderedGroup.splice(targetIndex, 0, draggedItem);
          
          const newOrder: string[] = [];
          const reorderedGroupIds = reorderedGroup.map(g => g.elementId);
          let groupIndex = 0;
          
          for (const elementId of this.elementOrder) {
            const element = this.elements.find(el => el.id === elementId);
            if (!element) continue;
            
            const elementType = element.elementType || 'content-generator';
            
            if (elementType === this.draggedGroupType) {
              if (groupIndex < reorderedGroupIds.length) {
                newOrder.push(reorderedGroupIds[groupIndex]);
                groupIndex++;
              }
            } else {
              newOrder.push(elementId);
            }
          }
          
          this.elementOrder = newOrder;
          this.setElementOrder(this.elementOrder);
          this.onReorder(newOrder);
        }
        
        allVisibleElements.forEach(el => {
          el.classList.remove('is-dragging', 'is-drag-target');
          const header = el.querySelector('.element-box-header');
          if (header) {
            header.classList.remove('is-dragging');
          }
        });
      }
      
      this.draggedElement = null;
      this.draggedElementId = null;
      this.draggedGroupType = null;
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
  
  private createDragPreview(element: HTMLElement, e: MouseEvent): void {
    // Clone the element header for the preview
    const header = element.querySelector('.element-box-header');
    if (!header) return;
    
    const preview = header.cloneNode(true) as HTMLElement;
    preview.classList.add('drag-preview');
    
    // Set initial styles
    preview.style.position = 'fixed';
    preview.style.zIndex = '10000';
    preview.style.pointerEvents = 'none';
    preview.style.transform = 'scale(0.85)';
    preview.style.opacity = '0.9';
    preview.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    preview.style.transformOrigin = 'right center';
    
    // Add to DOM first to measure
    document.body.appendChild(preview);
    this.dragPreview = preview;
    
    // Position so right center aligns with cursor
    // Use requestAnimationFrame to ensure layout is complete
    requestAnimationFrame(() => {
      if (this.dragPreview) {
        // Fixed width is 280px, scaled to 0.85 = 238px
        // transform-origin is right center, so right edge stays at cursor
        const scaledWidth = 280 * 0.85; // 238px
        const rect = this.dragPreview.getBoundingClientRect();
        const scaledHeight = rect.height * 0.85;
        this.dragPreview.style.left = `${e.clientX - scaledWidth}px`;
        this.dragPreview.style.top = `${e.clientY - scaledHeight / 2}px`;
      }
    });
  }
  
  private removeDragPreview(): void {
    if (this.dragPreview) {
      this.dragPreview.remove();
      this.dragPreview = null;
    }
  }
}
