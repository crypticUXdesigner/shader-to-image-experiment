# 03 — CompilationManager / WebGpuRenderBackend modularization — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`_OVERVIEW.md`](./_OVERVIEW.md); read [`webgpu-preview-gpu-scheduling`](../webgpu-preview-gpu-scheduling/_OVERVIEW.md) — **avoid conflicting edits** to the same regions of `WebGpuRenderBackend.ts` (coordinate or stack PRs).
2. **Behavior freeze** for preview frames, pipeline reuse, and destroy-vs-retain rules documented in [`preview-and-recompilation.md`](../../architecture/preview-and-recompilation.md) / inline comments near `applyCompilationResult`.
3. Prefer **extract static helpers or sub-classes** over deep behavior changes.
4. Finish with **`npm run build`**, **`npm run check`**, **`npx vitest run src/runtime`** (or narrower paths touched).

## Overview

`CompilationManager.ts` and `WebGpuRenderBackend.ts` are large, high-churn files combining lifecycle, caches, pass-plan routing, and instrumentation. Splitting **ownership** reduces regression risk and aligns with ongoing GPU scheduling work.

## Scope

### In

- Extract **at least one** cohesive unit from **`WebGpuRenderBackend`** into a colocated module (e.g. `webgpuShaderModuleCache.ts`, `webgpuPassPlanRouter.ts`, or `webgpuPreviewLifecycle.ts`) **without** changing default behavior.
- Optionally extract **non-WebGPU** helpers from **`CompilationManager`** (e.g. fingerprint helpers, uniform transfer helpers) into `compilation/` subfolder if dependency direction stays acyclic.
- Add a short **`README` or comment block** at top of `WebGpuRenderBackend.ts` listing extracted modules and ownership.

### Out

- Changing WebGPU pass-plan semantics or adding new node support.
- Golden harness threshold changes.

## Dependencies

### Provides

- Smaller files for review; clearer ownership for scheduling tasks.

### Blocks

- None.

## Implementation tasks

1. Pick the **lowest-risk** extraction (pure functions or cache class with no `this` soup) — ship one extraction in this task.
2. Update imports; ensure **no circular deps** (`tsc` / Vite will surface).
3. Run **`npm run build`**, **`npm run check`**, and runtime Vitest subset.
4. If extraction touches **>200 lines moved**, add **one** regression test only if there is an existing harness pattern (optional).

## Technical notes

- Preserve comments about **pipeline reuse** and **destroy** rules when moving code — they are load-bearing for preview freeze bugs.

## Completion

✅ Done when at least **one** new module exists, default preview behavior unchanged (spot-check WebGPU preview + one parameter tweak), and **build + check + Vitest subset** pass.

### Acceptance (observable)

- `npm run build`, `npm run check` green.
- `npx vitest run` for tests under `src/runtime` (or list exact files run in PR).

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **03** row: **Done** + date + extracted module names.
