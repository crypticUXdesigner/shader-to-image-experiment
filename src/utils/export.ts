import type { ExportConfig, Layer } from '../types';
import { StaticRenderer } from '../shaders/StaticRenderer';
import { ShaderCompiler } from '../shaders/ShaderCompiler';
import { ShaderInstance } from '../shaders/ShaderInstance';
import { elementLibrary } from '../shaders/elements/index';
import type { ColorConfig } from '../types';

export class ExportManager {
  async exportImage(
    renderer: StaticRenderer,
    config: ExportConfig,
    layers: Layer[],
    timelineConfig: { value: number },
    hiddenElements: Map<string, Set<string>> = new Map()
  ): Promise<void> {
    // Create temporary canvas at export resolution
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = config.resolution[0];
    exportCanvas.height = config.resolution[1];
    
    // Get WebGL context for export canvas
    const exportGl = exportCanvas.getContext('webgl2');
    if (!exportGl) {
      throw new Error('WebGL2 not supported for export');
    }
    
    // Compile shader for export
    const compiler = new ShaderCompiler();
    const shaderSource = compiler.compileShaderWithLayers(layers, elementLibrary, hiddenElements);
    
    // Create shader instance for export
    const exportShader = new ShaderInstance(exportGl, shaderSource);
    
    // Set all parameters from all layers with layer-specific uniform names
    layers.forEach((layer, layerIndex) => {
      const layerNum = layerIndex + 1;
      
      Object.entries(layer.parameters).forEach(([key, value]) => {
        const [elementId, paramName] = key.split('.');
        // Set parameter with layer number for layer-specific uniforms
        exportShader.setParameter(elementId, paramName, value, layerNum);
      });
      
      // Set layer properties and color configs
      exportShader.setLayerProperties(layerNum, layer.blendingMode, layer.opacity, layer.visible);
      exportShader.setLayerColorConfig(layerNum, layer.colorConfig);
    });
    
    // Set time
    exportShader.setTime(timelineConfig.value);
    
    // Render to export canvas
    exportGl.clearColor(0, 0, 0, 1);
    exportGl.clear(exportGl.COLOR_BUFFER_BIT);
    exportGl.viewport(0, 0, config.resolution[0], config.resolution[1]);
    exportShader.render(config.resolution[0], config.resolution[1]);
    
    // Read pixels from WebGL
    const pixels = new Uint8Array(config.resolution[0] * config.resolution[1] * 4);
    exportGl.readPixels(0, 0, config.resolution[0], config.resolution[1], exportGl.RGBA, exportGl.UNSIGNED_BYTE, pixels);
    
    // Clean up
    exportShader.destroy();
    
    // Create 2D canvas and put pixels
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = config.resolution[0];
    outputCanvas.height = config.resolution[1];
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    
    // Flip vertically (WebGL has origin at bottom-left, canvas at top-left)
    const imageData = ctx.createImageData(config.resolution[0], config.resolution[1]);
    for (let y = 0; y < config.resolution[1]; y++) {
      const srcRow = y;
      const dstRow = config.resolution[1] - 1 - y;
      for (let x = 0; x < config.resolution[0]; x++) {
        const srcIdx = (srcRow * config.resolution[0] + x) * 4;
        const dstIdx = (dstRow * config.resolution[0] + x) * 4;
        imageData.data[dstIdx] = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    
    // Convert to blob and download
    return new Promise((resolve, reject) => {
      outputCanvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to create blob'));
          return;
        }
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = config.filename || `shader-export-${Date.now()}.${config.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        resolve();
      }, `image/${config.format}`, config.quality || 1.0);
    });
  }
}

