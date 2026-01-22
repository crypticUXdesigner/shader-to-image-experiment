import type { NodeSpec } from '../../types';

/**
 * Color Map Node
 * Converts a float value to vec3 color (grayscale or with color mapping)
 */
export const colorMapNodeSpec: NodeSpec = {
  id: 'color-map',
  category: 'Operation',
  displayName: 'Color Map',
  description: 'Converts float value to vec3 color (grayscale)',
  inputs: [
    {
      name: 'in',
      type: 'float'
    }
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec3'
    }
  ],
  parameters: {},
  mainCode: `
    // Convert float to grayscale vec3
    $output.out = vec3($input.in);
  `
};
