import type { TimelineConfig } from '../../types';

export class TimelineScrubber {
  private container: HTMLElement;
  private onTimeChange: (time: number) => void;
  private config: TimelineConfig;
  private slider: HTMLInputElement | null = null;
  private valueDisplay: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  
  constructor(
    container: HTMLElement,
    initialConfig: TimelineConfig,
    onTimeChange: (time: number) => void
  ) {
    this.container = container;
    this.config = initialConfig;
    this.onTimeChange = onTimeChange;
    this.render();
    this.setupKeyboardShortcuts();
  }
  
  setConfig(config: TimelineConfig): void {
    this.config = config;
    this.render();
  }
  
  setTime(time: number): void {
    this.config.value = time;
    this.render();
  }
  
  getTime(): number {
    return this.config.value;
  }
  
  private setupKeyboardShortcuts(): void {
    this.keydownHandler = (e: KeyboardEvent) => {
      // Check for Alt (Windows/Linux) or Option (Mac) key
      const isAltPressed = e.altKey;
      
      if (isAltPressed) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.stepBackward();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.stepForward();
        }
      }
    };
    
    document.addEventListener('keydown', this.keydownHandler);
  }
  
  private stepBackward(): void {
    if (!this.slider || !this.valueDisplay) return;
    
    const newValue = Math.max(this.config.min, this.config.value - this.config.step);
    this.config.value = newValue;
    this.slider.value = String(newValue);
    this.valueDisplay.textContent = `${newValue.toFixed(2)}s`;
    this.onTimeChange(newValue);
  }
  
  private stepForward(): void {
    if (!this.slider || !this.valueDisplay) return;
    
    const newValue = Math.min(this.config.max, this.config.value + this.config.step);
    this.config.value = newValue;
    this.slider.value = String(newValue);
    this.valueDisplay.textContent = `${newValue.toFixed(2)}s`;
    this.onTimeChange(newValue);
  }
  
  private render(): void {
    this.container.innerHTML = '';
    
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'timeline-slider-container';
    
    // Step backward button
    const stepBackBtn = document.createElement('button');
    stepBackBtn.textContent = '◀';
    stepBackBtn.className = 'timeline-step-button';
    stepBackBtn.addEventListener('click', () => this.stepBackward());
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(this.config.min);
    slider.max = String(this.config.max);
    slider.step = String(this.config.step);
    slider.value = String(this.config.value);
    this.slider = slider;
    
    // Step forward button
    const stepForwardBtn = document.createElement('button');
    stepForwardBtn.textContent = '▶';
    stepForwardBtn.className = 'timeline-step-button';
    stepForwardBtn.addEventListener('click', () => this.stepForward());
    
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = `${this.config.value.toFixed(2)}s`;
    valueDisplay.className = 'timeline-value-display';
    this.valueDisplay = valueDisplay;
    
    // Stop propagation to prevent any parent handlers from interfering
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
      const newValue = parseFloat(slider.value);
      this.config.value = newValue;
      if (this.valueDisplay) {
        this.valueDisplay.textContent = `${newValue.toFixed(2)}s`;
      }
      this.onTimeChange(newValue);
    });
    
    sliderContainer.appendChild(stepBackBtn);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(stepForwardBtn);
    sliderContainer.appendChild(valueDisplay);
    this.container.appendChild(sliderContainer);
  }
  
  destroy(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }
}

