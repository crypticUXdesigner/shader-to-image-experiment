# 02 — Render backend ↔ renderer explicit façade — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`_OVERVIEW.md`](./_OVERVIEW.md) and `src/runtime/factories.ts` — note **`as unknown as IRenderer`**.
2. Prefer **narrowing types** and a small **facade interface** over a large rename sweep; keep WebGL and WebGPU backends compiling.
3. Coordinate file ownership with **task 03** if both touch `CompilationManager` / `factories.ts` in one sprint.
4. Finish with **`npm run build`**, **`npm run check`**, and **`npx vitest run`** for any affected runtime tests.

## Overview

`createRuntimeManager` constructs `IRenderBackend` then casts it to **`IRenderer`** for `RuntimeManager` and `CompilationManager`. That hides which methods are compile-critical vs presentation-only and risks silent partial implementations.

## Scope

### In

- Introduce an explicit type (name flexible), e.g. **`IRuntimeRasterTarget`** or **`ICompilationRenderer`**, that lists **only** methods `CompilationManager` / `RuntimeManager` require from the backend (subset of today’s `IRenderer` + backend-specific hooks if needed).
- Update **`factories.ts`** to return this type **without** `unknown` cast, or document a **single** safe adapter class `RenderBackendAsRenderer` that forwards calls.
- Fix call sites so TypeScript enforces completeness (compile errors when backend misses a method).

### Out

- Rewriting `WebGpuRenderBackend` internals (task **03**).
- Changing default backend selection or URL flags.

## Dependencies

### Provides

- Compiler-safe contract for new backends; informs task **03**.

### Blocks

- None (soft: informs **03**).

## Implementation tasks

1. List methods on `IRenderer` actually invoked from `CompilationManager`, `RuntimeManager`, and `Renderer`-typed utilities (grep `this.renderer.` / `renderer.`).
2. Define the **minimal façade interface** + implement via **class adapter** wrapping `IRenderBackend` **or** extend `IRenderBackend` formally if it already matches.
3. Replace cast in `factories.ts`; update `RuntimeManager` constructor types if needed.
4. **Verify:** `npm run build`, `npm run check`, `npx vitest run` for `CompilationManager` / `RuntimeManager` tests if present.

## Technical notes

- If `IRenderBackend` already extends or duplicates `IRenderer`, prefer **one** inheritance/composition story — avoid two parallel hierarchies long-term; this task may only document “phase 1: façade” for a later merge.

## Completion

✅ Done when **`as unknown as IRenderer`** is eliminated (or isolated to **one** documented adapter implementation), types enforce required methods, and **build + check + listed tests** pass.

### Acceptance (observable)

- No `as unknown as IRenderer` in `factories.ts` (unless adapter file is the sole narrow bridge with a comment referencing this task).
- `npm run build`, `npm run check` green.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **02** row: **Done** + date + new type names.
