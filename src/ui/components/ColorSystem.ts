import type { ColorConfig, OKLCHColor, CubicBezier, ColorMode } from '../../types';

interface HSVColor {
  h: number; // Hue (0-360)
  s: number; // Saturation (0-1)
  v: number; // Value/Brightness (0-1)
}

export class ColorSystem {
  private container: HTMLElement;
  private onColorChange: (config: ColorConfig) => void;
  private config: ColorConfig;
  private collapsedSections: Set<string> = new Set();
  private startColorPickerContainer: HTMLElement | null = null;
  private endColorPickerContainer: HTMLElement | null = null;
  
  constructor(
    container: HTMLElement,
    initialConfig: ColorConfig,
    onColorChange: (config: ColorConfig) => void
  ) {
    this.container = container;
    this.config = initialConfig;
    this.onColorChange = onColorChange;
    this.render();
  }
  
  setConfig(config: ColorConfig): void {
    this.config = config;
    // Update HSV picker values directly if they exist and are still in the DOM
    if (this.startColorPickerContainer && this.endColorPickerContainer && 
        this.container.contains(this.startColorPickerContainer) && 
        this.container.contains(this.endColorPickerContainer)) {
      // Update HSV picker values directly without full re-render
      this.updateHsvPicker(this.startColorPickerContainer, config.startColor);
      this.updateHsvPicker(this.endColorPickerContainer, config.endColor);
      // Also update mode selector if it exists
      const modeSelector = this.container.querySelector('.color-system-mode-selector select') as HTMLSelectElement;
      if (modeSelector) {
        modeSelector.value = config.mode;
      }
    } else {
      // Reset references if they're stale
      this.startColorPickerContainer = null;
      this.endColorPickerContainer = null;
      // Full re-render if pickers don't exist yet or are stale
      this.render();
    }
  }
  
  getConfig(): ColorConfig {
    return this.config;
  }
  
  private createCollapsibleSection(
    id: string,
    title: string,
    contentCallback: (contentDiv: HTMLElement) => void
  ): HTMLElement {
    const section = document.createElement('div');
    section.className = 'element-box';
    
    const isCollapsed = this.collapsedSections.has(id);
    
    // Header
    const header = document.createElement('div');
    header.className = 'element-box-header';
    header.style.cursor = 'pointer';
    
    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.className = 'element-box-name';
    
    const toggle = document.createElement('span');
    toggle.textContent = isCollapsed ? '▶' : '▼';
    toggle.className = 'toggle';
    toggle.style.marginLeft = 'auto';
    
    header.appendChild(titleEl);
    header.appendChild(toggle);
    
    header.addEventListener('click', () => {
      if (this.collapsedSections.has(id)) {
        this.collapsedSections.delete(id);
      } else {
        this.collapsedSections.add(id);
      }
      this.render();
    });
    
    section.appendChild(header);
    
    // Content
    if (!isCollapsed) {
      const contentDiv = document.createElement('div');
      contentDiv.style.padding = `0 var(--spacing-md) var(--spacing-md) var(--spacing-md)`;
      contentCallback(contentDiv);
      section.appendChild(contentDiv);
    }
    
    return section;
  }
  
  private render(): void {
    this.container.innerHTML = '';
    // Reset color picker references since we're re-rendering
    this.startColorPickerContainer = null;
    this.endColorPickerContainer = null;
    
    // Colors section
    const colorsSection = this.createCollapsibleSection('colors', 'Colors', (contentDiv) => {
      // Color pickers container (side by side)
      const colorPickersContainer = document.createElement('div');
      colorPickersContainer.className = 'color-picker-container';
      
      // Start color
      const startColorDiv = this.createColorPicker('Start Color', this.config.startColor, (color) => {
        this.config.startColor = color;
        this.onColorChange(this.config);
        // Color picker value is already correct (set by user input), no need to update
      });
      colorPickersContainer.appendChild(startColorDiv);
      
      // End color
      const endColorDiv = this.createColorPicker('End Color', this.config.endColor, (color) => {
        this.config.endColor = color;
        this.onColorChange(this.config);
        // Color picker value is already correct (set by user input), no need to update
      });
      colorPickersContainer.appendChild(endColorDiv);
      
      contentDiv.appendChild(colorPickersContainer);
      
      // Color control buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'color-system-button-container';
      
      const swapButton = document.createElement('button');
      swapButton.textContent = 'Swap Colors';
      swapButton.className = 'color-system-button';
      swapButton.addEventListener('click', () => {
        const temp = this.config.startColor;
        this.config.startColor = this.config.endColor;
        this.config.endColor = temp;
        this.onColorChange(this.config);
        this.render();
      });
      
      const invertHueButton = document.createElement('button');
      invertHueButton.textContent = 'Invert Hue Direction';
      invertHueButton.className = 'color-system-button';
      invertHueButton.addEventListener('click', () => {
        // Invert hue direction by swapping only the hue values
        // This reverses the interpolation path while keeping L and C the same
        const tempH = this.config.startColor.h;
        this.config.startColor.h = this.config.endColor.h;
        this.config.endColor.h = tempH;
        this.onColorChange(this.config);
        this.render();
      });
      
      buttonContainer.appendChild(swapButton);
      buttonContainer.appendChild(invertHueButton);
      contentDiv.appendChild(buttonContainer);
    });
    this.container.appendChild(colorsSection);
    
    // Color Mode section
    const colorModeSection = this.createCollapsibleSection('color-mode', 'Color Mode', (contentDiv) => {
      // Color mode selector
      const modeDiv = this.createModeSelector();
      contentDiv.appendChild(modeDiv);
      
      // Threshold mode controls (including bayer dithering)
      if (this.config.mode === 'thresholds') {
        const transitionWidth = this.config.transitionWidth ?? 0.005;
        const transitionWidthDiv = this.createSliderControl('Transition Width', transitionWidth, 0.001, 0.1, 0.001, (value) => {
          this.config.transitionWidth = value;
          this.onColorChange(this.config);
        });
        contentDiv.appendChild(transitionWidthDiv);
        
        // Bayer dithering controls
        const ditherStrength = this.config.ditherStrength ?? 0.0;
        const ditherStrengthDiv = this.createSliderControl('Dither Strength', ditherStrength, 0.0, 10.0, 0.1, (value) => {
          this.config.ditherStrength = value;
          this.onColorChange(this.config);
        });
        contentDiv.appendChild(ditherStrengthDiv);
        
        const pixelSize = this.config.pixelSize ?? 1.0;
        const pixelSizeDiv = this.createSliderControl('Pixel Size', pixelSize, 0.1, 10.0, 0.5, (value) => {
          this.config.pixelSize = value;
          this.onColorChange(this.config);
        });
        contentDiv.appendChild(pixelSizeDiv);
      }
    });
    this.container.appendChild(colorModeSection);
    
    // Curves section
    const curvesSection = this.createCollapsibleSection('curves', 'Curves', (contentDiv) => {
      // Stops (keep as number input)
      const stopsDiv = this.createNumberInput('Stops', this.config.stops, 1, 50, 1, (value) => {
        this.config.stops = value;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(stopsDiv);
      
      // Bezier curves
      const lCurveDiv = this.createBezierInput('L Curve', this.config.lCurve, (curve) => {
        this.config.lCurve = curve;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(lCurveDiv);
      
      const cCurveDiv = this.createBezierInput('C Curve', this.config.cCurve, (curve) => {
        this.config.cCurve = curve;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(cCurveDiv);
      
      const hCurveDiv = this.createBezierInput('H Curve', this.config.hCurve, (curve) => {
        this.config.hCurve = curve;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(hCurveDiv);
    });
    this.container.appendChild(curvesSection);
    
    // Tone Mapping section
    const toneMappingSection = this.createCollapsibleSection('tone-mapping', 'Tone Mapping', (contentDiv) => {
      const toneMapping = this.config.toneMapping ?? { exposure: 1.0, contrast: 1.0, saturation: 1.0 };
      
      const exposureDiv = this.createSliderControl('Exposure', toneMapping.exposure ?? 1.0, 0.0, 3.0, 0.01, (value) => {
        if (!this.config.toneMapping) {
          this.config.toneMapping = { exposure: 1.0, contrast: 1.0, saturation: 1.0 };
        }
        this.config.toneMapping.exposure = value;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(exposureDiv);
      
      const contrastDiv = this.createSliderControl('Contrast', toneMapping.contrast ?? 1.0, 0.0, 2.0, 0.01, (value) => {
        if (!this.config.toneMapping) {
          this.config.toneMapping = { exposure: 1.0, contrast: 1.0, saturation: 1.0 };
        }
        this.config.toneMapping.contrast = value;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(contrastDiv);
      
      const saturationDiv = this.createSliderControl('Saturation', toneMapping.saturation ?? 1.0, 0.0, 2.0, 0.01, (value) => {
        if (!this.config.toneMapping) {
          this.config.toneMapping = { exposure: 1.0, contrast: 1.0, saturation: 1.0 };
        }
        this.config.toneMapping.saturation = value;
        this.onColorChange(this.config);
      });
      contentDiv.appendChild(saturationDiv);
    });
    this.container.appendChild(toneMappingSection);
  }
  
  private createColorPicker(label: string, color: OKLCHColor, onChange: (color: OKLCHColor) => void): HTMLElement {
    const div = document.createElement('div');
    div.className = 'color-picker-item';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'color-picker-label';
    
    const pickerContainer = document.createElement('div');
    pickerContainer.className = 'hsv-picker-container';
    
    // Convert OKLCH to HSV
    const initialHsv = this.oklchToHsv(color);
    
    // Color preview
    const preview = document.createElement('div');
    preview.className = 'hsv-picker-preview';
    const rgb = this.oklchToRgb(color);
    preview.style.backgroundColor = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    
    // HSV controls - store references to sliders
    const controls = document.createElement('div');
    controls.className = 'hsv-picker-controls';
    
    // Function to read all slider values and update color
    const updateColorFromSliders = () => {
      const sliders = controls.querySelectorAll('.hsv-slider') as NodeListOf<HTMLInputElement>;
      if (sliders.length >= 3) {
        const h = parseFloat(sliders[0].value);
        const s = parseFloat(sliders[1].value);
        const v = parseFloat(sliders[2].value);
        const hsv: HSVColor = { h, s, v };
        const oklch = this.hsvToOklch(hsv);
        onChange(oklch);
        this.updatePreview(preview, oklch);
      }
    };
    
    // Hue slider (0-360)
    const hueControl = this.createHsvControl('H', initialHsv.h, 0, 360, 1, (_value) => {
      updateColorFromSliders();
    });
    controls.appendChild(hueControl);
    
    // Saturation slider (0-1)
    const satControl = this.createHsvControl('S', initialHsv.s, 0, 1, 0.01, (_value) => {
      updateColorFromSliders();
    });
    controls.appendChild(satControl);
    
    // Value slider (0-1)
    const valControl = this.createHsvControl('V', initialHsv.v, 0, 1, 0.01, (_value) => {
      updateColorFromSliders();
    });
    controls.appendChild(valControl);
    
    pickerContainer.appendChild(preview);
    pickerContainer.appendChild(controls);
    
    // Store reference for start/end color pickers
    if (label === 'Start Color') {
      this.startColorPickerContainer = pickerContainer;
    } else if (label === 'End Color') {
      this.endColorPickerContainer = pickerContainer;
    }
    
    div.appendChild(labelEl);
    div.appendChild(pickerContainer);
    
    return div;
  }
  
  private createHsvControl(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
    const control = document.createElement('div');
    control.className = 'hsv-control';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'hsv-control-label';
    
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'hsv-slider-container';
    
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.className = 'hsv-slider';
    
    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'hsv-value-display';
    valueDisplay.textContent = label === 'H' ? Math.round(value).toString() : value.toFixed(2);
    
    slider.addEventListener('input', () => {
      const newValue = parseFloat(slider.value);
      valueDisplay.textContent = label === 'H' ? Math.round(newValue).toString() : newValue.toFixed(2);
      onChange(newValue);
    });
    
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(valueDisplay);
    
    control.appendChild(labelEl);
    control.appendChild(sliderContainer);
    
    return control;
  }
  
  private updateHsvPicker(container: HTMLElement, color: OKLCHColor): void {
    const hsv = this.oklchToHsv(color);
    const preview = container.querySelector('.hsv-picker-preview') as HTMLElement;
    const sliders = container.querySelectorAll('.hsv-slider') as NodeListOf<HTMLInputElement>;
    const displays = container.querySelectorAll('.hsv-value-display') as NodeListOf<HTMLElement>;
    
    if (preview) {
      const rgb = this.oklchToRgb(color);
      preview.style.backgroundColor = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
    }
    
    if (sliders.length >= 3 && displays.length >= 3) {
      sliders[0].value = String(hsv.h);
      sliders[1].value = String(hsv.s);
      sliders[2].value = String(hsv.v);
      displays[0].textContent = Math.round(hsv.h).toString();
      displays[1].textContent = hsv.s.toFixed(2);
      displays[2].textContent = hsv.v.toFixed(2);
    }
  }
  
  private updatePreview(preview: HTMLElement, color: OKLCHColor): void {
    const rgb = this.oklchToRgb(color);
    preview.style.backgroundColor = `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
  }
  
  // HSV conversion functions
  private rgbToHsv(r: number, g: number, b: number): HSVColor {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let h = 0;
    if (delta !== 0) {
      if (max === r) {
        h = ((g - b) / delta) % 6;
      } else if (max === g) {
        h = (b - r) / delta + 2;
      } else {
        h = (r - g) / delta + 4;
      }
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    
    return { h, s, v };
  }
  
  private hsvToRgb(hsv: HSVColor): [number, number, number] {
    const h = hsv.h / 60;
    const s = hsv.s;
    const v = hsv.v;
    
    const c = v * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = v - c;
    
    let r = 0, g = 0, b = 0;
    
    if (h >= 0 && h < 1) {
      r = c; g = x; b = 0;
    } else if (h >= 1 && h < 2) {
      r = x; g = c; b = 0;
    } else if (h >= 2 && h < 3) {
      r = 0; g = c; b = x;
    } else if (h >= 3 && h < 4) {
      r = 0; g = x; b = c;
    } else if (h >= 4 && h < 5) {
      r = x; g = 0; b = c;
    } else if (h >= 5 && h < 6) {
      r = c; g = 0; b = x;
    }
    
    return [r + m, g + m, b + m];
  }
  
  private oklchToHsv(oklch: OKLCHColor): HSVColor {
    const rgb = this.oklchToRgb(oklch);
    return this.rgbToHsv(rgb[0], rgb[1], rgb[2]);
  }
  
  private hsvToOklch(hsv: HSVColor): OKLCHColor {
    const rgb = this.hsvToRgb(hsv);
    return this.rgbToOklch(rgb[0], rgb[1], rgb[2]);
  }
  
  // Removed unused hexToRgb and rgbToHex methods
  
  // Convert OKLCH to RGB (matching shader exactly)
  private oklchToRgb(oklch: OKLCHColor): [number, number, number] {
    const l = oklch.l;
    const c = oklch.c;
    const h = (oklch.h * Math.PI) / 180.0;
    
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    
    // OKLab to linear RGB (matching shader exactly)
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
    
    const l3 = l_ * l_ * l_;
    const m3 = m_ * m_ * m_;
    const s3 = s_ * s_ * s_;
    
    const rLinear = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const gLinear = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bLinear = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
    
    // Clamp and convert to sRGB for display
    const rClamped = Math.max(0, Math.min(1, rLinear));
    const gClamped = Math.max(0, Math.min(1, gLinear));
    const bClamped = Math.max(0, Math.min(1, bLinear));
    
    // Linear RGB to sRGB (gamma correction)
    const toSRGB = (c: number) => {
      if (c <= 0.0031308) {
        return 12.92 * c;
      }
      return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
    };
    
    return [
      toSRGB(rClamped),
      toSRGB(gClamped),
      toSRGB(bClamped)
    ];
  }
  
  // Convert RGB to OKLCH (inverse of shader's conversion)
  private rgbToOklch(r: number, g: number, b: number): OKLCHColor {
    // sRGB to linear RGB
    const toLinear = (c: number) => {
      if (c <= 0.04045) {
        return c / 12.92;
      }
      return Math.pow((c + 0.055) / 1.055, 2.4);
    };
    
    const rLinear = toLinear(r);
    const gLinear = toLinear(g);
    const bLinear = toLinear(b);
    
    // Linear RGB to LMS^3 (inverse of shader's matrix)
    // Using the exact inverse of the 3x3 matrix from the shader
    const l3 = 0.4122214708 * rLinear + 0.5363325363 * gLinear + 0.0514459929 * bLinear;
    const m3 = 0.2119034982 * rLinear + 0.6806995451 * gLinear + 0.1073969566 * bLinear;
    const s3 = 0.0883024619 * rLinear + 0.2817188376 * gLinear + 0.6299787005 * bLinear;
    
    // Cube root to get LMS
    const l_lms = Math.cbrt(Math.max(0, l3));
    const m_lms = Math.cbrt(Math.max(0, m3));
    const s_lms = Math.cbrt(Math.max(0, s3));
    
    // LMS to OKLab (exact inverse of shader's OKLab to LMS)
    // Shader: l_ = l + 0.3963377774*a + 0.2158037573*b
    //         m_ = l - 0.1055613458*a - 0.0638541728*b
    //         s_ = l - 0.0894841775*a - 1.2914855480*b
    //
    // Solving for l, a, b (exact inverse):
    const dm = l_lms - m_lms;
    const ds = l_lms - s_lms;
    const a = 2.4275059514000854 * dm - 0.44967140361345986 * ds;
    const b_ = -0.7827238128415106 * dm + 0.8086907364688929 * ds;
    const l = l_lms - 0.3963377774 * a - 0.2158037573 * b_;
    
    // OKLab to OKLCH
    const c = Math.sqrt(a * a + b_ * b_);
    let h = Math.atan2(b_, a) * (180.0 / Math.PI);
    if (h < 0) h += 360;
    
    return {
      l: Math.max(0, Math.min(1, l)),
      c: Math.max(0, Math.min(1, c)),
      h: h
    };
  }
  
  private createBezierInput(label: string, curve: CubicBezier, onChange: (curve: CubicBezier) => void): HTMLElement {
    const div = document.createElement('div');
    div.className = 'bezier-input';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'bezier-input-label';
    
    const inputs = document.createElement('div');
    inputs.className = 'bezier-input-grid';
    
    const createInput = (value: number, index: keyof CubicBezier) => {
      return this.createNumberInput(index, value, 0, 1, 0.01, (val) => {
        onChange({ ...curve, [index]: val });
      });
    };
    
    inputs.appendChild(createInput(curve.x1, 'x1'));
    inputs.appendChild(createInput(curve.y1, 'y1'));
    inputs.appendChild(createInput(curve.x2, 'x2'));
    inputs.appendChild(createInput(curve.y2, 'y2'));
    
    div.appendChild(labelEl);
    div.appendChild(inputs);
    
    return div;
  }
  
  private createModeSelector(): HTMLElement {
    const div = document.createElement('div');
    div.className = 'color-system-mode-selector';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = 'Color Mode';
    labelEl.className = 'label';
    
    const select = document.createElement('select');
    
    const bezierOption = document.createElement('option');
    bezierOption.value = 'bezier';
    bezierOption.textContent = 'Bezier (Per-Pixel Evaluation)';
    select.appendChild(bezierOption);
    
    const thresholdsOption = document.createElement('option');
    thresholdsOption.value = 'thresholds';
    thresholdsOption.textContent = 'Thresholds (Reference Style)';
    select.appendChild(thresholdsOption);
    
    // Set the value after options are added
    select.value = this.config.mode;
    
    select.addEventListener('change', () => {
      this.config.mode = select.value as ColorMode;
      this.onColorChange(this.config);
      this.render();
    });
    
    div.appendChild(labelEl);
    div.appendChild(select);
    
    return div;
  }
  
  private createSliderControl(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
    const div = document.createElement('div');
    div.className = 'param-control';
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'param-label';
    
    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';
    
    // Snap initial value to step
    let initialValue = value;
    if (step) {
      initialValue = Math.round(value / step) * step;
      initialValue = Math.max(initialValue, min);
      initialValue = Math.min(initialValue, max);
    }
    
    // Format number based on step size
    const formatValue = (val: number): string => {
      const stepStr = String(step);
      const decimalPlaces = stepStr.includes('.') ? stepStr.split('.')[1].length : 0;
      const displayPlaces = Math.min(decimalPlaces, 3);
      return val.toFixed(displayPlaces);
    };
    
    // Slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(initialValue);
    slider.className = 'param-slider';
    
    // Value display
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = formatValue(initialValue);
    valueDisplay.className = 'param-value-display';
    
    // Step back button
    const stepBackBtn = document.createElement('button');
    stepBackBtn.textContent = '◀';
    stepBackBtn.className = 'step-button';
    stepBackBtn.addEventListener('click', () => {
      let newValue = parseFloat(slider.value) - step;
      newValue = Math.max(newValue, min);
      newValue = Math.min(newValue, max);
      // Snap to step
      newValue = Math.round(newValue / step) * step;
      slider.value = String(newValue);
      valueDisplay.textContent = formatValue(newValue);
      onChange(newValue);
    });
    
    // Step forward button
    const stepForwardBtn = document.createElement('button');
    stepForwardBtn.textContent = '▶';
    stepForwardBtn.className = 'step-button';
    stepForwardBtn.addEventListener('click', () => {
      let newValue = parseFloat(slider.value) + step;
      newValue = Math.max(newValue, min);
      newValue = Math.min(newValue, max);
      // Snap to step
      newValue = Math.round(newValue / step) * step;
      slider.value = String(newValue);
      valueDisplay.textContent = formatValue(newValue);
      onChange(newValue);
    });
    
    // Update value if it was snapped
    if (initialValue !== value) {
      onChange(initialValue);
    }
    
    // Stop propagation to prevent parent handlers from interfering
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
      let newValue = parseFloat(slider.value);
      // Snap to step
      newValue = Math.round(newValue / step) * step;
      // Clamp to min/max
      newValue = Math.max(newValue, min);
      newValue = Math.min(newValue, max);
      // Update slider value to snapped value
      slider.value = String(newValue);
      valueDisplay.textContent = formatValue(newValue);
      onChange(newValue);
    });
    
    slider.addEventListener('change', () => {
      let newValue = parseFloat(slider.value);
      // Snap to step
      newValue = Math.round(newValue / step) * step;
      // Clamp to min/max
      newValue = Math.max(newValue, min);
      newValue = Math.min(newValue, max);
      // Update slider value to snapped value
      slider.value = String(newValue);
      valueDisplay.textContent = formatValue(newValue);
      onChange(newValue);
    });
    
    sliderContainer.appendChild(stepBackBtn);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(stepForwardBtn);
    sliderContainer.appendChild(valueDisplay);
    
    div.appendChild(labelEl);
    div.appendChild(sliderContainer);
    
    return div;
  }
  
  private createNumberInput(label: string, value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLElement {
    const div = document.createElement('div');
    
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'label';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        onChange(val);
      }
    });
    
    div.appendChild(labelEl);
    div.appendChild(input);
    
    return div;
  }
}
