// Dropdown Menu Component
// Simple dropdown menu for top bar actions

export interface DropdownMenuItem {
  label: string;
  action: () => void;
  disabled?: boolean;
}

export class DropdownMenu {
  private menu: HTMLElement;
  private _isVisible: boolean = false;
  private ignoreClicksUntil: number = 0;
  
  isVisible(): boolean {
    return this._isVisible;
  }
  
  constructor() {
    this.menu = document.createElement('div');
    this.menu.className = 'menu-wrapper';
    document.body.appendChild(this.menu);
    this.setupEventListeners();
  }
  
  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private setupEventListeners(): void {
    // Remove existing listeners if any
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler);
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    
    // Close on outside click
    this.clickHandler = (e: MouseEvent) => {
      // Ignore clicks that happen soon after opening (to ignore the click that opened it)
      const now = Date.now();
      if (now < this.ignoreClicksUntil) {
        return;
      }
      if (this._isVisible && !this.menu.contains(e.target as Node)) {
        e.stopPropagation(); // Prevent canvas handlers from processing this click
        this.hide();
      }
    };
    document.addEventListener('click', this.clickHandler, true); // Use capture phase to run before canvas handlers
    
    // Close on escape
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this._isVisible) {
        this.hide();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }
  
  show(x: number, y: number, items: DropdownMenuItem[]): void {
    this.menu.innerHTML = '';
    
    items.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'menu-item';
      if (item.disabled) {
        menuItem.classList.add('is-disabled');
      }
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!item.disabled) {
          item.action();
          this.hide();
        }
      });
      this.menu.appendChild(menuItem);
    });
    
    this.menu.classList.add('is-visible');
    this._isVisible = true;
    
    // Ignore clicks for the next 300ms to prevent the click that opened this dropdown from closing it
    // This handles the case where mousedown opens the dropdown, and mouseup completes the click
    this.ignoreClicksUntil = Date.now() + 300;
    
    // Position menu: apply initial position first so getBoundingClientRect() reflects it
    const viewportPadding = 8;
    this.menu.style.setProperty('--menu-top', `${y}px`);
    this.menu.style.setProperty('--menu-left', `${x}px`);
    this.menu.style.setProperty('--menu-transform', 'none');
    void this.menu.offsetHeight; // force reflow so layout is applied
    const rect = this.menu.getBoundingClientRect();
    let menuLeft = x;
    let menuTop = y;
    
    // Vertical: prefer below anchor; flip above if not enough space below, then clamp to viewport
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 0 && spaceAbove >= rect.height) {
      menuTop = y - rect.height;
    } else if (spaceBelow < 0) {
      menuTop = Math.max(viewportPadding, window.innerHeight - rect.height - viewportPadding);
    }
    if (menuTop < viewportPadding) {
      menuTop = viewportPadding;
    }
    
    // Horizontal: keep aligned; clamp if overflowing left or right
    if (rect.right > window.innerWidth - viewportPadding) {
      menuLeft = window.innerWidth - rect.width - viewportPadding;
    }
    if (menuLeft < viewportPadding) {
      menuLeft = viewportPadding;
    }
    
    this.menu.style.setProperty('--menu-top', `${menuTop}px`);
    this.menu.style.setProperty('--menu-left', `${menuLeft}px`);
  }
  
  hide(): void {
    this.menu.classList.remove('is-visible');
    this._isVisible = false;
  }
  
  destroy(): void {
    // Remove event listeners
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    
    if (this.menu.parentNode) {
      this.menu.parentNode.removeChild(this.menu);
    }
  }
}
