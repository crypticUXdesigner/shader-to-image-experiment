/** @vitest-environment happy-dom */

/**
 * ValueInput — double-click opens inline edit
 *
 * Regression guard for the graph-node `.value-display` readout. Two activation paths must
 * both end in `editMode = true`, a focused real `<input>`, and selected text:
 *
 *  1. **Strict tap-then-down double**: two primary-mouse `pointerdown`s within
 *     `STRICT_DOUBLE_CLICK_MAX_MS` and `STRICT_DOUBLE_CLICK_MAX_MOVE_PX` of each other.
 *     This is what fires when the OS double-click chain has not finished by the time the
 *     second `pointerdown` arrives.
 *  2. **Native `dblclick`** on the display element — the slower fallback for users whose
 *     gesture exceeds the strict window but stays inside the browser's own dblclick window.
 *
 * Bug context: prior to this guard the strict-tap path entered edit mode, but Chrome's
 * compat `mousedown` (queued behind the second `pointerdown`) re-targeted focus through the
 * now-detached `.value-display`, collapsing focus to `<body>` and `handleBlur → commitEdit`
 * closed edit mode within the same frame. The fix is `e.preventDefault()` on the consuming
 * pointerdown so the compat chain is suppressed.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import ValueInput from './ValueInput.svelte';

function mountValueInput(props: Partial<{
  value: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
}> = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const instance = mount(ValueInput, {
    target,
    props: {
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      decimals: 3,
      ...props,
    },
  });
  return { target, instance };
}

function makePointerEvent(
  type: 'pointerdown' | 'pointerup',
  el: Element,
  overrides: Partial<PointerEventInit> = {}
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    clientX: 10,
    clientY: 10,
    ...overrides,
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('ValueInput — double-click to enter inline edit', () => {
  it('strict tap-then-down: two rapid primary-mouse pointerdowns open the <input>', async () => {
    const { target, instance } = mountValueInput();
    const display = target.querySelector('.value-display') as HTMLElement;
    expect(display, 'display readout should be rendered').not.toBeNull();
    expect(target.querySelector('input.input-edit')).toBeNull();

    // First press + release (records the completed primary tap).
    display.dispatchEvent(makePointerEvent('pointerdown', display));
    window.dispatchEvent(makePointerEvent('pointerup', window as unknown as Element));

    // Second press — must be on the still-present `.value-display` (the consume path
    // synchronously schedules editMode=true). `display` from before remains valid because
    // we have not awaited the Svelte microtask yet.
    display.dispatchEvent(makePointerEvent('pointerdown', display));

    // Two ticks: the first flushes Svelte's DOM update (display → input swap); the second
    // resolves `enterEditMode`'s own `await tick()` so input.focus()/select() have run.
    await tick();
    await tick();

    const input = target.querySelector('input.input-edit') as HTMLInputElement | null;
    expect(input, 'inline edit input should be mounted').not.toBeNull();
    expect(target.querySelector('.value-display')).toBeNull();
    expect(document.activeElement, 'inline input should hold focus').toBe(input);

    unmount(instance);
  });

  it('strict tap-then-down: consuming pointerdown is preventDefault()-ed so the compat mousedown chain cannot blur the new input', async () => {
    const { target, instance } = mountValueInput();
    const display = target.querySelector('.value-display') as HTMLElement;

    display.dispatchEvent(makePointerEvent('pointerdown', display));
    window.dispatchEvent(makePointerEvent('pointerup', window as unknown as Element));

    // Capture the second pointerdown so we can inspect defaultPrevented after dispatch.
    const secondDown = makePointerEvent('pointerdown', display);
    display.dispatchEvent(secondDown);
    expect(
      secondDown.defaultPrevented,
      'the consuming pointerdown must call preventDefault() to suppress the compat mousedown→click→dblclick chain'
    ).toBe(true);

    await tick();

    const input = target.querySelector('input.input-edit');
    expect(input).not.toBeNull();

    unmount(instance);
  });

  it('native dblclick fallback: still opens inline edit when the strict-tap path did not arm', async () => {
    const { target, instance } = mountValueInput();
    const display = target.querySelector('.value-display') as HTMLElement;

    // No prior pointerdown/up sequence — simulate the OS double-click firing after the
    // strict-tap window lapsed (or after movement disarmed it).
    display.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      })
    );

    await tick();
    await tick();

    const input = target.querySelector('input.input-edit') as HTMLInputElement | null;
    expect(input, 'native dblclick should still open inline edit').not.toBeNull();
    expect(document.activeElement).toBe(input);

    unmount(instance);
  });

  it('first-press path does NOT preventDefault, preserving the native dblclick fallback', () => {
    const { target, instance } = mountValueInput();
    const display = target.querySelector('.value-display') as HTMLElement;

    const firstDown = makePointerEvent('pointerdown', display);
    display.dispatchEvent(firstDown);
    expect(
      firstDown.defaultPrevented,
      'first pointerdown must not preventDefault — Chrome would otherwise suppress the native dblclick fallback'
    ).toBe(false);

    unmount(instance);
  });

  it('single tap (no follow-up press) does not enter edit mode', async () => {
    const { target, instance } = mountValueInput();
    const display = target.querySelector('.value-display') as HTMLElement;

    display.dispatchEvent(makePointerEvent('pointerdown', display));
    window.dispatchEvent(makePointerEvent('pointerup', window as unknown as Element));

    await tick();

    expect(target.querySelector('input.input-edit')).toBeNull();
    expect(target.querySelector('.value-display')).not.toBeNull();

    unmount(instance);
  });
});
