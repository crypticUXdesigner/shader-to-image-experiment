import type { Layer } from '../../types';

export class BlendControls {
  private container: HTMLElement;
  private onUpdate: (layer: Layer) => void;
  private layer: Layer | null = null;
  
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
    
    const title = document.createElement('div');
    title.className = 'element-box-name';
    title.textContent = 'Blend Settings';
    header.appendChild(title);
    elementBox.appendChild(header);
    
    // Content
    const content = document.createElement('div');
    content.className = 'element-box-content';
    
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
    
    elementBox.appendChild(content);
    this.container.appendChild(elementBox);
  }
}
