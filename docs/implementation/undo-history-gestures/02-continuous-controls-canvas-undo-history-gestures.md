# 02 — Continuous controls + canvas — undo-history-gestures

## Agent instructions (START HERE)

Complete **task 01** first (or work on a branch that already contains its APIs).

Non-negotiables:

- **Preview / runtime** must see **transient** values during drag — use **`recordUndo: false`** only for history, **not** to skip graph updates.
- **Discrete** controls (toggle, enum click, single-step actions) should keep **one** undo step via default **`recordUndo: true`**; avoid double-booking on **both** `onChange` and `onCommit` where both fire the same discrete value.
- Respect **`docs/user-goals/11-undo-redo-and-keyboard.md`** and **graph immutability** (`graphStore` / data-model).

## Overview

Wire **parameter UI** and **canvas** parameter handlers so **continuous** gestures record **one** undo entry: **transient** `graphStore.updateNodeParameter(..., { recordUndo: false })` during drag/scrub, then **`recordUndo: true`** or **bookmark API** from task **01** on **commit** (pointer-up, blur-as-commit if that is the control’s contract).

## Scope

### In

- **`NodeBody.svelte`** and **`NodeBodyLayoutItem.svelte`**
  - **`Knob`**: pass **`onChange`** → transient updates; **`onCommit`** → record undo (bookmark if value unchanged from last transient).
  - **`ValueInput`** (numeric fields, including those beside knobs): align **drag-to-scrub** vs **inline edit** with the same undo policy (read **`ValueInput.svelte`** — it already exposes **`onCommit`**).
  - **`RangeParameter`**, **`CoordPad` / `CoordPadWithPorts`**: audit pointer paths; use existing **`onCommit`** where present.
- **`NodeEditorCanvasWrapper.svelte`** (**`handleParameterChange`**) or equivalent: plumb **`recordUndo`** / separate **transient vs commit** entry points so **canvas** knobs/sliders match DOM behavior.
- Any **shared helper** (`onParameterChange` wrappers) that centralizes updates — keep one codepath, two modes.

### Out

- New undo **manager** design; automation lane editing undo policy (unless the same `updateNodeParameter` path is used — then inherit).
- **`BezierEditor`** / custom editors — include **only** if they call **`graphStore.updateNodeParameter`** on every pointer move today; otherwise defer to a follow-up.

## Dependencies

### Provides

- Shippable UX: **gesture-level** undo for common parameters + canvas.

### Blocks

- None.

## Implementation tasks

1. Map every **`updateNodeParameter`** path used by **continuous** controls; classify **transient** vs **commit** handlers.
2. Implement wiring per component; prefer **parent** supplying callbacks so **Knob** stays dumb.
3. **Canvas**: ensure **pointer-up** (or canvas SDK equivalent) triggers exactly **one** `recordUndo: true` / bookmark after any transient moves.
4. Manual smoke: **knob** 0.1→0.2 (step 0.01) → **one** undo to 0.1; **redo** restores; discrete **toggle** still **one** step.
5. Run **`npm run type-check`**, **`npm test`**, **`npm run lint`**, **`npm run build`**.

## Technical notes

- Reuse **`parameterChangeSync.ts`** / **`syncCanvasAfterParameterStoreUpdateThenRuntime`** ordering; avoid regressing **DomNodeLayer** vs runtime staleness.
- If **commit** fires with **same** value as last **transient**, use task **01** **bookmark** so undo still captures the **pre-gesture** state once.
- **CoordPad** already splits **`onChange` / `onCommit`** — verify parents pass **`recordUndo`** correctly after **01**.

## Completion

✅ Done when continuous parameters match **locked decisions** in **`_OVERVIEW.md`**, canvas matches DOM, checks are green, and **`docs/user-goals/11-undo-redo-and-keyboard.md`** is updated if it still claims undo is unwired or mis-describes granularity.

### Final steps

- Mark **task 02** **✅** in **`_OVERVIEW.md`**; bump **progress tracker** and **overall %** when both tasks ship.
- Optionally add a **short Vitest** or integration note in **`docs/implementation/graph-undo-redo.md`** (status line) pointing at shipped gesture behavior.
