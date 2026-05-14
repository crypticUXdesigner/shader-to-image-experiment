# Integration QA — adaptive preview × preview × image export

**Prerequisites:** [`PRODUCTIZATION.md`](./PRODUCTIZATION.md) (adaptive = **dev-only**), [`DRAWING-BUFFER-AUDIT.md`](./DRAWING-BUFFER-AUDIT.md) (WebGL export uses **dedicated** `ExportRenderPath` canvas + `preserveDrawingBuffer: true`; live preview is **not** `toBlob`’d for export).

Use this matrix before release or after touching `PreviewScheduler`, `Renderer.setupViewport`, `selectRenderBackend`, or image export orchestration.

## Environment prep

1. Load a graph that renders reliably (simple fullscreen color or known preset).
2. Optional: `?previewOverlay=1` (or `localStorage` `shadernoice.previewSchedulerOverlay` = `1`) so overlay shows `adaptive: on/off`, backing size, and `window.devicePixelRatio`.
3. Clear adaptive between runs: `localStorage.removeItem('shadernoice.previewAdaptive')` and reload.

## Matrix (record Pass / Fail / Skip + notes)

| # | Adaptive | Preview backend | Steps | Expected |
| --- | --- | --- | --- | --- |
| 1 | **Off** (default) | WebGL (`?renderBackend=webgl` or auto on machine without WebGPU) | Pan canvas or drag a node for ~2s, release. | Preview stays sharp at device DPR; no forced settle flicker beyond normal recompiles. |
| 2 | **On** | WebGL | `localStorage.setItem('shadernoice.previewAdaptive','1')` → reload. Pan/drag, release. | While dragging: overlay shows **adaptive: on**; backing DPR capped (~1.25× effective during `interactionReduced`). After release: one **full-DPR** settle pass (backing jumps up); preview not stuck blurry. |
| 3 | **Off** | WebGL | Open **image export** from shell; scrub time in dialog; confirm export at small resolution. | Dialog preview updates; final download matches frame; no black frame. |
| 4 | **On** | WebGL | Same as #3 with adaptive left **on** during dialog. | Same as #3 (export path is **off** live preview canvas per audit). |
| 5 | **Off** | WebGPU (`?renderBackend=webgpu`, GPU available) | Pan/drag, release. | Preview normal; no WebGL errors (WebGL context not on visible canvas in this mode). |
| 6 | **On** | WebGPU | Enable adaptive; pan/drag, release. | Adaptive flags still apply where `Renderer` / scheduler drive viewport; no crash; overlay consistent if enabled. |
| 7 | **On** | WebGPU | Image export dialog; scrub; export. | Preview/final use WebGPU raster path when session export backend is WebGPU; no silent fallback to WebGL for one job without user-visible error (see `AGENTS.md` / export parity). |

## Regression spot-checks

- **`prefers-reduced-motion`:** With OS reduced motion on, no new mandatory motion tied to adaptive (overlay is informational only).
- **Cancel image export:** Dialog closes without leaving preview black or zero-size canvas.

## Sign-off

| Role | Date | Result (e.g. all Pass) |
| --- | --- | --- |
| | | |

**Automated agent runs:** this checklist is **manual**; CI does not execute it. Record results here or in PR description when validating.
