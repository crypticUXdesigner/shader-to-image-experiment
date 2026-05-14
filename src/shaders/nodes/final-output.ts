import type { NodeSpec } from '../../types/nodeSpec';

/**
 * Final Output Node
 * Marks a node as the final output for the shader.
 * This is a terminal node that marks where the rendering pipeline ends.
 * The compiler uses the input connection to determine the final shader output.
 * Float inputs promote to vec3 (e.g. `vec3(scalar)`) via port typing / codegen—no separate adapter node.
 */
export const finalOutputNodeSpec: NodeSpec = {
  id: 'final-output',
  category: 'Output',
  displayName: 'Output',
  description: 'Marks the final output for the shader. Converts input to color.',
  inputs: [
    {
      name: 'in',
      type: 'vec3', // Accepts vec3; scalar inputs promote via TypeValidator / codegen
      label: 'Color',
      hideHeaderLabel: true
    }
  ],
  outputs: [],  // Terminal node - no outputs
  parameters: {},
  mainCode: ''  // No code needed - compiler uses input connection directly
};
