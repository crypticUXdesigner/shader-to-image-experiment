import type { Meta, StoryObj } from '@storybook/svelte-vite';
import Component from './NodeHeader.svelte';
import { nodeSystemSpecs } from '../../../shaders/nodes';

const transformSpec = nodeSystemSpecs.find((s) => s.id === 'transform')!;

const meta = {
  title: "ShaderNoice/node/NodeHeader",
  component: Component,
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    spec: transformSpec,
    label: '',
    headerHeight: 260,
    nodePosition: { x: 0, y: 0 },
    nodeId: 'story-node',
    onLabelChange: () => {},
    onDragStart: () => {},
  },
};
