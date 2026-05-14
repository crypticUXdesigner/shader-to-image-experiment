# Adaptive preview (P2) — how to enable the toggle

**Last updated:** 2026-05

**Code:** [`src/runtime/PreviewScheduler.ts`](../../src/runtime/PreviewScheduler.ts) (`ADAPTIVE_PREVIEW_STORAGE_KEY`, `setAdaptivePreviewEnabled`, `Renderer` DPR cap + settle).

**Default:** adaptive preview is **off**. Baseline preview behavior matches a build without this flag.

## Product stance

Adaptive preview is **maintained as an internal / developer experiment**, not a supported end-user feature. There is no in-app settings entry for it; enabling it requires DevTools, `localStorage`, or URL flags as below. Behavior may change or be removed without a migration path. Formal decision: [`PRODUCTIZATION.md`](./PRODUCTIZATION.md).

## DevTools console (`__previewSchedulerDebug`, any build)

`window.__previewSchedulerDebug` is always installed after the runtime starts (see `installPreviewSchedulerDebugGlobal()` in the same module).

**Overlay without typing in the console:** add `?previewOverlay` or `?previewOverlay=1` to the URL (use `previewOverlay=0` to force off for that load). Or set `localStorage.setItem('shadernoice.previewSchedulerOverlay', '1')` and reload when the URL does not include `previewOverlay`.

```js
// Turn on (persists to localStorage — survives reload)
window.__previewSchedulerDebug.setAdaptivePreview(true);

// Turn off
window.__previewSchedulerDebug.setAdaptivePreview(false);

// Optional: overlay (~300ms) shows mode, compile phase, adaptive on/off, DPR
window.__previewSchedulerDebug.enableOverlay(true);
```

## localStorage only (`shadernoice.previewAdaptive`, any build)

Same persistence the dev API uses:

```js
localStorage.setItem('shadernoice.previewAdaptive', '1');  // enable — then reload the app
localStorage.removeItem('shadernoice.previewAdaptive');    // disable — then reload
```

## What it does when enabled

- While the scheduler reports **`interactionReduced`** (e.g. canvas pan / node drag), the preview **caps effective `devicePixelRatio`** at **1.25×** when sizing the WebGL backing store (`Renderer.setupViewport`).
- On **interaction end**, one **full-DPR** viewport pass is scheduled so the next committed frame can settle at native backing scale (then a redraw is forced).

**Not changed:** live preview still uses **`preserveDrawingBuffer: true`**. Audit + recommendation: [`DRAWING-BUFFER-AUDIT.md`](./DRAWING-BUFFER-AUDIT.md) (**keep `true`** until an explicit resolve path exists).

## Related reading

- Preview / recompile context: [`preview-and-recompilation.md`](./preview-and-recompilation.md)
- Manual QA matrix (adaptive × backends × export): [`INTEGRATION-QA-CHECKLIST.md`](./INTEGRATION-QA-CHECKLIST.md)
