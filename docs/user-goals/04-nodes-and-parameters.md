# Nodes & Parameters — User Goals

## 1. Purpose

Nodes are graph building blocks; each exposes parameters the user can set or connect. UX must make values, input modes, and live (e.g. audio-driven) values clear and editable.

## 2. User & Context

- **Who:** User editing the shader graph.
- **When:** When selecting a node, editing a parameter, or connecting to a parameter port.

## 3. User Goals

- **See and edit each parameter with the right control** — Type-appropriate controls per spec (slider, color, dropdown, text, bezier, grid, etc.); correct defaults; values in `node.parameters`. Preview updates in real time except when: parameter has no effect, overridden by connection/automation, resource loading (e.g. audio), or preview paused.
- **Choose fixed value vs connection** — Connectable parameters have input mode (e.g. use connection vs override with fixed); effective value respects it; output can connect to parameter port via connection flow.
- **See live values when connected or driven** — When connected or audio-driven, effective (live) value visible (e.g. port or tooltip). When timeline automation is active (lane with evaluable regions), the effective value follows automation for the **entire** timeline—including before the first region, between regions, and after the last—unless overridden by a connection per input mode; a small timeline cue on the parameter row indicates automation is authoritative.
- **Use signal/connection picker** — For parameters that support audio (band or remapper): **double-click** the parameter port to open the **audio signal picker**. The picker is band-centric (bands with frequency range, remappers per band). **Two modes:** when the port has no audio connection, a **large** popover shows all bands and remappers so you can create or choose a signal and connect; when the port is already connected, a **compact** popover shows only that band’s or remapper’s configuration (tweak or disconnect). From compact mode, **Open full** (or equivalent) can show the large picker again without disconnecting first; otherwise disconnect and double-click again to browse all signals. Graph (node) outputs are connected by dragging from the node’s output port to the parameter port, not via this picker.
- **Edit color and enum on canvas** — Color: picker; on canvas, popover/overlay (e.g. LCH); apply on confirm or live. Enum: dropdown; on canvas, overlay dropdown. Overlays bridged to DOM so they render above canvas and receive focus.
- **Choose file for file parameters** — e.g. audio: “choose file” opens file picker; chosen file loads and parameter/audio setup updates; preview may pause during dialog.
- **Rely on clear data model** — Values stored in graph (`node.parameters`); effective value = graph + connections + input mode + audio/timeline at runtime. Parameter UI from spec; custom layout elements for specific types (e.g. bezier row, color map preview). **Across GPU modes:** the same graph and wiring should drive parameters and live values the same way **where both WebGL2 and WebGPU support that node chain**; if a connection is allowed in one mode but not the other, the editor should surface that early (see [05-connections.md](./05-connections.md) — two layers of validity and wire-time strictness in WebGPU sessions).
- **Power off a node to A/B its effect** — Eligible nodes (transforms, effects, generators, patterns, shapes/SDFs, blend, color-related inputs and utilities in those families) show a **Power** control in the header. When “off,” the node is skipped in compilation: if it could pass its main input through unchanged, it does; otherwise downstream nodes behave as if nothing were wired from it and use their usual defaults. Math, utility, masking-control, and output nodes do not offer Power. The setting is saved with the graph and comes back after reload.

## 4. Key Flows

- **Edit:** Select node → change slider/color/enum → value and preview update.
- **Connect to parameter:** Drag output to parameter port → connection created → effective value per input mode. For audio: double-click parameter port → audio signal picker (large or compact) → connect band/remapper or disconnect.
- **Signal picker (audio):** Double-click parameter port → band-centric picker (large when not connected, compact when connected) → select band or remapper to connect, or disconnect; graph outputs are connected via drag only.

## 5. Constraints

- Canvas overlays (color, enum) bridged to DOM for focus and layering.

## 6. Related

- [02-node-graph-canvas.md](./02-node-graph-canvas.md) — Node rendering and selection.
- [05-connections.md](./05-connections.md) — Connections to parameter ports.
- [06-audio.md](./06-audio.md) — Audio signals and file parameters.
- [07-timeline-and-automation.md](./07-timeline-and-automation.md) — Automation-driven values.
