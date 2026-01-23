// Node Editor Layout Component
// Implements split-screen layout with collapsible shader preview

import { createIconElement } from '../../utils/icons';
import { getCSSColor, getCSSVariable } from '../../utils/cssTokens';

export type PreviewState = 'expanded' | 'collapsed';

export interface LayoutState {
  previewState: PreviewState;
  dividerPosition: number; // 0.0 to 1.0 (percentage of viewport width)
  cornerWidgetSize: { width: number; height: number };
  cornerWidgetPosition: { x: number; y: number };
}

export class NodeEditorLayout {
  private container: HTMLElement;
  private nodeEditorContainer!: HTMLElement;
  private previewContainer!: HTMLElement;
  private divider!: HTMLElement;
  private saveAsDefaultBtn!: HTMLElement;
  private copyPresetBtn!: HTMLElement;
  private exportBtn!: HTMLElement;
  private presetSelect!: HTMLSelectElement;
  private state: LayoutState;
  
  private isDraggingDivider: boolean = false;
  private isDraggingCornerWidget: boolean = false;
  private isResizingCornerWidget: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private dragStartWidgetX: number = 0;
  private dragStartWidgetY: number = 0;
  private resizeStartWidth: number = 0;
  private resizeStartHeight: number = 0;
  private resizeObserver: ResizeObserver | null = null;
  
  // Track which corner the widget is snapped to (null if not snapped)
  // Format: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null
  private snappedCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | null = null;
  
  // Edge snapping configuration
  private readonly SNAP_DISTANCE = 20; // pixels
  private readonly SAFE_DISTANCE = 16; // pixels from edges
  private readonly BUTTON_HIDE_DELAY = 2000; // milliseconds before hiding button when collapsed
  
  private onSaveAsDefault?: () => Promise<void> | void;
  private onCopyPreset?: () => Promise<void> | void;
  private onExport?: () => Promise<void> | void;
  private onLoadPreset?: (presetName: string) => Promise<void> | void;
  private onGlobalAudioPlayToggle?: () => void;
  private onGlobalAudioTimeChange?: (time: number) => void;
  private getGlobalAudioState?: () => { isPlaying: boolean; currentTime: number; duration: number } | null;
  private buttonHideTimeout: number | null = null;
  private globalPlayButton!: HTMLElement;
  private globalTimeSlider!: HTMLInputElement;
  private globalTimeDisplay!: HTMLElement;
  private audioUpdateInterval: number | null = null;
  private isDraggingTimeSlider: boolean = false;
  
  constructor(container: HTMLElement) {
    this.container = container;
    
    // Initialize corner widget position to top-right
    const initialWidth = 320;
    const initialHeight = 240;
    const containerRect = container.getBoundingClientRect();
    const initialX = containerRect.width - initialWidth - this.SAFE_DISTANCE;
    const initialY = this.SAFE_DISTANCE; // Top-right corner
    
    // Initialize as snapped to top-right corner
    this.snappedCorner = 'top-right';
    
    this.state = {
      previewState: 'collapsed',
      dividerPosition: 0.5,
      cornerWidgetSize: { width: initialWidth, height: initialHeight },
      cornerWidgetPosition: { x: initialX, y: initialY }
    };
    
    this.createLayout();
    this.setupEventListeners();
    this.setupPreviewResizeObserver();
    this.updateLayout();
  }
  
  private setupPreviewResizeObserver(): void {
    // Watch the preview container and canvas for size changes
    // This ensures the WebGL viewport updates when the preview expands/collapses
    const triggerResize = () => {
      // Use requestAnimationFrame to ensure layout has settled
      requestAnimationFrame(() => {
        // Trigger window resize event so Renderer's setupViewport is called
        // This updates the canvas internal dimensions and WebGL viewport
        window.dispatchEvent(new Event('resize'));
      });
    };
    
    this.resizeObserver = new ResizeObserver(triggerResize);
    this.resizeObserver.observe(this.previewContainer);
    
    // Also observe the canvas directly if it exists
    const canvas = this.previewContainer.querySelector('canvas');
    if (canvas) {
      this.resizeObserver.observe(canvas);
    }
    
    // Watch for canvas being added later (e.g., when preview container is populated)
    const canvasObserver = new MutationObserver(() => {
      const canvas = this.previewContainer.querySelector('canvas');
      if (canvas && this.resizeObserver) {
        this.resizeObserver.observe(canvas);
      }
    });
    canvasObserver.observe(this.previewContainer, { childList: true, subtree: true });
  }
  
  /**
   * Set callback for save as default button
   * Callback should return a promise that resolves on success or rejects on error
   */
  setSaveAsDefaultCallback(callback: () => Promise<void> | void): void {
    this.onSaveAsDefault = async () => {
      try {
        await callback();
        this.showToast('State saved as default!', 'success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to save default state';
        this.showToast(errorMessage, 'error');
        console.error('Failed to save default state:', error);
      }
    };
  }
  
  /**
   * Set callback for copy preset button
   */
  setCopyPresetCallback(callback: () => Promise<void> | void): void {
    if (!callback) {
      console.error('[NodeEditorLayout] setCopyPresetCallback called with null/undefined callback');
      return;
    }
    this.onCopyPreset = async () => {
      try {
        await callback();
        this.showToast('Graph copied to clipboard!', 'success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to copy graph';
        this.showToast(errorMessage, 'error');
        console.error('Failed to copy graph:', error);
      }
    };
  }
  
  /**
   * Set callback for export button
   */
  setExportCallback(callback: () => Promise<void> | void): void {
    this.onExport = async () => {
      try {
        await callback();
        this.showToast('Image exported successfully!', 'success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to export image';
        this.showToast(errorMessage, 'error');
        console.error('Failed to export image:', error);
      }
    };
  }
  
  /**
   * Set callbacks for global audio controls
   */
  setGlobalAudioCallbacks(callbacks: {
    onPlayToggle?: () => void;
    onTimeChange?: (time: number) => void;
    getState?: () => { isPlaying: boolean; currentTime: number; duration: number } | null;
  }): void {
    this.onGlobalAudioPlayToggle = callbacks.onPlayToggle;
    this.onGlobalAudioTimeChange = callbacks.onTimeChange;
    this.getGlobalAudioState = callbacks.getState;
    
    // Start updating UI if we have a state getter
    if (this.getGlobalAudioState) {
      this.startAudioUIUpdates();
    }
  }
  
  /**
   * Start periodic updates for audio UI
   */
  private startAudioUIUpdates(): void {
    if (this.audioUpdateInterval) {
      clearInterval(this.audioUpdateInterval);
    }
    
    this.audioUpdateInterval = window.setInterval(() => {
      if (this.getGlobalAudioState) {
        const state = this.getGlobalAudioState();
        if (state) {
          this.updatePlayButtonIcon(state.isPlaying);
          this.updateTimeDisplay(state.currentTime, state.duration);
          this.updateTimeSlider(state.currentTime, state.duration);
        } else {
          // No audio loaded
          this.updatePlayButtonIcon(false);
          this.globalTimeDisplay.textContent = '0:00 / 0:00';
          this.globalTimeSlider.value = '0';
          this.globalTimeSlider.max = '100';
        }
      }
    }, 100); // Update every 100ms
  }
  
  /**
   * Update play button icon
   */
  private updatePlayButtonIcon(isPlaying: boolean): void {
    this.globalPlayButton.innerHTML = '';
    const iconName = isPlaying ? 'pause' : 'play';
    const iconColor = getCSSColor('layout-button-color', '#e0e0e0');
    const icon = createIconElement(iconName, 16, iconColor);
    this.globalPlayButton.appendChild(icon);
  }
  
  /**
   * Update time display
   */
  private updateTimeDisplay(currentTime: number, duration: number): void {
    const formatTime = (seconds: number): string => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    this.globalTimeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
  }
  
  /**
   * Update time slider
   */
  private updateTimeSlider(currentTime: number, duration: number): void {
    // Don't update slider while user is dragging
    if (this.isDraggingTimeSlider) {
      return;
    }
    
    if (duration > 0) {
      const percent = (currentTime / duration) * 100;
      this.globalTimeSlider.value = percent.toString();
      this.globalTimeSlider.max = '100';
    } else {
      this.globalTimeSlider.value = '0';
      this.globalTimeSlider.max = '100';
    }
  }

  /**
   * Set callback for preset selection
   */
  setLoadPresetCallback(callback: (presetName: string) => Promise<void> | void): void {
    this.onLoadPreset = async (presetName: string) => {
      try {
        await callback(presetName);
        this.showToast(`Loaded preset: ${presetName}`, 'success');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load preset';
        this.showToast(errorMessage, 'error');
        console.error('Failed to load preset:', error);
      }
    };
  }
  
  /**
   * Update the preset select dropdown with available presets
   */
  async updatePresetList(presets: Array<{ name: string; displayName: string }>): Promise<void> {
    // Clear existing options except the first "Select preset..." option
    while (this.presetSelect.options.length > 1) {
      this.presetSelect.remove(1);
    }
    
    // Add preset options
    for (const preset of presets) {
      const option = document.createElement('option');
      option.value = preset.name;
      option.textContent = preset.displayName;
      this.presetSelect.appendChild(option);
    }
  }
  
  /**
   * Show a toast notification
   */
  private showToast(message: string, type: 'success' | 'error'): void {
    // Remove existing toast if any
    const existingToast = document.body.querySelector('.toast-notification');
    if (existingToast) {
      existingToast.remove();
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast-notification is-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.classList.add('is-visible');
      });
    });
    
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 300);
    }, 3000);
  }
  
  private createLayout(): void {
    // Create button container for top-left controls
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'layout-button-container';
    this.container.appendChild(buttonContainer);
    
    // Save as default button
    this.saveAsDefaultBtn = document.createElement('button');
    this.saveAsDefaultBtn.textContent = 'Save as Default';
    this.saveAsDefaultBtn.title = 'Save current state as the new starting point';
    this.saveAsDefaultBtn.className = 'layout-button';
    this.saveAsDefaultBtn.addEventListener('click', async () => {
      if (this.onSaveAsDefault) {
        await this.onSaveAsDefault();
      }
    });
    buttonContainer.appendChild(this.saveAsDefaultBtn);
    
    // Copy preset button
    this.copyPresetBtn = document.createElement('button');
    (this.copyPresetBtn as HTMLButtonElement).type = 'button';
    this.copyPresetBtn.textContent = 'Copy Preset';
    this.copyPresetBtn.title = 'Copy current graph as JSON to clipboard';
    this.copyPresetBtn.className = 'layout-button';
    this.copyPresetBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onCopyPreset) {
        await this.onCopyPreset();
      } else {
        console.warn('[NodeEditorLayout] Copy preset callback not set yet. Please wait for initialization to complete.');
        this.showToast('Copy preset not ready yet. Please try again.', 'error');
      }
    });
    buttonContainer.appendChild(this.copyPresetBtn);
    
    // Export button
    this.exportBtn = document.createElement('button');
    (this.exportBtn as HTMLButtonElement).type = 'button';
    this.exportBtn.textContent = 'Export Image';
    this.exportBtn.title = 'Export current shader as image';
    this.exportBtn.className = 'layout-button';
    this.exportBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onExport) {
        await this.onExport();
      } else {
        console.warn('[NodeEditorLayout] Export callback not set yet.');
        this.showToast('Export not ready yet. Please try again.', 'error');
      }
    });
    buttonContainer.appendChild(this.exportBtn);
    
    // Preset select dropdown
    this.presetSelect = document.createElement('select');
    this.presetSelect.title = 'Load a preset';
    this.presetSelect.className = 'layout-select';
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select preset...';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    this.presetSelect.appendChild(defaultOption);
    this.presetSelect.addEventListener('change', async (e) => {
      const target = e.target as HTMLSelectElement;
      const presetName = target.value;
      if (presetName && this.onLoadPreset) {
        await this.onLoadPreset(presetName);
        // Reset selection to default
        target.selectedIndex = 0;
      }
    });
    buttonContainer.appendChild(this.presetSelect);
    
    // Global audio controls container
    const audioControlsContainer = document.createElement('div');
    audioControlsContainer.className = 'layout-audio-controls';
    audioControlsContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 16px;
    `;
    
    // Global play/pause button
    this.globalPlayButton = document.createElement('button');
    this.globalPlayButton.className = 'layout-button layout-audio-play-button';
    this.globalPlayButton.title = 'Play/Pause all audio';
    this.globalPlayButton.style.cssText = `
      width: 32px;
      height: 32px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    this.updatePlayButtonIcon(false);
    this.globalPlayButton.addEventListener('click', () => {
      this.onGlobalAudioPlayToggle?.();
    });
    audioControlsContainer.appendChild(this.globalPlayButton);
    
    // Time display
    this.globalTimeDisplay = document.createElement('div');
    this.globalTimeDisplay.className = 'layout-audio-time';
    this.globalTimeDisplay.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      color: ${getCSSColor('layout-button-color', '#e0e0e0')};
      min-width: 80px;
      text-align: right;
    `;
    this.globalTimeDisplay.textContent = '0:00 / 0:00';
    audioControlsContainer.appendChild(this.globalTimeDisplay);
    
    // Time scrubber slider
    this.globalTimeSlider = document.createElement('input');
    this.globalTimeSlider.type = 'range';
    this.globalTimeSlider.min = '0';
    this.globalTimeSlider.max = '100';
    this.globalTimeSlider.value = '0';
    this.globalTimeSlider.className = 'layout-audio-slider';
    this.globalTimeSlider.style.cssText = `
      flex: 1;
      min-width: 200px;
      max-width: 400px;
    `;
    this.globalTimeSlider.addEventListener('mousedown', () => {
      this.isDraggingTimeSlider = true;
    });
    this.globalTimeSlider.addEventListener('mouseup', () => {
      this.isDraggingTimeSlider = false;
    });
    this.globalTimeSlider.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const percent = parseFloat(target.value);
      if (this.getGlobalAudioState) {
        const state = this.getGlobalAudioState();
        if (state) {
          const time = (percent / 100) * state.duration;
          this.onGlobalAudioTimeChange?.(time);
        }
      }
    });
    audioControlsContainer.appendChild(this.globalTimeSlider);
    
    buttonContainer.appendChild(audioControlsContainer);
    
    // Node editor container (left)
    this.nodeEditorContainer = document.createElement('div');
    this.nodeEditorContainer.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      overflow: hidden;
    `;
    this.container.appendChild(this.nodeEditorContainer);
    
    // Divider
    this.divider = document.createElement('div');
    const dividerBg = getCSSColor('layout-divider-bg', '#3a3a3a');
    const dividerWidth = getCSSVariable('layout-divider-width', '4px');
    this.divider.style.cssText = `
      position: absolute;
      top: 0;
      height: 100%;
      width: ${dividerWidth};
      background: ${dividerBg};
      cursor: col-resize;
      z-index: 10;
      user-select: none;
    `;
    this.container.appendChild(this.divider);
    
    // Preview container (right)
    this.previewContainer = document.createElement('div');
    const previewBg = getCSSColor('layout-preview-bg', '#1a1a1a');
    this.previewContainer.style.cssText = `
      position: absolute;
      top: 0;
      height: 100%;
      overflow: hidden;
      background: ${previewBg};
    `;
    this.container.appendChild(this.previewContainer);
    
    // Expand/Collapse button
    const toggleButton = document.createElement('button');
    toggleButton.className = 'layout-toggle-button';
    toggleButton.addEventListener('click', () => this.togglePreview());
    this.previewContainer.appendChild(toggleButton);
    
    // Store reference to button for icon updates
    (this.previewContainer as any)._toggleButton = toggleButton;
    this.updateToggleButtonIcon();
    
    // Setup hover listeners for auto-hide/show when collapsed
    this.setupButtonAutoHide();
  }
  
  private setupEventListeners(): void {
    // Divider drag
    this.divider.addEventListener('mousedown', (e) => {
      this.isDraggingDivider = true;
      this.dragStartX = e.clientX;
      document.addEventListener('mousemove', this.handleDividerDrag);
      document.addEventListener('mouseup', this.handleDividerDragEnd);
      e.preventDefault();
    });
    
    // Window resize
    window.addEventListener('resize', () => {
      this.updateLayout();
    });
  }
  
  private setupButtonAutoHide(): void {
    // Show button on hover when collapsed
    this.previewContainer.addEventListener('mouseenter', () => {
      if (this.state.previewState === 'collapsed') {
        this.showToggleButton();
      }
    });
    
    // Start hide timer when mouse leaves (only when collapsed)
    this.previewContainer.addEventListener('mouseleave', () => {
      if (this.state.previewState === 'collapsed') {
        this.scheduleButtonHide();
      }
    });
  }
  
  private showToggleButton(): void {
    const toggleButton = (this.previewContainer as any)._toggleButton;
    if (!toggleButton) return;
    
    // Clear any pending hide timeout
    this.clearButtonHideTimeout();
    
    // Show button
    toggleButton.classList.remove('is-hidden');
  }
  
  private hideToggleButton(): void {
    const toggleButton = (this.previewContainer as any)._toggleButton;
    if (!toggleButton) return;
    
    // Hide button
    toggleButton.classList.add('is-hidden');
  }
  
  private scheduleButtonHide(): void {
    this.clearButtonHideTimeout();
    
    this.buttonHideTimeout = window.setTimeout(() => {
      if (this.state.previewState === 'collapsed') {
        this.hideToggleButton();
      }
      this.buttonHideTimeout = null;
    }, this.BUTTON_HIDE_DELAY);
  }
  
  private clearButtonHideTimeout(): void {
    if (this.buttonHideTimeout !== null) {
      clearTimeout(this.buttonHideTimeout);
      this.buttonHideTimeout = null;
    }
  }
  
  private handleDividerDrag = (e: MouseEvent): void => {
    if (!this.isDraggingDivider) return;
    
    const containerRect = this.container.getBoundingClientRect();
    const newPosition = (e.clientX - containerRect.left) / containerRect.width;
    this.state.dividerPosition = Math.max(0.2, Math.min(0.8, newPosition));
    this.updateLayout();
  };
  
  private handleDividerDragEnd = (): void => {
    this.isDraggingDivider = false;
    document.removeEventListener('mousemove', this.handleDividerDrag);
    document.removeEventListener('mouseup', this.handleDividerDragEnd);
  };
  
  private togglePreview(): void {
    const wasExpanded = this.state.previewState === 'expanded';
    this.state.previewState = wasExpanded ? 'collapsed' : 'expanded';
    
    // If transitioning to collapsed, initialize position if not set
    if (wasExpanded && this.state.previewState === 'collapsed') {
      const containerRect = this.container.getBoundingClientRect();
      const widgetWidth = this.state.cornerWidgetSize.width;
      
      // Only initialize if position is at origin (0,0) or invalid
      if (this.state.cornerWidgetPosition.x === 0 && this.state.cornerWidgetPosition.y === 0) {
        this.state.cornerWidgetPosition.x = containerRect.width - widgetWidth - this.SAFE_DISTANCE;
        this.state.cornerWidgetPosition.y = this.SAFE_DISTANCE; // Top-right corner
        this.snappedCorner = 'top-right';
      } else {
        // Check if the current position is at a corner and update snappedCorner
        const safeDist = this.SAFE_DISTANCE;
        const widgetHeight = this.state.cornerWidgetSize.height;
        const x = this.state.cornerWidgetPosition.x;
        const y = this.state.cornerWidgetPosition.y;
        const maxX = containerRect.width - widgetWidth - safeDist;
        const maxY = containerRect.height - widgetHeight - safeDist;
        
        // Check if at a corner
        if (Math.abs(x - safeDist) < this.SNAP_DISTANCE && Math.abs(y - safeDist) < this.SNAP_DISTANCE) {
          this.snappedCorner = 'top-left';
        } else if (Math.abs(x - maxX) < this.SNAP_DISTANCE && Math.abs(y - safeDist) < this.SNAP_DISTANCE) {
          this.snappedCorner = 'top-right';
        } else if (Math.abs(x - safeDist) < this.SNAP_DISTANCE && Math.abs(y - maxY) < this.SNAP_DISTANCE) {
          this.snappedCorner = 'bottom-left';
        } else if (Math.abs(x - maxX) < this.SNAP_DISTANCE && Math.abs(y - maxY) < this.SNAP_DISTANCE) {
          this.snappedCorner = 'bottom-right';
        } else {
          this.snappedCorner = null;
        }
      }
    }
    
    this.updateToggleButtonIcon();
    this.updateLayout();
  }
  
  private updateLayout(): void {
    const containerRect = this.container.getBoundingClientRect();
    const width = containerRect.width;
    const height = containerRect.height;
    
    // Update toggle button icon
    this.updateToggleButtonIcon();
    
    // Handle button visibility
    if (this.state.previewState === 'expanded') {
      // Always show when expanded
      this.clearButtonHideTimeout();
      this.showToggleButton();
    } else {
      // When collapsed, show initially then schedule hide
      this.showToggleButton();
      this.scheduleButtonHide();
    }
    
    if (this.state.previewState === 'expanded') {
      // Split-screen mode
      const leftWidth = width * this.state.dividerPosition;
      const rightWidth = width * (1 - this.state.dividerPosition);
      
      this.nodeEditorContainer.style.width = `${leftWidth}px`;
      this.nodeEditorContainer.style.display = 'block';
      
      this.divider.style.left = `${leftWidth}px`;
      this.divider.style.top = `0px`;
      this.divider.style.height = `100%`;
      this.divider.style.display = 'block';
      
      this.previewContainer.style.left = `${leftWidth + 4}px`;
      this.previewContainer.style.top = `0px`;
      this.previewContainer.style.width = `${rightWidth - 4}px`;
      this.previewContainer.style.height = `100%`;
      this.previewContainer.style.display = 'block';
      this.previewContainer.style.position = 'absolute';
      this.previewContainer.style.border = 'none';
      this.previewContainer.style.borderRadius = '0';
      this.previewContainer.style.cursor = 'default';
      
      // Remove resize handles when expanded
      const existingHandles = this.previewContainer.querySelectorAll('.resize-handle');
      existingHandles.forEach(h => h.remove());
    } else {
      // Collapsed mode (corner widget)
      this.nodeEditorContainer.style.width = '100%';
      this.nodeEditorContainer.style.display = 'block';
      
      this.divider.style.display = 'none';
      
      // Position corner widget - maintain relative position when snapped
      const widgetWidth = this.state.cornerWidgetSize.width;
      const widgetHeight = this.state.cornerWidgetSize.height;
      let widgetX = this.state.cornerWidgetPosition.x;
      let widgetY = this.state.cornerWidgetPosition.y;
      
      // If snapped to a corner, recalculate position based on that corner
      if (this.snappedCorner) {
        const maxX = width - widgetWidth - this.SAFE_DISTANCE;
        const maxY = height - widgetHeight - this.SAFE_DISTANCE;
        
        switch (this.snappedCorner) {
          case 'top-left':
            widgetX = this.SAFE_DISTANCE;
            widgetY = this.SAFE_DISTANCE;
            break;
          case 'top-right':
            widgetX = maxX;
            widgetY = this.SAFE_DISTANCE;
            break;
          case 'bottom-left':
            widgetX = this.SAFE_DISTANCE;
            widgetY = maxY;
            break;
          case 'bottom-right':
            widgetX = maxX;
            widgetY = maxY;
            break;
        }
      } else {
        // Not snapped - constrain position to viewport with safe distance
        const maxX = width - widgetWidth - this.SAFE_DISTANCE;
        const maxY = height - widgetHeight - this.SAFE_DISTANCE;
        widgetX = Math.max(this.SAFE_DISTANCE, Math.min(maxX, widgetX));
        widgetY = Math.max(this.SAFE_DISTANCE, Math.min(maxY, widgetY));
      }
      
      // Update state with constrained position
      this.state.cornerWidgetPosition.x = widgetX;
      this.state.cornerWidgetPosition.y = widgetY;
      
      this.previewContainer.style.left = `${widgetX}px`;
      this.previewContainer.style.top = `${widgetY}px`;
      this.previewContainer.style.width = `${widgetWidth}px`;
      this.previewContainer.style.height = `${widgetHeight}px`;
      this.previewContainer.style.display = 'block';
      this.previewContainer.style.position = 'fixed';
      const previewBorder = getCSSVariable('layout-preview-border', '1px solid #3a3a3a');
      const buttonRadius = getCSSVariable('button-radius', '4px');
      this.previewContainer.style.border = previewBorder;
      this.previewContainer.style.borderRadius = buttonRadius;
      this.previewContainer.style.zIndex = '50';
      this.previewContainer.style.cursor = 'move';
      
      // Add resize handles and drag functionality
      this.addResizeHandles();
      this.setupCornerWidgetDrag();
    }
  }
  
  private updateToggleButtonIcon(): void {
    const toggleButton = (this.previewContainer as any)._toggleButton;
    if (!toggleButton) return;
    
    // Clear existing icon
    toggleButton.innerHTML = '';
    
    // Show expand icon when collapsed, minimize icon when expanded
    const iconName = this.state.previewState === 'collapsed' ? 'maximize-2' : 'minimize-2';
    const iconColor = getCSSColor('layout-button-color', '#e0e0e0');
    const icon = createIconElement(iconName, 18, iconColor);
    toggleButton.appendChild(icon);
  }
  
  private addResizeHandles(): void {
    // Remove existing handles
    const existingHandles = this.previewContainer.querySelectorAll('.resize-handle');
    existingHandles.forEach(h => h.remove());
    
    // Only corner handles: [position, cursor, resize direction]
    const handleConfigs: Array<{
      position: { top?: string; bottom?: string; left?: string; right?: string };
      cursor: string;
      resizeX: number; // -1: left, 0: none, 1: right
      resizeY: number; // -1: top, 0: none, 1: bottom
    }> = [
      // Top-left
      { position: { top: '0', left: '0' }, cursor: 'nwse-resize', resizeX: -1, resizeY: -1 },
      // Top-right
      { position: { top: '0', right: '0' }, cursor: 'nesw-resize', resizeX: 1, resizeY: -1 },
      // Bottom-left
      { position: { bottom: '0', left: '0' }, cursor: 'nesw-resize', resizeX: -1, resizeY: 1 },
      // Bottom-right
      { position: { bottom: '0', right: '0' }, cursor: 'nwse-resize', resizeX: 1, resizeY: 1 },
    ];
    
    handleConfigs.forEach((config) => {
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      
      const size = '16px';
      
      let style = `
        position: absolute;
        cursor: ${config.cursor};
        z-index: 10;
        width: ${size};
        height: ${size};
        background: transparent;
      `;
      
      // Position styles
      Object.entries(config.position).forEach(([key, value]) => {
        style += `${key}: ${value}; `;
      });
      
      handle.style.cssText = style;
      
      handle.addEventListener('mousedown', (e) => {
        this.isResizingCornerWidget = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.resizeStartWidth = this.state.cornerWidgetSize.width;
        this.resizeStartHeight = this.state.cornerWidgetSize.height;
        
        // Store resize direction
        (this as any)._resizeX = config.resizeX;
        (this as any)._resizeY = config.resizeY;
        (this as any)._resizeStartX = this.state.cornerWidgetPosition.x;
        (this as any)._resizeStartY = this.state.cornerWidgetPosition.y;
        
        document.addEventListener('mousemove', this.handleCornerWidgetResize);
        document.addEventListener('mouseup', this.handleCornerWidgetResizeEnd);
        e.preventDefault();
        e.stopPropagation();
      });
      
      this.previewContainer.appendChild(handle);
    });
  }
  
  private setupCornerWidgetDrag(): void {
    // Remove existing drag listeners by cloning the node (removes all event listeners)
    // But we need to preserve children, so we'll use a different approach
    // Instead, we'll check if listener already exists and use a flag
    
    // Add drag functionality to preview container
    // Use a single listener that checks the target
    const handleMouseDown = (e: MouseEvent) => {
      // Don't start drag if clicking on resize handle or close button
      const target = e.target as HTMLElement;
      if (target.closest('.resize-handle') || target.closest('button')) {
        return;
      }
      
      this.isDraggingCornerWidget = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragStartWidgetX = this.state.cornerWidgetPosition.x;
      this.dragStartWidgetY = this.state.cornerWidgetPosition.y;
      document.addEventListener('mousemove', this.handleCornerWidgetDrag);
      document.addEventListener('mouseup', this.handleCornerWidgetDragEnd);
      e.preventDefault();
    };
    
    // Remove old listener if it exists (we'll track it)
    if ((this.previewContainer as any)._dragHandler) {
      this.previewContainer.removeEventListener('mousedown', (this.previewContainer as any)._dragHandler);
    }
    (this.previewContainer as any)._dragHandler = handleMouseDown;
    this.previewContainer.addEventListener('mousedown', handleMouseDown);
  }
  
  private handleCornerWidgetDrag = (e: MouseEvent): void => {
    if (!this.isDraggingCornerWidget) return;
    
    const containerRect = this.container.getBoundingClientRect();
    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;
    
    let newX = this.dragStartWidgetX + deltaX;
    let newY = this.dragStartWidgetY + deltaY;
    
    // Check if we're moving away from a snapped corner
    // If moved more than snap distance, clear the snap
    if (this.snappedCorner) {
      const safeDist = this.SAFE_DISTANCE;
      const snapDist = this.SNAP_DISTANCE;
      const widgetWidth = this.state.cornerWidgetSize.width;
      const widgetHeight = this.state.cornerWidgetSize.height;
      
      let expectedX = 0;
      let expectedY = 0;
      
      switch (this.snappedCorner) {
        case 'top-left':
          expectedX = safeDist;
          expectedY = safeDist;
          break;
        case 'top-right':
          expectedX = containerRect.width - widgetWidth - safeDist;
          expectedY = safeDist;
          break;
        case 'bottom-left':
          expectedX = safeDist;
          expectedY = containerRect.height - widgetHeight - safeDist;
          break;
        case 'bottom-right':
          expectedX = containerRect.width - widgetWidth - safeDist;
          expectedY = containerRect.height - widgetHeight - safeDist;
          break;
      }
      
      // If moved away from snapped position, clear the snap
      if (Math.abs(newX - expectedX) > snapDist || Math.abs(newY - expectedY) > snapDist) {
        this.snappedCorner = null;
      }
    }
    
    // Apply edge snapping with safe distance
    const snapped = this.snapToEdges(
      newX,
      newY,
      this.state.cornerWidgetSize.width,
      this.state.cornerWidgetSize.height,
      containerRect.width,
      containerRect.height
    );
    
    this.state.cornerWidgetPosition.x = snapped.x;
    this.state.cornerWidgetPosition.y = snapped.y;
    
    this.updateLayout();
  };
  
  private handleCornerWidgetDragEnd = (): void => {
    this.isDraggingCornerWidget = false;
    document.removeEventListener('mousemove', this.handleCornerWidgetDrag);
    document.removeEventListener('mouseup', this.handleCornerWidgetDragEnd);
  };
  
  private handleCornerWidgetResize = (e: MouseEvent): void => {
    if (!this.isResizingCornerWidget) return;
    
    const containerRect = this.container.getBoundingClientRect();
    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;
    
    const resizeX = (this as any)._resizeX as number;
    const resizeY = (this as any)._resizeY as number;
    const resizeStartX = (this as any)._resizeStartX as number;
    const resizeStartY = (this as any)._resizeStartY as number;
    
    const minWidth = 160;
    const minHeight = 120;
    const maxWidth = containerRect.width * 0.5;
    const maxHeight = containerRect.height * 0.5;
    
    // Calculate new dimensions based on resize direction
    let newWidth = this.resizeStartWidth;
    let newHeight = this.resizeStartHeight;
    let newX = resizeStartX;
    let newY = resizeStartY;
    
    if (resizeX === 1) {
      // Resizing from right
      newWidth = Math.max(minWidth, Math.min(maxWidth, this.resizeStartWidth + deltaX));
    } else if (resizeX === -1) {
      // Resizing from left
      const widthDelta = -deltaX;
      const proposedWidth = this.resizeStartWidth + widthDelta;
      if (proposedWidth >= minWidth) {
        newWidth = Math.min(maxWidth, proposedWidth);
        newX = resizeStartX + deltaX;
      }
    }
    
    if (resizeY === 1) {
      // Resizing from bottom
      newHeight = Math.max(minHeight, Math.min(maxHeight, this.resizeStartHeight + deltaY));
    } else if (resizeY === -1) {
      // Resizing from top
      const heightDelta = -deltaY;
      const proposedHeight = this.resizeStartHeight + heightDelta;
      if (proposedHeight >= minHeight) {
        newHeight = Math.min(maxHeight, proposedHeight);
        newY = resizeStartY + deltaY;
      }
    }
    
    // Constrain position and size to viewport bounds
    const minX = this.SAFE_DISTANCE;
    const maxX = containerRect.width - newWidth - this.SAFE_DISTANCE;
    const minY = this.SAFE_DISTANCE;
    const maxY = containerRect.height - newHeight - this.SAFE_DISTANCE;
    
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));
    
    // Adjust width/height if position was constrained
    if (resizeX === -1 && newX === minX) {
      newWidth = containerRect.width - newX - this.SAFE_DISTANCE;
    } else if (resizeX === -1 && newX === maxX) {
      newWidth = this.resizeStartWidth;
      newX = resizeStartX;
    }
    
    if (resizeY === -1 && newY === minY) {
      newHeight = containerRect.height - newY - this.SAFE_DISTANCE;
    } else if (resizeY === -1 && newY === maxY) {
      newHeight = this.resizeStartHeight;
      newY = resizeStartY;
    }
    
    // Final size constraints
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
    newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
    
    this.state.cornerWidgetSize.width = newWidth;
    this.state.cornerWidgetSize.height = newHeight;
    this.state.cornerWidgetPosition.x = newX;
    this.state.cornerWidgetPosition.y = newY;
    
    // After resize, snap position to edges if needed
    // Note: During resize, we want to maintain the corner snap if it exists
    // So we check if we're still at a corner position
    const snapped = this.snapToEdges(
      newX,
      newY,
      newWidth,
      newHeight,
      containerRect.width,
      containerRect.height
    );
    this.state.cornerWidgetPosition.x = snapped.x;
    this.state.cornerWidgetPosition.y = snapped.y;
    
    this.updateLayout();
  };
  
  private handleCornerWidgetResizeEnd = (): void => {
    this.isResizingCornerWidget = false;
    (this as any)._resizeX = undefined;
    (this as any)._resizeY = undefined;
    (this as any)._resizeStartX = undefined;
    (this as any)._resizeStartY = undefined;
    document.removeEventListener('mousemove', this.handleCornerWidgetResize);
    document.removeEventListener('mouseup', this.handleCornerWidgetResizeEnd);
  };
  
  /**
   * Snap widget position to edges with safe distance
   * Returns the snapped position and updates the snappedCorner tracking
   */
  private snapToEdges(
    x: number,
    y: number,
    width: number,
    height: number,
    viewportWidth: number,
    viewportHeight: number
  ): { x: number; y: number } {
    const safeDist = this.SAFE_DISTANCE;
    const snapDist = this.SNAP_DISTANCE;
    
    // Calculate distances to each edge
    const distToLeft = x - safeDist;
    const distToRight = (viewportWidth - safeDist) - (x + width);
    const distToTop = y - safeDist;
    const distToBottom = (viewportHeight - safeDist) - (y + height);
    
    let snappedX = x;
    let snappedY = y;
    let snappedToLeft = false;
    let snappedToRight = false;
    let snappedToTop = false;
    let snappedToBottom = false;
    
    // Snap to left edge
    if (Math.abs(distToLeft) < snapDist) {
      snappedX = safeDist;
      snappedToLeft = true;
    }
    // Snap to right edge
    else if (Math.abs(distToRight) < snapDist) {
      snappedX = viewportWidth - width - safeDist;
      snappedToRight = true;
    }
    
    // Snap to top edge
    if (Math.abs(distToTop) < snapDist) {
      snappedY = safeDist;
      snappedToTop = true;
    }
    // Snap to bottom edge
    else if (Math.abs(distToBottom) < snapDist) {
      snappedY = viewportHeight - height - safeDist;
      snappedToBottom = true;
    }
    
    // Update snapped corner tracking
    if (snappedToTop && snappedToLeft) {
      this.snappedCorner = 'top-left';
    } else if (snappedToTop && snappedToRight) {
      this.snappedCorner = 'top-right';
    } else if (snappedToBottom && snappedToLeft) {
      this.snappedCorner = 'bottom-left';
    } else if (snappedToBottom && snappedToRight) {
      this.snappedCorner = 'bottom-right';
    } else {
      // Not snapped to a corner (might be snapped to one edge only, or not snapped at all)
      this.snappedCorner = null;
    }
    
    // Constrain to viewport bounds
    const minX = safeDist;
    const maxX = viewportWidth - width - safeDist;
    const minY = safeDist;
    const maxY = viewportHeight - height - safeDist;
    
    snappedX = Math.max(minX, Math.min(maxX, snappedX));
    snappedY = Math.max(minY, Math.min(maxY, snappedY));
    
    return { x: snappedX, y: snappedY };
  }
  
  // Public API
  getNodeEditorContainer(): HTMLElement {
    return this.nodeEditorContainer;
  }
  
  getPreviewContainer(): HTMLElement {
    return this.previewContainer;
  }
  
  setPreviewState(state: PreviewState): void {
    this.state.previewState = state;
    this.updateLayout();
  }
  
  getState(): LayoutState {
    return { ...this.state };
  }
}
