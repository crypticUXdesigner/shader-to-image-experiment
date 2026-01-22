# Shader Composer

A web-based node-based shader editor for creating procedural shader art using WebGL. Build complex shader graphs by connecting nodes visually.

🌐 **[Live Demo](https://crypticUXdesigner.github.io/shader-composer/)**

## Features

- **Node-Based Editor**: Visual node graph editor for composing shaders
- **Real-time Preview**: Live preview of shader output as you build
- **Rich Node Library**: 90+ nodes including noise generators, transforms, blending modes, post-processing effects, and more
- **Preset System**: Save and load shader graphs as presets
- **Export System**: Export images at custom resolutions (PNG, JPEG, WebP)
- **Undo/Redo**: Full undo/redo support for all operations
- **Copy/Paste**: Copy and paste nodes between graphs
- **Parameter Controls**: Intuitive draggable parameter controls with real-time updates

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

## Usage

### Creating a Shader

1. **Add Nodes**: Right-click on the canvas or press `Space` to open the node search dialog
2. **Connect Nodes**: Drag from output ports to input ports to create connections
3. **Adjust Parameters**: Click on nodes to expand parameter controls, then drag sliders to adjust values
4. **Preview**: The shader preview updates in real-time as you make changes
5. **Save Preset**: Use "Copy Preset" to copy your graph as JSON, then save it in `src/presets/`
6. **Export Image**: Click "Export Image" to save your creation at custom resolutions

### Keyboard Shortcuts

- `Space` - Open node search dialog
- `Delete` / `Backspace` - Delete selected nodes
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Ctrl/Cmd + C` - Copy selected nodes
- `Ctrl/Cmd + V` - Paste nodes
- `Ctrl/Cmd + A` - Select all nodes
- `Ctrl/Cmd + D` - Duplicate selected nodes

## Project Structure

```
src/
├── data-model/            # Graph data structures, validation, serialization
├── shaders/
│   ├── elements/          # Visual element node definitions
│   ├── nodes/             # System nodes (math, blending, transforms, etc.)
│   └── NodeShaderCompiler.ts  # Compiles node graphs to GLSL
├── runtime/               # WebGL runtime, shader execution, uniform management
├── ui/
│   └── components/        # Node editor UI components
├── presets/               # Preset shader graphs
├── utils/                 # Utilities (export, presets, serialization)
└── main.ts                # Main application entry point
```

## Building

```bash
npm run build
```

## License

All Rights Reserved. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

