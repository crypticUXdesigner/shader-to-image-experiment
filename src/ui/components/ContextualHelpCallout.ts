/**
 * Contextual Help Callout Component
 * Displays contextual help information positioned relative to trigger elements
 */

import type { HelpContent } from '../../utils/ContextualHelpManager';
import { getHelpContent, resolveRelatedItems, findNodesUsingType } from '../../utils/ContextualHelpManager';
import type { NodeSpec } from '../../types/nodeSpec';
import { createIconElement } from '../../utils/icons';
import { createNodeIconElement } from '../../utils/icons';
import { getNodeIcon } from '../../utils/nodeSpecUtils';
import { getCSSColor } from '../../utils/cssTokens';
import { getPortTypeDisplayLabel } from './rendering/RenderingUtils';

export interface ShowOptions {
  helpId?: string;
  content?: HelpContent;
  triggerElement?: HTMLElement;
  screenX?: number;
  screenY?: number;
  /** When 'center', screenX/screenY are the center of the popover (e.g. canvas center) */
  positionMode?: 'anchor' | 'center';
  typeLabelBounds?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
  nodeSpecs?: Map<string, NodeSpec>;
}

export class ContextualHelpCallout {
  private callout: HTMLElement;
  private _isVisible: boolean = false;
  private ignoreClicksUntil: number = 0;
  private nodeSpecs: Map<string, NodeSpec> = new Map();
  private onCloseCallback: (() => void) | null = null;
  
  isVisible(): boolean {
    return this._isVisible;
  }
  
  setOnClose(callback: (() => void) | null): void {
    this.onCloseCallback = callback;
  }
  
  constructor() {
    this.callout = document.createElement('div');
    this.callout.className = 'help-popover';
    document.body.appendChild(this.callout);
    this.setupEventListeners();
  }

  /**
   * Set node specs for resolving related items
   */
  setNodeSpecs(nodeSpecs: Map<string, NodeSpec>): void {
    this.nodeSpecs = nodeSpecs;
  }

  private clickHandler: ((e: MouseEvent) => void) | null = null;
  private mousedownHandler: ((e: MouseEvent) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  private setupEventListeners(): void {
    // Remove existing listeners if any
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
    }
    if (this.mousedownHandler) {
      document.removeEventListener('mousedown', this.mousedownHandler, true);
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
    }
    
    // Close on outside click (use mousedown to catch events before canvas handlers)
    this.mousedownHandler = (e: MouseEvent) => {
      if (!this._isVisible) {
        return;
      }
      
      const now = Date.now();
      if (now < this.ignoreClicksUntil) {
        // Still in ignore period - don't hide
        return;
      }
      
      // Check if click is on the close button or inside the callout
      const target = e.target as HTMLElement;
      if (!target) {
        return;
      }
      
      // If click is on close button, don't handle it here (its own handler will)
      if (target.closest('.help-popover-close') || target.closest('.close')) {
        return;
      }
      
      // Check if click is outside the callout
      if (!this.callout.contains(target)) {
        // Only hide if callout is actually visible in DOM
        const computedStyle = window.getComputedStyle(this.callout);
        if (computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden') {
          e.stopPropagation();
          this.hide();
        }
      }
    };
    document.addEventListener('mousedown', this.mousedownHandler, true);
    
    // Also handle click events as fallback
    this.clickHandler = (e: MouseEvent) => {
      if (!this._isVisible) {
        return;
      }
      
      const now = Date.now();
      if (now < this.ignoreClicksUntil) {
        return;
      }
      
      // Check if click is on the close button or inside the callout
      const target = e.target as HTMLElement;
      if (!target) {
        return;
      }
      
      // If click is on close button, don't handle it here (its own handler will)
      if (target.closest('.help-popover-close')) {
        return;
      }
      
      // Check if click is outside the callout
      if (!this.callout.contains(target)) {
        e.stopPropagation();
        this.hide();
      }
    };
    document.addEventListener('click', this.clickHandler, true);
    
    // Close on escape
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this._isVisible) {
        this.hide();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * Show help callout
   */
  async show(options: ShowOptions): Promise<void> {
    console.log('[ContextualHelpCallout] show() called with:', options);
    console.log('[ContextualHelpCallout] Callout element:', {
      exists: !!this.callout,
      parentNode: this.callout?.parentNode,
      className: this.callout?.className,
      isVisible: this.callout?.classList.contains('is-visible')
    });
    
    let content: HelpContent | null = null;

    // Get content from helpId or use provided content
    if (options.helpId) {
      content = await getHelpContent(options.helpId);
      if (!content) {
        console.warn(`Help content not found for: ${options.helpId}`);
        return;
      }
      console.log('[ContextualHelpCallout] Content loaded:', content);
    } else if (options.content) {
      content = options.content;
    } else {
      console.error('ContextualHelpCallout.show() requires either helpId or content');
      return;
    }

    // Build callout content
    this.renderContent(content);

    // Position callout
    let screenX = 0;
    let screenY = 0;

    if (options.triggerElement) {
      const rect = options.triggerElement.getBoundingClientRect();
      screenX = rect.left;
      screenY = rect.bottom;
    } else if (options.screenX !== undefined && options.screenY !== undefined) {
      screenX = options.screenX;
      screenY = options.screenY;
    } else {
      console.error('ContextualHelpCallout.show() requires either triggerElement or screenX/screenY');
      return;
    }

    // Mark as visible BEFORE positioning to prevent event handlers from hiding it
    this._isVisible = true;
    this.ignoreClicksUntil = Date.now() + 500; // Increased timeout to prevent immediate hiding
    
    // Position callout (this will also add is-visible class)
    this.positionCallout(screenX, screenY, options.typeLabelBounds, options.positionMode ?? 'anchor');
    
    console.log('[ContextualHelpCallout] Callout shown successfully:', {
      helpId: options.helpId,
      isVisible: this._isVisible,
      calloutElement: this.callout,
      hasContent: this.callout.innerHTML.length > 0
    });
  }

  /**
   * Append a "Use:" or "Connect to:" row to a port item, resolving node/type IDs to labels and chips.
   */
  private appendPortSuggestions(container: HTMLElement, label: string, ids: string[]): void {
    const resolved = resolveRelatedItems(ids, this.nodeSpecs);
    if (resolved.nodes.length === 0 && resolved.types.length === 0) {
      return;
    }
    const row = document.createElement('div');
    row.className = 'port-suggestions';
    const labelEl = document.createElement('span');
    labelEl.className = 'port-suggestions-label';
    labelEl.textContent = label;
    row.appendChild(labelEl);
    const items = document.createElement('div');
    items.className = 'port-suggestions-items';
    for (const type of resolved.types) {
      const pill = document.createElement('span');
      pill.className = 'port-suggestion-type';
      pill.textContent = type;
      items.appendChild(pill);
    }
    for (const nodeSpec of resolved.nodes) {
      const chip = document.createElement('div');
      chip.className = 'related-item';
      chip.title = nodeSpec.displayName;
      const iconIdentifier = getNodeIcon(nodeSpec);
      const icon = createNodeIconElement(iconIdentifier, 20, 'currentColor', undefined);
      chip.appendChild(icon);
      const span = document.createElement('span');
      span.className = 'related-item-label';
      span.textContent = nodeSpec.displayName;
      chip.appendChild(span);
      items.appendChild(chip);
    }
    row.appendChild(items);
    container.appendChild(row);
  }

  private renderContent(content: HelpContent): void {
    this.callout.innerHTML = '';

    // Header with title and close button
    const header = document.createElement('div');
    header.className = 'header';

    // Title badge
    const titleBadge = document.createElement('div');
    titleBadge.className = 'title-badge';
    
    // Apply type-specific styling if it's a type
    if (content.titleType === 'type') {
      const tokenMap: Record<string, string> = {
        'float': 'port-type-bg-float',
        'vec2': 'port-type-bg-vec2',
        'vec3': 'port-type-bg-vec3',
        'vec4': 'port-type-bg-vec4'
      };
      const bgTokenName = tokenMap[content.title] || 'port-type-bg-default';
      const textTokenMap: Record<string, string> = {
        'float': 'port-type-text-float',
        'vec2': 'port-type-text-vec2',
        'vec3': 'port-type-text-vec3',
        'vec4': 'port-type-text-vec4'
      };
      const textTokenName = textTokenMap[content.title] || 'port-type-text-default';
      
      const typeBgColor = getCSSColor(bgTokenName, getCSSColor('port-type-bg-default', getCSSColor('color-gray-40', '#282b31')));
      const typeTextColor = getCSSColor(textTokenName, getCSSColor('port-type-text-default', getCSSColor('color-gray-110', '#a3aeb5')));
      titleBadge.style.backgroundColor = typeBgColor;
      titleBadge.style.color = typeTextColor;
    } else {
      // Default styling
      const defaultBg = getCSSColor('port-type-bg-default', getCSSColor('color-gray-40', '#282b31'));
      const defaultText = getCSSColor('port-type-text-default', getCSSColor('color-gray-110', '#a3aeb5'));
      titleBadge.style.backgroundColor = defaultBg;
      titleBadge.style.color = defaultText;
    }
    
    titleBadge.textContent = content.titleType === 'type' ? getPortTypeDisplayLabel(content.title) : content.title;
    header.appendChild(titleBadge);

    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close help');
    const closeIcon = createIconElement('x', 16, 'currentColor', undefined, 'line');
    closeButton.appendChild(closeIcon);
    
    // Use mousedown instead of click to avoid canvas interference
    closeButton.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.hide();
    });
    
    // Also handle click as fallback
    closeButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.hide();
    });
    
    header.appendChild(closeButton);

    this.callout.appendChild(header);

    // Description (order: 2)
    const description = document.createElement('div');
    description.className = 'description';
    description.textContent = content.description;
    this.callout.appendChild(description);

    // Inputs (order: 2.5) – explain each input port
    if (content.inputs && content.inputs.length > 0) {
      const inputsSection = document.createElement('div');
      inputsSection.className = 'ports inputs';
      const inputsLabel = document.createElement('div');
      inputsLabel.className = 'ports-label';
      inputsLabel.textContent = 'Inputs';
      inputsSection.appendChild(inputsLabel);
      const inputsList = document.createElement('div');
      inputsList.className = 'ports-list';
      for (const port of content.inputs) {
        const item = document.createElement('div');
        item.className = 'port-item';
        const nameRow = document.createElement('div');
        nameRow.className = 'port-name-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'port-name';
        nameEl.textContent = port.name;
        const typeEl = document.createElement('span');
        typeEl.className = 'port-type';
        typeEl.textContent = getPortTypeDisplayLabel(port.type);
        nameRow.appendChild(nameEl);
        nameRow.appendChild(typeEl);
        item.appendChild(nameRow);
        const descEl = document.createElement('div');
        descEl.className = 'port-description';
        descEl.textContent = port.description;
        item.appendChild(descEl);
        if (port.suggestedSources && port.suggestedSources.length > 0) {
          this.appendPortSuggestions(item, 'Use:', port.suggestedSources);
        }
        inputsList.appendChild(item);
      }
      inputsSection.appendChild(inputsList);
      this.callout.appendChild(inputsSection);
    }

    // Outputs (order: 2.6) – explain each output port
    if (content.outputs && content.outputs.length > 0) {
      const outputsSection = document.createElement('div');
      outputsSection.className = 'ports outputs';
      const outputsLabel = document.createElement('div');
      outputsLabel.className = 'ports-label';
      outputsLabel.textContent = 'Outputs';
      outputsSection.appendChild(outputsLabel);
      const outputsList = document.createElement('div');
      outputsList.className = 'ports-list';
      for (const port of content.outputs) {
        const item = document.createElement('div');
        item.className = 'port-item';
        const nameRow = document.createElement('div');
        nameRow.className = 'port-name-row';
        const nameEl = document.createElement('span');
        nameEl.className = 'port-name';
        nameEl.textContent = port.name;
        const typeEl = document.createElement('span');
        typeEl.className = 'port-type';
        typeEl.textContent = getPortTypeDisplayLabel(port.type);
        nameRow.appendChild(nameEl);
        nameRow.appendChild(typeEl);
        item.appendChild(nameRow);
        const descEl = document.createElement('div');
        descEl.className = 'port-description';
        descEl.textContent = port.description;
        item.appendChild(descEl);
        if (port.suggestedTargets && port.suggestedTargets.length > 0) {
          this.appendPortSuggestions(item, 'Connect to:', port.suggestedTargets);
        }
        outputsList.appendChild(item);
      }
      outputsSection.appendChild(outputsList);
      this.callout.appendChild(outputsSection);
    }

    // Examples (order: 3)
    if (content.examples && content.examples.length > 0) {
      const examplesSection = document.createElement('div');
      examplesSection.className = 'examples';
      const examplesLabel = document.createElement('div');
      examplesLabel.className = 'examples-label';
      examplesLabel.textContent = 'Examples:';
      examplesSection.appendChild(examplesLabel);

      const examplesList = document.createElement('ul');
      examplesList.className = 'examples-list';
      content.examples.forEach((example: string) => {
        const li = document.createElement('li');
        li.textContent = example;
        examplesList.appendChild(li);
      });
      examplesSection.appendChild(examplesList);
      this.callout.appendChild(examplesSection);
    }

    // Related items (nodes that use this type) - "Used by" (order: 4)
    if (content.titleType === 'type' && this.nodeSpecs.size > 0) {
      const relatedNodes = findNodesUsingType(content.title, this.nodeSpecs);
      if (relatedNodes.length > 0) {
        const relatedRow = document.createElement('div');
        relatedRow.className = 'related';
        const relatedLabel = document.createElement('div');
        relatedLabel.className = 'related-label';
        relatedLabel.textContent = 'Used by:';
        relatedRow.appendChild(relatedLabel);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'related-items';
        
        relatedNodes.slice(0, 12).forEach((nodeSpec: NodeSpec) => { // Limit to 12 items
          const item = document.createElement('div');
          item.className = 'related-item';
          item.title = nodeSpec.displayName;
          
          const iconIdentifier = getNodeIcon(nodeSpec);
          const icon = createNodeIconElement(iconIdentifier, 20, 'currentColor', undefined);
          item.appendChild(icon);
          
          const label = document.createElement('span');
          label.className = 'related-item-label';
          label.textContent = nodeSpec.displayName;
          item.appendChild(label);
          
          itemsContainer.appendChild(item);
        });

        relatedRow.appendChild(itemsContainer);
        this.callout.appendChild(relatedRow);
      }
    }

    // Related items from help content - "Related" (order: 5)
    if (content.relatedItems && content.relatedItems.length > 0 && this.nodeSpecs.size > 0) {
      const resolved = resolveRelatedItems(content.relatedItems, this.nodeSpecs);
      if (resolved.nodes.length > 0) {
        const relatedRow = document.createElement('div');
        relatedRow.className = 'related';
        const relatedLabel = document.createElement('div');
        relatedLabel.className = 'related-label';
        relatedLabel.textContent = 'Related:';
        relatedRow.appendChild(relatedLabel);

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'related-items';
        
        resolved.nodes.slice(0, 8).forEach((nodeSpec: NodeSpec) => {
          const item = document.createElement('div');
          item.className = 'related-item';
          item.title = nodeSpec.displayName;
          
          const iconIdentifier = getNodeIcon(nodeSpec);
          const icon = createNodeIconElement(iconIdentifier, 20, 'currentColor', undefined);
          item.appendChild(icon);
          
          const label = document.createElement('span');
          label.className = 'related-item-label';
          label.textContent = nodeSpec.displayName;
          item.appendChild(label);
          
          itemsContainer.appendChild(item);
        });

        relatedRow.appendChild(itemsContainer);
        this.callout.appendChild(relatedRow);
      }
    }
  }

  private positionCallout(screenX: number, screenY: number, typeLabelBounds?: ShowOptions['typeLabelBounds'], positionMode: 'anchor' | 'center' = 'anchor'): void {
    const margin = 12; // Gap from trigger element
    const safeMargin = 16; // Safe distance from viewport edges
    
    // Show callout to measure it (use CSS class, not inline display)
    this.callout.classList.add('is-visible');
    this.callout.style.visibility = 'hidden';
    this.callout.style.top = '0px';
    this.callout.style.left = '0px';
    
    // Force a layout recalculation by reading a layout property
    void this.callout.offsetHeight;
    
    const rect = this.callout.getBoundingClientRect();
    const calloutWidth = rect.width;
    const calloutHeight = rect.height;
    
    // If dimensions are 0, use fallback values
    if (calloutWidth === 0 || calloutHeight === 0) {
      console.warn('[ContextualHelpCallout] Callout has zero dimensions, using fallback:', {
        width: calloutWidth,
        height: calloutHeight,
        innerHTML: this.callout.innerHTML.substring(0, 100)
      });
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (positionMode === 'center') {
      // Center the popover at (screenX, screenY), clamped to viewport
      let left = screenX - calloutWidth / 2;
      let top = screenY - calloutHeight / 2;
      left = Math.max(safeMargin, Math.min(viewportWidth - calloutWidth - safeMargin, left));
      top = Math.max(safeMargin, Math.min(viewportHeight - calloutHeight - safeMargin, top));
      this.callout.style.left = `${left}px`;
      this.callout.style.top = `${top}px`;
      this.callout.style.visibility = 'visible';
      return;
    }
    
    // Use type label bounds if available, otherwise use point coordinates
    const anchorLeft = typeLabelBounds?.left ?? screenX;
    const anchorTop = typeLabelBounds?.top ?? screenY;
    const anchorRight = typeLabelBounds?.right ?? screenX;
    const anchorBottom = typeLabelBounds?.bottom ?? screenY;
    const anchorHeight = typeLabelBounds?.height ?? 0;
    
    // Try multiple positions in order of preference and choose the best one
    interface PositionOption {
      left: number;
      top: number;
      score: number; // Higher is better
    }
    
    const positions: PositionOption[] = [];
    
    // 1. Below, aligned to left edge of type label (preferred for input ports)
    positions.push({
      left: anchorLeft,
      top: anchorBottom + margin,
      score: 100
    });
    
    // 2. Above, aligned to left edge of type label (preferred if not enough space below)
    positions.push({
      left: anchorLeft,
      top: anchorTop - calloutHeight - margin,
      score: 90
    });
    
    // 3. To the right, vertically centered with type label
    positions.push({
      left: anchorRight + margin,
      top: anchorTop + (anchorHeight / 2) - (calloutHeight / 2),
      score: 80
    });
    
    // 4. To the left, vertically centered with type label
    positions.push({
      left: anchorLeft - calloutWidth - margin,
      top: anchorTop + (anchorHeight / 2) - (calloutHeight / 2),
      score: 70
    });
    
    // Score each position based on available space and viewport constraints
    for (const pos of positions) {
      // Check viewport bounds
      const fitsHorizontally = pos.left >= safeMargin && pos.left + calloutWidth <= viewportWidth - safeMargin;
      const fitsVertically = pos.top >= safeMargin && pos.top + calloutHeight <= viewportHeight - safeMargin;
      
      if (!fitsHorizontally || !fitsVertically) {
        // Adjust position to fit within viewport
        if (pos.left < safeMargin) {
          pos.left = safeMargin;
        } else if (pos.left + calloutWidth > viewportWidth - safeMargin) {
          pos.left = viewportWidth - calloutWidth - safeMargin;
        }
        
        if (pos.top < safeMargin) {
          pos.top = safeMargin;
        } else if (pos.top + calloutHeight > viewportHeight - safeMargin) {
          pos.top = viewportHeight - calloutHeight - safeMargin;
        }
        
        // Reduce score for positions that needed adjustment
        pos.score -= 20;
      }
      
      // Calculate available space around position
      const spaceAbove = pos.top - safeMargin;
      const spaceBelow = viewportHeight - safeMargin - (pos.top + calloutHeight);
      const spaceLeft = pos.left - safeMargin;
      const spaceRight = viewportWidth - safeMargin - (pos.left + calloutWidth);
      
      // Boost score for positions with more available space
      const totalSpace = spaceAbove + spaceBelow + spaceLeft + spaceRight;
      pos.score += Math.min(totalSpace / 100, 10); // Cap bonus at 10
    }
    
    // Sort by score (highest first) and pick the best position
    positions.sort((a, b) => b.score - a.score);
    const bestPosition = positions[0];
    
    // Apply final position
    this.callout.style.top = `${bestPosition.top}px`;
    this.callout.style.left = `${bestPosition.left}px`;
    this.callout.style.visibility = 'visible';
    
    // Force a reflow to ensure styles are applied
    void this.callout.offsetHeight;
    
    // Debug: log positioning info
    const computedStyle = window.getComputedStyle(this.callout);
    console.log('[ContextualHelpCallout] Positioned callout:', {
      screenX,
      screenY,
      typeLabelBounds,
      finalLeft: bestPosition.left,
      finalTop: bestPosition.top,
      score: bestPosition.score,
      width: calloutWidth,
      height: calloutHeight,
      viewport: { width: viewportWidth, height: viewportHeight },
      isVisible: this.callout.classList.contains('is-visible'),
      visibility: computedStyle.visibility,
      display: computedStyle.display,
      hasContent: this.callout.innerHTML.length > 0
    });
  }

  hide(): void {
    if (!this._isVisible) {
      return;
    }
    this._isVisible = false;
    this.callout.classList.remove('is-visible');
    this.ignoreClicksUntil = 0;
    if (this.onCloseCallback) {
      this.onCloseCallback();
    }
  }

  destroy(): void {
    // Remove event listeners
    if (this.clickHandler) {
      document.removeEventListener('click', this.clickHandler, true);
      this.clickHandler = null;
    }
    if (this.mousedownHandler) {
      document.removeEventListener('mousedown', this.mousedownHandler, true);
      this.mousedownHandler = null;
    }
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    
    if (this.callout.parentNode) {
      this.callout.parentNode.removeChild(this.callout);
    }
  }
}

