// Node Panel Component
// Left-side panel for browsing and adding nodes

import type { NodeSpec } from '../../types/nodeSpec';
import { getNodeIcon } from '../../utils/nodeSpecUtils';
import { createNodeIconElement, createIconElement } from '../../utils/icons';

export interface NodePanelCallbacks {
  onCreateNode?: (nodeType: string, canvasX: number, canvasY: number) => void;
  onScreenToCanvas?: (screenX: number, screenY: number) => { x: number; y: number };
}

interface GroupedNodeSpec {
  category: string;
  nodes: NodeSpec[];
}

type DisplayMode = 'list' | 'grid';

export class NodePanel {
  private panel: HTMLElement;
  private input: HTMLInputElement;
  private clearButton: HTMLButtonElement;
  private filterTags: HTMLElement;
  private displayModeToggle: HTMLElement;
  private results: HTMLElement;
  private nodeSpecs: NodeSpec[];
  private callbacks: NodePanelCallbacks;
  private filteredSpecs: NodeSpec[] = [];
  private groupedSpecs: GroupedNodeSpec[] = [];
  private selectedCategory: string | null = null;
  private selectedTypes: Set<string> = new Set();
  private displayMode: DisplayMode = 'grid';
  private isVisible: boolean = true;
  
  // Get all unique categories and types
  private allCategories: string[] = [];
  private allTypes: string[] = [];
  
  // Category order: grouped by color families (Input → Creation → Transformation → Combining → Final)
  private static readonly CATEGORY_ORDER: string[] = [
    // Input/Data Sources (Blue family)
    'Inputs',
    'Audio',
    // Creation/Generation (Green family)
    'Patterns',
    'Shapes',
    // Transformation/Manipulation (Orange/Yellow family)
    'Distort',
    'Math',
    'Utilities',
    // Combining/Control (Purple family)
    'Blend',
    'Mask',
    // Final Stage (Red family)
    'Effects',
    'Output'
  ];
  
  // Category display label mapping (for filter tags)
  private static readonly CATEGORY_DISPLAY_LABELS: Record<string, string> = {
    'Inputs': 'Input',
    'Patterns': 'Pattern',
    'Shapes': 'Shape',
    'Utilities': 'Util',
    'Effects': 'FX'
  };
  
  /**
   * Sort categories with custom order: grouped by color families
   */
  private sortCategories(categories: string[]): string[] {
    return categories.sort((a, b) => {
      const aIndex = NodePanel.CATEGORY_ORDER.indexOf(a);
      const bIndex = NodePanel.CATEGORY_ORDER.indexOf(b);
      
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
  
  constructor(nodeSpecs: NodeSpec[], callbacks: NodePanelCallbacks = {}) {
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
    
    // Create panel
    this.panel = document.createElement('div');
    this.panel.className = 'node-panel';
    
    // Search input container (with display mode toggle in same row)
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    
    // Search input wrapper (for leading icon and trailing clear button)
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper input-wrapper-search';
    
    // Search icon (leading)
    const searchIcon = createIconElement('search', 16, 'currentColor', 'input-icon-leading', 'line');
    inputWrapper.appendChild(searchIcon);
    
    // Search input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Search nodes...';
    this.input.className = 'input primary md';
    this.input.addEventListener('input', () => {
      this.updateClearButtonVisibility();
      this.filterResults();
    });
    this.input.addEventListener('focus', () => {
      this.input.value = '';
      this.updateClearButtonVisibility();
      this.filterResults();
    });
    inputWrapper.appendChild(this.input);
    
    // Clear button (trailing)
    const clearButton = document.createElement('button');
    clearButton.className = 'button ghost sm icon-only input-clear';
    clearButton.type = 'button';
    clearButton.title = 'Clear search';
    clearButton.setAttribute('aria-label', 'Clear search');
    const clearIcon = createIconElement('x', 16, 'currentColor', undefined, 'line');
    clearButton.appendChild(clearIcon);
    clearButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.value = '';
      this.updateClearButtonVisibility();
      this.filterResults();
      this.input.focus();
    });
    this.clearButton = clearButton;
    inputWrapper.appendChild(clearButton);
    
    searchContainer.appendChild(inputWrapper);
    
    // Display mode toggle
    this.displayModeToggle = document.createElement('div');
    this.displayModeToggle.className = 'display-mode-toggle';
    
    const listButton = document.createElement('button');
    listButton.className = 'button ghost sm icon-only';
    listButton.title = 'List view';
    const listIcon = createIconElement('menu', 16, 'currentColor', undefined, 'line');
    listButton.appendChild(listIcon);
    listButton.addEventListener('click', () => {
      this.displayMode = 'list';
      this.updateDisplayModeToggle();
      this.renderResults();
    });
    
    const gridButton = document.createElement('button');
    gridButton.className = 'button ghost sm icon-only';
    gridButton.title = 'Grid view';
    const gridIcon = createIconElement('layout-grid', 16, 'currentColor', undefined, 'filled');
    gridButton.appendChild(gridIcon);
    gridButton.addEventListener('click', () => {
      this.displayMode = 'grid';
      this.updateDisplayModeToggle();
      this.renderResults();
    });
    
    this.displayModeToggle.appendChild(listButton);
    this.displayModeToggle.appendChild(gridButton);
    searchContainer.appendChild(this.displayModeToggle);
    
    // Panel header (contains search and filter tags)
    const panelHeader = document.createElement('div');
    panelHeader.className = 'header';
    panelHeader.appendChild(searchContainer);
    
    // Filter tags container
    this.filterTags = document.createElement('div');
    this.filterTags.className = 'filter-tags';
    this.renderFilterTags();
    panelHeader.appendChild(this.filterTags);
    
    this.panel.appendChild(panelHeader);
    
    // Results container
    this.results = document.createElement('div');
    this.results.className = 'results';
    this.panel.appendChild(this.results);
    
    // Panel will be appended by layout, not to body
    this.filterResults();
    this.updateDisplayModeToggle();
    this.updateClearButtonVisibility();
  }
  
  private updateClearButtonVisibility(): void {
    if (this.input.value.trim() === '') {
      this.clearButton.classList.add('is-hidden');
    } else {
      this.clearButton.classList.remove('is-hidden');
    }
  }
  
  /**
   * Focus the search input (e.g. for Cmd/Ctrl+F shortcut).
   */
  focusSearch(): void {
    this.input.focus();
  }
  
  private updateDisplayModeToggle(): void {
    const buttons = this.displayModeToggle.querySelectorAll('button');
    buttons.forEach((btn, index) => {
      if ((index === 0 && this.displayMode === 'list') || (index === 1 && this.displayMode === 'grid')) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
  }
  
  private renderFilterTags(): void {
    this.filterTags.innerHTML = '';
    
    // Category tags
    const categoryContainer = document.createElement('div');
    categoryContainer.className = 'tag-container';
    
    for (const category of this.allCategories) {
      const tag = document.createElement('button');
      // Use display label if available, otherwise use category name
      tag.textContent = NodePanel.CATEGORY_DISPLAY_LABELS[category] || category;
      tag.className = 'tag interactive sm';
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
    typeContainer.className = 'tag-container';
    
    for (const type of this.allTypes) {
      const tag = document.createElement('button');
      tag.textContent = type;
      tag.className = 'tag interactive sm';
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
    
    if (this.displayMode === 'list') {
      this.results.classList.add('is-list');
      this.results.classList.remove('is-grid');
    } else {
      this.results.classList.add('is-grid');
      this.results.classList.remove('is-list');
    }
    
    if (this.groupedSpecs.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No nodes found';
      noResults.className = 'no-results';
      this.results.appendChild(noResults);
      return;
    }
    
    for (const group of this.groupedSpecs) {
      // Category header
      const categoryHeader = document.createElement('div');
      categoryHeader.textContent = group.category;
      categoryHeader.className = 'category-header';
      categoryHeader.setAttribute('data-category', group.category);
      this.results.appendChild(categoryHeader);
      
      // Nodes in this category
      for (const spec of group.nodes) {
        const item = this.createNodeItem(spec);
        this.results.appendChild(item);
      }
    }
  }
  
  private createNodeItem(spec: NodeSpec): HTMLElement {
    const item = document.createElement('div');
    item.className = 'item';
    item.setAttribute('data-category', spec.category);
    item.setAttribute('draggable', 'true');
    item.setAttribute('data-node-type', spec.id);
    
    // Icon box with icon inside (colored bg based on category)
    const iconBox = document.createElement('div');
    iconBox.className = 'icon-box';
    iconBox.setAttribute('data-category', spec.category);
    const iconIdentifier = getNodeIcon(spec);
    try {
      // Variant is auto-selected by createNodeIconElement based on icon identifier
      const iconElement = createNodeIconElement(iconIdentifier, 24, 'currentColor', 'item-icon');
      iconBox.appendChild(iconElement);
    } catch (e) {
      console.warn(`Failed to create icon for ${spec.id}:`, e);
    }
    item.appendChild(iconBox);
    
    // Input types container (for grid view - absolute positioned)
    const inputTypesContainer = document.createElement('div');
    inputTypesContainer.className = 'input-types';
    
    // Create individual tags for each input type
    spec.inputs.forEach(input => {
      const inputTag = document.createElement('span');
      inputTag.className = 'tag xs';
      inputTag.setAttribute('data-type', input.type);
      inputTag.textContent = input.type;
      inputTypesContainer.appendChild(inputTag);
    });
    
    if (spec.inputs.length > 0) {
      item.appendChild(inputTypesContainer);
    }
    
    // Output types container (for grid view - absolute positioned)
    const outputTypesContainer = document.createElement('div');
    outputTypesContainer.className = 'output-types';
    
    // Create individual tags for each output type
    spec.outputs.forEach(output => {
      const outputTag = document.createElement('span');
      outputTag.className = 'tag xs';
      outputTag.setAttribute('data-type', output.type);
      outputTag.textContent = output.type;
      outputTypesContainer.appendChild(outputTag);
    });
    
    if (spec.outputs.length > 0) {
      item.appendChild(outputTypesContainer);
    }
    
    // Content container
    const content = document.createElement('div');
    content.className = 'content';
    
    // Title
    const title = document.createElement('div');
    title.textContent = spec.displayName;
    title.className = 'title';
    content.appendChild(title);
    
    // Types row wrapper (for list mode - will contain cloned input and output types)
    const typesRow = document.createElement('div');
    typesRow.className = 'types-row';
    
    // Clone input and output types for list view (inside content)
    if (spec.inputs.length > 0) {
      const listInputTypes = inputTypesContainer.cloneNode(true) as HTMLElement;
      listInputTypes.className = 'input-types list-types';
      typesRow.appendChild(listInputTypes);
    }
    
    if (spec.outputs.length > 0) {
      const listOutputTypes = outputTypesContainer.cloneNode(true) as HTMLElement;
      listOutputTypes.className = 'output-types list-types';
      typesRow.appendChild(listOutputTypes);
    }
    
    content.appendChild(typesRow);
    item.appendChild(content);
    
    // Drag and drop handlers
    item.addEventListener('dragstart', (e) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', spec.id);
        // Store the node type for later use
        (item as any)._draggingNodeType = spec.id;
        item.classList.add('is-dragging');
      }
    });
    
    item.addEventListener('dragend', () => {
      item.classList.remove('is-dragging');
    });
    
    // Click handler (fallback for non-drag interactions)
    item.addEventListener('click', () => {
      // Could add click-to-add functionality here if needed
    });
    
    return item;
  }
  
  show(): void {
    this.isVisible = true;
    // Panel visibility is controlled by container, not panel itself
  }
  
  hide(): void {
    this.isVisible = false;
    // Panel visibility is controlled by container, not panel itself
  }
  
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
  
  isPanelVisible(): boolean {
    return this.isVisible;
  }
  
  getPanelElement(): HTMLElement {
    return this.panel;
  }
  
  /**
   * Handle drop event from canvas
   */
  handleDrop(screenX: number, screenY: number, nodeType: string): void {
    if (this.callbacks.onCreateNode && this.callbacks.onScreenToCanvas) {
      const canvasPos = this.callbacks.onScreenToCanvas(screenX, screenY);
      this.callbacks.onCreateNode(nodeType, canvasPos.x, canvasPos.y);
    }
  }
  
  destroy(): void {
    if (this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
