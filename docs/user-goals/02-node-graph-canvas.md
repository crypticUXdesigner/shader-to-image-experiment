# Node Graph Canvas — User Goals

## 1. Purpose

Canvas for building and editing the shader graph: place nodes, connect, adjust parameters, navigate. Interactions must feel responsive and predictable.

## 2. User & Context

- **Who:** User editing the graph.
- **When:** In node-editor view: pan, zoom, select, drag, connect.

## 3. User Goals

- **Pan and zoom the canvas** — Pan (Hand tool or spacebar-drag); zoom (top bar or wheel); fit to view after initial load (~150 ms delay when graph has nodes); zoom level visible; pan state preserved with view.
- **Work with tools and selection** — Cursor / Hand / Select (shortcuts **V**, **H**, **S**); **Patch** (**P**, or double-click a node body away from controls, then click a cable). **Add** nodes on empty canvas with **Alt/Option+click** while Cursor is active, or choose the **Add** tool from the bottom bar (no letter shortcut). Select supports marquee; active tool visible in the bottom bar. Select one or more nodes (click or marquee); delete, copy, paste, duplicate (Delete/Backspace, Ctrl/Cmd+C/V/D). Shortcuts do not fire when focus in input or modal open (except spacebar for pan where intended).
- **Temporarily pan with spacebar** — Spacebar held (~200 ms) activates Hand for pan; release restores previous tool; quick press can trigger play/pause in bottom bar.
- **Move nodes** — Drag selected node(s); position persisted.
- **Add nodes from the panel** — Drag node type onto canvas (or equivalent) at chosen position; new node at drop (screen-to-canvas mapped).
- **Create and remove connections** — Start from output port; complete on input or parameter port; invalid targets rejected (type/rules). Remove: select connection and Delete, or disconnect gesture. One connection per port; new connection to same port replaces previous.
- **Use node context menu** — Right-click node: Read Guide, Copy node name, Remove.
- **See live shader preview** — Preview updates as the graph changes. Preview uses **one** GPU API for the session (**WebGL2** or **WebGPU**); see [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) (preview GPU mode). In **WebGPU** mode, expect the composition to work **until** a **blocking** message says otherwise (unsupported graph, device loss, or an explicit parity/product gap)—then follow the message (e.g. switch to **WebGL** mode) rather than relying on hidden fallback.

## 4. Key Flows

- **Pan/zoom:** Hand or Spacebar → drag; or change zoom in top bar.
- **Select and delete:** Select node(s) → Delete/Backspace → nodes and connections removed.
- **Copy/paste:** Select → Ctrl/Cmd+C → move view → Ctrl/Cmd+V → pasted at target (offset or cursor).
- **Add and connect:** Drag node from panel onto canvas → drag output to input/parameter → connection if valid.

## 5. Constraints

- Canvas draws nodes, ports, wires; hit-testing and rendering tuned for responsiveness.

## 6. Related

- [01-overview-and-app-shell.md](./01-overview-and-app-shell.md) — Preview GPU mode (WebGL2 vs WebGPU) and hard block.
- [03-node-panel.md](./03-node-panel.md) — Adding nodes.
- [04-nodes-and-parameters.md](./04-nodes-and-parameters.md) — Parameters and parameter ports.
- [05-connections.md](./05-connections.md) — Connection creation and validation.
- [10-help-and-discovery.md](./10-help-and-discovery.md) — Node context menu.
- [09-export.md](./09-export.md) — Export uses the same GPU mode as the session.
