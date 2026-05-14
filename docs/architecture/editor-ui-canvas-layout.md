# Editor UI and canvas layout

**Last updated:** 2026-05

ShaderNoice splits **what the user sees (Svelte)** from **the 2D node canvas engine (plain TypeScript)**. This page describes **where code lives today** and the **import bridge** between layers. It is not a product spec; shell and panel behavior are covered in [`docs/user-goals/`](../user-goals/README.md).

## Split: `src/lib` vs `src/ui`

| Layer | Location | Role |
| --- | --- | --- |
| **Svelte UI** | [`src/lib/`](../../src/lib/) — especially [`src/lib/components/`](../../src/lib/components/) | App shell, node cards, parameters, panels, dialogs, stores |
| **Canvas engine** | [`src/ui/editor/`](../../src/ui/editor/) | `NodeEditorCanvas`, view state, rendering layers, layout, hit testing, metrics — **no `.svelte` files** |
| **Interactions** | [`src/ui/interactions/`](../../src/ui/interactions/) | Pan, zoom, drag, connection gestures — used with the canvas |

**Principle:** Svelte owns DOM for chrome and node **parameter** UI; the canvas uses a **`HTMLCanvasElement`** and imperative drawing. [`CanvasOverlayBridge.ts`](../../src/lib/CanvasOverlayBridge.ts) coordinates overlay positions between lib and the canvas.

## Current feature-oriented layout (lib)

The tree evolves; verify with the repo. Representative areas under `src/lib/components/`:

- **`editor/`** — `NodeEditorCanvasWrapper`, `NodeEditorLayout`, DOM overlay for parameter editing, resize handles
- **`node/`** — `Node`, `NodeHeader`, `NodeBody`, context menu
- **`node/parameters/`** — Knobs, ports, color pickers, coord pads, Bezier UI, node-only controls
- **`ui/`** — Shared primitives (`button/`, `menu/`, `input/`, `overlay/`, …) reused by nodes, audio, and dialogs
- **`side-panel/`** — Node library and docs tabs
- **`audio/`**, **`timeline/`**, **`bottom-bar/`**, **`top-bar/`**, **`export/`**, **`floating-panel/`** — Feature folders

## Canvas engine layout (`src/ui/editor`)

High-level groupings:

- **`canvas/`** — `NodeEditorCanvas`, managers (view state, selection, connections, overlays, scroll, guides), input handlers
- **`rendering/`** — Layer renderers, layout engine, parameter render registry, caches

Public entry points are re-exported from index files so **`lib`** imports **`ui/editor`** (and interactions) through stable paths rather than deep internals.

## Import rules (architecture)

- **`lib/components/**`** may import **`src/lib`** utilities and stores, and **`src/ui/editor`** (or interactions) via their **public** `index.ts` exports.
- **`src/ui/**`** stays **TypeScript-only**; it may import types/helpers from `lib` where needed (e.g. bridge types, menus) but must not import Svelte components.

### Allowed `src/lib` → `src/ui` import roots (barrel-only)

Do not confuse **`src/lib/components/ui/`** (shared Svelte primitives: `button/`, `menu/`, …) with **`src/ui/`** (TypeScript canvas engine). Only the latter is covered here.

From **`src/lib/**`**, imports of the canvas engine must resolve to a **folder barrel** — no deep paths under `src/ui/editor/...` or `src/ui/interactions/...`:

| Target | Allowed specifier shape (relative depth varies) | Forbidden |
| --- | --- | --- |
| Editor canvas API | `.../ui/editor` → [`src/ui/editor/index.ts`](../../src/ui/editor/index.ts) | `.../ui/editor/canvas/...`, `.../ui/editor/NodeEditorCanvas`, etc. |
| Interactions (when used) | `.../ui/interactions` → [`src/ui/interactions/index.ts`](../../src/ui/interactions/index.ts) | Any `.../ui/interactions/<subfolder>/...` |
| Re-export hub (optional) | `.../ui` only when it resolves to [`src/ui/index.ts`](../../src/ui/index.ts) (e.g. from `src/lib/` one level up), **not** `lib/components/ui` | — |

If a symbol is missing from a barrel, **extend the barrel** (`index.ts`) instead of deep-importing from `src/lib`.

## Styles

Global tokens and layout shells live under [`src/styles/`](../../src/styles/). Component-owned styles should live in **`<style>`** in the owning Svelte file or colocated CSS per project CSS rules (see `.cursor/rules/frontend/css-standards.mdc`).

---

## Appendix: Historical consolidation notes

Earlier plans proposed aggressive renames (e.g. every folder kebab-case, extracting top bar from layout). **Much of that migration has landed** (`src/ui/editor/` replacing the old `ui/components` canvas tree, `top-bar/TopBar.svelte`, `side-panel/`, nested `ui/` primitives). Remaining diffs between an “ideal outline” and the repo should be resolved by **following the actual tree** and updating this doc when large moves happen. Detailed step-by-step migration checklists belong in **`docs/implementation/`** work packages, not here.
