# Implementation specs

Focused engineering notes for behavior that is **partially implemented**, **not yet wired to UX**, or **easy to drift** across files. They complement **`docs/user-goals/`** (what users should get). Multi-step work lives here too: optional **`docs/implementation/<slug>/_OVERVIEW.md`** plus numbered task markdown files in the same folder (see **`workpkg-hygiene.mdc`**, **`define-project` / `define-tasks`** skills).

| Document | Topic |
|----------|--------|
| [graph-undo-redo.md](./graph-undo-redo.md) | Wire `UndoRedoManager` to keyboard/UI so undo/redo matches user goals |
| [node-panel-category-order.md](./node-panel-category-order.md) | Keep browse category order consistent between node panel and add picker |
| [a11y-baseline.md](./a11y-baseline.md) | Accessibility baseline / scripted checks |
| [node-port-labels-in-out-analysis.md](./node-port-labels-in-out-analysis.md) | Port labels: extended reference + audit tables (**canonical rules:** `shaders/node-standards.mdc` § port labels) |
| [`webgpu-migration/_OVERVIEW.md`](./webgpu-migration/_OVERVIEW.md) | **Historical:** WebGPU-first rollout tasks + ledger (**superseded** for policy — see [`docs/architecture/webgl-webgpu-preview-export.md`](../architecture/webgl-webgpu-preview-export.md)) |
| [`webgpu-heavy-nodes-followup/_OVERVIEW.md`](./webgpu-heavy-nodes-followup/_OVERVIEW.md) | **Active:** Task **10** remainder — `particle-system` GPU pass plan (compiler → preview → export → gates) + optional audio+RD export gate (**05**) |
| [`node-power/_OVERVIEW.md`](./node-power/_OVERVIEW.md) | Per-node Power (bypass) toggle: serialized node setting + two global compile rules + UI affordance |
| [`expression-node/_OVERVIEW.md`](./expression-node/_OVERVIEW.md) | **Expression** node: sandboxed math DSL (`a`–`d`), dual GLSL/WGSL emit, CodeMirror UI, demo preset |
| [`preview-compile-feedback/_OVERVIEW.md`](./preview-compile-feedback/_OVERVIEW.md) | Preview recompile **progress toast** coverage + **failed compile / last-good** clarity (bottom stack / info path) |
| [`audio-band-valueinput-ux/_OVERVIEW.md`](./audio-band-valueinput-ux/_OVERVIEW.md) | Audio band **`ValueInput`** fields: **vertical-intent** drag (ignore horizontal-dominant scrub), **Tab → inline edit**, modifier drag **regression** after drag changes |
| [`color-map-node-removal/_OVERVIEW.md`](./color-map-node-removal/_OVERVIEW.md) | **Remove `color-map` node:** migrate graphs on load, drop redundant float→grayscale stub from registry/WGSL, presets + docs closeout |
| [`runtime-editor-perf-phase2/_OVERVIEW.md`](./runtime-editor-perf-phase2/_OVERVIEW.md) | **Active:** Post–`/review-performance` residual — parameter `hashGraph` burst, lighter graph identity, preview-surface adjacency, canvas `$effect` audit, playing-path audio analyzer, DomNodeLayer DOM budget |
| [`webgpu-preview-gpu-scheduling/_OVERVIEW.md`](./webgpu-preview-gpu-scheduling/_OVERVIEW.md) | **Active:** WebGPU preview **GPU path & scheduling** — instrumentation, clock-mask hardening, uniform upload audit, editor view-sync backoff when fullscreen, pipeline LRU docs |
| [`graph-runtime-ui-seams/_OVERVIEW.md`](./graph-runtime-ui-seams/_OVERVIEW.md) | **Done (2026-05-14):** Graph / runtime / UI **seam hardening** — preview-compile UI sink, canvas parameter sync, `App` runtime bootstrap extract, WebGPU paste/add guards, worker message contract tests |
| [`graph-runtime-ui-architecture-followup/_OVERVIEW.md`](./graph-runtime-ui-architecture-followup/_OVERVIEW.md) | **Active:** Post–`/review-architecture` follow-up — `App` orchestration shrink, render-backend façade, WebGPU/compile modularization, graph-diff ownership doc, runtime-only guardrails, `graphStore`↔toast decoupling, WebGPU wire validation phase 2, `lib`→`ui` barrel audit |

New multi-step packages: add `docs/implementation/<slug>/_OVERVIEW.md` first, then link it here (see **`workpkg-hygiene.mdc`**).

When a spec is fully delivered, update or archive it and align **`docs/user-goals/`** if behavior changed.
