import type { VisualElement } from '../../types';

export class ElementComposer {
  private container: HTMLElement;
  private onToggle: (elementId: string, enabled: boolean) => void;
  private onReorder: (newOrder: string[]) => void;
  private elements: VisualElement[] = [];
  private activeElements: Set<string> = new Set();
  private elementOrder: string[] = [];
  private parameterValues: Map<string, number> = new Map();
  private draggedElement: HTMLElement | null = null;
  private draggedIndex: number = -1;
  
  constructor(
    container: HTMLElement,
    onToggle: (elementId: string, enabled: boolean) => void,
    onReorder: (newOrder: string[]) => void,
    _onParameterChange: (elementId: string, paramName: string, value: number) => void
  ) {
    this.container = container;
    this.onToggle = onToggle;
    this.onReorder = onReorder;
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
      
      // Category box - each category gets its own box
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
      
      categoryHeader.appendChild(typeIcon);
      categoryHeader.appendChild(typeTitle);
      categoryBox.appendChild(categoryHeader);
      
      // Group container for drag-and-drop
      const groupContainer = document.createElement('div');
      groupContainer.dataset.groupType = type;
      
      // Sort elements by their order in elementOrder
      elements.sort((a, b) => a.orderIndex - b.orderIndex);
      
      elements.forEach(({ element, orderIndex }) => {
        const elementId = element.id;
        const isActive = this.activeElements.has(elementId);
        
        // Main block container
        const block = document.createElement('div');
        block.className = 'element-box';
        block.dataset.elementId = elementId;
        block.dataset.index = String(orderIndex);
        block.dataset.groupType = type;
        
        // Header (always visible)
        const header = document.createElement('div');
        header.className = 'element-box-header';
        
        // Power button (replaces checkbox)
        const powerButton = document.createElement('button');
        powerButton.className = 'power-button';
        if (isActive) {
          powerButton.classList.add('is-active');
        }
        powerButton.addEventListener('click', (e) => {
          e.stopPropagation();
          const newState = !isActive;
          powerButton.classList.toggle('is-active', newState);
          this.onToggle(elementId, newState);
        });
        
        // Element name
        const nameLabel = document.createElement('div');
        nameLabel.textContent = element.displayName;
        nameLabel.className = 'element-box-name';
        
        // Drag handle icon
        const dragHandle = document.createElement('span');
        dragHandle.textContent = '☰';
        dragHandle.className = 'drag-handle';
        
        header.appendChild(powerButton);
        header.appendChild(nameLabel);
        header.appendChild(dragHandle);
        
        // Drag and drop handlers - only allow dragging within same group
        header.addEventListener('mousedown', (e) => {
          // Don't start drag if clicking on interactive elements (power button, sliders, etc.)
          const target = e.target as HTMLElement;
          if (target === powerButton || 
              (target !== dragHandle && target.closest('input, button, [type="range"]'))) {
            return;
          }
          // Allow dragging from anywhere on the header, including the drag handle
          this.startDrag(block, orderIndex, e, type);
        });
        
        block.appendChild(header);
        groupContainer.appendChild(block);
      });
      
      categoryBox.appendChild(groupContainer);
      this.container.appendChild(categoryBox);
    });
  }
  
  private startDrag(element: HTMLElement, index: number, _e: MouseEvent, groupType: string): void {
    this.draggedElement = element;
    this.draggedIndex = index;
    
    element.classList.add('is-dragging');
    const header = element.querySelector('.element-box-header');
    if (header) {
      header.classList.add('is-dragging');
    }
    
    const onMouseMove = (e: MouseEvent) => {
      // Don't interfere with slider dragging
      const target = e.target as HTMLElement;
      if (target && ((target instanceof HTMLInputElement && target.type === 'range') || target.closest('input[type="range"]'))) {
        return;
      }
      e.preventDefault();
      // Only consider elements in the same group
      const elements = Array.from(this.container.querySelectorAll(`[data-element-id][data-group-type="${groupType}"]`)) as HTMLElement[];
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
      
      // Visual feedback - only highlight elements in same group
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
      // Don't interfere with slider dragging
      const target = e.target as HTMLElement;
      if (target && ((target instanceof HTMLInputElement && target.type === 'range') || target.closest('input[type="range"]'))) {
        // Still clean up listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this.draggedElement = null;
        this.draggedIndex = -1;
        return;
      }
      e.preventDefault();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      if (this.draggedElement && this.draggedIndex !== -1) {
        // Only consider elements in the same group
        const elements = Array.from(this.container.querySelectorAll(`[data-element-id][data-group-type="${groupType}"]`)) as HTMLElement[];
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
        
        // Find the actual indices in elementOrder for elements in this group
        const groupElements = elements.map(el => {
          const elementId = el.dataset.elementId!;
          const orderIndex = this.elementOrder.indexOf(elementId);
          return { elementId, orderIndex, element: el };
        }).sort((a, b) => a.orderIndex - b.orderIndex);
        
        const draggedElementId = this.elementOrder[this.draggedIndex];
        const draggedInGroupIndex = groupElements.findIndex(g => g.elementId === draggedElementId);
        
        // Adjust target index if dragging down
        if (draggedInGroupIndex < targetIndex) {
          targetIndex--;
        }
        
        if (targetIndex !== draggedInGroupIndex && targetIndex >= 0 && targetIndex < groupElements.length) {
          // Reorder elements within the group
          const reorderedGroup = [...groupElements];
          const [draggedItem] = reorderedGroup.splice(draggedInGroupIndex, 1);
          reorderedGroup.splice(targetIndex, 0, draggedItem);
          
          // Now rebuild the full elementOrder with the reordered group
          // Strategy: replace all elements of this type with the reordered list, maintaining relative positions
          const newOrder: string[] = [];
          const reorderedGroupIds = reorderedGroup.map(g => g.elementId);
          let groupIndex = 0;
          
          for (const elementId of this.elementOrder) {
            const element = this.elements.find(el => el.id === elementId);
            if (!element) continue;
            
            const elementType = element.elementType || 'content-generator';
            
            if (elementType === groupType) {
              // Replace with reordered group element
              if (groupIndex < reorderedGroupIds.length) {
                newOrder.push(reorderedGroupIds[groupIndex]);
                groupIndex++;
              }
            } else {
              // Keep other elements in their original positions
              newOrder.push(elementId);
            }
          }
          
          this.elementOrder = newOrder;
          this.setElementOrder(this.elementOrder);
          
          // Notify parent with new order
          this.onReorder(newOrder);
        }
        
        // Reset visual state
        elements.forEach(el => {
          el.classList.remove('is-dragging', 'is-drag-target');
          const header = el.querySelector('.element-box-header');
          if (header) {
            header.classList.remove('is-dragging');
          }
        });
      }
      
      this.draggedElement = null;
      this.draggedIndex = -1;
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}

