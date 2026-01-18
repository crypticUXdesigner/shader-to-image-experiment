import { ShaderInstance } from './ShaderInstance';
import type { ColorConfig } from '../types';

export class StaticRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private shaderInstance: ShaderInstance | null = null;
  
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;
    
    // Set viewport
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  
  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth * dpr;
    const height = this.canvas.clientHeight * dpr;
    
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.gl.viewport(0, 0, width, height);
    }
  }
  
  setShader(shaderInstance: ShaderInstance): void {
    this.shaderInstance = shaderInstance;
  }
  
  setTime(time: number): void {
    if (this.shaderInstance) {
      this.shaderInstance.setTime(time);
    }
  }
  
  setColorConfig(colorConfig: ColorConfig): void {
    if (this.shaderInstance) {
      this.shaderInstance.setColorConfig(colorConfig);
    }
  }
  
  setParameter(elementId: string, paramName: string, value: number): void {
    if (this.shaderInstance) {
      this.shaderInstance.setParameter(elementId, paramName, value);
    }
  }
  
  render(): void {
    if (!this.shaderInstance) return;
    
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    
    this.shaderInstance.render(this.canvas.width, this.canvas.height);
  }
  
  exportImage(resolution: [number, number], format: 'png' | 'jpeg' | 'webp', quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // Create temporary canvas
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = resolution[0];
      exportCanvas.height = resolution[1];
      
      const exportGl = exportCanvas.getContext('webgl2');
      if (!exportGl) {
        reject(new Error('WebGL2 not supported for export'));
        return;
      }
      
      // Create temporary shader instance
      // For now, we'll render to the main canvas and copy
      // In a full implementation, we'd create a new shader instance for export
      
      // Store original size
      const originalWidth = this.canvas.width;
      const originalHeight = this.canvas.height;
      
      // Temporarily resize
      this.canvas.width = resolution[0];
      this.canvas.height = resolution[1];
      this.gl.viewport(0, 0, resolution[0], resolution[1]);
      
      // Render
      this.render();
      
      // Convert to blob
      this.canvas.toBlob((blob) => {
        // Restore original size
        this.canvas.width = originalWidth;
        this.canvas.height = originalHeight;
        this.resize();
        
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob'));
        }
      }, `image/${format}`, quality || 1.0);
    });
  }
}

