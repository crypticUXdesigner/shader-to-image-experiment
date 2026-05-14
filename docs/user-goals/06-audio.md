# Audio — User Goals

## 1. Purpose

Audio drives the shader in real time (e.g. frequency bands, remapped values) and is used for video export. User manages files, bands, and remappers in the audio panel and binds them to parameters; playback and timeline shared with preview.

## 2. User & Context

- **Who:** User creating audio-reactive shaders or exporting video with audio.
- **When:** When configuring audio, during playback, and when exporting video.

## 3. User Goals

- **Manage audio files** — Audio panel (tab or toggle) shows setup: files, bands, remappers. Add file (e.g. upload MP3 or file picker); file loaded and appears; first file can be primary for timeline and export. Multiple files: id, name, path label, auto-play; remove or reorder as supported. File picker: preview may pause; on close, playback may resume.
- **Define bands and remappers** — Frequency bands (e.g. per file): range, smoothing, FFT size, optional remap in/out; listed and editable in panel. Remappers: map band value to range (inMin, inMax, outMin, outMax); connectable to parameters via signal picker. The bands & remappers view can be opened directly from the **audio toggle** in the bottom bar (browse mode: create / edit / delete; no Connect actions because there's no target parameter).
- **Control playback and see time** — Play/pause from bottom bar (button or short spacebar); time display and scrubber show current time and duration. One playhead, one duration; primary (e.g. first) file defines duration when loaded.
- **Scrub the timeline** — Drag on time strip in bottom bar; playhead seeks; preview and audio-driven parameters update.
- **Bind audio to parameters** — Double-click a parameter port to open the **audio signal picker**. The picker is band-centric: it shows bands (with frequency range) and remappers per band. Create a new band or choose an existing band (raw) or remapper and connect; the connection is created and the port shows the signal name. When the port is already connected to an audio signal, double-click opens a **compact** view with only that band’s or remapper’s configuration (tweak settings or disconnect). From compact mode, **Open full** can reopen the large picker without disconnecting first; otherwise disconnect (or close) and double-click again to open the full picker. **Graph (node) outputs** are not listed in this picker—connect a node output to a parameter by dragging from the node’s output port to the parameter port. Parameters bound to a band or remapper receive live value at runtime; UI shows “driven” and live value.
- **Persist audio setup** — Stored separately from graph (e.g. `audioSetup`); saved/loaded with presets and included in “copy to clipboard” for paste.

## 4. Key Flows

- **Setup:** Open audio panel (audio toggle in bottom bar, or double-click a parameter port) → add file (e.g. MP3) → configure bands/remappers. Bind to a parameter by double-clicking the parameter port → picker shows bands and remappers → connect band (raw) or a remapper → preview reacts.
- **Playback:** Play in bottom bar → timeline runs; scrub strip → playhead seeks; shader and audio in sync.
- **Export:** Start video export → “use full audio” → primary file’s buffer and duration used (see [09-export.md](./09-export.md)).

## 5. Constraints

- Audio nodes migrated to audio setup + virtual nodes; UX is panel-based files/bands/remappers plus parameter connections. Web Audio API (and OfflineAudioContext for export); codec support for export may depend on browser (WebCodecs).
- **Import / portability** — Graph JSON may reference uploaded files by id/name from the original browser; after **Import JSON** or moving machines, users may need to **re-upload** tracks in the audio panel so playback works again.

## 6. Related

- [04-nodes-and-parameters.md](./04-nodes-and-parameters.md) — Signal picker and parameter binding.
- [07-timeline-and-automation.md](./07-timeline-and-automation.md) — Playhead, play/pause, seek.
- [08-presets-and-data.md](./08-presets-and-data.md) — Audio setup in presets and clipboard.
- [09-export.md](./09-export.md) — Video export with primary audio.
