# 01 — App shell: remaining orchestration extraction — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`_OVERVIEW.md`](./_OVERVIEW.md) mission and **Non-goals**.
2. Follow sections in order. **Behavior freeze** for export, undo, autosave revision, hub, and runtime callbacks unless a pre-existing bug is filed and in scope.
3. Prefer **TypeScript modules** under `src/lib/app/` (or `src/lib/editor/`) — **no** new Svelte files unless unavoidable.
4. Finish with **`npm run build`** and **`npm run check`**.

## Overview

[`graph-runtime-ui-seams`](../graph-runtime-ui-seams/_OVERVIEW.md) task **03** moved **runtime session bootstrap** out of `App.svelte`. Remaining orchestration (image/video export wiring, hub resolution side-effects, revision/undo listeners, Audiotool helpers) still concentrates risk and merge pain in one component.

## Scope

### In

- Extract **one or two** cohesive blocks from `src/lib/App.svelte` into typed modules, e.g.:
  - **Export session helpers** — `runImageExportFlow` / `runVideoExportFlow` call sites, guards, and error surfacing **as functions** taking `RuntimeManager` + store getters/setters as parameters (no hidden globals).
  - **Graph/audio revision listeners** — logic now inline next to `graphStore.setGraphChangedListener` / `setAudioChangedListener` → `attachGraphRevisionListeners({ ...deps })` returning a disposer.
- `App.svelte` imports and calls the new APIs; lifecycle (`onMount`, `cancelled`) stays in Svelte.

### Out

- Redesigning export UX or resolution limits ([`docs/user-goals/09-export.md`](../../user-goals/09-export.md) unchanged unless bugfix).
- Moving entire node editor subtree out of `App` (separate initiative).

## Dependencies

### Provides

- Smaller diff surface for future preview/runtime work.

### Blocks

- None.

## Implementation tasks

1. Inventory `App.svelte` blocks **> ~80 lines** that are pure coordination (no template bindings); rank by dependency count.
2. Extract **at least one** block (recommended: **export flow** *or* **listener wiring**) into `src/lib/app/` with explicit dependency injection types.
3. Replace inlined code in `App.svelte`; preserve **`hydrating`**, **`cancelled`**, and undo semantics.
4. **Verify:** `npm run build`, `npm run check`. If a Vitest exists for URL/runtime flags, run it; otherwise **no** new test required for this task unless extraction exposes a pure function worth unit testing (optional one file).

## Technical notes

- Reuse existing [`editorRuntimeBootstrap.ts`](../../../src/lib/app/editorRuntimeBootstrap.ts) patterns for URL/runtime flags — do not duplicate parsers.
- If **task 06** (toast decoupling) lands first, prefer extracting listeners **after** store surface is stable.

## Completion

✅ Done when `App.svelte` line count is **measurably reduced** (cite before/after in PR or task completion note), behavior matches prior flows, and **build + check** pass.

### Acceptance (observable)

- `npm run build` and `npm run check` green.
- Manual smoke: open graph, trigger **image export** (or smallest export path available in dev), confirm no regression.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **01** row: **Done** + date + module paths.
