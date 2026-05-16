/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from 'vitest';
import { mount, unmount } from 'svelte';
import type { NodeGraph } from '../../../data-model/types';
import Node from './Node.svelte';
import { nodeSystemSpecs } from '../../../shaders/nodes';

const transformSpec = nodeSystemSpecs.find((s) => s.id === 'transform')!;
const nodeSpecs = new Map(nodeSystemSpecs.map((s) => [s.id, s]));

afterEach(() => {
  document.body.replaceChildren();
});

describe('Node — bypassed visual class', () => {
  it('adds is-bypassed to the root when node.bypassed is true', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 'g',
      version: '2.0',
      nodes: [],
      connections: [],
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(Node, {
      target,
      props: {
        nodeId: 'n1',
        node: {
          id: 'n1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 0, pivotX: 0, pivotY: 0 },
          bypassed: true,
        },
        spec: transformSpec,
        metrics: { width: 200, height: 88, headerHeight: 88 },
        selected: false,
        graph,
        audioSetup: { files: [], bands: [], remappers: [] },
        nodeSpecs,
        nodePosition: { x: 0, y: 0 },
        onDrag: () => {},
        onSelect: () => {},
        onLabelChange: () => {},
        onParameterChange: () => {},
      },
    });
    const root = target.querySelector('.node')!;
    expect(root.classList.contains('is-bypassed')).toBe(true);
    unmount(instance);
  });

  it('omits is-bypassed when bypassed is absent or false', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 'g',
      version: '2.0',
      nodes: [],
      connections: [],
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(Node, {
      target,
      props: {
        nodeId: 'n1',
        node: {
          id: 'n1',
          type: 'transform',
          position: { x: 0, y: 0 },
          parameters: { angle: 0, pivotX: 0, pivotY: 0 },
        },
        spec: transformSpec,
        metrics: { width: 200, height: 88, headerHeight: 88 },
        selected: false,
        graph,
        audioSetup: { files: [], bands: [], remappers: [] },
        nodeSpecs,
        nodePosition: { x: 0, y: 0 },
        onDrag: () => {},
        onSelect: () => {},
        onLabelChange: () => {},
        onParameterChange: () => {},
      },
    });
    const root = target.querySelector('.node')!;
    expect(root.classList.contains('is-bypassed')).toBe(false);
    unmount(instance);
  });
});
