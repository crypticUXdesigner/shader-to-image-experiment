# Coverage matrix (WebGL vs WGSL MVP vs export)

This document defines the **axes** product and engineering use when talking about “coverage” for [exclusive GPU preview/export modes](./webgl-webgpu-preview-export.md). The **canonical per-node table** (one row per `nodeSystemSpecs` id) is generated; this file adds **column semantics**, **pass-plan kinds**, and an **`unsupportedReasons` taxonomy**.

## Automation (owner command)

Regenerate the full node table whenever `nodeSystemSpecs` or the WGSL allowlists change:

```bash
npx tsx scripts/generate-wgsl-coverage-ledger-table.ts --write-doc
```

Output: [`docs/implementation/webgpu-migration/wgsl-coverage-ledger.md`](../implementation/webgpu-migration/wgsl-coverage-ledger.md).  
The script reads `WGSL_SUPPORTED_NODE_TYPES` and `WGSL_WEBGPU_PASS_PLAN_NODE_TYPES` from [`src/shaders/compilation/WgslMvpCompiler.ts`](../../src/shaders/compilation/WgslMvpCompiler.ts) and must stay in sync with them (see script header comment).

## Matrix columns (how to read a row)

| Column | Meaning | Source of truth |
| --- | --- | --- |
| **Node id** | Stable shader node type (`NodeSpec` id). | `nodeSystemSpecs` / ledger table |
| **GL preview** | Graph can drive the WebGL2 preview path (subject to normal GLSL compile/link rules). | GLSL pipeline in `NodeShaderCompiler` + runtime; not gated by WGSL allowlist. |
| **WGSL fullscreen** | Node participates in **single-shader** WGSL codegen when no higher-priority pass plan applies. | Membership in `WGSL_SUPPORTED_NODE_TYPES`. |
| **`webgpuPassPlan` kind** | When topology matches `… → effectNode → final-output` (see pass-plan table below), compiler may emit a **multi-pass** plan instead of inline WGSL. | `WebGpuPassPlan['kind']` in [`src/runtime/types.ts`](../../src/runtime/types.ts); emitters in `WgslMvpCompiler.ts`. |
| **Export still (WGSL)** | Still image export can compile/serve this graph on the WebGPU export path when the session is WebGPU (session inherits export raster API). | [`src/image-export/`](../../src/image-export/) `*Gate*.test.ts`, `WebGpuExportRenderPath` |
| **Export video (WGSL)** | Video export WebGPU path can serve this graph (async frame pipeline). | [`src/video-export/`](../../src/video-export/) `*Gate*.test.ts`, `WebGpuVideoExportRenderPath` |
| **Notes** | Audio-driven uniforms, SDF allow-lists, step caps, research-tier visuals. | Ledger “Notes / blockers”, `MVP_INLINE_NOTE_OVERRIDES` in the generator script |

### Snapshot counts (2026-05-12, from repo)

Derived with the same sets the ledger uses: **143** registered node ids; **141** in `WGSL_SUPPORTED_NODE_TYPES`; **2** types are **pass-plan-only** (not in the fullscreen allowlist): `glow-bloom`, `crepuscular-rays`. **4** types can emit a `webgpuPassPlan`: `blur`, `bokeh`, `glow-bloom`, `crepuscular-rays` (`WGSL_WEBGPU_PASS_PLAN_NODE_TYPES`). `blur` and `bokeh` also appear in the fullscreen allowlist (inline stubs + pass plan when wired to `final-output`).

### `webgpuPassPlan` kinds (multipass / pilot)

| `kind` | Driving node type | When selected (simplified) |
| --- | --- | --- |
| `pass.blur.gaussian-separable.v1` | `blur` | `blur.out → final-output.in` and upstream subgraph WGSL-compiles |
| `pass.glow-bloom.v1` | `glow-bloom` | `glow-bloom.out → final-output.in` |
| `pass.bokeh.v1` | `bokeh` | `bokeh.out → final-output.in` |
| `pass.crepuscular-rays.v1` | `crepuscular-rays` | `crepuscular-rays.out → final-output.in` |

If the pattern does not match, `blur` / `bokeh` may still compile as **inline** WGSL when the node is otherwise supported.

## `unsupportedReasons` taxonomy (WebGPU compile)

Strings are **diagnostic** today (not a stable enum). Grouping below maps to **WebGPU-only session** severity per [product decisions](./webgl-webgpu-preview-export.md): anything that yields `supported: false` is a **hard block** for that session unless product later splits “degradable” cases.

| Prefix / pattern | Examples | Severity (WebGPU-only mode) |
| --- | --- | --- |
| **`unsupported node type: <id>`** | One entry per distinct unsupported type in the reachable graph | **Blocking** — graph cannot compile on WGSL MVP path |
| **`generic-raymarcher (WebGPU MVP):`** | `sdf source must be one of (…) — got '<type>'` | **Blocking** — SDF not in `GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES` |
| **`pass.blur.gaussian-separable.v1:`** | `blur node has no upstream input`; `upstream subgraph not WGSL-compatible` (+ subgraph reasons) | **Blocking** when pass plan is required; subgraph reasons bubble from inline compile |
| **`pass.glow-bloom.v1:`** | `glow-bloom node has no upstream input`; `upstream subgraph not WGSL-compatible` | **Blocking** |
| **`pass.bokeh.v1:`** | `bokeh node has no upstream input`; `upstream subgraph not WGSL-compatible` | **Blocking** |
| **`pass.crepuscular-rays.v1:`** | `crepuscular-rays node has no upstream input`; `upstream subgraph not WGSL-compatible` | **Blocking** |
| **`unknown subgraph compile failure`** | Fallback when a subgraph returns unsupported without reasons | **Blocking** |
| **Structural / graph** | `missing final-output node` (`WgslMvpCompiler`, `NodeShaderCompiler`); `could not resolve output expression` | **Blocking** |

The historical ledger also lists `final-output.in is not connected` under “structural failures”; if that string is not emitted by code paths today, treat it as **documentation drift** until reintroduced or removed from [`wgsl-coverage-ledger.md`](../implementation/webgpu-migration/wgsl-coverage-ledger.md).

### Future-stable codes (aspirational)

Documented in the ledger “Fallback rules” section: `wgsl.unsupported.node:<id>`, `wgsl.unsupported.feature:*`, `wgsl.unimplemented` — use when adding new failure modes so UX and telemetry can key off stable ids.

## Export gate tests (WGSL path)

These tests encode **compile + wiring** expectations for export, not pixel parity:

| Area | Files |
| --- | --- |
| Fullscreen WebGPU still | `webGpuFullscreenExportCompilationGate.test.ts`, `fullscreenWebGpuExportCompilationGateAssertions.ts` |
| Pass-plan + audio (still) | `webGpuPassPlanAudioBlurGlowBloomExportCompilationGate.test.ts`, `webGpuPassPlanAudioBokehCrepuscularExportCompilationGate.test.ts`, `passPlanWebGpuExportCompilationGateAssertions.ts` |
| Node power bypass | `nodePowerBypassExportCompilationGate.test.ts` |
| Video mirrors | `webGpuFullscreenVideoExportCompilationGate.test.ts`, `webGpuPassPlanAudioBlurGlowBloomVideoExportCompilationGate.test.ts`, `webGpuPassPlanAudioBokehCrepuscularVideoExportCompilationGate.test.ts` |

## Open gaps (feeds follow-up work)

- **Per-node row** gaps: none if `generate-wgsl-coverage-ledger-table.ts` covers every `nodeSystemSpecs` id (regenerate after adding nodes).
- **Column gaps:** “Export still/video” are **not** yet summarized per node in machine-readable form beyond gate tests — optional future matrix work.
