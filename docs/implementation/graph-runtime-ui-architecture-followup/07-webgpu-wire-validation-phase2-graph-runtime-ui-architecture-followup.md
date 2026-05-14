# 07 — WebGPU wire validation phase 2 — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`WIRE-VALIDATION-DESIGN.md`](../../architecture/WIRE-VALIDATION-DESIGN.md), [`GAP-INVENTORY.md`](../../architecture/GAP-INVENTORY.md), and [`docs/user-goals/05-connections.md`](../../user-goals/05-connections.md).
2. Build on shipped paste/add guards from [`graph-runtime-ui-seams`](../graph-runtime-ui-seams/_OVERVIEW.md) task **04** — **extend** validation (e.g. port type / mode-aware wire rules), not duplicate.
3. User-visible errors must be **actionable** (what failed + how to fix), consistent with existing connection validation UX.
4. Finish with **`npm run build`**, **`npm run check`**, **`npx vitest run`** for validation / connection tests touched.

## Overview

Phase-1 style rules reduced “surprise WebGPU compile” for **unsupported nodes**. Phase **2** adds **wire-time** checks for combinations that are graph-valid but WebGPU-invalid per `GAP-INVENTORY` / design doc **Later phases**.

## Scope

### In

- Implement **one concrete rule family** from the design doc’s Phase-2 list (pick the smallest high-impact slice — e.g. **float3 → float** port mismatch flagging in WebGPU session only, or **texture sampler** pairing if already partially modeled).
- Thread **`ConnectionValidationContext`** (or existing WebGPU session flag) so validation runs **before** commit on connect / reconnect.
- Add **Vitest** cases for **accept** + **reject** + **copy/paste** if applicable.

### Out

- Full pass-plan simulation.
- Changing `WGSL_SUPPORTED_NODE_TYPES` set (unless required by chosen rule — avoid scope creep).

## Dependencies

### Provides

- Fewer compile-time hard fails; clearer operator feedback.

### Blocks

- None.

## Implementation tasks

1. Pick **one** rule family; document choice in PR + one paragraph in `WIRE-VALIDATION-DESIGN.md` (*Implementation status*) or a bullet in `GAP-INVENTORY.md`.
2. Implement validation in the same layer as existing connection validation (grep `ConnectionValidationContext`, `validateConnection`).
3. Add tests under `src/data-model` or `src/utils` matching existing validation test layout.
4. **Verify:** `npm run build`, `npm run check`, `npx vitest run` for new/edited tests.

## Technical notes

- Fail-open vs fail-closed policy must match [`webgl-webgpu-preview-export.md`](../../architecture/webgl-webgpu-preview-export.md) session semantics — WebGL-only sessions should not regress.

## Completion

✅ Done when **one** Phase-2 rule family is enforced at wire time in **WebGPU session**, docs note the shipped rule, and **build + check + tests** pass.

### Acceptance (observable)

- Vitest covers at least **two** scenarios (allowed / blocked).
- `npm run build`, `npm run check` green.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **07** row: **Done** + date + rule summary.
