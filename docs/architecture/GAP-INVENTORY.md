# WebGPU compile gap inventory (data-model valid → WGSL MVP `supported: false`)

**Purpose:** Prioritize **wire-time** and other editor guards so **WebGPU** sessions fail predictably, not only at compile/export. **Sources of truth:** [`WgslMvpCompiler.ts`](../../src/shaders/compilation/WgslMvpCompiler.ts), [`COVERAGE-MATRIX.md`](./COVERAGE-MATRIX.md), [`wgsl-coverage-ledger.md`](../implementation/webgpu-migration/wgsl-coverage-ledger.md) (regenerate via `npx tsx scripts/generate-wgsl-coverage-ledger-table.ts --write-doc`).

**Counts (snapshot, see COVERAGE-MATRIX):** ~**143** registered `nodeSystemSpecs` ids vs **141** in `WGSL_SUPPORTED_NODE_TYPES`; **2** types are **pass-plan-only** (not fullscreen-inline): `glow-bloom`, `crepuscular-rays`. **4** types participate in `webgpuPassPlan`: `blur`, `bokeh`, `glow-bloom`, `crepuscular-rays`.

## Summary — largest “surprise” buckets for finishers

1. **`generic-raymarcher` WebGPU MVP bounds** — SDF source restricted to a fixed allow-list; `displacement` only accepts `displacement-3d.out`. Unwired `in` uses **vec2 zero** (same as GLSL/WGSL resolvers), not a compile error. Users often discover SDF allow-list limits only after wiring exotic SDFs that work on WebGL2.
2. **Pass-plan subgraphs** (`blur`, `bokeh`, `glow-bloom`, `crepuscular-rays` → `final-output`) — Upstream subgraph must WGSL-compile inline; failures surface as `pass.*: upstream subgraph not WGSL-compatible` plus nested reasons.
3. **Globally unsupported node types** — Any reachable node whose type is absent from the WGSL MVP path yields `unsupported node type: <id>` (rare if registry and allowlists stay aligned).
4. **Structural graph issues** — `missing final-output node`, `could not resolve output expression`; mostly editor-invariant but still classified below.

---

## Prioritized table

| Failure pattern / reason (prefix family) | User-visible example | Candidate prevention | Priority |
| --- | --- | --- | --- |
| **`generic-raymarcher (WebGPU MVP): sdf source must be one of (…) — got 'x'`** | User wires `glass-shell` or another SDF into **Generic raymarcher**’s `sdf` port; WebGL2 works, WebGPU compile fails. | **Wire-time** (WebGPU session): reject `sdf` connection when source type ∉ `GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES`. | **P0** |
| **`generic-raymarcher (WebGPU MVP): displacement port supports displacement-3d.out …`** | User connects a non–`displacement-3d` node into `displacement`. | **Wire-time** (WebGPU session): reject bad displacement source. | **P0** (shipped Phase 1) |
| **Bool ↔ numeric port wires (WebGPU)** | GLSL may coerce in some paths; WGSL expectations differ. | **Wire-time** (WebGPU session): reject when one port is `bool` and the other is not. | **P2** (shipped Phase 2 slice) |
| ~~`generic-raymarcher (WebGPU MVP): Screen position port in must be connected`~~ | **Removed:** unwired `in` matches GLSL/WGSL parity — `resolveInputVec2` supplies `vec2<f32>(0.0)`; no editor restriction and no compile hard-fail for missing `in`. | — | **Done** |
| **`pass.blur|bokeh|glow-bloom|crepuscular-rays.*: upstream subgraph not WGSL-compatible`** | Effect in front of `final-output` but chain contains unsupported WGSL piece. | **Wire-time** partial checks (expensive if full compile); phase **later** — document + telemetry first. | **P1** |
| **`pass.*: <effect> node has no upstream input`** | Effect node wired to `final-output` but no `in`. | Editor gesture / existing topology checks; low surprise if preview already shows broken state. | **P2** |
| **`unsupported node type: <id>`** | Preset or paste includes a node not in WGSL MVP allowlist. | **Add-node / paste / duplicate** validation in WebGPU-exclusive preview sessions (**`NodeEditorCanvasWrapper`** + `WGSL_SUPPORTED_NODE_TYPES`); optional **wire-time** when connection pulls node into active chain. | **P1** |
| **`missing final-output node`** | Corrupt or partial graph. | Serialization / **editor should already prevent** removing last output in normal flows. | **P2** |
| **`could not resolve output expression`** | Compiler cannot resolve final expression. | **Editor should already prevent** in happy path; treat as residual. | **P2** |
| **`unknown subgraph compile failure`** | Subgraph compile returned unsupported without reasons. | Logging + reduce to known prefixes over time. | **P2** |

---

## Notes

- `unsupportedReasons` strings are **diagnostic**, not a stable enum — map **prefix families** when implementing UX (see COVERAGE-MATRIX taxonomy).
- Phase 1 implementation targets **P0** rows in [`WIRE-VALIDATION-DESIGN.md`](./WIRE-VALIDATION-DESIGN.md).
