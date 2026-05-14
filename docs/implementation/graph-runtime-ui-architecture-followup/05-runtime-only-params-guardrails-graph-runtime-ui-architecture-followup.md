# 05 — Runtime-only parameters guardrails — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`graph-and-platform-boundaries.md`](../../architecture/graph-and-platform-boundaries.md) § *Runtime-only parameters* and `src/utils/runtimeOnlyParams.ts`.
2. Prefer a **Vitest** that fails when **NodeSpec** parameters are missing from the runtime-only registry **or** a **lint/script** — pick the smallest mechanism that catches real drift (see Implementation tasks).
3. Finish with **`npm run build`**, **`npm run check`**, **`npx vitest run`** including the new test (if added).

## Overview

`isRuntimeOnlyParameter` must stay aligned across uniform generation, compilation, runtime, and export. Missing an entry causes **subtle** double-application or shader bugs.

## Scope

### In

- Implement **one** guardrail:
  - **Option A:** Vitest iterates **`nodeSystemSpecs`** (or exported specs map) and asserts every parameter flagged `runtimeOnly` in spec metadata (if such metadata exists) matches `runtimeOnlyParams` list — **or** inverse: every name in `runtimeOnlyParams` appears on **some** spec parameter.
  - **Option B:** Script `npm run check:runtime-only-params` (package.json) that runs a small `node`/tsx checker — only if Option A is infeasible.
- Document the rule in **one** sentence in `runtimeOnlyParams.ts` header comment linking to the test.

### Out

- Changing which parameters are runtime-only (product change).
- WGSL/GLSL emit changes.

## Dependencies

### Provides

- CI signal when new audio/UI parameters forget registration.

### Blocks

- None.

## Implementation tasks

1. Inspect how nodes declare parameters today (`NodeSpec` / `parameters` arrays) — choose **Option A** if specs are iterable in tests without heavy env.
2. Implement the test or script; ensure it runs in **`npm test`** (Vitest glob) or document new script in task Completion.
3. Run **`npm run build`**, **`npm run check`**, **`npx vitest run <newfile>`**.

## Technical notes

- If specs cannot be imported in Vitest cleanly, add **`src/utils/runtimeOnlyParams.test.ts`** that at least locks **sorted uniqueness** + **known critical keys** from a shared `const` array used by both production list and test — minimal drift protection.

## Completion

✅ Done when a **deterministic automated check** exists (Vitest **or** npm script), is wired into the standard test command **or** documented for CI addition, and **build + check** pass.

### Acceptance (observable)

- New test file or script path listed in PR.
- `npm run build`, `npm run check` green; **`npx vitest run`** green for added test.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **05** row: **Done** + date.
