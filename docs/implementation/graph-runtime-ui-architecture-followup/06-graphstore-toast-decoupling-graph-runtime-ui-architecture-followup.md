# 06 — graphStore toast decoupling — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`_OVERVIEW.md`](./_OVERVIEW.md) — this task is **layering cleanup**, not UX redesign.
2. **`graphStore.svelte.ts`** must **not** import **`appToastStore`** after this task; surface errors via **return values**, **listener callbacks**, or **`App`-level** handling.
3. Preserve **all** user-visible toast text and triggers (same copy unless typo fix approved).
4. Finish with **`npm run build`** and **`npm run check`**.

## Overview

The reactive graph store imports toast UI, coupling **data layer** to **chrome**. Inverting the dependency keeps stores reusable if multiple editor surfaces exist.

## Scope

### In

- Remove `import { appToastStore } from './appToastStore'` from `src/lib/stores/graphStore.svelte.ts`.
- Replace internal toast calls with:
  - **`onToast` optional callback** registered from `App` (mirror `setGraphChangedListener` pattern), **or**
  - **return a structured `StoreActionResult`** from the specific actions that currently toast — choose the smallest API churn.
- Wire **`App.svelte`** (or existing shell) to call `appToastStore` when the callback fires.

### Out

- Redesigning toast layout or categories.
- Changing validation messages specified in [`docs/user-goals/`](../../user-goals/README.md) without doc updates.

## Dependencies

### Provides

- Cleaner module graph for **task 01** (App extraction).

### Blocks

- None.

## Implementation tasks

1. Grep `graphStore` for `appToastStore` usages — list each user-facing message.
2. Introduce callback or result type; update store actions; register from `App` on init.
3. **Verify:** `npm run build`, `npm run check`; manual: trigger each toast path once (connection errors, etc., per grep list).

## Technical notes

- If some toasts are **dev-only**, keep them behind `import.meta.env.DEV` at the **App** callback, not inside store, unless store already had DEV gates.

## Completion

✅ Done when **`graphStore`** has **no** `appToastStore` import, toasts still appear for prior triggers, and **build + check** pass.

### Acceptance (observable)

- `npm run build`, `npm run check` green.
- Manual checklist of toast paths completed (attach to PR comment).

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **06** row: **Done** + date.
