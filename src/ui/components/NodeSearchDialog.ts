// Node Search Dialog Component
// Search dialog for creating nodes

import type { NodeSpec } from '../../types/nodeSpec';
import { getNodeColorByCategory } from '../../utils/nodeSpecAdapter';
import { getCSSColor, getCSSVariable } from '../../utils/cssTokens';

export interface SearchDialogCallbacks {
  onCreateNode?: (nodeType: string, canvasX: number, canvasY: number) => void;
}

// Type colors - consistent with NodeRenderer
const TYPE_COLORS: Record<string, string> = {
  'float': '#2196F3',  // Blue
  'vec2': '#4CAF50',   // Green
  'vec3': '#FF9800',   // Orange
  'vec4': '#9C27B0'    // Purple
};

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
    this.allCategories = Array.from(categorySet).sort();
    this.allTypes = Array.from(typeSet).sort();
    
    // Debug: log node count
    console.log(`[NodeSearchDialog] Initialized with ${nodeSpecs.length} node specs`);
    
    // Create overlay
    this.overlay = document.createElement('div');
    const overlayBg = getCSSVariable('search-dialog-overlay', 'rgba(0, 0, 0, 0.5)');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${overlayBg};
      z-index: 1000;
      display: none;
    `;
    
    // Create dialog
    this.dialog = document.createElement('div');
    const dialogBg = getCSSColor('search-dialog-bg', '#2a2a2a');
    const dialogBorder = getCSSVariable('search-dialog-border', '1px solid #3a3a3a');
    const dialogRadius = getCSSVariable('search-dialog-radius', '6px');
    const dialogShadow = getCSSVariable('search-dialog-shadow', '0 8px 24px rgba(0, 0, 0, 0.5)');
    this.dialog.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 450px;
      max-height: 500px;
      background: ${dialogBg};
      border: ${dialogBorder};
      border-radius: ${dialogRadius};
      box-shadow: ${dialogShadow};
      z-index: 1001;
      display: flex;
      flex-direction: column;
    `;
    
    // Search input (at the top)
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Search nodes...';
    const inputBg = getCSSColor('search-input-bg', '#1a1a1a');
    const inputBorder = getCSSVariable('search-input-border', '1px solid #3a3a3a');
    const inputColor = getCSSColor('search-input-color', '#e0e0e0');
    const inputRadius = getCSSVariable('input-radius', '4px');
    this.input.style.cssText = `
      margin: 10px;
      padding: 8px 10px;
      background: ${inputBg};
      border: ${inputBorder};
      border-radius: ${inputRadius};
      color: ${inputColor};
      font-size: 13px;
      outline: none;
    `;
    this.input.addEventListener('input', () => this.filterResults());
    this.input.addEventListener('keydown', (e) => this.handleInputKeyDown(e));
    this.dialog.appendChild(this.input);
    
    // Filter tags container
    this.filterTags = document.createElement('div');
    this.filterTags.style.cssText = `
      padding: 0 10px 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    `;
    this.renderFilterTags();
    this.dialog.appendChild(this.filterTags);
    
    // Results container
    this.results = document.createElement('div');
    this.results.tabIndex = -1; // Make focusable for keyboard navigation
    const resultsId = `node-search-results-${Date.now()}`;
    this.results.id = resultsId;
    this.results.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 0 10px 10px;
      outline: none;
      /* Hide scrollbar but keep functionality */
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    `;
    // Hide scrollbar for WebKit browsers (Chrome, Safari)
    const style = document.createElement('style');
    style.textContent = `
      #${resultsId}::-webkit-scrollbar {
        display: none;
      }
    `;
    document.head.appendChild(style);
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
    categoryContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; width: 100%;';
    
    for (const category of this.allCategories) {
      const tag = document.createElement('button');
      tag.textContent = category;
      const isSelected = this.selectedCategory === category;
      const categoryColor = getNodeColorByCategory(category);
      
      const defaultBorder = getCSSVariable('search-result-border', '1px solid #3a3a3a');
      const defaultBg = getCSSColor('search-result-bg', '#1a1a1a');
      const defaultColor = getCSSColor('search-result-desc-color', '#999');
      tag.style.cssText = `
        padding: 3px 8px;
        border: 1px solid ${isSelected ? categoryColor : defaultBorder.split(' ').slice(2).join(' ')};
        border-radius: 10px;
        background: ${isSelected ? categoryColor + '40' : defaultBg};
        color: ${isSelected ? categoryColor : defaultColor};
        font-size: 10px;
        cursor: pointer;
        outline: none;
        transition: all 0.15s;
        font-weight: ${isSelected ? '600' : '400'};
      `;
      
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
    typeContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; width: 100%; margin-top: 6px;';
    
    for (const type of this.allTypes) {
      const tag = document.createElement('button');
      tag.textContent = type;
      const isSelected = this.selectedTypes.has(type);
      const typeColor = TYPE_COLORS[type] || '#666666';
      
      const defaultBorder = getCSSVariable('search-result-border', '1px solid #3a3a3a');
      const defaultBg = getCSSColor('search-result-bg', '#1a1a1a');
      tag.style.cssText = `
        padding: 3px 8px;
        border: 1px solid ${isSelected ? typeColor : defaultBorder.split(' ').slice(2).join(' ')};
        border-radius: 10px;
        background: ${isSelected ? typeColor + '40' : defaultBg};
        color: ${isSelected ? typeColor : typeColor + 'CC'};
        font-size: 10px;
        cursor: pointer;
        outline: none;
        transition: all 0.15s;
        font-weight: ${isSelected ? '600' : '400'};
      `;
      
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
    
    // Sort categories and create groups
    const sortedCategories = Array.from(categoryMap.keys()).sort();
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
      const noResultsColor = getCSSColor('search-no-results-color', '#999');
      noResults.style.cssText = `padding: 12px; color: ${noResultsColor}; text-align: center; font-size: 12px;`;
      this.results.appendChild(noResults);
      return;
    }
    
    let itemIndex = 0;
    for (const group of this.groupedSpecs) {
      // Category header - more subtle
      const categoryHeader = document.createElement('div');
      categoryHeader.textContent = group.category;
      const categoryColor = getNodeColorByCategory(group.category);
      // const categoryHeaderBg = getCSSVariable('search-category-header-bg', 'rgba(74, 154, 255, 0.08)');
      // const categoryHeaderColor = getCSSColor('search-category-header-color', '#4a9eff');
      
      categoryHeader.style.cssText = `
        padding: 4px 8px;
        margin: 6px 0 2px 0;
        background: ${categoryColor}15;
        color: ${categoryColor};
        font-size: 10px;
        font-weight: 600;
        border-radius: 3px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-left: 2px solid ${categoryColor};
      `;
      categoryHeader.setAttribute('data-category-header', 'true');
      this.results.appendChild(categoryHeader);
      
      // Nodes in this category
      for (const spec of group.nodes) {
        const item = document.createElement('div');
        item.tabIndex = -1;
        
        const categoryColor = getNodeColorByCategory(spec.category);
        const itemBgDefault = getCSSColor('search-result-bg', '#1a1a1a');
        const itemBgSelected = getCSSColor('search-result-bg-selected', '#3a3a3a');
        const itemBg = itemIndex === this.selectedIndex ? itemBgSelected : itemBgDefault;
        const borderDefault = getCSSVariable('search-result-border', '1px solid #3a3a3a');
        const borderSelected = getCSSVariable('search-result-border-selected', '1px solid #2196F3');
        const borderColor = itemIndex === this.selectedIndex 
          ? borderSelected.split(' ').slice(2).join(' ')
          : borderDefault.split(' ').slice(2).join(' ');
        
        item.style.cssText = `
          padding: 6px 8px;
          margin-bottom: 2px;
          background: ${itemBg};
          border: 1px solid ${borderColor};
          border-left: 3px solid ${categoryColor};
          border-radius: 3px;
          cursor: pointer;
          outline: none;
          display: flex;
          align-items: center;
          gap: 6px;
        `;
        
        // Node name and description
        const content = document.createElement('div');
        content.style.cssText = 'flex: 1; min-width: 0;';
        
        const name = document.createElement('div');
        name.textContent = spec.displayName;
        const nameColor = getCSSColor('search-result-name-color', '#e0e0e0');
        name.style.cssText = `font-size: 12px; font-weight: 600; color: ${nameColor}; margin-bottom: 1px;`;
        content.appendChild(name);
        
        if (spec.description) {
          const desc = document.createElement('div');
          desc.textContent = spec.description;
          const descColor = getCSSColor('search-result-desc-color', '#999');
          desc.style.cssText = `font-size: 10px; color: ${descColor}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
          content.appendChild(desc);
        }
        
        item.appendChild(content);
        
        // Type tags for outputs
        const typeTags = document.createElement('div');
        typeTags.style.cssText = 'display: flex; gap: 3px; flex-wrap: wrap; flex-shrink: 0;';
        
        // Show output types
        const uniqueOutputTypes = new Set(spec.outputs.map(o => o.type));
        for (const type of Array.from(uniqueOutputTypes).slice(0, 2)) {
          const typeTag = document.createElement('span');
          typeTag.textContent = type;
          const typeColor = TYPE_COLORS[type] || '#666666';
          typeTag.style.cssText = `
            padding: 1px 5px;
            border-radius: 6px;
            background: ${typeColor}25;
            color: ${typeColor};
            font-size: 9px;
            font-weight: 600;
            border: 1px solid ${typeColor}50;
          `;
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
      
      const categoryColor = getNodeColorByCategory(spec.category);
      
      const itemBgSelected = getCSSColor('search-result-bg-selected', '#3a3a3a');
      const itemBgDefault = getCSSColor('search-result-bg', '#1a1a1a');
      const borderSelected = getCSSVariable('search-result-border-selected', '1px solid #2196F3');
      const borderDefault = getCSSVariable('search-result-border', '1px solid #3a3a3a');
      
      if (itemIndex === this.selectedIndex) {
        item.style.background = itemBgSelected;
        item.style.borderColor = borderSelected.split(' ').slice(2).join(' ');
        item.style.borderLeftColor = categoryColor;
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.background = itemBgDefault;
        item.style.borderColor = borderDefault.split(' ').slice(2).join(' ');
        item.style.borderLeftColor = categoryColor;
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
    this.overlay.style.display = 'block';
    
    if (center) {
      // Center the dialog
      this.dialog.style.top = '50%';
      this.dialog.style.left = '50%';
      this.dialog.style.transform = 'translate(-50%, -50%)';
    } else {
      // Position at click location (screen coordinates)
      // Adjust to ensure dialog stays within viewport
      const dialogRect = this.dialog.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = screenX;
      let top = screenY;
      
      // Adjust if dialog would go off screen
      if (left + dialogRect.width > viewportWidth) {
        left = viewportWidth - dialogRect.width - 16;
      }
      if (top + dialogRect.height > viewportHeight) {
        top = viewportHeight - dialogRect.height - 16;
      }
      if (left < 16) left = 16;
      if (top < 16) top = 16;
      
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
    this.overlay.style.display = 'none';
    this.input.value = '';
    this.selectedCategory = null;
    this.selectedTypes.clear();
    this.renderFilterTags();
    this.filterResults();
  }
  
  isVisible(): boolean {
    return this.overlay.style.display === 'block';
  }
  
  destroy(): void {
    document.body.removeChild(this.overlay);
  }
}
