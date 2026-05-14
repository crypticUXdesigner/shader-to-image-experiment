import type { NodeSpec } from '../../types/nodeSpec';

export const displaceNodeSpec: NodeSpec = {
  id: 'displace',
  category: 'Distort',
  displayName: 'Displace',
  icon: 'arrow-big-right',
  description:
    'Offset UVs: vector mode (offset × scale from Offset X/Y) or directional mode (angle × Amount × scale)',
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
    displaceMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Mode'
    },
    displaceScale: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 5.0,
      step: 0.01,
      label: 'Scale'
    },
    offsetX: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Offset X',
      knobPolarity: 'two-sided'
    },
    offsetY: {
      type: 'float',
      default: 0.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Offset Y',
      knobPolarity: 'two-sided'
    },
    directionalDisplaceAngle: {
      type: 'float',
      default: 0.0,
      min: -6.28,
      max: 6.28,
      step: 0.05,
      label: 'Angle',
      knobPolarity: 'two-sided'
    },
    amount: {
      type: 'float',
      default: 1.0,
      min: -10.0,
      max: 10.0,
      step: 0.01,
      label: 'Amount',
      knobPolarity: 'two-sided'
    }
  },
  parameterGroups: [
    {
      id: 'displace-main',
      label: 'Displace',
      parameters: ['displaceMode', 'displaceScale'],
      collapsible: false,
      defaultCollapsed: false
    },
    {
      id: 'displace-vector',
      label: 'Vector offset',
      parameters: ['offsetX', 'offsetY'],
      collapsible: true,
      defaultCollapsed: false
    },
    {
      id: 'displace-directional',
      label: 'Directional',
      parameters: ['directionalDisplaceAngle', 'amount'],
      collapsible: true,
      defaultCollapsed: true
    }
  ],
  parameterLayout: {
    // Mode + Scale stay visible in both modes; per-mode rows use visibleWhen (no duplicate Scale).
    elements: [
      {
        type: 'grid',
        parameters: ['displaceMode', 'displaceScale'],
        parameterUI: { displaceMode: 'enum' },
        layout: { columns: 2 }
      },
      {
        type: 'grid',
        label: 'Vector offset',
        visibleWhen: { parameter: 'displaceMode', equals: 0 },
        parameters: ['offsetX', 'offsetY'],
        parameterUI: { offsetX: 'coords', offsetY: 'coords' },
        layout: { columns: 2, coordsSpan: 2 }
      },
      {
        type: 'grid',
        label: 'Directional',
        visibleWhen: { parameter: 'displaceMode', equals: 1 },
        parameters: ['directionalDisplaceAngle', 'amount'],
        layout: { columns: 2 }
      }
    ]
  },
  mainCode: `
  if ($param.displaceMode == 1) {
    vec2 dir = vec2(cos($param.directionalDisplaceAngle), sin($param.directionalDisplaceAngle));
    $output.out = $input.in + dir * ($param.amount * $param.displaceScale);
  } else {
    vec2 offs = vec2($param.offsetX, $param.offsetY);
    $output.out = $input.in + offs * $param.displaceScale;
  }
`
};
