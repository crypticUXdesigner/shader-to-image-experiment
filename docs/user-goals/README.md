# ShaderNoice — User Goals

**User-goals documentation** for ShaderNoice (node-based shader editor). Each doc describes what the user can achieve in a given area: goals first, with short topic bullets only when a goal needs more detail.

These goals reflect **product intent** and **observed app behavior**; where behavior is still landing (e.g. undo/redo invocation), the doc states **current** vs **target** and links to **`docs/implementation/`** specs.

## Document Index

| Doc | Topic | Goals at a glance |
|-----|--------|-------------------|
| [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) | Overview & App Shell | Preset, layout, zoom, FPS, help, panel, errors, preview GPU mode (WebGL2 vs WebGPU), hard block + switch |
| [02-node-graph-canvas.md](./02-node-graph-canvas.md) | Node Graph Canvas | Pan/zoom, V/H/S/P tools, Alt+click add, selection, move nodes, add nodes, connections, context menu, live preview (WebGL2 or WebGPU session) |
| [03-node-panel.md](./03-node-panel.md) | Node Panel | Search, filter by type, browse by category (fixed order), list/grid, add at position |
| [04-nodes-and-parameters.md](./04-nodes-and-parameters.md) | Nodes & Parameters | Edit params, fixed vs connection, live values, signal picker, color/enum, file, data model |
| [05-connections.md](./05-connections.md) | Connections | Create, remove, one per port (replace), see topology; graph vs session GPU validity (wire-time in WebGPU) |
| [06-audio.md](./06-audio.md) | Audio | Files, bands/remappers, playback, scrub, bind to params, persist |
| [07-timeline-and-automation.md](./07-timeline-and-automation.md) | Timeline & Automation | Time/playback, seek, automation lanes/curves, drive params, persist |
| [08-presets-and-data.md](./08-presets-and-data.md) | Presets & Data | Load/switch preset, copy/paste composition, consistent data format |
| [09-export.md](./09-export.md) | Export | Image/video export; inherits WebGL2 vs WebGPU session mode; clear errors (no silent cross-API fallback in one job) |
| [10-help-and-discovery.md](./10-help-and-discovery.md) | Help & Discovery | Node guide, context menu, compatible types, WebGPU hard-block / export copy |
| [11-undo-redo-and-keyboard.md](./11-undo-redo-and-keyboard.md) | Undo/Redo & Keyboard | History capture; delete/copy/paste/duplicate; spacebar pan; F fullscreen; undo/redo shortcuts planned |

## Implementation specs

Engineering notes for partially shipped or easy-to-drift behavior: **[`../implementation/`](../implementation/)** (e.g. graph undo/redo wiring, category order consistency).

## Template

New user-goals docs should follow [\_template.md](./_template.md).

## Scope

- **In scope:** Entire app functionality expressed as user goals and, where needed, short topic lists.
- **Out of scope:** Internal architecture or API design unless they affect UX (e.g. how WebGL2 vs WebGPU session modes surface in preview and export).
