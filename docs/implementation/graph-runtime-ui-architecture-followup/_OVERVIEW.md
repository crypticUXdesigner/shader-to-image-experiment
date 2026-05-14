# Graph / runtime / UI — architecture follow-up (2026-05)

## Mission

Turn **`/review-architecture`** follow-on items **1–8** (post-[`graph-runtime-ui-seams`](../graph-runtime-ui-seams/_OVERVIEW.md)) into **bounded, implementable** work: shrink remaining **`App.svelte`** orchestration, harden the **render-backend ↔ renderer** seam, modularize **heavy WebGPU / compile** paths, clarify **graph diff ownership**, add **runtime-only parameter** guardrails, optionally **decouple toasts from `graphStore`**, extend **WebGPU wire / session validation**, and keep **`src/lib` ↔ `src/ui`** imports **barrel-clean**.

## Goals

1. **Shell:** Further extract non-Svelte orchestration from **`App.svelte`** (export, hub, listeners, revision counters) into typed modules with unchanged UX.
2. **Runtime seam:** Replace or narrow the **`IRenderBackend` as `IRenderer`** cast with an explicit façade / capability surface so backends cannot silently miss contract.
3. **Maintainability:** Reduce risk in **`CompilationManager`** + **`WebGpuRenderBackend`** by splitting ownership (lifecycle vs cache vs pass-plan) without parity regressions.
4. **Correctness:** Single **taxonomy doc** (or shared helper) for **structure vs parameter** graph changes — who decides immediate vs debounced vs incremental compile.
5. **Safety:** **Tests or lint** that fail when a new runtime-only parameter is not registered where uniforms must be skipped.
6. **Layering (optional):** **`graphStore`** does not import **`appToastStore`** — toasts triggered via callback/outbox from **`App`** or a thin façade.
7. **WebGPU UX:** Phase-2 **mode-aware** validation (connections / ports / unsupported combos) aligned with [`WIRE-VALIDATION-DESIGN.md`](../../architecture/WIRE-VALIDATION-DESIGN.md) and [`GAP-INVENTORY.md`](../../architecture/GAP-INVENTORY.md).
8. **Hygiene:** Repo audit: **`src/lib/**`** must not deep-import **`src/ui/**`** (index barrels only per `component-structure.mdc`).

## Non-goals

- Pixel WebGL vs WebGPU parity rewrites ([`PARITY-PLAN.md`](../../architecture/PARITY-PLAN.md)).
- Productizing adaptive DPR / preview overlay defaults.
- Rewriting **`docs/architecture`** wholesale (link updates only as needed per task).

## Constraints

- **Immutable graph** — `AGENTS.md`, `graph-updates.mdc`.
- **User-goals:** Touch UX or blocking errors → align relevant [`docs/user-goals/`](../../user-goals/README.md) files.
- **Chokepoint per task:** `npm run build` + `npm run check`; add **`npx vitest run <path>`** where specified.

## Work items

| ID | Task | Status | Provides | Blocks |
| --- | --- | --- | --- | --- |
| 01 | [App shell: remaining orchestration extraction](./01-app-shell-remaining-orchestration-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Smaller `App.svelte`, testable session helpers | — |
| 02 | [Render backend ↔ renderer explicit façade](./02-render-backend-renderer-facade-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Typed compile/present seam; safer backend swaps | Informs 03 (coordinate files) |
| 03 | [CompilationManager / WebGpuRenderBackend modularization](./03-compilation-webgpu-modularization-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Clear submodules + ownership doc | — |
| 04 | [Graph change detection ownership](./04-graph-change-detection-ownership-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Single contract doc + optional shared taxonomy | — |
| 05 | [Runtime-only parameters guardrails](./05-runtime-only-params-guardrails-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | CI/test or lint for `isRuntimeOnlyParameter` alignment | — |
| 06 | [graphStore toast decoupling](./06-graphstore-toast-decoupling-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Store free of `appToastStore` import | — |
| 07 | [WebGPU wire validation phase 2](./07-webgpu-wire-validation-phase2-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Session-aware validation beyond node-type paste | — |
| 08 | [lib ↔ ui barrel import audit](./08-lib-ui-barrel-import-audit-graph-runtime-ui-architecture-followup.md) | **Done** (2026-05-14) | Grep-clean report + fixes or eslint rule | — |

**Suggested order:** **05** and **08** are safe early wins. **02 → 03** share `factories.ts` / `CompilationManager` — land in order or one PR with clear file ownership. **01** can proceed in parallel once **06** is decided (optional: do **06** before large `App` edits to reduce merge noise). **04** and **07** are mostly docs + targeted code.

## Progress

**Overall:** 8 / 8 tasks (100%). **Opened:** 2026-05-14.

**Notes (05):** Declarative `RUNTIME_ONLY_EXACT_ENTRIES` + `RUNTIME_ONLY_PATTERN_RULE_SOURCES` in `src/utils/runtimeOnlyParams.ts`; drift tests in `src/utils/runtimeOnlyParams.test.ts` vs `nodeSystemSpecs` (sorted uniqueness, spec keys, pattern coverage).

**Notes (08):** Audit: **0** deep `src/lib` → `src/ui/**` imports (`ui/editor/` and `ui/interactions/` subpaths under `src/lib` had no matches via workspace search; `git grep "ui/editor/" -- src/lib` and `git grep "ui/interactions/" -- src/lib` empty). All canvas imports use `.../ui/editor` barrel. Documented allowed roots vs `lib/components/ui` in `docs/architecture/editor-ui-canvas-layout.md`. ESLint `no-restricted-imports` deferred per task (optional follow-up).

**Notes (01):** `src/lib/app/appExportSession.ts` (`runEditorImageExportSession`, `runEditorVideoExportSession`, `createGetPrimaryAudioBuffer`) + `src/lib/app/graphRevisionListeners.ts` (`attachGraphRevisionListeners`). `App.svelte` **2301 → 2298** lines (export + primary-audio wiring lifted; disposer `let` + teardown symmetry). Hub teardown uses returned disposer instead of duplicating `set*Listener(null)`.

**Notes (02):** `IRenderBackend` extended with `Disposable`, `startAnimation`, `stopAnimation` (`IRenderBackend.ts`). `RuntimeManager` + `createRuntimeManager*` take `IRenderBackend` only (`factories.ts` cast removed). `TimeManager` uses `ITimeManagerRasterSink` (`Pick` mark/render). `getRenderBackend()` replaces `getRenderer()` on `RuntimeManager`.

**Notes (03):** `src/runtime/renderBackends/webGpuFullscreenPreviewCache.ts` — `webGpuParamLayoutsEqual`, `trimWebGpuShaderPipelineCaches` (LRU eviction + perf counter); `WebGpuRenderBackend.ts` header lists ownership. Build + `npm run check` + `npx vitest run src/runtime` green.

**Notes (04):** `docs/architecture/graph-and-platform-boundaries.md` — call-site bullets (`GraphChangeDetector` ← `RuntimeManager`, `CompilationManager`, `graphUpdate`), decision table (view vs move vs parameter vs connection vs automation vs structure), link to `parameters-pipeline.md`.

**Notes (06):** `graphStore.setPatchToolExitListener` + `App.svelte` registers `appToastStore.dismissBySource('patch-tool')` on hub bootstrap; disposer clears listener. `graphStore.svelte.ts` drops `appToastStore` import.

**Notes (07):** `webGpuExclusiveConnectionValidation.ts` — Phase 2 **bool port strictness** (WebGPU session); generic-raymarcher rules scoped so Phase 2 runs on all port wires; tests in `webGpuExclusiveConnectionValidation.test.ts`; `WIRE-VALIDATION-DESIGN.md` + `GAP-INVENTORY.md` updated.

## Dependencies (external)

- **Prerequisites:** [`graph-runtime-ui-seams`](../graph-runtime-ui-seams/_OVERVIEW.md) (runtime bootstrap extract, preview compile sink, paste/add guards) — shipped.
- **Related active packages:** [`webgpu-preview-gpu-scheduling`](../webgpu-preview-gpu-scheduling/_OVERVIEW.md) (GPU scheduling) — **coordinate** with task **03** to avoid duplicate refactors of `WebGpuRenderBackend.ts`.

## Success criteria (package)

Each task’s **Completion** section is the single ✅ gate (build + check + any listed Vitest). No task ships behavior regressions vs **`docs/user-goals`** without an explicit doc update in the same change.
