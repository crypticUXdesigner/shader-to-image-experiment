import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Masking/Control Nodes
 */

export const compareNodeSpec: NodeSpec = {
  id: 'compare',
  category: 'Mask',
  displayName: 'Compare',
  description: 'Compares two values and outputs 0.0 or 1.0',
  icon: 'compare',
  inputs: [
    { name: 'a', type: 'float', label: 'A' },
    { name: 'b', type: 'float', fallbackParameter: 'b', label: 'B' }
  ],
  outputs: [
    { name: 'out', type: 'float', label: 'Result' }
  ],
  parameters: {
    operation: {
      type: 'int',
      default: 0,
      min: 0,
      max: 5,
      label: 'Operation'
    },
    b: { type: 'float', default: 0.5, min: -10.0, max: 10.0, step: 0.001, label: 'B',
      knobPolarity: 'two-sided' }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['operation', 'b'],
        layout: { columns: 1 }
      }
    ],
    minColumns: 2
  },
  mainCode: `
    if ($param.operation == 0) {
      $output.out = ($input.a == $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 1) {
      $output.out = ($input.a != $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 2) {
      $output.out = ($input.a < $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 3) {
      $output.out = ($input.a <= $input.b) ? 1.0 : 0.0;
    } else if ($param.operation == 4) {
      $output.out = ($input.a > $input.b) ? 1.0 : 0.0;
    } else {
      $output.out = ($input.a >= $input.b) ? 1.0 : 0.0;
    }
  `
};

export const selectNodeSpec: NodeSpec = {
  id: 'select',
  category: 'Mask',
  displayName: 'Select',
  description: 'Selects between two values based on condition',
  icon: 'select',
  inputs: [
    { name: 'trueValue', type: 'any', label: 'If true' },
    { name: 'falseValue', type: 'any', label: 'If false' },
    { name: 'condition', type: 'float', fallbackParameter: 'condition', label: 'Condition' }
  ],
  outputs: [
    { name: 'out', type: 'any', label: 'Result' }
  ],
  parameters: {
    condition: { type: 'float', default: 0.0, min: 0.0, max: 1.0, step: 0.01, label: 'Condition' }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['condition'],
        layout: { columns: 1 }
      }
    ],
    minColumns: 2
  },
  mainCode: `
    $output.out = ($input.condition > 0.5) ? $input.trueValue : $input.falseValue;
  `
};

/** Composites foreground over background using a mask (float). Dark = bg, bright = fg. */
export const maskCompositeFloatNodeSpec: NodeSpec = {
  id: 'mask-composite-float',
  category: 'Mask',
  displayName: 'Mask BW',
  description: 'Composites foreground over background using a mask. Dark areas show background, bright areas show foreground. Optional invert swaps the mask.',
  inputs: [
    { name: 'bg', type: 'float', fallbackParameter: 'bg', label: 'Background' },
    { name: 'mask', type: 'float', fallbackParameter: 'mask', label: 'Mask' },
    { name: 'fg', type: 'float', fallbackParameter: 'fg', label: 'Foreground' }
  ],
  outputs: [
    { name: 'out', type: 'float', label: 'Result' }
  ],
  parameters: {
    bg: { type: 'float', default: 0.0, min: -10.0, max: 10.0, step: 0.001, label: 'Background',
      knobPolarity: 'two-sided' },
    mask: { type: 'float', default: 0.5, min: 0.0, max: 1.0, step: 0.01, label: 'Mask' },
    fg: { type: 'float', default: 1.0, min: -10.0, max: 10.0, step: 0.001, label: 'Foreground',
      knobPolarity: 'two-sided' },
    invert: { type: 'int', default: 0, min: 0, max: 1, step: 1, label: 'Invert' }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['bg', 'mask', 'fg'],
        layout: { columns: 3 }
      },
      {
        type: 'grid',
        parameters: ['invert'],
        parameterUI: { invert: 'toggle' },
        layout: { columns: 1 }
      }
    ]
  },
  mainCode: `
    float maskCompositeM = ($param.invert != 0) ? (1.0 - $input.mask) : $input.mask;
    $output.out = mix($input.bg, $input.fg, maskCompositeM);
  `
};

/** Composites colored foreground over colored background using a mask (vec3). */
export const maskCompositeVec3NodeSpec: NodeSpec = {
  id: 'mask-composite-vec3',
  category: 'Mask',
  displayName: 'Mask Color',
  description: 'Composites colored foreground over colored background using a mask. Dark areas show background, bright areas show foreground. Optional invert swaps the mask.',
  inputs: [
    { name: 'bg', type: 'vec3', label: 'Background' },
    { name: 'mask', type: 'float', fallbackParameter: 'mask', label: 'Mask' },
    { name: 'fg', type: 'vec3', label: 'Foreground' }
  ],
  outputs: [
    { name: 'out', type: 'vec3', label: 'Color' }
  ],
  parameters: {
    mask: { type: 'float', default: 0.5, min: 0.0, max: 1.0, step: 0.01, label: 'Mask' },
    invert: { type: 'int', default: 0, min: 0, max: 1, step: 1, label: 'Invert' }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: ['mask', 'invert'],
        parameterUI: { invert: 'toggle' },
        layout: { columns: 2 }
      }
    ],
    minColumns: 2
  },
  mainCode: `
    float maskCompositeM = ($param.invert != 0) ? (1.0 - $input.mask) : $input.mask;
    $output.out = mix($input.bg, $input.fg, maskCompositeM);
  `
};

// Note: gradient-mask node has been migrated to a native NodeSpec (if it exists).
// All VisualElements have been converted to native NodeSpecs.
