# Overview & App Shell — User Goals

## 1. Purpose

Establish how the user opens ShaderNoice, orients on the preset and layout chrome, monitors status, accesses help and errors, and (when enabled) interacts with Audiotool account linking—without prescribing internal implementation details.

## 2. User & Context

- **Who:** Anyone editing a shader composition in the browser.
- **When:** Every session—from first load until export and navigation within the shell (top bar, panels, overlays).

## 3. User Goals

- **Start from the Projects hub, then preset chrome** — Open the app onto a hub of **My projects** (browser-local), bundled presets (**Preview** vs **Use as new project**), **Start from scratch**, and **Import JSON**. **GPU preview runtime** (WebGL2 **or** WebGPU, depending on session) boots only after picking a hub action (lazy init). **`?project=<uuid>`** auto-opens when that UUID exists locally; GitHub Pages–safe SPA query parameter only (`/project/:id` deferred).
  - After entering the editor: preset picker; layout (split/full node view); bottom bar chrome. Preset dialog can include **Local projects…** to return to the hub (runtime teardown).
- **Understand preview GPU mode (WebGL2 vs WebGPU)** — The editor runs in an explicit **session mode**: **WebGL2** or **WebGPU** for preview (not both at once). Default policy picks a mode when the user does not override; advanced users may force a mode (e.g. **`?renderBackend=webgl`**, **`webgpu`**, or **`auto`**). In **WebGPU** mode, the product goal is **full feature coverage**; until then, if the graph cannot compile or run on WebGPU, the user sees a **hard block** (clear error) with **how to proceed**—typically **switch to WebGL mode**—not a silent fallback that hides the gap. The same block may signal a **parity gap** or a product decision (e.g. future rules such as disallowed connections until WGSL supports a case). Architecture / policy: [`../architecture/webgl-webgpu-preview-export.md`](../architecture/webgl-webgpu-preview-export.md).
- **See and control viewport context** — Zoom and frame rate cues where shown; timeline/preview affordances tied to shell layout.
- **Get help and recover from errors** — Help entry when applicable; non-blocking errors and messages that do not trap core editing.
  - Errors toasts/display; shortcuts/help affordances where implemented.
  - **Preview / export GPU mode:** When **WebGPU** session mode hits a **hard block** (preview compile, device loss, or export that cannot use WebGPU for this graph), shell messages use **clear copy**: what failed, that the user is still in **WebGPU** mode, and the **recommended next step** (e.g. **switch to WebGL** and retry)—not phrasing that suggests the app silently fell back to WebGL for the same session. Toasts stay **dismissible** where appropriate and follow the single error path per project conventions. Copy patterns: [10-help-and-discovery.md](./10-help-and-discovery.md).
- **Use the full editor without mandatory Audiotool sign-in** — When Audiotool OAuth is enabled in deployment, ShaderNoice must still allow entering the main editor via an explicit **continue without signing in** path on the splash. Audiotool is **additive**: identity and account-linked catalog features appear after sign-in, not instead of editing.
  - Splash: primary action to enter without OAuth; secondary action to **Sign in to Audiotool** (or retry when OAuth init fails).
  - Top bar: when not connected but OAuth is configured, offer **Sign in to Audiotool** after the splash is dismissed.
  - When connected: account menu (avatar/identity where available); sign-out returns to disconnected state without tearing down an already-running editor graph/runtime.
  - Copy avoids “guest” or tier framing; emphasize optional connection (see **`docs/implementation/`** when an Audiotool/OAuth spec exists).

## 4. Key Flows

- **Load app → hub → picker → edit:** Splash (branding/OAuth when configured) → optional Audiotool continue → **Projects hub** (IDB + bundled list) → user choice → preset dialog as needed → canvas and panels active.
- **Optional Audiotool:** Continue without OAuth → edit; later **Sign in to Audiotool** from splash or top bar → account chrome updates when session exists.
- **Sign out:** Disconnect Audiotool in chrome; editor stays usable.

## 5. Constraints

- Splash and OAuth redirects must remain usable without trapping the user (continue path when OAuth gate is enabled).
- **WebGL2**, **WebGPU**, and browser capabilities (WebCodecs, limits) may limit preview and export independently of each other and of Audiotool.
- Detailed catalog/browse behavior for Audiotool-hosted media waits on API validation (project spike notes)—not promised in shell goals beyond sign-in/offering UX.

## 6. Related

- [README index](./README.md)
- [02-node-graph-canvas.md](./02-node-graph-canvas.md) — Live preview.
- [09-export.md](./09-export.md) — Export inherits session GPU mode.
- [10-help-and-discovery.md](./10-help-and-discovery.md) — Error / toast copy for GPU mode blocks.
- Implementation specs (optional OAuth, when tracked): [`../implementation/README.md`](../implementation/README.md)
- Exclusive GPU modes (preview + export policy): [`../architecture/webgl-webgpu-preview-export.md`](../architecture/webgl-webgpu-preview-export.md)
