# WebGL `preserveDrawingBuffer` + readback audit

**Scope:** ShaderNoice preview (WebGL2) and raster export paths. **WebGPU** preview/export uses a different surface (`GPUCanvasContext` / readback via `copyTextureToBuffer` in export helpers); it is noted only where APIs mix.

**Recommendation (one line):** **Keep `preserveDrawingBuffer: true`** on every WebGL2 context used for preview or export in this codebase until a follow-up task introduces an explicit post-render copy (e.g. `readPixels` / blit to 2D) before any compositor-dependent read. **Do not flip defaults** based on this audit alone.

---

## 1. Where WebGL2 is created and the flag is set

| Location | Context surface | `preserveDrawingBuffer` | Purpose |
| --- | --- | --- | --- |
| [`src/runtime/Renderer.ts`](../../src/runtime/Renderer.ts) (`getContext('webgl2', …)`) | The canvas passed into `Renderer` — for live preview this is the visible mount canvas when the backend is [`WebGlRenderBackend`](../../src/runtime/renderBackends/WebGlRenderBackend.ts) ([`selectRenderBackend`](../../src/runtime/renderBackends/selectRenderBackend.ts) `webgl` / `auto` without WebGPU). | **`true`** (comment: *export / 2d blit fallback*) | Renders the live shader; optional **`drawImage(glBacking)` → presentation** when an off-screen backing exists (subclass / detached layout). |
| [`src/video-export/ExportRenderPath.ts`](../../src/video-export/ExportRenderPath.ts) | Dedicated `document.createElement('canvas')` at export resolution (not the live preview element). | **`true`** | Offline frame rendering for **image** and **video** WebGL export; frames are handed to **Mediabunny `CanvasSource`** ([`WebCodecsVideoExporter`](../../src/video-export/WebCodecsVideoExporter.ts)) or **`canvas.toBlob`** ([`imageExportOrchestrator`](../../src/image-export/imageExportOrchestrator.ts)). |

No other `webgl2` context creation sites were found in `src/` (search: `getContext('webgl2'`.

**WebGPU-only preview** ([`WebGpuRenderBackend`](../../src/runtime/renderBackends/WebGpuRenderBackend.ts)): does not construct a WebGL2 context on the visible canvas; **`preserveDrawingBuffer` does not apply** there.

---

## 2. Readback / snapshot call sites vs live preview

**Live WebGL preview**

- No app `toBlob` / `toDataURL` / `readPixels` on the preview canvas in product code.
- **2D blit path:** `Renderer.blitWebGlBackingToPresentationIfDetached()` uses `presentationCanvas.getContext('2d')` and **`ctx.drawImage(this.glBackingCanvas, …)`**. That reads the WebGL canvas’s **current drawing buffer** as a bitmap source. With **`preserveDrawingBuffer: false`**, contents are **undefined after compositing** per WebGL semantics; intermittent **black or stale** blits are a known failure mode when the browser clears the default framebuffer after presentation.

**Export (WebGL)**

- **Image:** `createExportRenderPath` → `renderFrame` → **`canvas.toBlob`** on the same WebGL canvas (after `flush`/`finish` in `ExportRenderPath`).
- **Video:** `renderFrame` / `renderFrameAsync` → canvas passed to **`WebCodecsVideoExporter.addFrame`** → Mediabunny **`CanvasSource`** (implicit per-frame capture from the canvas).

`ExportRenderPath` already calls **`gl.finish()`** before returning the canvas to reduce **intermittent black frames** when the encoder snapshots the surface. **`preserveDrawingBuffer: true`** remains important because capture can still occur **after** the WebGL drawing buffer would otherwise become invalid for readback when the default is `false`.

**Export (WebGPU)**

- **Image:** [`renderWebGpuExportRgba8`](../../src/image-export/WebGpuExportRenderPath.ts) → CPU RGBA8 → **fresh 2D canvas** via `putImageData` → `toBlob` (no WebGL drawing buffer).
- **Video:** [`WebGpuVideoExportRenderPath`](../../src/video-export/WebGpuVideoExportRenderPath.ts) renders to a **WebGPU canvas**; sync before handoff; still not `preserveDrawingBuffer`.

**Orthogonal / test-only**

- [`webgpuGoldenHarnessMain.ts`](../../src/validation/webgpuGoldenHarnessMain.ts): `toDataURL` / `getImageData` on harness canvases — not product preview/export.
- [`FrameBuffer.ts`](../../src/ui/editor/rendering/FrameBuffer.ts): 2D `getImageData` — not wired to WebGL preview readback (orchestrator comment: too expensive).

---

## 3. Tradeoffs of `preserveDrawingBuffer`

| Concern | `true` | `false` |
| --- | --- | --- |
| **Memory / compositing** | Browser may retain the full-color buffer longer; small extra GPU memory pressure vs default. | Lower retention; default for many apps. |
| **Readback / `drawImage` / `toBlob` / encoder capture** | Contents remain defined for reads **after** the frame is presented (modulo explicit clears in app code). | After present, **reading the buffer is undefined**; race-prone **black or empty** captures unless you copy out before the compositor boundary. |
| **Multi-DPR / resize** | Unchanged; still tied to `Renderer.setupViewport` / export canvas width-height. | Same; risk is **readback timing**, not DPR math. |

---

## 4. Tests and manual checks that would fail if the flag were wrong

**Automated:** There is **no** unit test today that asserts `preserveDrawingBuffer` or bitmap stability after `renderFrame`; export tests focus on compilation gates and WebGPU paths.

**Manual / integration (regression if set `false` without a new copy path):**

1. **WebGL image export:** Open image export, confirm dialog **preview** and **final PNG/JPEG/WebP** match the shader (no black / cleared frame).
2. **WebGL video export:** Encode a short clip; scan for **intermittent black frames** (historically mitigated by `finish()` + `preserveDrawingBuffer: true`).
3. **WebGL preview + detached / blit layout:** Any configuration that uses **off-screen WebGL backing + `drawImage` to presentation** must show a stable image when idle (not flashing black between frames).
4. **WebGPU session:** Raster export uses WebGPU helpers above — should be **unchanged** by a WebGL flag flip, but worth a **smoke** image + video export when toggling backends in QA.

---

## 5. Next step (defer / ticket pointer)

Treat **turning `preserveDrawingBuffer` off** as a **separate engineering task**: prove with **automated** visual or pixel probes on WebGL image + video export and on any blit fallback, or implement an **explicit resolve** (e.g. copy default FBO to 2D or texture readback) before any API that samples the canvas. Until then, **keep `true`**; adaptive preview (P2) remains **dev-only** per [`PRODUCTIZATION.md`](./PRODUCTIZATION.md) without assuming a WebGL buffer lifetime change.

**Related:** [`adaptive-preview-p2-toggle.md`](./adaptive-preview-p2-toggle.md), [`preview-and-recompilation.md`](./preview-and-recompilation.md).
