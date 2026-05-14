# WebGL vs WebGPU preview and export (exclusive session modes)

**Last updated:** 2026-05-14

**Shipped:** Exclusive preview/export modes and hybrid preview removal were delivered 2026-05-12 (formerly tracked under `docs/implementation/webgl-webgpu-exclusive-modes/`, consolidated here).

## Invariants

- For any **preview session** or **single export job**, **at most one** live raster API runs: **WebGL2** or **WebGPU** (the CPU compiler may still emit both GLSL and WGSL).
- **WebGPU-only preview** does not keep a parallel WebGL2 context for nominal frames. `WebGpuRenderBackend` does not extend the WebGL backend; `getGLContext()` is null on that path. See [`preview-and-recompilation.md`](./preview-and-recompilation.md) (*Reliability properties*).
- **Export** uses the **same** raster backend as the editor session (`RuntimeManager.getExportRasterBackend` → `runImageExportFlow` / `runVideoExportFlow`). There is **no** silent WebGPU→WebGL fallback inside one export job.

## Product behavior

- **WebGPU session + unsupported graph:** **Hard block** with a clear error and **how to proceed** (e.g. reload with `?renderBackend=webgl` or use settings). No silent compile on WebGL for that session.
- **WebGL session:** First-class path; capability follows the GLSL pipeline for the graph.
- **URL override:** `?renderBackend=auto|webgpu|webgl` — parsed in `src/lib/App.svelte` (`parseUrlRenderBackendOverride`).

## Coverage and parity

- **Matrix semantics, export gate index, `unsupportedReasons` taxonomy:** [`COVERAGE-MATRIX.md`](./COVERAGE-MATRIX.md)
- **CI vs golden harness, RMS thresholds, “drop WebGL” gates:** [`PARITY-PLAN.md`](./PARITY-PLAN.md)
- **Per-node generated table:** [`../implementation/webgpu-migration/wgsl-coverage-ledger.md`](../implementation/webgpu-migration/wgsl-coverage-ledger.md) — regenerate with `npx tsx scripts/generate-wgsl-coverage-ledger-table.ts --write-doc`

## Optional follow-ups (not required for exclusive modes)

- **Telemetry:** frame time, memory, WebGPU block rate — add when instrumenting preview/runtime.
- **Validation timing:** some gaps may later surface as **connection-time** or **add-node** rules in WebGPU mode; coordinate with [`WIRE-VALIDATION-DESIGN.md`](./WIRE-VALIDATION-DESIGN.md) and [`GAP-INVENTORY.md`](./GAP-INVENTORY.md).

## Manual QA (spot-check after large GPU changes)

| Browser | Session (`?renderBackend=`) | What to verify |
| --- | --- | --- |
| Chrome / Edge | `webgl` | Image + video export completes on **WebGL2** only; no WebGPU device for raster export. |
| Chrome / Edge | `webgpu` + WGSL-supported graph | Image + video export on **WebGPU** only. |
| Chrome / Edge | `webgpu` + unsupported graph | Preview hard-block; export error points to switching to WebGL — **no** silent WebGL export in the same job. |
| Firefox | `webgl` | Export on WebGL where available; forced `webgpu` may fail early with an explicit error. |

## Relationship to `webgpu-migration`

[`docs/implementation/webgpu-migration/_OVERVIEW.md`](../implementation/webgpu-migration/_OVERVIEW.md) is a **historical** work log (ledger, pass plans, incremental rollout). **Policy and architecture** for exclusive preview/export modes live in **this** document and the coverage/parity companions linked above.
