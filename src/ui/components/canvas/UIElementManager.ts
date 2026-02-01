/**
 * UIElementManager
 * 
 * Manages UI elements overlaying the canvas (input fields, dropdowns, frequency bands editor, color picker).
 */
import { getCSSVariableAsNumber } from '../../../utils/cssTokens';
import { DropdownMenu, type DropdownMenuItem } from '../DropdownMenu';
import { FrequencyBandsEditor } from '../FrequencyBandsEditor';
import { ColorPickerPopover, type OKLCHTriple } from '../ColorPickerPopover';

export interface UIElementContext {
  getCanvas: () => HTMLCanvasElement;
  getZoom: () => number;
  getPanZoom: () => { panX: number; panY: number; zoom: number };
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  canvasToScreen: (canvasX: number, canvasY: number) => { x: number; y: number };
}

export class UIElementManager {
  private parameterInputElement: HTMLInputElement | null = null;
  private labelInputElement: HTMLInputElement | null = null;
  private labelInputBackdropElement: HTMLElement | null = null;
  private enumDropdown: DropdownMenu | null = null;
  private frequencyBandsEditor: FrequencyBandsEditor | null = null;
  private colorPickerPopover: ColorPickerPopover | null = null;
  private context?: UIElementContext;

  /**
   * Set the context for UI element management
   */
  setContext(context: UIElementContext): void {
    this.context = context;
  }

  /**
   * Create and show parameter input field
   */
  showParameterInput(
    _nodeId: string,
    _paramName: string,
    value: number,
    position: { x: number; y: number },
    size: { width: number; height: number },
    onCommit: (value: number) => void,
    onCancel: () => void
  ): void {
    if (!this.context) return;

    // Remove existing input if any
    this.hideParameterInput();

    // const canvas = this.context.getCanvas(); // Unused but kept for potential future use
    const zoom = this.context.getZoom();
    const screenPos = this.context.canvasToScreen(position.x, position.y);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
    input.className = 'input primary parameter-value-overlay';
    input.style.position = 'absolute';
    input.style.left = `${screenPos.x}px`;
    input.style.top = `${screenPos.y}px`;
    const w = Math.max(size.width * zoom, 140);
    const h = size.height * zoom;
    input.style.width = `${w}px`;
    input.style.height = `${h}px`;
    input.style.fontSize = `${getCSSVariableAsNumber('input-value-font-size', 18) * zoom}px`;
    input.style.boxSizing = 'border-box';
    input.style.zIndex = '1000';
    input.style.outline = 'none';

    const handleCommit = () => {
      const numValue = parseFloat(input.value);
      if (!isNaN(numValue)) {
        onCommit(numValue);
      } else {
        onCancel();
      }
      this.hideParameterInput();
    };

    const handleCancel = () => {
      onCancel();
      this.hideParameterInput();
    };

    input.addEventListener('blur', handleCommit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    });

    document.body.appendChild(input);
    input.focus();
    input.select();
    this.parameterInputElement = input;
  }

  /**
   * Hide parameter input field
   */
  hideParameterInput(): void {
    if (this.parameterInputElement) {
      this.parameterInputElement.remove();
      this.parameterInputElement = null;
    }
  }

  /**
   * Check if parameter input is active
   */
  isParameterInputActive(): boolean {
    return this.parameterInputElement !== null;
  }

  /**
   * Create and show label input field
   */
  showLabelInput(
    _nodeId: string,
    label: string | undefined,
    _position: { x: number; y: number },
    size: { width: number; height: number },
    onCommit: (label: string | undefined) => void,
    onCancel: () => void
  ): void {
    if (!this.context) return;

    // Remove existing input if any
    this.hideLabelInput();

    const zoom = this.context.getZoom();
    const canvas = this.context.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = label || '';
    input.className = 'input primary lg label-edit-overlay';
    input.style.left = `${centerX}px`;
    input.style.top = `${centerY}px`;
    input.style.minWidth = `${Math.max(size.width * zoom, 120)}px`;

    const handleCommit = () => {
      const newLabel = input.value.trim() || undefined;
      onCommit(newLabel);
      this.hideLabelInput();
    };

    const handleCancel = () => {
      onCancel();
      this.hideLabelInput();
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'label-edit-overlay-backdrop';
    backdrop.addEventListener('click', handleCommit);

    input.addEventListener('blur', handleCommit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleCommit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(input);
    input.focus();
    input.select();
    this.labelInputBackdropElement = backdrop;
    this.labelInputElement = input;
  }

  /**
   * Hide label input field
   */
  hideLabelInput(): void {
    if (this.labelInputBackdropElement) {
      this.labelInputBackdropElement.remove();
      this.labelInputBackdropElement = null;
    }
    if (this.labelInputElement) {
      this.labelInputElement.remove();
      this.labelInputElement = null;
    }
  }

  /**
   * Check if label input is active
   */
  isLabelInputActive(): boolean {
    return this.labelInputElement !== null;
  }

  /**
   * Show enum dropdown menu
   */
  showEnumDropdown(
    screenX: number,
    screenY: number,
    items: DropdownMenuItem[],
    onSelect: (value: string) => void
  ): void {
    if (!this.context) return;

    if (!this.enumDropdown) {
      this.enumDropdown = new DropdownMenu();
    }

    if (this.enumDropdown.isVisible()) {
      this.enumDropdown.hide();
    }

    // Wrap items to call onSelect with the label value
    const wrappedItems: DropdownMenuItem[] = items.map(item => ({
      ...item,
      action: () => {
        item.action();
        // Extract value from label (assuming label is the value string)
        onSelect(item.label);
        this.enumDropdown?.hide();
      }
    }));

    this.enumDropdown.show(screenX, screenY, wrappedItems);
  }

  /**
   * Hide enum dropdown
   */
  hideEnumDropdown(): void {
    if (this.enumDropdown && this.enumDropdown.isVisible()) {
      this.enumDropdown.hide();
    }
  }

  /**
   * Check if enum dropdown is visible
   */
  isEnumDropdownVisible(): boolean {
    return this.enumDropdown?.isVisible() ?? false;
  }

  /**
   * Show frequency bands editor
   */
  showFrequencyBandsEditor(
    bandsArray: number[][],
    onCommit: (bands: number[][]) => void,
    onCancel: () => void
  ): void {
    if (!this.context) return;

    if (!this.frequencyBandsEditor) {
      this.frequencyBandsEditor = new FrequencyBandsEditor({
        onApply: (bands) => {
          // Convert FrequencyBand[] to number[][]
          const bandsArray = bands.map(band => [band.minHz, band.maxHz]);
          onCommit(bandsArray);
          this.frequencyBandsEditor?.hide();
        },
        onCancel: () => {
          onCancel();
          this.frequencyBandsEditor?.hide();
        }
      });
    }

    this.frequencyBandsEditor.show(bandsArray);
  }

  /**
   * Hide frequency bands editor
   */
  hideFrequencyBandsEditor(): void {
    if (this.frequencyBandsEditor && this.frequencyBandsEditor.isVisible()) {
      this.frequencyBandsEditor.hide();
    }
  }

  /**
   * Check if frequency bands editor is visible
   */
  isFrequencyBandsEditorVisible(): boolean {
    return this.frequencyBandsEditor?.isVisible() ?? false;
  }

  /**
   * Show color picker popover (OKLCH, HSV-style UI)
   */
  showColorPicker(
    nodeId: string,
    initial: OKLCHTriple,
    screenX: number,
    screenY: number,
    onApply: (l: number, c: number, h: number) => void
  ): void {
    if (!this.colorPickerPopover) {
      this.colorPickerPopover = new ColorPickerPopover({});
    }
    this.colorPickerPopover.show(nodeId, initial, screenX, screenY, onApply);
  }

  /**
   * Hide color picker popover
   */
  hideColorPicker(): void {
    if (this.colorPickerPopover?.isVisible()) {
      this.colorPickerPopover.close();
    }
  }

  /**
   * Check if color picker is visible
   */
  isColorPickerVisible(): boolean {
    return this.colorPickerPopover?.isVisible() ?? false;
  }

  /**
   * Check if any UI element is active
   */
  isAnyUIActive(): boolean {
    return (
      this.isParameterInputActive() ||
      this.isLabelInputActive() ||
      this.isEnumDropdownVisible() ||
      this.isFrequencyBandsEditorVisible() ||
      this.isColorPickerVisible()
    );
  }

  /**
   * Hide all UI elements
   */
  hideAll(): void {
    this.hideParameterInput();
    this.hideLabelInput();
    this.hideEnumDropdown();
    this.hideFrequencyBandsEditor();
    this.hideColorPicker();
  }

  /**
   * Cleanup all UI elements
   */
  dispose(): void {
    this.hideAll();
    this.context = undefined;
  }
}
