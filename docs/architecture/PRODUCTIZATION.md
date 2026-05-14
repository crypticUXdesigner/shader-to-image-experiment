# Adaptive preview (P2) — productization decision

**Date:** 2026-05-14  
**Prerequisite:** [`DRAWING-BUFFER-AUDIT.md`](./DRAWING-BUFFER-AUDIT.md) (**keep `preserveDrawingBuffer: true`** for WebGL preview and export).

## Decision

**Outcome B — internal / developer-only.** Adaptive preview remains **off by default**, toggled only via `localStorage`, `?previewOverlay`, and `window.__previewSchedulerDebug` as documented in [`adaptive-preview-p2-toggle.md`](./adaptive-preview-p2-toggle.md). There is **no** shipped settings control or user-goals copy for this toggle in the current release window.

## Rationale

Adaptive DPR capping during `interactionReduced` is a **presentation-budget experiment**: it trades preview sharpness while dragging for lower backing-store cost. That is valuable for contributors profiling large graphs, but it is **not** yet paired with end-user discovery (where the control lives, how it interacts with export and `prefers-reduced-motion`, and how support explains “sometimes blurry while dragging”). Task 01 confirms **`preserveDrawingBuffer: true`** must stay on WebGL preview and export paths; adaptive DPR does **not** contradict that — it only changes backing size during interaction — so the technical blocker for shipping a quality toggle is **product surface**, not the drawing-buffer audit.

Path **A** (user-visible quality control) would require a deliberate shell or settings placement per `docs/user-goals/`, `.impeccable.md` copy, and likely QA across WebGL + WebGPU preview and export modals. That belongs to a **follow-up initiative** if product prioritizes it, not to closing this package’s “ambiguous contract” goal.

## What “B” means for engineering

- **`PreviewScheduler`** and architecture docs must **not** imply a promised future user-facing adaptive setting.
- The implementation **stays** in tree (same APIs); contributors may still enable the experiment for profiling.
- Manual matrix for optional dev validation: [`INTEGRATION-QA-CHECKLIST.md`](./INTEGRATION-QA-CHECKLIST.md).

## If we revisit path A later

Reuse existing `setAdaptivePreviewEnabled` / storage key; add explicit user-goals + settings UX; keep default **off** until export and reduced-motion behavior are specified and tested.
