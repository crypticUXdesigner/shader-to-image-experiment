# Node documentation content guide

This guide defines how to write and edit user-facing node documentation in `src/data/node-documentation.json`. It covers **what appears in the Guide UI**, **JSON field reference**, **tone**, and **quality rules**. Follow it for consistent, clear, and learnable help.

---

## Where the Guide appears

- **Trigger:** One node selected → Help button or right‑click → “Read Guide”.
- **UI:** Floating Guide panel (draggable) with:
  - **Headline** — icon (from node spec), **title**, **tagline**
  - **Setup example** — optional mini graph (when `setupExampleGraph` is set)
  - **Description** — main body text
  - **Inputs** — collapsible list: port name/label, type pill, description, optional “suggested” nodes
  - **Outputs** — same structure
  - **Controls** — collapsible list of parameters: name + description
  - **Examples** — optional bullet list of short text examples
  - **More detail** — optional `<details>` with **advanced** text
  - **Used by** — auto-derived when `titleType === 'type'` (for type help, not node help)
  - **Related** — list of related nodes/types from **relatedItems**

**Icon and category/color** come only from the **NodeSpec** (node registry), not from the doc JSON. Do not add `icon` or `category` to doc entries.

---

## Document ID

- **Key format:** `node:<nodeTypeId>` (e.g. `node:noise`, `node:mix`).
- **Node type id** must match the node’s `id` in the shader/node registry so the app can resolve the spec for port labels and headline styling.

---

## Fields (used by the UI)

| Field | Used in UI | Guidance |
| --- | --- | --- |
| **title** | Headline (h2) | Short display name (e.g. “Noise”, “Output”). Can match or slightly rephrase the node’s display name. |
| **titleType** | Logic (e.g. “Used by”) | Use `"node"` for node docs. Use `"type"` only for port-type help (e.g. `type:float`). |
| **tagline** | Headline subtitle | One short sentence: what the node is for and what you get (e.g. “Creates a random-looking pattern from coordinates…”). |
| **description** | Main body | 1–3 sentences: what it does, main parameters, and a concrete “connect to X then Y” so the user can get a visible result. |
| **inputs** | Inputs section | Array of port objects (see § Ports). Omit or `[]` if no inputs. |
| **outputs** | Outputs section | Array of port objects (see § Ports). Omit or `[]` if no outputs. |
| **parameters** | Controls section | Array of `{ name, description }` (see § Parameters). Omit or `[]` if no controls. |
| **setupExampleGraph** | Mini graph | Optional. Structured graph (nodes + connections) for the Setup example mini graph. If present and all node types exist in the registry, the graph is shown. |
| **examples** | Examples list | Optional. Array of strings; each is one bullet (e.g. “Use with Time for animated noise.”). |
| **advanced** | “More detail” block | Optional. Extra technical or expert note; shown in a `<details>`. |
| **relatedItems** | Related section | Optional. Array of IDs: `"node:<id>"` or `"type:<typeName>"`. Resolved to node names + icons in the UI. |

**Removed / do not use:** `whatYouSee`, `quickExample` (text), `icon`, `category` are not rendered. Parameters have only `name` and `description`. (Use `setupExampleGraph` for the Setup example mini graph.)

---

## Ports (inputs / outputs) — JSON shape

Each port object can have:

- **name** (required) — Must match the node spec port name (e.g. `in`, `out`, `a`, `b`).
- **type** (required) — Port type (e.g. `float`, `vec2`, `vec4`). Shown as a type pill.
- **description** (required) — One sentence: what this port is and what to connect (or where to connect it).
- **label** (optional) — Override for display; if omitted, the UI can use the spec’s label so the Guide matches the node header.
- **suggestedSources** (inputs only) — Optional. Array of IDs (`"type:float"`, `"node:uv-coordinates"`, etc.) shown as “suggested” nodes that can feed this input.
- **suggestedTargets** (outputs only) — Optional. Array of node IDs this output can sensibly connect to.

---

## Parameters (Controls) — JSON shape

Each parameter object has:

- **name** (required) — Must match the parameter name in the node spec (e.g. “Scale”, “Mode”, “Octaves”).
- **description** (required) — What the control does and how it affects the result. Include the “visual effect” in this single description (e.g. “Higher = larger blobs; lower = finer grain.”).

One entry per control; order can follow the spec or a logical reading order.

---

## Setup example graph

- **setupExampleGraph** (optional):
  - **nodes:** `[{ "id": "<graph-local-id>", "type": "<nodeTypeId>" }, ...]`
  - **connections:** `[{ "from": "<node-id>", "fromPort": "<port>", "to": "<node-id>", "toPort": "<port>" }, ...]`

Use short, stable `id`s (e.g. `a`, `b`, `c`). Every `type` must exist in the node registry; otherwise the mini graph is not shown. Keep the graph minimal (e.g. UV → Noise → Color Map → Output). Type: `SetupExampleGraph` (nodes: `SetupExampleGraphNode[]`, connections: `SetupExampleGraphConnection[]`).

---

## Tone and voice

- Use **second person** (“you”) and **concrete, actionable** language.
- Prefer **“Connect X to Y to get Z”** over “This node can be used for Z.”
- Avoid vague lead-ins like **“Ideal for…”** or **“Useful for…”** without a concrete example. If you use them, add at least one sentence that says what to connect or what the user sees.
- Keep sentences short. One idea per sentence where possible.
- **Plain language:** Avoid jargon where possible; explain terms if needed.
- **Inclusive:** “You” and “Connect X to Y” is fine; keep it scannable (bullets, short paragraphs).

---

## Parameter descriptions (effect-first)

- Every parameter **must** state what the user **sees or hears** (effect or visual/audio impact).
- If the parameter is a **fallback when a port is unconnected**, say so and add **one line on effect** (e.g. “Set to 0.5 to shift the result by half” or “Larger values = stronger effect”).
- **Not allowed:** A parameter description that only says “Used when unconnected” or “Used for input b when nothing is connected” with no mention of effect. Add at least one line that explains what changing the value does (e.g. “Higher values speed up the animation”).

---

## Examples (the `examples` array)

- Provide **2–3 short bullets** per node in the `examples` array.
- Each bullet is **one concrete use case** in plain language (e.g. “Combine two patterns with different opacity,” “Animate a mask over time,” “Drive a pattern from UV and feed it to Color Map”).
- **Not** a full tutorial sentence—enough to spark a next step. The user should be able to try the idea immediately.
- Vary examples by node type so similar nodes (e.g. Add vs Multiply) don’t repeat the same bullets.

---

## Advanced (the `advanced` field)

- **Optional.** Use for short technical notes only when they add value.
- Good uses: **when to choose X vs Y** (e.g. UV vs Fragment Coords, or one noise mode vs another), a **formula or algorithm note**, or an **expert tip**.
- Keep to **one short paragraph**. No long essays.
- **Omit** if the main description already covers the idea. Don’t duplicate.

---

## Clarity rule

- Each node should have **at least one concrete wiring or “often used with” cue** where it makes sense: either in the main description or in port descriptions.
- Example: “Connect UV Coords to Noise, then Noise to Color Map, then to Output.” Or: “Often used with Distance and Color Map for radial gradients.”
- **Weak entries** (e.g. only “Ideal for…” with no concrete wiring) must be raised to this standard. Add one sentence that says what to connect or what typically connects here.

---

## Port descriptions (writing quality)

- Keep the existing pattern: **what the port is**, **what to connect** (or what connects here), and (where helpful) **what you get**.
- `suggestedSources` and `suggestedTargets` stay as-is; no new rules beyond consistency with the tone and clarity above.
- Port text should align with the clarity rule: when relevant, mention a typical connection (e.g. “Connect UV Coords, or Translate/Scale for shifted or zoomed input”).
- Port and parameter **names** must match the node spec so labels and types line up.

---

## Do not

- **Do not** shorten or remove an existing description or tagline when improving an entry. Only add or refine.
- **Do not** introduce new JSON keys. Use only the existing HelpContent shape (e.g. `examples`, `advanced`, `parameters`, etc.).
- **Do not** use jargon (e.g. “FBM”, “SDF”, “raymarch”) without a **one-line explanation** in the same entry (e.g. “SDF (signed distance function): a value that encodes distance to a shape”).

---

## Checklist for a new or updated node doc

- [ ] Entry key is `node:<nodeTypeId>` and matches the registry.
- [ ] **title**, **titleType** (`"node"`), **tagline**, **description** are set and concise.
- [ ] **inputs** / **outputs**: each port has `name`, `type`, `description`; names match the spec; optional `suggestedSources` / `suggestedTargets` where helpful.
- [ ] **parameters**: each control has `name` and `description`; names match the spec.
- [ ] **setupExampleGraph** (if used): valid nodes + connections; all node types in registry.
- [ ] **examples** / **advanced** / **relatedItems** optional but useful where they add value.
- [ ] No `icon`, `category`, `whatYouSee`, or `quickExample` (text) in the entry; parameters use only `name` and `description`.

---

## Reference

- Node spec and checklist: `.cursor/rules/shaders/node-standards.mdc`
- Help and context menu: `.cursor/rules/frontend/help-discovery.mdc`
- User goals for help: `docs/user-goals/10-help-and-discovery.md`
- Data: `src/data/node-documentation.json`
- Types: `HelpContent`, `HelpPort`, `HelpParameter` in `src/utils/ContextualHelpManager.ts`
- UI: `HelpCallout.svelte` → `HelpCalloutContent.svelte` and subcomponents (`HelpCalloutHeadline`, `HelpCalloutPortsSection`, `HelpCalloutParametersSection`, `SetupExample`).
- Port label audit (UI vs code names): `docs/implementation/node-port-labels-in-out-analysis.md`
