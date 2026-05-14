import type { NodeSpec } from '../../types/nodeSpec';

export const brickTilingNodeSpec: NodeSpec = {
  id: 'brick-tiling',
  category: 'Distort',
  displayName: 'Tiling',
  icon: 'grid',
  description: 'Tiles coordinates (optionally with brick-style alternating row offset)',
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
    brickScaleX: {
      type: 'float',
      default: 4.0,
      min: 0.1,
      max: 50.0,
      step: 0.1,
      label: 'Scale X'
    },
    brickScaleY: {
      type: 'float',
      default: 4.0,
      min: 0.1,
      max: 50.0,
      step: 0.1,
      label: 'Scale Y'
    },
    offsetX: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Offset X',
      knobPolarity: 'two-sided'
    },
    brickAmount: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Brick Amount'
    },
    brickOffsetX: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Brick Offset X',
      knobPolarity: 'two-sided'
    },
    brickOffsetY: {
      type: 'float',
      default: 0.0,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      label: 'Offset Y',
      knobPolarity: 'two-sided'
    }
  },
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        parameters: [
          'brickScaleX',
          'brickScaleY',
          'offsetX',
          'brickOffsetY',
          'brickAmount',
          'brickOffsetX',
        ],
        // `coords` pairs each X with the *next* grid parameter as Y. `brickOffsetX` is last, so marking
        // it `coords` renders nothing (no paramY) and the value sticks at 0 — Brick Amount then has no effect.
        parameterUI: { offsetX: 'coords', brickOffsetY: 'coords' },
        layout: { columns: 2, coordsSpan: 2, coordsOrigin: 'bottom-left' }
      }
    ]
  },
  functions: `
vec2 brickTiling(vec2 p, vec2 scale, vec2 offset, float brickAmount, float brickOffsetX) {
  vec2 q = p * scale + offset;
  float row = floor(q.y);
  float parity = mod(row, 2.0); // 0 on even rows, 1 on odd rows
  q.x += parity * brickOffsetX * brickAmount;
  return fract(q);
}
`,
  mainCode: `
  vec2 brickScale = vec2($param.brickScaleX, $param.brickScaleY);
  vec2 offset = vec2($param.offsetX, $param.brickOffsetY);
  $output.out = brickTiling($input.in, brickScale, offset, $param.brickAmount, $param.brickOffsetX);
`
};
