import type { Layer } from '../../types';

export class LayerList {
  private container: HTMLElement;
  private onLayerSelect: (layerId: string) => void;
  // Removed unused onLayerUpdate
  private layers: Layer[] = [];
  private activeLayerId: string = '';
  
  constructor(
    container: HTMLElement,
    onLayerSelect: (layerId: string) => void,
    _onLayerUpdate: (layer: Layer) => void
  ) {
    this.container = container;
    this.onLayerSelect = onLayerSelect;
    // onLayerUpdate parameter kept for API compatibility but not used
  }
  
  setLayers(layers: Layer[], activeLayerId: string): void {
    this.layers = layers;
    this.activeLayerId = activeLayerId;
    this.render();
  }
  
  private render(): void {
    this.container.innerHTML = '';
    
    this.layers.forEach(layer => {
      const isActive = layer.id === this.activeLayerId;
      const layerName = layer.id === 'layer-1' ? 'Layer 1' : 'Layer 2';
      
      // Create element-box for each layer
      const elementBox = document.createElement('div');
      elementBox.className = 'element-box';
      if (isActive) {
        elementBox.style.background = 'var(--box-bg-primary)';
      }
      elementBox.style.cursor = 'pointer';
      
      // Header
      const header = document.createElement('div');
      header.className = 'element-box-header';
      
      // Layer name
      const nameLabel = document.createElement('div');
      nameLabel.className = 'element-box-name';
      nameLabel.textContent = layerName;
      
      // Layer info (blend mode, opacity, visibility)
      // Layer 1 doesn't show blend mode/opacity since it has nothing to blend with
      const info = document.createElement('div');
      info.style.cssText = 'display: flex; align-items: center; gap: var(--spacing-sm); font-size: var(--text-sm); color: var(--label-color); flex-shrink: 0;';
      
      if (layer.id !== 'layer-1') {
        const blendModeNames = ['Normal', 'Multiply', 'Screen', 'Overlay', 'Soft Light', 'Hard Light', 
                                'Color Dodge', 'Color Burn', 'Linear Dodge', 'Linear Burn', 'Difference', 'Exclusion'];
        const blendName = document.createElement('span');
        blendName.textContent = blendModeNames[layer.blendingMode] || 'Normal';
        
        const opacity = document.createElement('span');
        opacity.textContent = `${Math.round(layer.opacity * 100)}%`;
        
        info.appendChild(blendName);
        info.appendChild(opacity);
      }
      
      // Visibility icon (layer-1 is always visible, but show icon for consistency)
      const visibleIcon = document.createElement('span');
      visibleIcon.textContent = layer.visible ? '👁' : '🚫';
      info.appendChild(visibleIcon);
      
      // Edit button
      const editBtn = document.createElement('button');
      editBtn.textContent = 'Edit';
      editBtn.style.marginLeft = 'auto';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onLayerSelect(layer.id);
      });
      
      header.appendChild(nameLabel);
      header.appendChild(info);
      header.appendChild(editBtn);
      
      elementBox.appendChild(header);
      elementBox.addEventListener('click', () => {
        this.onLayerSelect(layer.id);
      });
      
      this.container.appendChild(elementBox);
    });
  }
}
