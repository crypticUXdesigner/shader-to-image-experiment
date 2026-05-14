import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  beginPreviewCompileProgressToast,
  clearPreviewCompileProgressToast,
  previewCompileFailedKeptLastGood,
  previewCompileStatusStore,
  PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT,
} from './previewCompileStatusStore';

describe('previewCompileStatusStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearPreviewCompileProgressToast();
  });

  afterEach(() => {
    clearPreviewCompileProgressToast();
    vi.useRealTimers();
  });

  it('shows kept-last-good then returns to idle after timeout', () => {
    previewCompileFailedKeptLastGood();
    expect(get(previewCompileStatusStore)).toEqual({
      state: 'keptLastGood',
      message: PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT,
    });
    vi.advanceTimersByTime(4500);
    expect(get(previewCompileStatusStore)).toEqual({ state: 'idle' });
  });

  it('clears kept-last-good timer when a new compile begins', () => {
    previewCompileFailedKeptLastGood();
    vi.advanceTimersByTime(2000);
    beginPreviewCompileProgressToast();
    expect(get(previewCompileStatusStore).state).toBe('updating');
    vi.advanceTimersByTime(5000);
    expect(get(previewCompileStatusStore).state).toBe('updating');
  });
});
