# Audiotool arrangement snapshot — DAW data for visuals & control

## Mission

When the user’s primary audio is an **Audiotool published track**, ShaderNoice can **import a one-shot snapshot** of that track’s studio project (at **publish commit**) and use it to drive the shader: **region lanes**, **note visuals**, and **DAW automation → parameter** links with explicit remapping. Nexus is used only at import time; runtime and compilation read a **normalized, immutable snapshot**—no live DAW sync in this package.

## Vision (multi-milestone)

| Pillar | User-facing outcome |
| --- | --- |
| **1 — Region lanes** | A node draws **regions** on horizontal tracks (all or selected), scrolling or windowed against **`uTimelineTime`**, using outer span + DAW colors. |
| **2 — Note field** | A node draws **notes** (all or selected tracks), positioned by pitch/time vs playhead, sized by velocity. |
| **3 — DAW automation** | User links **specific DAW automation tracks** to **shader parameters** with **in/out remapping** (DAW values are not 1:1 with shader ranges). |

**Complements existing audio:** audiograph / FFT = energy; arrangement snapshot = **structure and control**.

## Goals

- **Import once** from `tracks/{id}` → `project_name` + `project_commit_index` → Nexus `open` → query → `stop`.
- **Persist** snapshot with the graph / `audioSetup` so presets and reload keep visuals.
- **Align time** with transport: snapshot times in **seconds**; playhead = **`uTimelineTime`**; duration/BPM from snapshot `config` (constant BPM v1).
- **Ship pillar 1** before pillar 2; pillar 3 after visual nodes prove the snapshot contract.

## Success & constraints

| Must-have | Detail |
| --- | --- |
| Snapshot contract | Typed `ArrangementSnapshot` (adapter output); nodes never import `@audiotool/nexus`. |
| Published state | Snapshot tied to **publish commit** on the playlist track (not “latest studio” unless user explicitly re-imports later). |
| Graph rules | Immutable graph; snapshot stored outside node mutation (extension on `audioSetup` or serialized sidecar—see task 02). |
| OAuth | `project:read` + `project:write` available for `open` / session. |
| Checks | `npm run type-check && npm test && npm run lint && npm run build` green per completed task. |

**Invariants:** No requirement for WebGL/WebGPU pixel parity on arrangement nodes; both backends should compile supported graphs without crash.

**Allowable v1 simplifications (documented, not bugs):**

- Region **lanes** draw uses **outer** `positionTicks` / `durationTicks` only (ignore inner loop math).
- Tick → second uses **`config.tempoBpm`** only (ignore tempo automation track).
- **Notes** import is **loop-aware** (matches hearable MIDI for looped `noteRegion`s; disabled regions/tracks omitted).

## Architecture & design

```
Audiotool track (playlist) ──► import (Nexus, once)
        │
        ▼
ArrangementSnapshot (normalized JSON)
        │
        ├──► audioSetup / serialization
        │
        ├──► compile: arrangement nodes (texture or uniform packing)
        ├──► runtime: optional scalar evaluators (later)
        └──► pillar 3: DAW automation bindings + remap + sample at uTimelineTime
```

**Anti-patterns:** Live `SyncedDocument` in preview loop; mutating snapshot in runtime; baking entire DAW doc into GLSL strings; coupling compilation to OAuth.

**High-touch areas (expect edits):** `src/utils/audiotoolSessionRpc.ts` or new `src/audiotool/arrangement/**`, `src/data-model/audioSetupTypes.ts`, `src/data-model/serialization.ts`, new `src/shaders/nodes/arrangement-*`, compile path for data textures / custom uniforms, `LoadTrackDialog` / audio panel import affordance.

## Locked decisions (planning)

| Topic | Decision |
| --- | --- |
| Sync model | **Query-once** snapshot; user **re-import** after DAW edits. |
| Source of truth | **Published** `project_name` + `project_commit_index` from `Track`. |
| Region geometry v1 | **Outer span** on timeline. |
| Large arrangements | Pack regions/notes into a **data texture** (or capped uniform array with documented max). |
| Time base | `ticksToSeconds` from `@audiotool/nexus/utils` at import; store **seconds** in snapshot. |
| Track filter | Node parameters: **all tracks** vs **subset** (track ids from snapshot). |
| Automation values | DAW automation events are **0–1**; **per-binding remap** (inMin/inMax/outMin/outMax) to shader param range. |

## Non-goals (this package)

- Live collaboration / `document.events` streaming.
- Full loop-region fidelity, tempo maps, desktop device graph viz, mixer level mirroring.
- Replacing ShaderNoice’s internal **graph automation** editor (DAW automation is an optional **additional** driver).
- Importing arrangement for **uploaded MP3-only** primary sources (no project).

## Work items

| ID | Task | Status | Provides | Blocks |
| --- | --- | --- | --- | --- |
| 01 | [Spike + snapshot contract](./01-spike-snapshot-contract-audiotool-arrangement.md) | ✅ | `ArrangementSnapshot` types, import spike, limits | 02 |
| 02 | [Adapter, storage, import UX](./02-snapshot-adapter-import-storage-audiotool-arrangement.md) | ✅ | Persisted snapshot on playlist primary | 03A, 03B, 04, 05 |
| 03A | [Region lanes node — GLSL](./03A-region-lanes-node-glsl-audiotool-arrangement.md) | ✅ | Pillar 1 visual node | 04 (optional) |
| 03B | [Region lanes node — WGSL MVP](./03B-region-lanes-node-wgsl-audiotool-arrangement.md) | ✅ | WebGPU parity for pillar 1 | — |
| 04 | [Notes visualization node](./04-notes-visualization-node-audiotool-arrangement.md) | ✅ | Pillar 2 | — |
| 05 | [DAW automation → parameter](./05-daw-automation-parameter-bindings-audiotool-arrangement.md) | ⏳ | Pillar 3 bindings + remap | — |
| 06 | [Arrangement Notes — layout controls](./06-arrangement-notes-layout-controls-audiotool-arrangement.md) | ✅ | Padding/gap/orientation for `arrangement-notes` | — |
| 07 | [Arrangement Notes — playhead, OKLCH, mask](./07-arrangement-notes-playhead-colors-mask-audiotool-arrangement.md) | ✅ | Playhead toggle/color; OKLCH bg; `mask` output | — |

**Execution order:** `01` → `02` → (`03A` ∥ `03B` after 02) → `04` → (`06` → `07` notes UX follow-up) ∥ `05`. Pillar 3 can slip to a follow-up sprint without invalidating 01–02.

## Progress tracker

- **Overall:** ~90% (tasks 01–04 + **06–07** shipped; 05 remains).
- **Milestone A (foundation):** tasks 01–02 ✅.
- **Milestone B (visual):** tasks 03A–03B, 04 ✅.
- **Milestone B2 (notes polish):** tasks 06–07 ✅ (2026-05-16): layout/orientation/pitch pad/row gap; OKLCH bg + playhead pickers; **`mask`** float; WGSL binds eval once via fragment `let`; `migrateArrangementNotesParameters` for legacy RGB.
- **Milestone C (control):** task 05.

## Notes & risks

- **Task 01 (2026-05-15):** `src/audiotool/arrangement/` — types, `buildArrangementSnapshot`, `importArrangementSnapshotFromProject` (`open`→`start`→`query`→`stop`), fixture `__fixtures__/spike-arrangement-raw.json`. Caps: **`MAX_ARRANGEMENT_REGIONS=512`**, **`MAX_ARRANGEMENT_NOTES=8192`** (fixture: 4 tracks, 4 regions). Nexus `open` attaches at latest commit; `commitIndex` is stored on snapshot for task 02 `GetEntities` pinning.
- **Task 02 (2026-05-15):** `audioSetup.arrangementSnapshot` + `arrangementImportedAt`; serialize/deserialize via `serialization.ts`; `importArrangementForPrimaryTrack` (GetTrack `project_name` / `project_commit_index`, bundled `tracks-data` fallback); browse-mode audio panel **Import arrangement from project**; snapshot cleared on primary upload/other track; timeline duration **not** auto-overwritten (toast hints manual alignment).
- **Task 03A (2026-05-15):** `arrangement-lanes` node (`src/shaders/nodes/arrangement-lanes.ts`); compile-time bake via `src/shaders/arrangement/packArrangementRegionsForGlsl.ts` + `FunctionGenerator` (`{{ARRANGEMENT_BAKE}}` / per-node suffix); follow/fixed viewport, track filter, DAW/palette colors; cap **512** regions documented in `node-documentation.json`; WebGL only (03B for WGSL).
- **Task 03B (2026-05-15):** `arrangement-lanes` in `WGSL_SUPPORTED_NODE_TYPES`; WGSL inline via `buildArrangementLanesWgslNodeHelper` + `WgslMvpCompiler` case (reuses `packArrangementRegionsForGlsl` packing); unwired `time` → `globals.v0.y` (`usesTimelineTime`); tests in `NodeShaderCompiler.test.ts` + `packArrangementRegionsForGlsl.test.ts`.
- **Task 04 (2026-05-15):** Importer fills `notes[]` from Nexus `note` entities linked to enabled `noteRegion`s (absolute ticks = region start + `collectionOffsetTicks` + note `positionTicks`). `arrangement-notes` node + `packArrangementNotesForGlsl.ts` (bake cap **2048** / `MAX_ARRANGEMENT_NOTES_PACKED`); GLSL + WGSL; pitch→Y, time→X, velocity→brightness; tests in `buildArrangementSnapshot.test.ts`, `packArrangementNotesForGlsl.test.ts`, `NodeShaderCompiler.test.ts`.
- **Tasks 06–07 (2026-05-16):** Shipped follow-up on **`arrangement-notes`** — layout (**Orient**, **Pitch pad**, **Row gap**); **Playhead** Off/On + OKLCH strip row with background (**Colors** row); **`mask`** float output (`out.a` equivalent weight); GLSL struct result per node instance; WGSL `fragmentLetStatements` avoids duplicate eval when both ports used; rename WGSL edge fade helper to **`arrangementNotesEdgeFadeWgsl`** to avoid colliding with **`arrangement-lanes-shared`** when both nodes compile; migration **`arrangementNotesParametersMigration`** (`backgroundR/G/B` → `backgroundL/C/H`).
- **Notes loop fix (2026-05-15):** `collectNotes` expands loop repetitions using Region `loopOffsetTicks` / `loopDurationTicks` / `collectionOffsetTicks`; skips disabled regions and disabled note tracks; diagnostics report `noteExpansionFactor`.
- **Track vs project:** Playlist row is `tracks/…`; snapshot needs `project_name` from `GetTrack` (already available in session RPC).
- **Duration alignment:** Prefer `min(config.durationTicks, track play_duration)` when both exist—task 02 documents rule.
- **WGSL data textures:** 03B uses compile-time `array<vec4<f32>, N>` bake (same packing as GLSL), not a runtime data texture.
- **User-goals:** Update `docs/user-goals/06-audio.md` when import UX ships (task 02/03), not in task 01.

## Open items (resolve in task 01 or 02, not blocking overview)

- Exact **max regions / max notes** for GPU packing (spike measures typical published projects).
- ~~Whether snapshot lives on **`audioSetup.arrangementSnapshot`**~~ — **resolved (task 02):** on `audioSetup` when playlist primary.
- Automation binding UI: extend audio panel vs dedicated “DAW links” section (task 05).
