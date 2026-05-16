# 01 — Graph store `recordUndo` + bookmark — undo-history-gestures

## Agent instructions (START HERE)

Follow sections in order. **Do not** change Knob/NodeBody wiring in this task — that is **task 02**.

Non-negotiables:

- **Immutable graph** — only extend **call sites** of `graphChangedListener` with `GraphChangedOptions`; do not mutate graphs in place.
- **Default `recordUndo: true`** for all mutations that omit options (backward compatible).
- **Autosave / `localRevision`** must still advance on **every** graph mutation whether or not undo is recorded (confirm `App.svelte` `onGraphChanged` behavior after your change).

## Overview

Extend **`graphStore`** so parameter (and any other needed) actions pass **`GraphChangedOptions`** through to `graphChangedListener`, and add a small **public** API to **push an undo bookmark** when the graph reference is already correct but a gesture **ended** (e.g. pointer-up with same value as last transient write).

## Scope

### In

- **`graphStore.svelte.ts`**
  - Add a shared options type (reuse or extend `GraphChangedOptions`) for mutations, e.g. `updateNodeParameter(nodeId, paramName, value, options?)`.
  - **`updateNodeParameter`**: pass `options` to `graphChangedListener?.(graph, options)`.
  - **`notifyGraphChanged` / `recordUndoSnapshot` / `markGraphChangedForUndo`** (pick one name, document it): invokes `graphChangedListener?.(graph, { recordUndo: true })` **without** applying another immutable update — covers “commit equals last transient”.
- Audit other actions that drive **continuous** UI and may need the same optional `recordUndo` in task 02; at minimum **parameter update** must be covered in **01**.
- **`graphRevisionListeners.ts`**: confirm `options` is forwarded unchanged (likely already correct).

### Out

- Wiring **`Knob`**, **`NodeBody`**, canvas wrappers (**task 02**).
- Changing **`UndoRedoManager`** stack size or snapshot format.

## Dependencies

### Provides

- Stable store API for **task 02** (transient `recordUndo: false`, commit `true` or bookmark).

### Blocks

- **02** until this task’s types + `graphChangedListener` contract are merged or implemented first in branch.

## Implementation tasks

1. Introduce optional **`options?: { recordUndo?: boolean }`** (or equivalent) on **`updateNodeParameter`**; default behavior matches **today** when omitted.
2. Implement **`notify*ForUndo`** (or chosen name) that triggers `graphChangedListener` with **`recordUndo: true`** for the **current** `graph` reference.
3. Grep **`updateNodeParameter`** / **`graphChangedListener`** call sites; update **types only** where task 02 will pass options (no UI behavior change required in 01 if defaults preserve behavior).
4. Run **`npm run type-check`** and **`npm test`** (or targeted tests if graph store has coverage).

## Technical notes

- **`setGraph`** already supports **`skipGraphChangedListener`** for undo **restore** — do not conflate with this task.
- If **`onGraphChanged`** in **`App.svelte`** increments **`localRevision`** unconditionally, transient edits must **still** call the listener with `recordUndo: false` (not skip the listener entirely), unless you confirm autosave does not require it.
- Prefer **one** clear name for the bookmark method; export it on **`graphStore`** only (keep runtime ignorant).

## Completion

✅ Done when **`updateNodeParameter`** supports **`recordUndo`** per call, a **bookmark** API records one undo step without redundant immutable updates, defaults preserve current behavior, and **type-check + tests** pass.

### Final steps

- Update **`.cursor/rules/data-model/undo-history.mdc`** with the new **`recordUndo`** / bookmark contract if the rule’s “Push” bullet is incomplete.
- Set **task 01** row in **`_OVERVIEW.md`** to **✅** when merged; unblock **02**.
