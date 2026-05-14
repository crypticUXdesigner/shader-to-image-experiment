# Strict double-activation + pointerdown DOM swap (Chrome focus) — audit

**Context:** Chrome can dispatch a compatibility `mousedown` after `pointerdown`. If a strict **tap-then-down** pair consumes the second `pointerdown` and synchronously replaces a focused/tabbed readout with an `<input>`, default `mousedown` focus retargeting can run against the detached node and collapse focus to `<body>`, blurring the new input in the same frame. Mitigation: `e.preventDefault()` on the **consuming** `pointerdown` (only that branch), so the compat chain is suppressed for that pointer.

## `createStrictTapThenDownDouble` (`src/lib/utils/strictDoubleClick.ts`)

| Location | Swap on consume? | Outcome |
| --- | --- | --- |
| `ValueInput.svelte` | Yes — `.value-display` → `<input>` on `consumeIfSecondPress` | **Fixed:** `preventDefault()` on the consume branch before `enterEditMode()`. |
| `TimelineCurveEditor.svelte` | Yes — opens value overlay with `<input>` (`handleGraphPointerdown` → `consumeIfSecondPress` → `handleGraphDblclick`) | **Already safe:** `handleGraphDblclick` calls `e.preventDefault()` first on the same `PointerEvent`, synchronously before overlay state updates. |

No other `createStrictTapThenDownDouble` call sites.

## `createStrictDoubleClickHandler` (pairs bubbling **`click`** events)

Activation runs on the **second `click`**, after `pointerdown`/`mouseup` for that click have completed — not the same “second `pointerdown` removes the hit target before compat `mousedown`” ordering. **N/A** for this Chrome hazard.

| File | Use |
| --- | --- |
| `NodeHeader.svelte` | Label inline edit (`onclick={labelStrictDoubleClick}`) |
| `EditableLabel.svelte` | `onclick={strictStartEdit}` |
| `ParamPort.svelte` | Port double-click |
| `TimelineLanes.svelte` | Track double-click |
| `TopBarViewportStatus.svelte` | Zoom label edit |
| `Node.svelte` | Patch-into on canvas |
| `NodeEditorCanvas.ts` | Canvas double-click |

## `createStrictDoubleClickNoteHandler` (successive **`mouseup`** pairs)

| File | Use |
| --- | --- |
| `MouseEventHandler.ts` | Parameter double-note (TODO overlay); no DOM swap today |

## Other `bind:this={inputEl}` inline edit

| File | Entry to edit | Notes |
| --- | --- | --- |
| `EditableLabel.svelte` | Strict double via **`click`** | N/A (see above). |
| `NodeHeader.svelte` | Strict double via **`click`** | N/A. |

## Real-browser regression

`npm run test:value-input-chromium` serves the last `npm run build-storybook` output and checks that strict tap-then-down opens the edit `<input>`, keeps focus, and accepts typing. **`npm run verify:pages`** runs `build-storybook` immediately before this script so CI does not test a stale bundle; if you run the script alone after editing `ValueInput.svelte`, rebuild Storybook first.

Structural coverage of the consume branch remains in Vitest (`ValueInput.doubleClick.test.ts`); happy-dom does not synthesize Chrome’s compat `mousedown` chain.