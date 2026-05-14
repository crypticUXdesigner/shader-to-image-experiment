# Help & Discovery — User Goals

## 1. Purpose

Learn what a node does (contextual help) and perform quick actions (right-click menu). Reduces friction when exploring node types and operations.

## 2. User & Context

- **Who:** Any user; especially when learning or unsure about ports and parameters.
- **When:** When zero or one node is selected (Help) or when right-clicking a node (context menu).

## 3. User Goals

- **Read help** — “Help” control (e.g. top bar) is available when **zero or one** node is selected:
  - **Zero selected:** opens a concise **overview** (what ShaderNoice is, how to think in signals, a simple UV→output mental model, and where to explore next).
  - **One selected:** opens the contextual **node guide** for the selected node type.
  - **Multiple selected:** Help remains disabled (unchanged).
  
  In node-guide mode, content appears in the callout/popover: description, inputs, outputs, parameters, examples; user can close (button or click outside). Help content is keyed by node type (e.g. `node:hexagonal-grid`); sourced from static files (`node-documentation.json`, `contextual-help.json`) or node spec; missing content shows fallback or empty.
- **Use the node context menu** — Right-click node: “Read Guide,” “Copy node name,” “Remove”; menu at pointer or near node. “Read Guide” opens same help content as Help button. “Copy node name” copies node type id (e.g. `hexagonal-grid`) to clipboard. “Remove” removes node and all its connections; graph and runtime updated. Menu implemented as dropdown; does not block canvas after close.
- **Recognize preview and export messages in WebGPU mode** — When preview or export **cannot proceed** while the session is in **WebGPU** mode, user-facing text states **what** failed (e.g. unsupported graph, device issue, export not available on WebGPU for this composition), names the **mode** (so the user knows they are not silently on WebGL), and gives an **actionable next step** (e.g. **switch to WebGL mode**—URL or control as implemented—and retry, simplify graph, or check limits). Avoid copy that implies the app “auto-fixed” preview in the background. Prefer **dismissible** toasts or banners for non-trapping cases; keep **compile / runtime errors** on the project’s normal error path. See [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) (GPU mode), [09-export.md](./09-export.md) (export inherits mode).
- **Understand what can connect** — Port type pills or “compatible types” in help can guide connections; may link to signal picker where applicable.

## 4. Key Flows

- **Help from selection:** Select one node → Help in top bar → callout with node guide → close.
- **Help from menu:** Right-click node → “Read Guide” → same callout.
- **Remove:** Right-click node → “Remove” → node and connections removed.

## 5. Constraints

- Node documentation may be partial; degrade gracefully when content missing.

## 6. Related

- [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) — Help button and layout; preview GPU mode and error copy.
- [02-node-graph-canvas.md](./02-node-graph-canvas.md) — Selection and right-click.
- [04-nodes-and-parameters.md](./04-nodes-and-parameters.md) — Port/parameter descriptions in help.
- [09-export.md](./09-export.md) — Export errors when session is WebGPU.
