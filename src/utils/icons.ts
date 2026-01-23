// Icon utility helper
// Provides a simple way to render Lucide icons as SVG elements

import { createElement } from 'lucide';
import { 
  GripVertical, 
  X, 
  RotateCw, 
  Plus, 
  Sparkles,
  Eye,
  EyeOff,
  Power,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Maximize2,
  Minimize2,
  Play,
  Pause
} from 'lucide';

export type IconName = 
  | 'grip-vertical'
  | 'x'
  | 'rotate-cw'
  | 'plus'
  | 'sparkles'
  | 'eye'
  | 'eye-off'
  | 'power'
  | 'chevron-down'
  | 'chevron-right'
  | 'chevron-left'
  | 'maximize-2'
  | 'minimize-2'
  | 'play'
  | 'pause';

const iconMap: Record<IconName, any> = {
  'grip-vertical': GripVertical,
  'x': X,
  'rotate-cw': RotateCw,
  'plus': Plus,
  'sparkles': Sparkles,
  'eye': Eye,
  'eye-off': EyeOff,
  'power': Power,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'maximize-2': Maximize2,
  'minimize-2': Minimize2,
  'play': Play,
  'pause': Pause,
};

/**
 * Creates an icon element that can be inserted into DOM
 * @param name Icon name
 * @param size Icon size in pixels (default: 16)
 * @param color Icon color (default: currentColor)
 * @param className Optional CSS class name
 * @returns SVG element
 */
export function createIconElement(
  name: IconName,
  size: number = 16,
  color: string = 'currentColor',
  className?: string
): SVGElement {
  const IconComponent = iconMap[name];
  if (!IconComponent) {
    throw new Error(`Unknown icon: ${name}`);
  }

  // Use Lucide's createElement to create the icon
  const iconElement = createElement(IconComponent, {
    size: size,
    color: color,
    ...(className ? { class: className } : {}),
    'stroke-width': 2,
  });

  // Ensure SVG has explicit width and height attributes and proper styling
  if (!iconElement.getAttribute('width')) {
    iconElement.setAttribute('width', String(size));
  }
  if (!iconElement.getAttribute('height')) {
    iconElement.setAttribute('height', String(size));
  }
  if (!iconElement.getAttribute('viewBox')) {
    iconElement.setAttribute('viewBox', '0 0 24 24');
  }
  
  // Set inline styles to ensure visibility
  iconElement.style.width = `${size}px`;
  iconElement.style.height = `${size}px`;
  iconElement.style.display = 'block';
  iconElement.style.flexShrink = '0';
  iconElement.style.verticalAlign = 'middle';

  return iconElement;
}
