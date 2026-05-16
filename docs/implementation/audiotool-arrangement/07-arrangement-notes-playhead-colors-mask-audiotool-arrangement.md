# 07 — Arrangement Notes — playhead, OKLCH colors, mask output

## Agent instructions (START HERE)

1. Read **`_OVERVIEW.md`** and complete task **06** first **unless** this task is explicitly scoped to skip layout (prefer **06 → 07** order to avoid merge thrash on the same files).
2. Follow **`data-model-migration`** skill if renaming/removing serialized parameter keys (e.g. replacing `backgroundR/G/B`).
3. Maintain **GLSL/WGSL parity** for all new behavior.
4. Finish with **Completion** + **Final Steps** (update `_OVERVIEW`).

---

## Overview

Let users **toggle/style the playhead**, define **background and playhead colors** with the same **OKLCH + color-picker** pattern as **`oklch-color`**, and expose an optional **mask** output for downstream compositing without splitting `vec4` manually.

## Scope

### In

- **Playhead**
  - Parameter to **disable** the playhead draw entirely (default **on** to preserve current behavior).
  - **Playhead color** via OKLCH parameters + **`parameterLayout`** `color-picker` strip (match patterns in **`src/shaders/nodes/color-system-primitives.ts`** / peers that convert OKLCH→RGB in shader).
- **Background color**
  - Replace flat **`backgroundR/G/B`** sliders with **OKLCH triplets + color-picker** (or add OKLCH params and migrate — **do not** leave duplicate competing RGB rows unless transitioning with migration).
  - **Serialized graph migration:** old graphs load with **visually close** defaults; document migration id in code per project conventions.
- **Mask output**
  - New output port (e.g. **`mask`**, type **`float`**) with documented semantics — recommend **monochrome coverage** (notes ∪ playhead when enabled) **before** final opacity/edge fade, or explicitly **match `out.a`** — pick one and document in **`node-documentation.json`**.
  - Compiler path (**`NodeShaderCompiler`**, **`WgslMvpCompiler`**) must **not** duplicate full node evaluation for two outputs; reuse intermediate or emit multi-output from single eval body.

### Out

- Changing note palette (`arrangementNotesPaletteColor`) or velocity model.
- **texture-based** note packing (still capped uniform/array bake).

## Dependencies

### Prerequisites

- Task **04** shipped.
- Task **06** recommended complete (shared files: `arrangement-notes.ts`, `packArrangementNotesForGlsl.ts`).

### Provides

- Styling parity with project color UX; clearer masking workflows.

### Blocks

- None.

## Implementation tasks

1. **Migration:** Map legacy **`backgroundR/G/B`** → initial **`l/c/h`** (or store computed OKLCH at load) so presets/projects don’t break; add tests under existing serialization/migration suites if present.
2. **Shader helpers:** OKLCH→RGB in GLSL/WGSL consistent with other nodes (reuse naming patterns; avoid duplicate incompatible conversions).
3. **Playhead:** Guard draw with new toggle; feed RGB from OKLCH params when enabled.
4. **Mask port:** Extend **`NodeSpec.outputs`**; wire codegen so **`out`** and **`mask`** share evaluation; update **`node-power`** / bypass lists if required by project rules.
5. **Docs:** `node-documentation.json` — ports, parameters, advanced cap note unchanged; clarify mask vs alpha.
6. **Verification:** `npm run type-check`, `npm test`, `npm run lint`, `npm run build` green; **`NodeShaderCompiler.test.ts`** covers second output symbol/reference if practical.

## Technical notes

- **Risk — dual backend:** any OKLCH shader change must be copied to **`buildArrangementNotesWgslNodeHelper`**.
- **Risk — compiler:** inspect how multi-output nodes are lowered; add a short comment in compiler if non-obvious.
- **Preset maintenance:** If repo presets reference removed params, run **`preset-maintenance`** skill checklist.

## Completion

**Acceptance:** Legacy graphs load without error; playhead can be hidden; background/playhead use color pickers; **`mask`** wires into a typical **`mix`** chain; WebGL + WebGPU compile.

### Final Steps

- Mark task **07** ✅ in **`docs/implementation/audiotool-arrangement/_OVERVIEW.md`**.
- Align **`docs/user-goals/06-audio.md`** only if arrangement note UX materially changed for end users.
