import { describe, expect, it } from 'vitest';
import { pointerModifierDragMultiplier } from './valueInputDragSensitivity';

describe('pointerModifierDragMultiplier', () => {
  it.each([
    [{ shiftKey: false, ctrlKey: false, metaKey: false }, 1],
    [{ shiftKey: true, ctrlKey: false, metaKey: false }, 0.1],
    [{ shiftKey: false, ctrlKey: true, metaKey: false }, 10],
    [{ shiftKey: false, ctrlKey: false, metaKey: true }, 10],
    [{ shiftKey: true, ctrlKey: true, metaKey: false }, 0.1],
  ] as const)('returns expected multiplier for %s', (keys, expected) => {
    expect(pointerModifierDragMultiplier(keys)).toBe(expected);
  });
});
