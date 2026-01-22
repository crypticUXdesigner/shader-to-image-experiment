import type { NodeSpec } from '../../types';

/**
 * Transform Nodes
 * These nodes modify coordinates (vec2 → vec2)
 */

export const translateNodeSpec: NodeSpec = {
  id: 'translate',
  category: 'Transform',
  displayName: 'Translate',
  description: 'Translates coordinates by x and y offsets',
  inputs: [
    {
      name: 'in',
      type: 'vec2'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {
    x: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    },
    y: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    }
  },
  mainCode: `
    $output.out = $input.in + vec2($param.x, $param.y);
  `
};

export const rotateNodeSpec: NodeSpec = {
  id: 'rotate',
  category: 'Transform',
  displayName: 'Rotate',
  description: 'Rotates coordinates around a center point',
  inputs: [
    {
      name: 'in',
      type: 'vec2'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {
    angle: {
      type: 'float',
      default: 0.0,
      min: -6.28,
      max: 6.28,
      step: 0.05
    },
    centerX: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    },
    centerY: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    }
  },
  mainCode: `
    vec2 center = vec2($param.centerX, $param.centerY);
    vec2 offset = $input.in - center;
    float c = cos($param.angle);
    float s = sin($param.angle);
    $output.out = center + vec2(offset.x * c - offset.y * s, offset.x * s + offset.y * c);
  `
};

export const scaleNodeSpec: NodeSpec = {
  id: 'scale',
  category: 'Transform',
  displayName: 'Scale',
  description: 'Scales coordinates around a center point',
  inputs: [
    {
      name: 'in',
      type: 'vec2'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {
    scaleX: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01
    },
    scaleY: {
      type: 'float',
      default: 1.0,
      min: 0.1,
      max: 10.0,
      step: 0.01
    },
    centerX: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    },
    centerY: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01
    }
  },
  mainCode: `
    vec2 center = vec2($param.centerX, $param.centerY);
    $output.out = center + ($input.in - center) * vec2($param.scaleX, $param.scaleY);
  `
};
