# Parity plan: acceptance, goldens, and “drop WebGL” gates

Companion to [`COVERAGE-MATRIX.md`](./COVERAGE-MATRIX.md). Defines **what we measure**, **what runs in CI vs opt-in browser**, and **what must be true** before treating WebGL as droppable.

## Parity criteria by graph class

| Graph class | Compile-only gate | Pixel / RMS gate | Notes |
| --- | --- | --- | --- |
| **Fullscreen WGSL** (no `webgpuPassPlan`) | `NodeShaderCompiler.test.ts` (`backend: 'webgpu'`), `wgslMvpCompileSnapshots.test.ts` | Optional: `npm run test:webgpu-golden` full-frame RMS (`DEFAULT_PARITY_RMS_MAX` **2.75** on 8-bit RGBA in [`imageParity.ts`](../../src/validation/imageParity.ts)) | Heavy / research nodes may stay compile-only until golden budget exists |
| **Pass-plan blur / glow-bloom / bokeh / crepuscular** | Export gate tests under `src/image-export/`, `src/video-export/` | Harness uses **relaxed** RMS for pass-plan fixtures (**12.0** override in [`webgpuGoldenHarnessMain.ts`](../../src/validation/webgpuGoldenHarnessMain.ts)); blur/bloom/crepuscular also use **grid signature** RMS (`defaultSignatureRmsMax` **6.5** in [`goldenImageSignature.ts`](../../src/validation/goldenImageSignature.ts)) | Pass-plan paths differ from single-shader GL; tolerances are intentional |
| **Multipass topology** | Same as pass-plan row | Signature / relaxed RMS — not strict pixel-identity vs WebGL | Documented skips for blank-frame / env in harness |

**Binary compile-only** is an acceptable gate for early coverage of a node; **golden** is required when behavior is non-trivial or regression-prone (see ledger “Conversion guidelines”).

## CI vs opt-in

| Layer | Command / location | Role |
| --- | --- | --- |
| **CI-friendly** | `npm test` (includes `NodeShaderCompiler.test.ts`, `wgslMvpCompileSnapshots.test.ts`, export `*Gate*.test.ts`) | WGSL emit, structural unsupported cases, export compilation contracts |
| **Opt-in browser** | `npm run test:webgpu-golden` → `scripts/webgpu-golden-parity.ts` + [`webgpuGoldenHarnessMain.ts`](../../src/validation/webgpuGoldenHarnessMain.ts) | WebGL vs WebGPU **pixel** compare; requires WebGPU-capable browser; known flakes documented in harness (blank-frame detection, `isProbablyBlankFrame`) |

**Future improvement:** the harness may gain **WGSL-only baselines** where today it assumes both APIs render the same fixture.

## Video export WebGPU

The WebGPU video path depends on **async frame submission** and device lifetime across encodes (`createWebGpuVideoExportRenderPath`). Parity tests should treat **still** and **video** as separate gates: still-image readback paths are not sufficient to prove encoder + async frame stability.

## “Drop WebGL” gate checklist

All must be satisfied before **dropping WebGL** is a product commitment (aligned with [`webgl-webgpu-preview-export.md`](./webgl-webgpu-preview-export.md) invariants and mission):

1. **Coverage matrix** — WGSL MVP (+ pass plans) covers every **shipped** preset / template graph class the product promises, with ledger regenerated and reviewed (`--write-doc`).
2. **Export parity** — Still and video export meet **session-mode inheritance**: no silent WebGPU→WebGL fallback in one job; actionable errors when unsupported.
3. **Automated tests** — CI gates above green; golden harness opt-in clean on reference Chromium for the **golden fixture set** (expand set as nodes graduate from compile-only).
4. **Manual QA matrix** — Smoke rows: device loss recovery, large canvas / memory, audio-reactive graphs on pass-plan effects, export at max resolution from [`../user-goals/09-export.md`](../user-goals/09-export.md) expectations.
5. **Device limits playbook** — Max texture size, timestamp/query limits, adapter fallback documented for support (optional telemetry work noted in [`webgl-webgpu-preview-export.md`](./webgl-webgpu-preview-export.md)).
6. **Non-goals (explicit)** — **Safari WebGPU** (or any browser without a tested WebGPU stack) is not a v1 blocker for *architectural* exclusive modes; product may still list supported browsers separately.

## Future: editor validation vs runtime hard block

Some `unsupportedReasons` may later move to **connection-time** or **add-node** rules in WebGPU mode (e.g. disallow `generic-raymarcher` + disallowed SDF until WGSL exists). When a rule ships, document it in the relevant [`docs/user-goals/`](../user-goals/) file; the matrix here stays **compiler/runtime truth**, not UX copy.
