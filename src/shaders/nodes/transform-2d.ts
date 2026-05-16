import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Unified 2D affine transform: Flip → Scale → Rotate around a shared pivot.
 */
export const transform2dNodeSpec: NodeSpec = {
  id: 'transform',
  category: 'Distort',
  displayName: 'Transform',
  description: 'Flip, scale, and rotate UVs around a shared pivot (fixed order: flip, then scale, then rotate)',
  icon: 'arrows-out',
  inputs: [
    {
      name: 'in',
      type: 'vec2',
      label: 'UV'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2',
      label: 'UV'
    }
  ],
  parameters: {
    pivotX: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Pivot X',
      knobPolarity: 'two-sided'
    },
    pivotY: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Pivot Y',
      knobPolarity: 'two-sided'
    },
    flipX: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      label: 'Flip X'
    },
    flipY: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      label: 'Flip Y'
    },
    scaleX: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Scale X'
    },
    scaleY: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      label: 'Scale Y'
    },
    angle: {
      type: 'float',
      default: 0.0,
      min: -180.0,
      max: 180.0,
      step: 1.0,
      label: 'Angle',
      knobPolarity: 'two-sided'
    }
  },
  parameterGroups: [
    {
      id: 'transform-pivot',
      label: 'Pivot',
      parameters: ['pivotX', 'pivotY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'transform-flip',
      label: 'Flip',
      parameters: ['flipX', 'flipY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'transform-scale',
      label: 'Scale',
      parameters: ['scaleX', 'scaleY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'transform-rotate',
      label: 'Rotate',
      parameters: ['angle'],
      collapsible: true,
      defaultCollapsed: false
    }
  ],
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        label: 'Pivot',
        parameters: ['pivotX', 'pivotY'],
        parameterUI: { pivotX: 'coords', pivotY: 'coords' },
        layout: { columns: 2, coordsSpan: 2 }
      },
      {
        type: 'grid',
        label: 'Flip',
        parameters: ['flipX', 'flipY'],
        layout: { columns: 2 }
      },
      {
        type: 'grid',
        label: 'Scale',
        parameters: ['scaleX', 'scaleY'],
        layout: { columns: 2 }
      },
      {
        type: 'grid',
        label: 'Rotate',
        parameters: ['angle'],
        layout: { columns: 1 }
      }
    ]
  },
  mainCode: `
    // Fixed order: Flip → Scale → Rotate around shared pivot.
    vec2 C = vec2($param.pivotX, $param.pivotY);
    vec2 p = $input.in - C;
    if ($param.flipX > 0) p.x = -p.x;
    if ($param.flipY > 0) p.y = -p.y;
    p *= vec2($param.scaleX, $param.scaleY);
    float c = cos(radians($param.angle));
    float s = sin(radians($param.angle));
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
    $output.out = C + p;
  `
};
