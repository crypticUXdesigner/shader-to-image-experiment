import type { Layer } from '../../types';

export class LayerProperties {
  private container: HTMLElement;
  private onUpdate: (layer: Layer) => void;
  private layer: Layer | null = null;
  private collapsed: boolean = true; // Collapsed by default
  
  constructor(
    container: HTMLElement,
    onUpdate: (layer: Layer) => void
  ) {
    this.container = container;
    this.onUpdate = onUpdate;
  }
  
  setLayer(layer: Layer): void {
    this.layer = layer;
    this.render();
  }
  
  private render(): void {
    if (!this.layer) {
      this.container.innerHTML = '';
      return;
    }
    
    this.container.innerHTML = '';
    
    // Create element-box wrapper
    const elementBox = document.createElement('div');
    elementBox.className = 'element-box';
    
    // Header
    const header = document.createElement('div');
    header.className = 'element-box-header';
    header.style.cursor = 'pointer';
    
    const title = document.createElement('div');
    title.className = 'element-box-name';
    title.textContent = 'Layer Properties';
    header.appendChild(title);
    
    // Toggle indicator
    const toggle = document.createElement('span');
    toggle.textContent = this.collapsed ? '▶' : '▼';
    toggle.className = 'toggle';
    toggle.style.marginLeft = 'auto';
    header.appendChild(toggle);
    
    // Toggle collapse on header click
    header.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.render();
    });
    
    elementBox.appendChild(header);
    
    // Content (only show when not collapsed)
    if (!this.collapsed) {
      const content = document.createElement('div');
      content.className = 'element-box-content';
    
    // Only show blend mode, opacity, and visibility controls for layer-2
    // Layer 1 is always visible and doesn't need blend mode/opacity (nothing to blend with)
    if (this.layer.id !== 'layer-1') {
      // Blending Mode
      const blendControl = document.createElement('div');
      blendControl.className = 'param-control';
      const blendLabel = document.createElement('label');
      blendLabel.className = 'param-label';
      blendLabel.textContent = 'Blending Mode';
      const blendSelect = document.createElement('select');
      const blendModes = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft Light', 'Hard Light', 
                         'Color Dodge', 'Color Burn', 'Linear Dodge', 'Linear Burn', 'Difference', 'Exclusion'];
      blendModes.forEach((name, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = name;
        if (index === this.layer!.blendingMode) {
          option.selected = true;
        }
        blendSelect.appendChild(option);
      });
      blendSelect.addEventListener('change', () => {
        this.layer!.blendingMode = parseInt(blendSelect.value);
        this.onUpdate({ ...this.layer! });
      });
      blendControl.appendChild(blendLabel);
      blendControl.appendChild(blendSelect);
      content.appendChild(blendControl);
      
      // Opacity
      const opacityControl = document.createElement('div');
      opacityControl.className = 'param-control';
      const opacityLabel = document.createElement('label');
      opacityLabel.className = 'param-label';
      opacityLabel.textContent = 'Opacity';
      
      const sliderContainer = document.createElement('div');
      sliderContainer.className = 'slider-container';
      
      const opacitySlider = document.createElement('input');
      opacitySlider.type = 'range';
      opacitySlider.className = 'param-slider';
      opacitySlider.min = '0';
      opacitySlider.max = '1';
      opacitySlider.step = '0.01';
      opacitySlider.value = String(this.layer.opacity);
      
      const formatOpacity = (val: number): string => {
        return `${Math.round(val * 100)}%`;
      };
      
      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'param-value-display';
      valueDisplay.textContent = formatOpacity(this.layer.opacity);
      
      // Step buttons
      const stepBackBtn = document.createElement('button');
      stepBackBtn.textContent = '◀';
      stepBackBtn.className = 'step-button';
      stepBackBtn.addEventListener('click', () => {
        let newValue = parseFloat(opacitySlider.value) - 0.01;
        newValue = Math.max(0, Math.min(1, newValue));
        opacitySlider.value = String(newValue);
        this.layer!.opacity = newValue;
        valueDisplay.textContent = formatOpacity(newValue);
        this.onUpdate({ ...this.layer! });
      });
      
      const stepForwardBtn = document.createElement('button');
      stepForwardBtn.textContent = '▶';
      stepForwardBtn.className = 'step-button';
      stepForwardBtn.addEventListener('click', () => {
        let newValue = parseFloat(opacitySlider.value) + 0.01;
        newValue = Math.max(0, Math.min(1, newValue));
        opacitySlider.value = String(newValue);
        this.layer!.opacity = newValue;
        valueDisplay.textContent = formatOpacity(newValue);
        this.onUpdate({ ...this.layer! });
      });
      
      opacitySlider.addEventListener('input', () => {
        this.layer!.opacity = parseFloat(opacitySlider.value);
        valueDisplay.textContent = formatOpacity(this.layer!.opacity);
        this.onUpdate({ ...this.layer! });
      });
      
      sliderContainer.appendChild(stepBackBtn);
      sliderContainer.appendChild(opacitySlider);
      sliderContainer.appendChild(valueDisplay);
      sliderContainer.appendChild(stepForwardBtn);
      
      opacityControl.appendChild(opacityLabel);
      opacityControl.appendChild(sliderContainer);
      content.appendChild(opacityControl);
      
      // Visibility
      const visibleControl = document.createElement('div');
      visibleControl.className = 'param-control';
      const visibleLabel = document.createElement('label');
      visibleLabel.className = 'param-label';
      visibleLabel.style.display = 'flex';
      visibleLabel.style.alignItems = 'center';
      visibleLabel.style.gap = 'var(--spacing-sm)';
      visibleLabel.style.cursor = 'pointer';
      const visibleCheckbox = document.createElement('input');
      visibleCheckbox.type = 'checkbox';
      visibleCheckbox.checked = this.layer.visible;
      visibleCheckbox.addEventListener('change', () => {
        this.layer!.visible = visibleCheckbox.checked;
        this.onUpdate({ ...this.layer! });
      });
      const visibleText = document.createElement('span');
      visibleText.textContent = 'Visible';
      visibleLabel.appendChild(visibleCheckbox);
      visibleLabel.appendChild(visibleText);
      visibleControl.appendChild(visibleLabel);
      content.appendChild(visibleControl);
    }
      
      elementBox.appendChild(content);
    }
    
    this.container.appendChild(elementBox);
  }
}
