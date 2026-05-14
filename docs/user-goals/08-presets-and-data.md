# Presets & Data — User Goals

## 1. Purpose

Load a known graph (and audio setup), download the composition as JSON, and rely on a consistent serialization format for save, share, and reload.

## 2. User & Context

- **Who:** Any user; especially when starting a session or sharing.
- **When:** On load (initial preset), when switching preset, when downloading the graph as JSON.

## 3. User Goals

- **Start every session from the Projects hub** — Local-only **My projects** (IndexedDB): open, duplicate, delete, **Import JSON** into a **new** project; bundled presets expose **Preview** (RAM/session-only, no IDB autosave) and **Use as new project** (fork into a persisted row). **Start from scratch** seeds from the bundled `new` preset and creates a persisted project. Returning to Projects from the preset dialog (“Local projects…”) tears down the **preview/runtime** (GPU + editor canvas) and lists projects again when supported.
- **Start with or switch preset** — After entering the editor, preset list (e.g. dropdown) from available files (`src/presets/*.json` at build time). Loading a bundled preset replaces current graph/audio; IDs remapped; undo cleared; optionally fit view. **Preset preview workflow:** editing under Preview is not persisted until the user forks via “Use as new project.”
- **Autosave user projects only** — While a **persisted local project** is active, edits are written to IndexedDB (debounced, with bounded flush timing). Hydration after open/fork/import does not spuriously mark dirty or write. If saving fails before leaving Projects, UI must block with **Retry**, **Download JSON backup and leave**, or **Cancel**.
- **Download composition** — “Download graph as JSON” (top bar): full graph and audio setup as a `.json` file (same `SerializedGraphFile` pipeline as IndexedDB payloads). Exported files intentionally **omit** browser-only `projectId`. **Import from file** (hub or preset flow when editor is active) validates first; failures create **no** IDB row; success opens the new project.
- **Deep link (static hosting)** — Optional query `?project=<uuid>`: if that project exists locally, open it automatically once the hub is reachable; strip the query once opened. Invalid IDs surface a picker message; no silent fallback.
- **Rely on consistent data** — Preset/storage format: `SerializedGraphFile` (format `shadernoice-node-graph`, formatVersion `2.0`, graph, optional audioSetup; legacy format `shader-composer-node-graph` still loads); loader validates and migrates legacy. Plaintext IndexedDB stores are **local to the browser profile** (not encrypted on disk); clearing site data removes projects; uploads referenced in presets may need re-linking after import on another machine (see audio goals).

## 4. Key Flows

- **Hub:** Session start → preset list metadata + IndexedDB meta only → choose project/scratch/import/preview → then bootstrap **preview/editor** (GPU runtime).
- **Load preset:** Select from dropdown → load file → migrate if needed → remap IDs → set graph and audio setup → clear undo → optionally fit view.
- **Download preset JSON:** Top bar → serialize graph + audio setup → download as `.json` file (backup / cross-environment).
- **Paste:** Valid data in clipboard → Paste on canvas → deserialize → remap IDs → add nodes/connections at target → update graph and runtime.

## 5. Constraints

- Preset list static at build time (Vite glob); new preset = new JSON file and rebuild. Migration on load; user does not trigger migration.
- Multiple tabs accept **last-write-wins** for v1 local storage semantics.

## 6. Related

- [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) — Projects hub splash, preset dropdown, OAuth continue path vs hub.
- [02-node-graph-canvas.md](./02-node-graph-canvas.md) — Paste position.
- [06-audio.md](./06-audio.md) — Audio setup in presets.
- [11-undo-redo-and-keyboard.md](./11-undo-redo-and-keyboard.md) — Copy/paste shortcuts.
