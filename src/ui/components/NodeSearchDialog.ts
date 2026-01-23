// Node Search Dialog Component
// Search dialog for creating nodes

import type { NodeSpec } from '../../types/nodeSpec';

export interface SearchDialogCallbacks {
  onCreateNode?: (nodeType: string, canvasX: number, canvasY: number) => void;
}

interface GroupedNodeSpec {
  category: string;
  nodes: NodeSpec[];
}

export class NodeSearchDialog {
  private dialog: HTMLElement;
  private overlay: HTMLElement;
  private input: HTMLInputElement;
  private filterTags: HTMLElement;
  private results: HTMLElement;
  private nodeSpecs: NodeSpec[];
  private callbacks: SearchDialogCallbacks;
  private selectedIndex: number = 0;
  private filteredSpecs: NodeSpec[] = [];
  private groupedSpecs: GroupedNodeSpec[] = [];
  private selectedCategory: string | null = null;
  private selectedTypes: Set<string> = new Set();
  private canvasX: number = 0;
  private canvasY: number = 0;
  
  // Get all unique categories and types
  private allCategories: string[] = [];
  private allTypes: string[] = [];
  
  // Category order: workflow-based (Inputs → Content Creation → Processing → Output)
  private static readonly CATEGORY_ORDER: string[] = [
    'Inputs',      // Start here - data sources
    'Patterns',     // Create patterns and noise
    'Shapes',      // Create shapes and geometry
    'Math',        // Mathematical operations
    'Utilities',   // Helper operations
    'Distort',     // Transform and distort
    'Blend',       // Combine and blend
    'Mask',        // Masking and control
    'Effects',     // Post-processing effects
    'Output'       // Final output
  ];
  
  /**
   * Sort categories with custom order: Inputs first, Output last, rest by workflow
   */
  private sortCategories(categories: string[]): string[] {
    return categories.sort((a, b) => {
      const aIndex = NodeSearchDialog.CATEGORY_ORDER.indexOf(a);
      const bIndex = NodeSearchDialog.CATEGORY_ORDER.indexOf(b);
      
      // If both are in the order list, use their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the list, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in the list, sort alphabetically
      return a.localeCompare(b);
    });
  }
  
  constructor(nodeSpecs: NodeSpec[], callbacks: SearchDialogCallbacks = {}) {
    this.nodeSpecs = nodeSpecs;
    this.callbacks = callbacks;
    
    // Extract unique categories and types
    const categorySet = new Set<string>();
    const typeSet = new Set<string>();
    for (const spec of nodeSpecs) {
      categorySet.add(spec.category);
      // Extract types from inputs and outputs
      for (const input of spec.inputs) {
        typeSet.add(input.type);
      }
      for (const output of spec.outputs) {
        typeSet.add(output.type);
      }
    }
    // Sort categories with workflow-based order
    this.allCategories = this.sortCategories(Array.from(categorySet));
    this.allTypes = Array.from(typeSet).sort();
    
    // Debug: log node count
    console.log(`[NodeSearchDialog] Initialized with ${nodeSpecs.length} node specs`);
    
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'search-dialog-overlay';
    
    // Create dialog
    this.dialog = document.createElement('div');
    this.dialog.className = 'search-dialog';
    
    // Search input (at the top)
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Search nodes...';
    this.input.className = 'search-dialog-input';
    this.input.addEventListener('input', () => this.filterResults());
    this.input.addEventListener('keydown', (e) => this.handleInputKeyDown(e));
    this.dialog.appendChild(this.input);
    
    // Filter tags container
    this.filterTags = document.createElement('div');
    this.filterTags.className = 'search-dialog-filter-tags';
    this.renderFilterTags();
    this.dialog.appendChild(this.filterTags);
    
    // Results container
    this.results = document.createElement('div');
    this.results.tabIndex = -1; // Make focusable for keyboard navigation
    this.results.className = 'search-dialog-results';
    this.results.addEventListener('keydown', (e) => {
      this.handleResultsKeyDown(e);
    });
    this.dialog.appendChild(this.results);
    
    this.overlay.appendChild(this.dialog);
    document.body.appendChild(this.overlay);
    
    this.filterResults();
    this.setupEventListeners();
  }
  
  private renderFilterTags(): void {
    this.filterTags.innerHTML = '';
    
    // Category tags
    const categoryContainer = document.createElement('div');
    categoryContainer.className = 'filter-tag-container';
    
    for (const category of this.allCategories) {
      const tag = document.createElement('button');
      tag.textContent = category;
      tag.className = 'filter-tag';
      tag.setAttribute('data-category', category);
      const isSelected = this.selectedCategory === category;
      if (isSelected) {
        tag.classList.add('is-selected');
      }
      
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        this.selectedCategory = isSelected ? null : category;
        this.renderFilterTags();
        this.filterResults();
      });
      
      categoryContainer.appendChild(tag);
    }
    this.filterTags.appendChild(categoryContainer);
    
    // Type tags
    const typeContainer = document.createElement('div');
    typeContainer.className = 'filter-tag-container';
    
    for (const type of this.allTypes) {
      const tag = document.createElement('button');
      tag.textContent = type;
      tag.className = 'filter-tag';
      tag.setAttribute('data-type', type);
      const isSelected = this.selectedTypes.has(type);
      if (isSelected) {
        tag.classList.add('is-selected');
      }
      
      tag.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelected) {
          this.selectedTypes.delete(type);
        } else {
          this.selectedTypes.add(type);
        }
        this.renderFilterTags();
        this.filterResults();
      });
      
      typeContainer.appendChild(tag);
    }
    this.filterTags.appendChild(typeContainer);
  }
  
  private filterResults(): void {
    const query = this.input.value.toLowerCase().trim();
    
    // Filter by query
    let filtered = this.nodeSpecs;
    
    if (query !== '') {
      filtered = filtered.filter(spec => {
        const nameMatch = spec.displayName.toLowerCase().includes(query);
        const descMatch = spec.description?.toLowerCase().includes(query) || false;
        const categoryMatch = spec.category.toLowerCase().includes(query);
        return nameMatch || descMatch || categoryMatch;
      });
    }
    
    // Filter by category
    if (this.selectedCategory) {
      filtered = filtered.filter(spec => spec.category === this.selectedCategory);
    }
    
    // Filter by types (if any selected)
    if (this.selectedTypes.size > 0) {
      filtered = filtered.filter(spec => {
        // Check if node has any input or output of selected types
        const hasInputType = spec.inputs.some(input => this.selectedTypes.has(input.type));
        const hasOutputType = spec.outputs.some(output => this.selectedTypes.has(output.type));
        return hasInputType || hasOutputType;
      });
    }
    
    // Sort: exact name matches first, then by category, then alphabetically
    filtered.sort((a, b) => {
      if (query !== '') {
        const aExact = a.displayName.toLowerCase() === query;
        const bExact = b.displayName.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
      }
      // Group by category
      const categoryCompare = a.category.localeCompare(b.category);
      if (categoryCompare !== 0) return categoryCompare;
      // Then alphabetically
      return a.displayName.localeCompare(b.displayName);
    });
    
    this.filteredSpecs = filtered;
    
    // Group by category
    this.groupedSpecs = [];
    const categoryMap = new Map<string, NodeSpec[]>();
    for (const spec of this.filteredSpecs) {
      if (!categoryMap.has(spec.category)) {
        categoryMap.set(spec.category, []);
      }
      categoryMap.get(spec.category)!.push(spec);
    }
    
    // Sort categories with workflow-based order
    const sortedCategories = this.sortCategories(Array.from(categoryMap.keys()));
    for (const category of sortedCategories) {
      this.groupedSpecs.push({
        category,
        nodes: categoryMap.get(category)!
      });
    }
    
    this.renderResults();
  }
  
  private renderResults(): void {
    this.results.innerHTML = '';
    
    // Calculate total item count for selection
    let totalItems = 0;
    for (const group of this.groupedSpecs) {
      totalItems += group.nodes.length;
    }
    
    // Set to -1 if in input, so first down arrow press moves to index 0
    if (this.isInInput) {
      this.selectedIndex = -1;
    } else if (this.selectedIndex < 0 || this.selectedIndex >= totalItems) {
      this.selectedIndex = totalItems > 0 ? 0 : -1;
    }
    
    if (this.groupedSpecs.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No nodes found';
      noResults.className = 'search-no-results';
      this.results.appendChild(noResults);
      return;
    }
    
    let itemIndex = 0;
    for (const group of this.groupedSpecs) {
      // Category header - more subtle
      const categoryHeader = document.createElement('div');
      categoryHeader.textContent = group.category;
      categoryHeader.className = 'search-category-header';
      categoryHeader.setAttribute('data-category', group.category);
      categoryHeader.setAttribute('data-category-header', 'true');
      this.results.appendChild(categoryHeader);
      
      // Nodes in this category
      for (const spec of group.nodes) {
        const item = document.createElement('div');
        item.tabIndex = -1;
        item.className = 'search-result-item';
        item.setAttribute('data-category', spec.category);
        if (itemIndex === this.selectedIndex) {
          item.classList.add('is-selected');
        }
        
        // Node name and description
        const content = document.createElement('div');
        content.className = 'search-result-item-content';
        
        const name = document.createElement('div');
        name.textContent = spec.displayName;
        name.className = 'search-result-item-name';
        content.appendChild(name);
        
        if (spec.description) {
          const desc = document.createElement('div');
          desc.textContent = spec.description;
          desc.className = 'search-result-item-desc';
          content.appendChild(desc);
        }
        
        item.appendChild(content);
        
        // Type tags for outputs
        const typeTags = document.createElement('div');
        typeTags.className = 'search-result-item-type-tags';
        
        // Show output types
        const uniqueOutputTypes = new Set(spec.outputs.map(o => o.type));
        for (const type of Array.from(uniqueOutputTypes).slice(0, 2)) {
          const typeTag = document.createElement('span');
          typeTag.textContent = type;
          typeTag.className = 'search-result-item-type-tag';
          typeTag.setAttribute('data-type', type);
          typeTags.appendChild(typeTag);
        }
        
        item.appendChild(typeTags);
        
        const currentIndex = itemIndex;
        item.addEventListener('mouseenter', () => {
          this.isInInput = false;
          this.selectedIndex = currentIndex;
          this.updateSelection();
        });
        
        item.addEventListener('click', () => {
          this.createNode(spec.id);
        });
        
        item.addEventListener('keydown', (e) => {
          this.handleResultsKeyDown(e);
        });
        
        item.addEventListener('focus', () => {
          this.isInInput = false;
          this.selectedIndex = currentIndex;
          this.updateSelection();
        });
        
        this.results.appendChild(item);
        itemIndex++;
      }
    }
    
    this.updateSelection();
  }
  
  private updateSelection(): void {
    let itemIndex = 0;
    const items = this.results.children;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as HTMLElement;
      // Skip category headers
      if (item.getAttribute('data-category-header') === 'true') continue;
      
      // This is a node item
      const spec = this.filteredSpecs[itemIndex];
      if (!spec) continue;
      
      // Ensure data-category attribute is set (should already be set, but ensure it)
      item.setAttribute('data-category', spec.category);
      
      if (itemIndex === this.selectedIndex) {
        item.classList.add('is-selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('is-selected');
      }
      itemIndex++;
    }
  }
  
  private isInInput: boolean = true; // Track if focus is in input or results
  
  private handleInputKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      // Move focus to results list
      this.isInInput = false;
      if (this.filteredSpecs.length > 0) {
        // Set to -1 so first down arrow press moves to index 0
        this.selectedIndex = -1;
        this.updateSelection();
        // Focus the results container
        this.results.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // If there are results, select the first one
      if (this.filteredSpecs.length > 0) {
        this.selectedIndex = 0;
        this.createNode(this.filteredSpecs[0].id);
      }
    }
  }
  
  private handleResultsKeyDown(e: KeyboardEvent): void {
    // Calculate total items
    let totalItems = 0;
    for (const group of this.groupedSpecs) {
      totalItems += group.nodes.length;
    }
    
    if (e.key === 'Escape') {
      this.hide();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.filteredSpecs[this.selectedIndex]) {
        this.createNode(this.filteredSpecs[this.selectedIndex].id);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.selectedIndex < totalItems - 1) {
        this.selectedIndex = this.selectedIndex + 1;
        this.updateSelection();
      } else if (this.selectedIndex === -1 && totalItems > 0) {
        // Handle case where we're coming from input (selectedIndex = -1)
        this.selectedIndex = 0;
        this.updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.selectedIndex > 0) {
        this.selectedIndex = this.selectedIndex - 1;
        this.updateSelection();
      } else {
        // Go back to input field
        this.isInInput = true;
        this.input.focus();
        this.input.select();
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing should go back to input
      this.isInInput = true;
      this.input.focus();
      this.input.value += e.key;
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
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });
    
    // ESC key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible()) {
        this.hide();
      }
    });
  }
  
  show(screenX: number, screenY: number, canvasX?: number, canvasY?: number, center: boolean = false): void {
    // Store canvas coordinates for node creation (if provided)
    if (canvasX !== undefined && canvasY !== undefined) {
      this.canvasX = canvasX;
      this.canvasY = canvasY;
    } else {
      // Fallback: use screen coordinates (shouldn't happen in normal flow)
      this.canvasX = screenX;
      this.canvasY = screenY;
    }
    this.overlay.classList.add('is-visible');
    
    if (center) {
      // Center the dialog
      this.dialog.style.top = '50%';
      this.dialog.style.left = '50%';
      this.dialog.style.transform = 'translate(-50%, -50%)';
    } else {
      // Position dialog with cursor horizontally centered and at 15% from top
      // Get dialog dimensions (it's already in the DOM and overlay is shown)
      const dialogRect = this.dialog.getBoundingClientRect();
      const dialogWidth = dialogRect.width || this.dialog.offsetWidth;
      const dialogHeight = dialogRect.height || this.dialog.offsetHeight;
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const safeMargin = 16; // Safe distance from viewport edges
      
      // Calculate ideal position: cursor centered horizontally and at 15% from top
      let left = screenX - (dialogWidth / 2);
      let top = screenY - (dialogHeight * 0.05);
      
      // Constrain to viewport with safe margins
      // Ensure dialog doesn't go beyond right edge
      if (left + dialogWidth > viewportWidth - safeMargin) {
        left = viewportWidth - dialogWidth - safeMargin;
      }
      // Ensure dialog doesn't go beyond left edge
      if (left < safeMargin) {
        left = safeMargin;
      }
      // Ensure dialog doesn't go beyond bottom edge
      if (top + dialogHeight > viewportHeight - safeMargin) {
        top = viewportHeight - dialogHeight - safeMargin;
      }
      // Ensure dialog doesn't go beyond top edge
      if (top < safeMargin) {
        top = safeMargin;
      }
      
      this.dialog.style.top = `${top}px`;
      this.dialog.style.left = `${left}px`;
      this.dialog.style.transform = 'none';
    }
    
    // Reset filters
    this.selectedCategory = null;
    this.selectedTypes.clear();
    this.renderFilterTags();
    
    this.isInInput = true;
    this.input.focus();
    this.input.select();
    this.filterResults();
  }
  
  hide(): void {
    this.overlay.classList.remove('is-visible');
    this.input.value = '';
    this.selectedCategory = null;
    this.selectedTypes.clear();
    this.renderFilterTags();
    this.filterResults();
  }
  
  isVisible(): boolean {
    return this.overlay.classList.contains('is-visible');
  }
  
  destroy(): void {
    document.body.removeChild(this.overlay);
  }
}
