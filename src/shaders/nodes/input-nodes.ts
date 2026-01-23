import type { NodeSpec } from '../../types';

/**
 * Input Nodes - provide basic inputs like UV coordinates, time, resolution, and constants
 */

export const uvCoordinatesNodeSpec: NodeSpec = {
  id: 'uv-coordinates',
  category: 'Inputs',
  displayName: 'UV Coordinates',
  description: 'Outputs normalized UV coordinates (0-1)',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {},
  mainCode: `
    // Output normalized screen space coordinates (p from base shader template)
    $output.out = p;
  `
};

export const timeNodeSpec: NodeSpec = {
  id: 'time',
  category: 'Inputs',
  displayName: 'Time',
  description: 'Outputs the current time value',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'float'
    }
  ],
  parameters: {},
  mainCode: `
    // Output time
    $output.out = $time;
  `
};

export const resolutionNodeSpec: NodeSpec = {
  id: 'resolution',
  category: 'Inputs',
  displayName: 'Resolution',
  description: 'Outputs the screen resolution as vec2',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {},
  mainCode: `
    // Output resolution
    $output.out = $resolution;
  `
};

export const fragmentCoordinatesNodeSpec: NodeSpec = {
  id: 'fragment-coordinates',
  category: 'Inputs',
  displayName: 'Fragment Coordinates',
  description: 'Outputs the fragment coordinates (gl_FragCoord.xy)',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'vec2'
    }
  ],
  parameters: {},
  mainCode: `
    // Output fragment coordinates
    $output.out = gl_FragCoord.xy;
  `
};

export const constantFloatNodeSpec: NodeSpec = {
  id: 'constant-float',
  category: 'Inputs',
  displayName: 'Constant Float',
  description: 'Outputs a constant float value',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'float'
    }
  ],
  parameters: {
    value: {
      type: 'float',
      default: 0.5,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    }
  },
  mainCode: `
    // Output constant float value
    $output.out = $param.value;
  `
};

export const constantVec2NodeSpec: NodeSpec = {
  id: 'constant-vec2',
  category: 'Inputs',
  displayName: 'Constant Vec2',
  description: 'Outputs a constant vec2 value',
  inputs: [],
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
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    y: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    }
  },
  mainCode: `
    // Output constant vec2 value
    $output.out = vec2($param.x, $param.y);
  `
};

export const constantVec3NodeSpec: NodeSpec = {
  id: 'constant-vec3',
  category: 'Inputs',
  displayName: 'Constant Vec3',
  description: 'Outputs a constant vec3 value',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'vec3'
    }
  ],
  parameters: {
    x: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    y: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    z: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    }
  },
  mainCode: `
    // Output constant vec3 value
    $output.out = vec3($param.x, $param.y, $param.z);
  `
};

export const constantVec4NodeSpec: NodeSpec = {
  id: 'constant-vec4',
  category: 'Inputs',
  displayName: 'Constant Vec4',
  description: 'Outputs a constant vec4 value',
  inputs: [],
  outputs: [
    {
      name: 'out',
      type: 'vec4'
    }
  ],
  parameters: {
    x: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    y: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    z: {
      type: 'float',
      default: 0.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    },
    w: {
      type: 'float',
      default: 1.0,
      min: -1000.0,
      max: 1000.0,
      step: 0.01
    }
  },
  mainCode: `
    // Output constant vec4 value
    $output.out = vec4($param.x, $param.y, $param.z, $param.w);
  `
};
