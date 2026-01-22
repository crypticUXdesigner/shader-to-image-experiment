import type { NodeSpec } from '../../types';

/**
 * Final Output Node
 * Marks a node as the final output for the shader.
 * Converts any input type to vec3/vec4 for final color output.
 */
export const finalOutputNodeSpec: NodeSpec = {
  id: 'final-output',
  category: 'Output',
  displayName: 'Final Output',
  description: 'Marks the final output for the shader. Converts input to color.',
  inputs: [
    {
      name: 'in',
      type: 'vec3'  // Accepts vec3 (use color-map node before this for float inputs)
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
    // Convert input to vec3 for final output
    // The compiler's type promotion will handle the conversion automatically
    // For float: vec3(value)
    // For vec2: vec3(value, 0.0)
    // For vec3: value
    // For vec4: value.rgb
    $output.out = $input.in;
  `
};
