# Agent instructions

This repo is a **node-based shader editor** (WebGL, Svelte 5, TypeScript).

## Non-negotiables

- **Graph**: Immutable; use `src/data-model/` for updates, serialization, and validation. Runtime and compilation never mutate the graph.
- **UX and features**: Align with `docs/user-goals/` (use the doc for the area you change).
- **UI work**: Follow `.impeccable.md` and `.cursor/rules/frontend/` (notably `css-standards.mdc`, `svelte-standards.mdc`, `design-system.mdc`).
- **Shader node naming, parameters, & ports**: **`NodeSpec.displayName`**, **`src/data/node-documentation.json`** **`title`**, **`parameters` / `parameterGroups` / `parameterLayout` header `label`s** (keep **short** — node body layout), and optional **`inputs`/`outputs` `label`** (display-only; **`name`** stays stable for GLSL) — conventions in **`shaders/node-standards.mdc`** (**Parameter and group label rules**, **Port label rules**). Extended port tables: **`docs/implementation/node-port-labels-in-out-analysis.md`**.

## Where things live

| Concern | Location |
| --- | --- |
| Scoped rules (when / how) | `.cursor/rules/**/*.mdc` — **always-on:** `core/project-conventions.mdc` |
| Slash **commands** (checklists, templates) | `.cursor/commands/*.md` → `/` + filename |
| **Skills** (repeatable workflows; often link to a command file) | `.cursor/skills/*/SKILL.md` |
| Which `/` tool when | **Authoritative:** `.cursor/rules/workflow/project-workflow.mdc` |
| Task / project file hygiene | `.cursor/rules/workflow/workpkg-hygiene.mdc` |
| Multi-step tasks, specs, `_OVERVIEW` packages (complements user-goals) | `docs/implementation/` |
| **Architecture** (graph, runtime, compilation, UI vs canvas seams) | `docs/architecture/README.md` |
| Writing or editing `.mdc` rules | `.cursor/rules/writing-rules.mdc` |

**Commands vs skills:** Keep **canonical workflow text** in `.cursor/commands/*.md`. Skills are **thin wrappers** (discovery via `description`, ordered steps, links to those files). Do not maintain two long copies of the same checklist.

Browse `.cursor/rules/` and `.cursor/skills/` or the chat slash menu for the full rule and skill lists.

## Onboarding

Use the **`onboard-contributor`** skill and `docs/onboarding-checklist.md`.

## GPU preview + export (dev)

- **URL:** `?renderBackend=auto|webgpu|webgl` — parsed in `src/lib/App.svelte` (`parseUrlRenderBackendOverride`). Chooses the preview backend and the **same** exclusive raster API for image/video export (`RuntimeManager.getExportRasterBackend` → `runImageExportFlow` / `runVideoExportFlow`). A WebGPU session does not silently finish export on WebGL in one job (clear error; switch to `webgl` and reload to export on WebGL).
- **Optional WebGPU clock mask (experimental):** `?webgpuPreviewDependencyClock=1|true|yes` — when preview is WebGPU-only, may pass the compile **preview dependency** mask into `TimeManager` so paused graphs can skip full-rate work; **default off** (fail-open to full-rate if the mask is unsafe). See [`docs/architecture/preview-and-recompilation.md`](docs/architecture/preview-and-recompilation.md) (*Optional developer URL flags*) and `src/runtime/webGpuPreviewDependencyClock.ts`.
- **WebGPU golden harness** (`npm run test:webgpu-golden`): browser-style WebGL vs WebGPU checks; **opt-in** (not run by default `npm test`). See `src/validation/webgpuGoldenHarnessMain.ts` and [`docs/architecture/PARITY-PLAN.md`](docs/architecture/PARITY-PLAN.md).
