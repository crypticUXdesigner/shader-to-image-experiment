# Shader Composer

A web-based tool for generating abstract art images using composable WebGL shader visual elements.

🌐 **[Live Demo](https://crypticUXdesigner.github.io/shader-composer/)**

## Features

- **Modular Visual Elements**: Compose custom shaders by selecting and combining visual elements (fBm noise, rings, vector field distortion, raymarched sphere, fractal deformation, pixelation)
- **Real-time Preview**: See changes instantly as you adjust parameters
- **OKLCH Color System**: Gradient-based colors with cubic-bezier curve interpolation
- **Timeline Scrubber**: Control time snapshot for static rendering
- **Export System**: Export images at custom resolutions (PNG, JPEG, WebP)
- **Config Hardsave**: Export complete configurations as JSON files

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

1. **Select Elements**: Check the boxes next to visual elements you want to include
2. **Reorder Elements**: Use ↑/↓ buttons to change the application order
3. **Adjust Parameters**: Expand parameter groups and adjust sliders
4. **Configure Colors**: Set start/end OKLCH colors and cubic-bezier curves
5. **Scrub Time**: Use the timeline slider to find the perfect frame
6. **Export**: Click "Export Image" to save your creation
7. **Hardsave**: Click "Hardsave Config" to copy configuration JSON

## Project Structure

```
src/
├── shaders/
│   ├── elements/          # Visual element definitions
│   ├── ShaderCompiler.ts  # Combines elements into GLSL
│   ├── ShaderInstance.ts  # WebGL shader instance
│   └── StaticRenderer.ts  # Static rendering system
├── ui/
│   └── components/        # UI components
├── utils/                 # Export and config utilities
└── main.ts                # Main application
```

## Building

```bash
npm run build
```

## License

All Rights Reserved. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

