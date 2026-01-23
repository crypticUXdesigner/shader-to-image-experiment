// Node Context Menu Component
// Right-click menu for creating nodes

import type { NodeSpec } from '../../types/nodeSpec';
import { getCSSColor, getCSSVariable } from '../../utils/cssTokens';

export interface ContextMenuCallbacks {
  onCreateNode?: (nodeType: string, x: number, y: number) => void;
  onPaste?: (x: number, y: number) => void;
  onSelectAll?: () => void;
}

export class NodeContextMenu {
  private menu: HTMLElement;
  private searchInput: HTMLInputElement;
  private resultsContainer: HTMLElement;
  private nodeSpecs: NodeSpec[];
  private callbacks: ContextMenuCallbacks;
  private isVisible: boolean = false;
  private filteredSpecs: NodeSpec[] = [];
  private selectedIndex: number = 0;
  private canvasX: number = 0;
  private canvasY: number = 0;
  
  constructor(nodeSpecs: NodeSpec[], callbacks: ContextMenuCallbacks = {}) {
    this.nodeSpecs = nodeSpecs;
    this.callbacks = callbacks;
    
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    
    // Search input at top
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search nodes...';
    this.searchInput.className = 'context-menu-input';
    this.searchInput.addEventListener('input', () => this.filterResults());
    this.searchInput.addEventListener('keydown', (e) => this.handleInputKeyDown(e));
    this.menu.appendChild(this.searchInput);
    
    // Results container
    this.resultsContainer = document.createElement('div');
    this.resultsContainer.className = 'context-menu-results';
    this.resultsContainer.tabIndex = -1;
    this.resultsContainer.addEventListener('keydown', (e) => this.handleResultsKeyDown(e));
    this.menu.appendChild(this.resultsContainer);
    
    document.body.appendChild(this.menu);
    this.filterResults();
    this.setupEventListeners();
  }
  
  private filterResults(): void {
    const query = this.searchInput.value.toLowerCase().trim();
    this.filteredSpecs = this.nodeSpecs.filter(spec => {
      const nameMatch = spec.displayName.toLowerCase().includes(query);
      const descMatch = spec.description?.toLowerCase().includes(query) || false;
      const categoryMatch = spec.category.toLowerCase().includes(query);
      return nameMatch || descMatch || categoryMatch;
    });
    
    // Sort: exact name matches first, then by relevance
    this.filteredSpecs.sort((a, b) => {
      const aExact = a.displayName.toLowerCase() === query;
      const bExact = b.displayName.toLowerCase() === query;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
    
    // Limit to 50 results
    this.filteredSpecs = this.filteredSpecs.slice(0, 50);
    
    this.renderResults();
  }
  
  private renderResults(): void {
    this.resultsContainer.innerHTML = '';
    this.selectedIndex = 0;
    
    if (this.filteredSpecs.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No nodes found';
      noResults.className = 'context-menu-no-results';
      this.resultsContainer.appendChild(noResults);
      return;
    }
    
    const contextMenuItemPadding = getCSSVariable('context-menu-item-padding', '8px 12px');
    const contextMenuItemColor = getCSSColor('context-menu-item-color', '#e0e0e0');
    const contextMenuItemBgHover = getCSSColor('context-menu-item-bg-hover', '#3a3a3a');
    const textMd = getCSSVariable('text-md', '0.9rem');
    const textSm = getCSSVariable('text-sm', '0.85rem');
    const spacingXs = getCSSVariable('spacing-xs', '0.25rem');
    const descColor = getCSSColor('search-result-desc-color', '#999');
    
    for (let i = 0; i < this.filteredSpecs.length; i++) {
      const spec = this.filteredSpecs[i];
      const item = document.createElement('div');
      item.tabIndex = -1;
      item.className = 'context-menu-item';
      if (i === this.selectedIndex) {
        item.classList.add('is-selected');
      }
      
      const name = document.createElement('div');
      name.textContent = spec.displayName;
      name.className = 'context-menu-item-name';
      item.appendChild(name);
      
      if (spec.description) {
        const desc = document.createElement('div');
        desc.textContent = `${spec.category} - ${spec.description}`;
        desc.className = 'context-menu-item-desc';
        item.appendChild(desc);
      }
      
      item.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
      
      item.addEventListener('click', () => {
        this.createNode(spec.id);
      });
      
      item.addEventListener('keydown', (e) => {
        this.handleResultsKeyDown(e);
      });
      
      item.addEventListener('focus', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
      
      this.resultsContainer.appendChild(item);
    }
    
    // Add separator and actions
    const separator = document.createElement('div');
    separator.className = 'context-menu-separator';
    this.resultsContainer.appendChild(separator);
    
    // Paste option
    const pasteItem = document.createElement('div');
    pasteItem.tabIndex = -1;
    pasteItem.className = 'context-menu-item';
    pasteItem.textContent = 'Paste';
    pasteItem.addEventListener('click', () => {
      this.hide();
      if (this.callbacks.onPaste) {
        this.callbacks.onPaste(this.canvasX, this.canvasY);
      }
    });
    pasteItem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.hide();
        if (this.callbacks.onPaste) {
          this.callbacks.onPaste(this.canvasX, this.canvasY);
        }
      }
    });
    this.resultsContainer.appendChild(pasteItem);
    
    // Select All option
    const selectAllItem = document.createElement('div');
    selectAllItem.tabIndex = -1;
    selectAllItem.className = 'context-menu-item';
    selectAllItem.textContent = 'Select All';
    selectAllItem.addEventListener('click', () => {
      this.hide();
      this.callbacks.onSelectAll?.();
    });
    selectAllItem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.hide();
        this.callbacks.onSelectAll?.();
      }
    });
    this.resultsContainer.appendChild(selectAllItem);
    
    this.updateSelection();
  }
  
  private updateSelection(): void {
    const items = this.resultsContainer.children;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as HTMLElement;
      if (i === this.selectedIndex) {
        item.classList.add('is-selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('is-selected');
      }
    }
  }
  
  private handleInputKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.filteredSpecs.length > 0 || this.resultsContainer.children.length > 0) {
        this.selectedIndex = 0;
        this.updateSelection();
        this.resultsContainer.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.filteredSpecs.length > 0) {
        this.selectedIndex = 0;
        this.createNode(this.filteredSpecs[0].id);
      }
    }
  }
  
  private handleResultsKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.hide();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // totalItems = this.filteredSpecs.length + 2; // +2 for Paste and Select All (unused for now)
      if (this.selectedIndex < this.filteredSpecs.length) {
        this.createNode(this.filteredSpecs[this.selectedIndex].id);
      } else if (this.selectedIndex === this.filteredSpecs.length) {
        // Paste
        this.hide();
        if (this.callbacks.onPaste) {
          this.callbacks.onPaste(this.canvasX, this.canvasY);
        }
      } else if (this.selectedIndex === this.filteredSpecs.length + 1) {
        // Select All
        this.hide();
        this.callbacks.onSelectAll?.();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const totalItems = this.filteredSpecs.length + 2;
      if (this.selectedIndex < totalItems - 1) {
        this.selectedIndex = this.selectedIndex + 1;
        this.updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.selectedIndex > 0) {
        this.selectedIndex = this.selectedIndex - 1;
        this.updateSelection();
      } else {
        // Go back to input field
        this.searchInput.focus();
        this.searchInput.select();
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing should go back to input
      this.searchInput.focus();
      this.searchInput.value += e.key;
      this.filterResults();
    }
  }
  
  private createNode(nodeType: string): void {
    this.hide();
    if (this.callbacks.onCreateNode) {
      this.callbacks.onCreateNode(nodeType, this.canvasX, this.canvasY);
    }
  }
  
  private setupEventListeners(): void {
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (this.isVisible && !this.menu.contains(e.target as Node)) {
        this.hide();
      }
    });
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }
  
  show(x: number, y: number, canvasX: number, canvasY: number, center: boolean = false): void {
    this.canvasX = canvasX;
    this.canvasY = canvasY;
    this.menu.classList.add('is-visible');
    this.isVisible = true;
    this.selectedIndex = 0;
    
    if (center) {
      // Center the menu
      this.menu.style.top = '50%';
      this.menu.style.left = '50%';
      this.menu.style.transform = 'translate(-50%, -50%)';
    } else {
      // Position at click location
      this.menu.style.top = `${y}px`;
      this.menu.style.left = `${x}px`;
      this.menu.style.transform = 'none';
      
      // Ensure menu stays within viewport
      const rect = this.menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        this.menu.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        this.menu.style.top = `${y - rect.height}px`;
      }
    }
    
    // Reset search and focus
    this.searchInput.value = '';
    this.filterResults();
    this.searchInput.focus();
  }
  
  hide(): void {
    this.menu.classList.remove('is-visible');
    this.isVisible = false;
  }
  
  destroy(): void {
    document.body.removeChild(this.menu);
  }
}
