/**
 * Injected UI for preview compile lifecycle (toasts). Runtime must not import Svelte stores;
 * the app wires an implementation that delegates to `previewCompileStatusStore` helpers.
 */
export interface PreviewCompileUiSink {
  beginPreviewCompileProgressToast(label?: string): void;
  clearPreviewCompileProgressToast(): void;
  previewCompileFailedKeptLastGood(message?: string): void;
}
