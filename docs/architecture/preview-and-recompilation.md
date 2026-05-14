# Preview, recompilation, and graph updates

**Last updated:** 2026-05-14

This document describes **how graph and structure changes reach the runtime**, how **`CompilationManager`** schedules full compiles vs fast paths, and how **`PreviewScheduler`** records signals for debugging and telemetry. For the parameter-specific path, see [`parameters-pipeline.md`](./parameters-pipeline.md). For worker offload of GLSL generation, see [`compilation-worker.md`](./compilation-worker.md).

## Single path: store → App → runtime

Graph structure changes (nodes, connections, non–position-only view changes, etc.) follow one route:

1. **UI** — e.g. [`NodeEditorCanvasWrapper.svelte`](../../src/lib/components/editor/NodeEditorCanvasWrapper.svelte): user action → `graphStore.*` mutator → `notifyGraphChanged()` → `callbacks.onGraphChanged(graphStore.graph)`.
2. **App** — `onGraphChanged` awaits `runtimeManager?.setGraph(g)` and integrates undo/redo snapshots.
3. **`RuntimeManager.setGraph`** — If the change is not **position-only** for the runtime, applies structure change handling, then `compilationManager.setGraph(graph)` and `compilationManager.onGraphStructureChange(immediate)`.

The canvas does **not** call legacy hooks such as `onNodeAdded` / `onConnectionAdded` separately for the same edits; structure is conveyed entirely through **`setGraph`**.

## Graph ownership at runtime

- **`RuntimeManager`** holds `currentGraph` and passes updates into **`CompilationManager.setGraph`**.
- **`CompilationManager`** holds `this.graph` for `recompile()` and `onParameterChange()`.

With immutable updates, the reference passed into `setGraph` is always the latest snapshot; nothing mutates that object in place for preview purposes.

## Change detection (two roles)

1. **`RuntimeManager`** — Decides whether to skip work (`isOnlyPositionChange`), what cleanup to run, and whether to ask for an **immediate** recompile path (`onGraphStructureChange(true)`) vs a debounced one (`false`). Treats some automation edits as not requiring shader recompile.
2. **`CompilationManager.recompile`** — Uses `detectGraphChanges(this.graph)` for **full vs incremental** compilation and to update cached metadata for the next run.

### Per-node Power (`NodeInstance.bypassed`)

Toggling **`bypassed`** is a **structural** graph change for compilation (same class as adding or removing a connection): it goes through `graphStore` → `setGraph` → full shader recompile, not a uniform-only fast path. Bypassed nodes are omitted from the compiled execution order; preview and export both read the same compiled result for a given graph snapshot.

## Compilation scheduling (current code)

| Trigger | Behavior (simplified) |
| --- | --- |
| Structure change, `immediate === false` | `scheduleRecompile()` — cancels pending work, then **`requestIdleCallback`** when available (`timeout` = compile debounce **100 ms**), else **`setTimeout(100 ms)`**. The idle/timer callback **only** schedules **`requestAnimationFrame`**; **`recompile()`** runs on the **next frame** so heavy compile work is not executed inside the idle/timer slice. |
| Structure change, `immediate === true` | Cancels pending, short **`setTimeout`** (**~80 ms**, `CONNECTION_STRUCTURE_COMPILE_DEBOUNCE_MS`) → **`recompile()`** directly — coalesces rapid wiring |
| Worker `result` / `error` reply | `onmessage` validates `id`, then schedules **`requestAnimationFrame`** → **`applyCompilationResult`** (or error handling) so the message handler stays short. |
| Preview compile toast (`previewCompileStatusStore`) | Whenever **`recompile()`** actually kicks **`recompileExecute`** (not the idle-skip path), the bottom stack shows **Updating preview…** via **`beginPreviewCompileProgressToast()`**: immediately for connection edits, automation-only / other structural edits, and the main-thread kick; **after one successful compile**, **node add/remove** still uses **double `requestAnimationFrame`** before the kick so the toast can paint first. **Idle-skip** (`shouldSkipPreviewRecompileForIdleGraphChanges`) clears the toast and does not compile. |
| Parameter change | `onParameterChange` — when `compileGraphIdentityRevision` matches the revision last paired with `lastGraphHash` and `lastGraphHash` is non-empty, skips `hashGraph` and treats structure as unchanged. When the identity revision is **ahead** of that paired revision (a structure notification arrived before the latest compile or idle-skip applied), the graph is treated as **compile-stale** and uniform-only updates defer to a recompile **without** hashing on every tick. If revisions are synced but `lastGraphHash` is still empty, `hashGraph` is used once to decide recompile vs uniform. Non-scalar parameter values still schedule a full recompile. |
| Audio setup change | Treated as structure-sensitive; uses the **immediate** path |

**Parameter-only updates** apply uniforms immediately and coalesce **one render per frame** via `requestAnimationFrame`.

### `PreviewScheduler` (instrumentation)

[`src/runtime/PreviewScheduler.ts`](../../src/runtime/PreviewScheduler.ts) records dirty reasons, compile phase transitions, and optional **developer-only** adaptive-preview flags. It is wired from [`Renderer.ts`](../../src/runtime/Renderer.ts) and [`CompilationManager.ts`](../../src/runtime/CompilationManager.ts). Relative to presentation cadence it is primarily **telemetry** (plus the optional adaptive DPR experiment); it does not own the main compile or rAF cadence. **Hot-path preview CPU work** lives in `CompilationManager` and adjacent runtime: compile-identity revision pairing to skip `hashGraph` on many uniform-only parameter updates, preview-parameter-surface memoization, audio-uniform collection scratch-buffer reuse, radial-pulse spawn-map pruning without spread churn, and (WebGPU-only) the optional URL experiment in *Optional developer URL flags* below.

**Adaptive preview (P2):** dev-only experiment — how to enable (`localStorage` + dev API) in [`adaptive-preview-p2-toggle.md`](./adaptive-preview-p2-toggle.md); product stance in [`PRODUCTIZATION.md`](./PRODUCTIZATION.md). **Manual integration QA** (adaptive × WebGL/WebGPU × image export): [`INTEGRATION-QA-CHECKLIST.md`](./INTEGRATION-QA-CHECKLIST.md).

## Reliability properties (current)

- **Latest graph for compile** — When a scheduled recompile runs, it reads **`this.graph`**, which reflects the last `setGraph`. Rapid edits cancel and reschedule; the callback is intended to see the latest graph.
- **Parameter + graph consistency** — `updateParameter(..., graph)` updates `CompilationManager`’s graph before `onParameterChange` runs; when the compile-identity revision is in sync, `onParameterChange` may skip `hashGraph` (see bullet below).
- **Compile-identity revision** — `CompilationManager` increments an internal revision on every `onGraphStructureChange` and records it alongside `lastGraphHash` whenever a compile (or idle-skip) refreshes that hash. While the revision matches that recorded value and `lastGraphHash` is non-empty, uniform-only parameter updates skip recomputing `hashGraph` (fewer sorts/stringifies on the hot path for large graphs). While the revision is **ahead** of the last paired value, uniform-only updates also skip `hashGraph` and conservatively schedule a recompile until the next sync (avoids hashing on every tick during in-flight compiles). Any new code path that assigns `lastGraphHash` must keep this pairing correct.
- **Errors** — Failed compile does not replace the active `ShaderInstance` with a broken one; errors go through the shared error handler. When a **previous** preview program is still active, the bottom stack briefly shows an **info** line (`previewCompileFailedKeptLastGood` / `keptLastGood` state) that the last working preview is still shown (supplementary to compile error toasts).
- **Context loss** — `recompile()` bails early when the GL context is lost; restore flows use dedicated APIs.
- **WebGPU-only preview** — `WebGpuRenderBackend` does not construct a parallel WebGL2 context; `getGLContext()` is null for that backend. Terminal WebGPU init failure or device loss sets `isWebGpuPreviewBlocked()` so `CompilationManager` does not spin on WebGL apply or assume a hybrid `super.render()` fallback (policy and pointers: [`webgl-webgpu-preview-export.md`](./webgl-webgpu-preview-export.md)).

### Optional developer URL flags (preview)

- **`?webgpuPreviewDependencyClock=1|true|yes`** — WebGPU-only experiment: may pass the compile **preview dependency** mask into `TimeManager` so paused graphs can avoid full-rate clock work when `resolveWebGpuPreviewDependencyMaskForClock` accepts the mask (**default off**, fail-open to full-rate). Implementation: `src/runtime/webGpuPreviewDependencyClock.ts`, `RuntimeManager.setTime`.

### Optional developer `localStorage` (preview, DEV-only)

- **`shadernoice.webgpuPreviewMaxModules`** — Parsed only when `import.meta.env.DEV`; integer clamp **[8, 256]** for the WebGPU preview shader + render-pipeline LRU in `WebGpuRenderBackend`. Production builds ignore this key. Details: [`docs/implementation/webgpu-preview-gpu-scheduling/PIPELINE-CACHE.md`](../implementation/webgpu-preview-gpu-scheduling/PIPELINE-CACHE.md).

## Worker interaction

When a compilation worker is attached, **`recompile()`** posts a message and returns; **`applyCompilationResult`** runs on the main thread when the result arrives (after **`requestAnimationFrame`** from `onmessage`). Stale replies are ignored via a monotonic compile id. Full compiles omit **`previousResult`** from the posted payload when incremental compile is not attempted, reducing **`structuredClone`** work in `cloneableCompilePayload`. Details: [`compilation-worker.md`](./compilation-worker.md).

---

## Appendix A: Historical review notes

An internal review noted that **`requestIdleCallback`** is meant for short idle work while **`recompile()`** can be heavy. **Current behavior:** the debounced path registers idle (or timer) only to **defer** work to the next **`requestAnimationFrame`**; `recompile()` / `recompileExecute` run in that frame callback, not inside the idle callback body. The idle **`timeout`** still bounds how long the browser may wait before invoking the scheduling callback when starved for idle time. Worker `postMessage` omits **`previousResult`** from the compile payload when incremental compile is not attempted, reducing **`structuredClone`** cost (`cloneableCompilePayload`); see [`compilation-worker.md`](./compilation-worker.md).

---

## Appendix B: Optional API cleanup

`RuntimeManager` still exposes `onNodeAdded` / `onConnectionAdded` / etc. for hypothetical alternate callers; the **primary** editor path does not use them. They can remain for compatibility or be removed in a dedicated refactor with call-site audit.
