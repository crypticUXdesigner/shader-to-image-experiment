# Undo history — gesture-level snapshots (parameters)

## Mission

Make **undo/redo meaningful** for continuous parameter edits: **one history entry per completed gesture** (e.g. knob / slider drag, coordinated pointer-up), not one entry per snapped step (`0.01`, `0.02`, …). **Live preview** must keep updating during the gesture. Align with **`docs/user-goals/11-undo-redo-and-keyboard.md`** and **`.cursor/rules/data-model/undo-history.mdc`**.

## Execution order (for agents)

1. **Task 01** — Extend **`graphStore`** (and mutation helpers if needed) so graph mutations can signal **`recordUndo: false`** vs **`true`** (default preserves today’s behavior). Add a safe **“bookmark”** path to record undo when the graph is already at the committed value (pointer-up without value change).
2. **Task 02** — Wire **continuous controls** and **canvas parameter sync** to use **transient** updates + **commit** undo recording. Verify **CoordPad** / existing **`onCommit`** patterns.

**Branch discipline:** Land **01** before **02** (or one PR with two commits) so task 02 has stable APIs.

## Locked decisions

| Topic | Decision |
| --- | --- |
| Granularity | **One undo step** per **completed** continuous edit (pointer up / explicit commit), not per `onChange` tick |
| Default | **`recordUndo` defaults to `true`** on store mutations — opt out only for known transient streams |
| Choke point | **`graphStore.setGraphChangedListener`** / **`GraphChangedOptions`** remain the single undo signal (see `App.svelte`) |
| Out of scope (v1) | **Audio setup** undo; **coalescing timer-based** debounce unrelated to gestures; changing **50** history cap |
| Acceptance | `npm run type-check`, `npm test`, `npm run lint`, `npm run build` green; manual: knob drag 0.1→0.2 → **one** Ctrl+Z returns to **0.1** |

## Non-goals

- Undo for view-only state (already excluded).
- Replacing **full-graph snapshots** with operation-based undo.
- Auto-merge unrelated sequential edits into one step.

## High-touch files

| File / area | Why |
| --- | --- |
| `src/lib/stores/graphStore.svelte.ts` | Optional `recordUndo` on parameter mutations; optional `notifyGraphChanged` for bookmark |
| `src/lib/app/graphRevisionListeners.ts` | Pass `options` through (already typed) |
| `src/lib/App.svelte` | `onGraphChanged` already respects `recordUndo` |
| `src/lib/components/node/NodeBody.svelte`, `NodeBodyLayoutItem.svelte` | Knob / `ValueInput` / sliders → transient + commit |
| `src/lib/components/editor/NodeEditorCanvasWrapper.svelte` | Canvas parameter changes |
| `src/lib/components/node/parameters/CoordPad*.svelte` | Confirm commit path records undo once |

## Work items

| ID | Task | Status | Provides | Blocks |
| --- | --- | --- | --- | --- |
| 01 | [Graph store contract](./01-graphstore-record-undo-undo-history-gestures.md) | ✅ | `recordUndo` + bookmark API | 02 |
| 02 | [Continuous controls + canvas](./02-continuous-controls-canvas-undo-history-gestures.md) | ✅ | Gesture-level UX | — |

## Progress tracker

- **Overall:** 100% — tasks 01–02 shipped (gesture undo + canvas bezier/pointer commit path).
- **Last updated:** 2026-05-16 — `graphStore.updateNodeParameter(..., { recordUndo })`, `recordUndoSnapshot`, NodeBody/Dom/canvas wiring; Bezier canvas uses throttled `recordUndo: false` + `onParameterGestureCommit` on end; `SetCallbacksCanvas` includes `onParameterGestureCommit`. **`NodeBodyLayoutItem.svelte`** is not imported in `src/` (legacy duplicate of node body); gesture work lives in **`NodeBody.svelte`** only.

## Success criteria

- Dragging a **knob** from `0.1` to `0.2` produces **one** new undo snapshot (not one per step).
- **Undo** restores the value before the gesture; **redo** restores after, within normal stack rules.
- **Discrete** controls (toggle, single click) still record **one** step as today.
- Docs/rules: update **`undo-history.mdc`** and **`docs/user-goals/11-undo-redo-and-keyboard.md`** if shipped behavior diverges from their text.
