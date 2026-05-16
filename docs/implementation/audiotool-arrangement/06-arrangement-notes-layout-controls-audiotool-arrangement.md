# 06 — Arrangement Notes — layout controls (padding, gap, orientation)

## Agent instructions (START HERE)

1. Read **`_OVERVIEW.md`** mission/constraints for this package (immutable snapshot, dual GLSL/WGSL, no live Nexus).
2. Execute sections **in order**. Do not expand scope into automation (**05**) or importer changes.
3. Keep **WGSL and GLSL behavior aligned** for `arrangement-notes` (same formulas, same defaults); mismatches are defects.
4. Finish with **Completion** acceptance + **Final Steps** (update `_OVERVIEW` row for this task).

---

## Overview

Extend **`arrangement-notes`** so users can control **how pitch/time occupy UV space**: symmetric vertical padding, spacing between pitch rows, and **horizontal vs vertical** orientation (swap which axis is timeline vs pitch).

## Scope

### In

- New parameters (names TBD in impl; keep **short labels** per `shaders/node-standards.mdc`) for:
  - **Pitch padding (single control):** symmetric margin at **top and bottom** of the pitch band in **normalized** 0–1 UV space (so lowest/highest notes no longer sit exactly on the edges unless padding = 0).
  - **Row gap:** interpret as **extra separation between pitch rows** in normalized pitch space (document exact formula in `node-documentation.json` — e.g. affects distance test vs `pitchY`, not MIDI data).
  - **Orientation:** default = current behavior (**time → X**, **pitch → Y**); alternate = **swapped** (**pitch → X**, **time → Y**).
- Implementation in **`src/shaders/nodes/arrangement-notes.ts`** (GLSL template) and **`buildArrangementNotesWgslNodeHelper`** in **`src/shaders/arrangement/packArrangementNotesForGlsl.ts`** (mirror logic).
- **`parameterEnumMappings.ts`** (and any WGSL float equivalents) for orientation enum labels.
- **`src/data/node-documentation.json`** (`node:arrangement-notes`): inputs/outputs descriptions if UV semantics change wordings; new parameter blurbs.
- Tests: extend **`packArrangementNotesForGlsl.test.ts`** if packing changes (unlikely); add/adjust **`NodeShaderCompiler.test.ts`** snippets so both backends still compile the node with new params.

### Out

- Playhead visibility/color (**task 07**).
- OKLCH/color-picker migration for colors (**task 07**).
- Dedicated **mask** output port (**task 07**).
- Changes to **`MAX_ARRANGEMENT_NOTES_PACKED`**, snapshot schema, or track filter UI.

## Dependencies

### Prerequisites

- Task **04** shipped (`arrangement-notes` baseline).

### Provides

- Predictable layout tuning for piano-roll style comps.

### Blocks

- None (task **07** may assume orientation-aware UV docs remain accurate).

## Implementation tasks

1. **Semantics:** Document in task notes + node docs: padding clamps safely (e.g. max usable band > 0); gap = 0 matches legacy row distance behavior; orientation swaps axes **after** existing `arrangementNotesScreenUv` / WGSL equivalent so **Normalized vs UV Coords** remains coherent.
2. **GLSL:** Thread new uniforms through `evalArrangementNotes` / `mainCode`; preserve defaults so **existing graphs look unchanged**.
3. **WGSL:** Duplicate math in `evalArrangementNotes_${suffix}` helper; verify **`WgslMvpCompiler`** case still passes compiled params.
4. **UI:** Parameter groups/layout rows for View vs Style — avoid overcrowding; collapse advanced defaults where useful.
5. **Verification:** `npm run type-check`, `npm test`, `npm run lint`, `npm run build` green.

## Technical notes

- **Performance:** Extra math is negligible vs the fixed **2048**-iteration note loop.
- **Risk:** Non-square aspect + orientation + `uvInputMode` — manually sanity-check fullscreen preview.

## Completion

**Acceptance:** Default parameter values reproduce **pixel-identical** (or documented epsilon) behavior to pre-change **`arrangement-notes`** on the same graph; with non-zero padding/gap and swapped orientation, layout responds as documented; WebGL + WebGPU compile.

### Final Steps

- Mark task **06** ✅ in **`docs/implementation/audiotool-arrangement/_OVERVIEW.md`** work items table and bump progress note if appropriate.
- If user-visible audio/goals text should mention new controls, patch **`docs/user-goals/06-audio.md`** in the same PR (only if this package already references arrangement notes there).
