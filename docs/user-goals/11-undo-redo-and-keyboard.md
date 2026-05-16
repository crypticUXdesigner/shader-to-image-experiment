# Undo/Redo & Keyboard — User Goals

## 1. Purpose

Undo/redo and keyboard shortcuts make editing faster and reversible. Graph changes undoable where possible; standard shortcuts work consistently and do not fire when typing in inputs or when dialogs are open.

## 2. User & Context

- **Who:** Any user editing the graph.
- **When:** After graph-modifying changes; when using keyboard for navigation and editing.

## 3. User Goals

- **Undo and redo graph changes** — Undo history of graph states (limit **50**); each significant graph change (add/remove node, connection, parameter, view state, automation) **records** a new snapshot. **Continuous** parameter edits (knob/slider drag, coordinated pointer-up on the canvas) aim for **one** snapshot per **completed gesture**—intermediate move events update the graph with **`recordUndo: false`**, then a commit/bookmark records undo once—rather than one snapshot per snapped step. **UX:** Undo (**Ctrl/Cmd+Z**) restores the previous graph when available; Redo (**Ctrl/Cmd+Shift+Z**) restores the next state. Loading a preset or replacing the graph (e.g. paste full graph) clears undo history. The shell exposes undo/redo and can surface “can undo” / “can redo” for controls (see [`../implementation/graph-undo-redo.md`](../implementation/graph-undo-redo.md)).
- **Delete, copy, paste, duplicate** — Delete selection (nodes and connections) with Delete or Backspace. Copy selection (nodes and internal connections) with Ctrl/Cmd+C; stored in internal clipboard (“Copy preset” is separate). Paste with Ctrl/Cmd+V when clipboard has node data; pasted at target (offset or cursor) with remapped IDs. Duplicate with Ctrl/Cmd+D (copy then paste at offset). Shortcuts do not fire when focus in input or dialog open.
- **Pan temporarily with spacebar** — Spacebar held for short delay (~200 ms) activates temporary pan (Hand); cursor changes (e.g. grab); release restores previous tool; quick press does not activate pan and can trigger play/pause in bottom bar. **While a modal dialog is open**, spacebar can activate pan **immediately** (no hold delay) so the canvas remains navigable without trapping the user.
- **Other canvas shortcuts** — **F** toggles browser fullscreen when not typing in an input (capture-phase handler).
- **Avoid shortcuts in dialogs** — When dialog or overlay (file picker, color picker) visible, keyboard shortcuts for graph actions (other than spacebar pan as above) are not processed; input fields in dialog receive keys normally.

## 4. Key Flows

- **Undo/redo:** Semantic change → history may push (per `recordUndo` policy); Undo → graph reverts; Redo → re-applies when available.
- **Delete:** Select nodes → Delete → selection and connections removed; history records (same push pipeline as other edits).
- **Copy/paste:** Select → Ctrl/Cmd+C → move view → Ctrl/Cmd+V → pasted at offset; history records.
- **Spacebar pan:** Hold spacebar briefly → cursor grab → drag to pan → release → tool and cursor restore (immediate pan when a blocking dialog is open).

## 5. Constraints

- Undo state is graph (and view state carried on the graph); **audio setup** is not part of the undo stack today—product rule unless extended later. Keyboard handling uses capture phase so canvas shortcuts run predictably; “is input active” and “is dialog visible” come from the app. See implementation plan: [`../implementation/graph-undo-redo.md`](../implementation/graph-undo-redo.md).

## 6. Related

- [02-node-graph-canvas.md](./02-node-graph-canvas.md) — Selection, delete, copy, paste, duplicate.
- [08-presets-and-data.md](./08-presets-and-data.md) — Clipboard and ID remap on paste.
- [07-timeline-and-automation.md](./07-timeline-and-automation.md) — Spacebar and play/pause in bottom bar.
- [graph-undo-redo.md](../implementation/graph-undo-redo.md) — Implementation plan for user-invokable undo/redo.
