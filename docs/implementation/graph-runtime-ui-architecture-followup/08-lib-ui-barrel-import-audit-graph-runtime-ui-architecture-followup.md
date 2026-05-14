# 08 — lib ↔ ui barrel import audit — graph-runtime-ui-architecture-followup

## Agent instructions (START HERE)

1. Read `.cursor/rules/frontend/component-structure.mdc` — **`src/lib` imports `src/ui` only via `index.ts`** (no deep paths).
2. Use **ripgrep** (or `npm run lint` if a rule exists) to find violations; fix **all** or split into follow-up only if a violation requires a large refactor — prefer fixing in this task if **≤ ~5 files**.
3. Finish with **`npm run build`** and **`npm run check`**.

## Overview

Deep imports from `src/ui/...` bypass the editor **`index.ts`** façade and increase coupling between Svelte surface and canvas engine, making moves/refactors brittle.

## Scope

### In

- Audit: from `src/lib/**`, grep imports matching `from ['"].*\/ui\/editor\/(?!index)` or equivalent deep `src/ui/` paths (adjust regex to project layout).
- Replace with **barrel** imports from approved `src/ui/editor/index.ts` (or documented public entry). If a symbol is not exported, **add a named export** to the barrel instead of deep-importing.
- Add **`docs/architecture/editor-ui-canvas-layout.md`** bullet or short subsection listing **allowed import roots** if not already explicit.

### Out

- Moving files between `lib` and `ui` folders (structural move).
- `src/ui/interactions` policy changes beyond fixing violations.

## Dependencies

### Provides

- Enforceable boundary for future UI work.

### Blocks

- None.

## Implementation tasks

1. Run audit; capture **violation count** before fixes.
2. Fix violations; if **>5 files** would change, stop at **5** and document remainder as a **new task** in `_OVERVIEW` Progress notes (get explicit scope extension from operator).
3. `npm run build`, `npm run check`.

## Technical notes

- Optional: add **eslint `no-restricted-imports`** pattern in a follow-up — **out of scope** unless trivial (one-line config); mention in Completion if deferred.

## Completion

✅ Done when **zero** deep `src/lib` → `src/ui/**` imports remain (except any documented exceptions in the architecture doc), violation count **0**, and **build + check** pass.

### Acceptance (observable)

- Paste **rg command** (or equivalent) used in PR showing **no matches**.
- `npm run build`, `npm run check` green.

### Final steps

- Update [`_OVERVIEW.md`](./_OVERVIEW.md) task **08** row: **Done** + date.
