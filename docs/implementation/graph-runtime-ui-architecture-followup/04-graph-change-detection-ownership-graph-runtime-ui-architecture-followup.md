# 04 — Graph change detection ownership — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read [`graph-and-platform-boundaries.md`](../../architecture/graph-and-platform-boundaries.md) § *Change detection and compilation*.
2. Prefer **documentation + thin shared helper** over risky merges of `RuntimeManager` and `CompilationManager` logic in one pass.
3. Do **not** change debounce timings or user-visible scheduling without explicit product sign-off.
4. Finish with **`npm run build`** and **`npm run check`**.

## Overview

**Two** layers classify graph edits: **`RuntimeManager`** (layout-only fast path, immediate vs debounced structure) and **`CompilationManager.recompile`** (incremental vs full compile). Drift causes subtle bugs when new edit types are added.

## Scope

### In

- Author or extend architecture prose in **`docs/architecture/graph-and-platform-boundaries.md`** **or** `preview-and-recompilation.md` with a **decision table**: edit kind → RuntimeManager action → CompilationManager expectation.
- Optionally add **`src/utils/changeDetection/graphEditTaxonomy.ts`** (name flexible) exporting **named predicates** used by both layers **only if** a real duplication is removed (e.g. shared `isLayoutOnly` definition). If no code dedup is justified, **docs-only** is acceptable for this task.

### Out

- Rewriting `detectGraphChanges` algorithm.
- Changing `isOnlyPositionChange` semantics without tests.

## Dependencies

### Provides

- Contributor checklist when adding connections, automation, or view state.

### Blocks

- None.

## Implementation tasks

1. Audit call sites: `GraphChangeDetector`, `detectGraphChanges`, `isOnlyPositionChange` — capture **who calls whom** in a short diagram or bullet list in the doc.
2. Add the **decision table** (minimum **5 rows**: e.g. pan-only, node move, parameter, connection add, automation edit).
3. If code helper is added: replace **at most two** duplicated conditionals; add **`npx vitest run`** for existing change-detection tests or add **one** focused test file.

## Technical notes

- Reference [`parameters-pipeline.md`](../../architecture/parameters-pipeline.md) for parameter vs structure path — link from the new table.

## Completion

✅ Done when the architecture doc clearly states **ownership** and, if any code was touched, **build + check + tests** pass; if **docs-only**, **build + check** suffice.

### Acceptance (observable)

- Doc PR section lists **RuntimeManager** vs **CompilationManager** responsibilities without contradiction.
- `npm run build`, `npm run check` green.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **04** row: **Done** + date + doc path.
