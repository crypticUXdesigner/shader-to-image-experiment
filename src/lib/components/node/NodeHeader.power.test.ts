/** @vitest-environment happy-dom */

import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import NodeHeader from './NodeHeader.svelte';
import { nodeSystemSpecs } from '../../../shaders/nodes';

const transformSpec = nodeSystemSpecs.find((s) => s.id === 'transform')!;
const addSpec = nodeSystemSpecs.find((s) => s.id === 'add')!;

function mountHeader(props: {
  spec: (typeof nodeSystemSpecs)[number];
  bypassed?: boolean;
  onPowerToggle?: (nodeId: string, next: boolean) => void;
}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(NodeHeader, {
    target,
    props: {
      spec: props.spec,
      label: '',
      headerHeight: 88,
      nodePosition: { x: 0, y: 0 },
      nodeId: 'n-test',
      bypassed: props.bypassed,
      onPowerToggle: props.onPowerToggle,
      onLabelChange: () => {},
      onDragStart: () => {},
    },
  });
  return { target, instance };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('NodeHeader — Power button', () => {
  it('renders the power toggle for an eligible node (transform)', () => {
    const { target, instance } = mountHeader({ spec: transformSpec });
    expect(target.querySelector('.power-toggle')).not.toBeNull();
    unmount(instance);
  });

  it('does not render the power toggle for an ineligible node (add)', () => {
    const { target, instance } = mountHeader({ spec: addSpec });
    expect(target.querySelector('.power-toggle')).toBeNull();
    unmount(instance);
  });

  it('calls onPowerToggle with toggled bypass state on click', async () => {
    const onPowerToggle = vi.fn();
    const user = userEvent.setup();
    const { target, instance } = mountHeader({
      spec: transformSpec,
      bypassed: false,
      onPowerToggle,
    });
    const btn = target.querySelector('.power-toggle')!;
    await user.click(btn);
    expect(onPowerToggle).toHaveBeenCalledTimes(1);
    expect(onPowerToggle).toHaveBeenCalledWith('n-test', true);
    unmount(instance);
  });

  it('reflects bypassed state in aria-label and title', () => {
    const { target: onTarget, instance: onInst } = mountHeader({
      spec: transformSpec,
      bypassed: false,
    });
    const onBtn = onTarget.querySelector('.power-toggle') as HTMLButtonElement;
    expect(onBtn.getAttribute('aria-label')).toBe('Power — bypass this node');
    expect(onBtn.getAttribute('title')).toBe('Power — bypass this node');
    unmount(onInst);

    const { target: offTarget, instance: offInst } = mountHeader({
      spec: transformSpec,
      bypassed: true,
    });
    const offBtn = offTarget.querySelector('.power-toggle') as HTMLButtonElement;
    expect(offBtn.getAttribute('aria-label')).toBe('Power — node is bypassed');
    expect(offBtn.getAttribute('title')).toBe('Power — node is bypassed');
    unmount(offInst);
  });

  it('does not start header drag when pointerdown originates on the power button', () => {
    const onDragStart = vi.fn();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(NodeHeader, {
      target,
      props: {
        spec: transformSpec,
        label: '',
        headerHeight: 88,
        nodePosition: { x: 0, y: 0 },
        nodeId: 'n-test',
        onDragStart,
        onLabelChange: () => {},
      },
    });
    const btn = target.querySelector('.power-toggle')!;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
    expect(onDragStart).not.toHaveBeenCalled();
    unmount(instance);
  });

  it('activates via Enter when focused (native button semantics)', async () => {
    const onPowerToggle = vi.fn();
    const user = userEvent.setup();
    const { target, instance } = mountHeader({
      spec: transformSpec,
      bypassed: false,
      onPowerToggle,
    });
    const btn = target.querySelector('.power-toggle')!;
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onPowerToggle).toHaveBeenCalledWith('n-test', true);
    unmount(instance);
  });
});
