# Presets

This directory contains preset files for the node-based shader system.

## Creating a Preset

1. Use the "Copy Preset" button in the UI to copy your current graph as JSON
2. Create a new `.json` file in this directory
3. Paste the copied JSON content into the file
4. The preset will automatically appear in the preset dropdown

## Preset Format

Presets must follow the `SerializedGraphFile` format:

```json
{
  "format": "shader-composer-node-graph",
  "formatVersion": "2.0",
  "graph": {
    "id": "graph-...",
    "name": "Preset Name",
    "version": "2.0",
    "nodes": [...],
    "connections": [...],
    "viewState": {
      "zoom": 1.0,
      "panX": 0,
      "panY": 0,
      "selectedNodeIds": []
    }
  }
}
```

## Naming

Preset filenames should be descriptive and use kebab-case (e.g., `sphere-shader.json`, `colorful-noise.json`).

The display name in the UI will automatically convert kebab-case to Title Case (e.g., `sphere-shader` → "Sphere Shader").
