/**
 * Bottom toast stack reads this (see AppToastStack) for indeterminate “preview updating” while the
 * runtime compiles/links after graph edits (node add/remove, etc.). Written from CompilationManager.
 *
 * After a failed compile when the previous preview program is still active, a short **kept last good**
 * info state is shown then cleared (see `previewCompileFailedKeptLastGood`).
 */
import { writable } from 'svelte/store';

export type PreviewCompileStatus =
  | { state: 'idle' }
  | { state: 'updating'; label?: string }
  | { state: 'keptLastGood'; message: string };

export const previewCompileStatusStore = writable<PreviewCompileStatus>({ state: 'idle' });

/** Default copy for the indeterminate preview toast (AppToastStack fallback matches). */
export const PREVIEW_COMPILE_DEFAULT_LABEL = 'Updating preview…';

/** Default copy when compile failed but the previous preview shader is still in use. */
export const PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT =
  "Couldn't update preview. Your last working result is still shown.";

let keptLastGoodClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearKeptLastGoodTimer(): void {
  if (keptLastGoodClearTimer != null && typeof clearTimeout !== 'undefined') {
    clearTimeout(keptLastGoodClearTimer);
  }
  keptLastGoodClearTimer = null;
}

export function clearPreviewCompileProgressToast(): void {
  clearKeptLastGoodTimer();
  previewCompileStatusStore.set({ state: 'idle' });
}

export { graphNodesAddedOrRemoved, shouldDeferPreviewCompileToast } from '../../runtime/previewCompileDeferral';

export function beginPreviewCompileProgressToast(label?: string): void {
  clearKeptLastGoodTimer();
  previewCompileStatusStore.set({
    state: 'updating',
    label: label?.trim() || PREVIEW_COMPILE_DEFAULT_LABEL,
  });
}

const PREVIEW_COMPILE_KEPT_LAST_GOOD_MS = 4500;

/**
 * After a failed preview compile while a previous `ShaderInstance` remains active: show a brief
 * informational line in the bottom stack, then return to idle. Clears any pending auto-clear.
 * Does not replace compile **error** reporting — supplementary UX only.
 */
export function previewCompileFailedKeptLastGood(message?: string): void {
  clearKeptLastGoodTimer();
  const msg = message?.trim() || PREVIEW_COMPILE_KEPT_LAST_GOOD_DEFAULT;
  previewCompileStatusStore.set({ state: 'keptLastGood', message: msg });
  if (typeof setTimeout === 'undefined') return;
  keptLastGoodClearTimer = setTimeout(() => {
    keptLastGoodClearTimer = null;
    previewCompileStatusStore.set({ state: 'idle' });
  }, PREVIEW_COMPILE_KEPT_LAST_GOOD_MS);
}