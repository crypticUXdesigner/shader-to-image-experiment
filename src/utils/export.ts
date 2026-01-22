/**
 * Export utility for node-based shader system
 * Exports the current shader as an image file
 */

import type { NodeGraph } from '../data-model/types';
import type { ShaderCompiler } from '../runtime/types';

export interface ExportOptions {
  resolution?: [number, number];
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  filename?: string;
}

/**
 * Export the current shader graph as an image
 */
export async function exportImage(
  graph: NodeGraph,
  compiler: ShaderCompiler,
  options: ExportOptions = {}
): Promise<void> {
  const {
    resolution = [1600, 1600],
    format = 'png',
    quality = 1.0,
    filename
  } = options;

  // Create temporary canvas at export resolution
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = resolution[0];
  exportCanvas.height = resolution[1];

  // Get WebGL context for export canvas
  const exportGl = exportCanvas.getContext('webgl2', {
    antialias: false,
    preserveDrawingBuffer: true
  });

  if (!exportGl) {
    throw new Error('WebGL2 not supported for export');
  }

  try {
    // Compile shader for export
    const compilationResult = compiler.compile(graph);

    if (compilationResult.metadata.errors.length > 0) {
      throw new Error(`Shader compilation errors: ${compilationResult.metadata.errors.join(', ')}`);
    }

    // Create shader program
    const vertexShader = createShader(exportGl, exportGl.VERTEX_SHADER, getVertexShaderSource());
    const fragmentShader = createShader(exportGl, exportGl.FRAGMENT_SHADER, compilationResult.shaderCode);
    const program = createProgram(exportGl, vertexShader, fragmentShader);

    // Setup viewport
    exportGl.viewport(0, 0, resolution[0], resolution[1]);

    // Create fullscreen quad
    const quadBuffer = createQuadBuffer(exportGl);

    // Use the program
    exportGl.useProgram(program);

    // Set uniforms
    const resolutionLocation = exportGl.getUniformLocation(program, 'uResolution');
    if (resolutionLocation) {
      exportGl.uniform2f(resolutionLocation, resolution[0], resolution[1]);
    }

    const timeLocation = exportGl.getUniformLocation(program, 'uTime');
    if (timeLocation) {
      exportGl.uniform1f(timeLocation, 0); // Static export, no animation
    }

    // Set parameter uniforms
    for (const uniform of compilationResult.uniforms) {
      const location = exportGl.getUniformLocation(program, uniform.name);
      if (!location) continue;

      const node = graph.nodes.find(n => n.id === uniform.nodeId);
      if (!node) continue;

      const paramValue = node.parameters[uniform.paramName];
      if (paramValue === undefined) continue;

      switch (uniform.type) {
        case 'float':
          exportGl.uniform1f(location, typeof paramValue === 'number' ? paramValue : uniform.defaultValue as number);
          break;
        case 'int':
          exportGl.uniform1i(location, typeof paramValue === 'number' ? Math.round(paramValue) : uniform.defaultValue as number);
          break;
        case 'vec2':
          const v2 = Array.isArray(paramValue) && paramValue.length >= 2
            ? [paramValue[0], paramValue[1]]
            : (uniform.defaultValue as [number, number]);
          exportGl.uniform2f(location, v2[0], v2[1]);
          break;
        case 'vec3':
          const v3 = Array.isArray(paramValue) && paramValue.length >= 3
            ? [paramValue[0], paramValue[1], paramValue[2]]
            : (uniform.defaultValue as [number, number, number]);
          exportGl.uniform3f(location, v3[0], v3[1], v3[2]);
          break;
        case 'vec4':
          const v4 = Array.isArray(paramValue) && paramValue.length >= 4
            ? [paramValue[0], paramValue[1], paramValue[2], paramValue[3]]
            : (uniform.defaultValue as [number, number, number, number]);
          exportGl.uniform4f(location, v4[0], v4[1], v4[2], v4[3]);
          break;
      }
    }

    // Clear and render
    exportGl.clearColor(0, 0, 0, 1);
    exportGl.clear(exportGl.COLOR_BUFFER_BIT);

    // Draw quad
    exportGl.bindBuffer(exportGl.ARRAY_BUFFER, quadBuffer);
    const positionLocation = exportGl.getAttribLocation(program, 'aPosition');
    exportGl.enableVertexAttribArray(positionLocation);
    exportGl.vertexAttribPointer(positionLocation, 2, exportGl.FLOAT, false, 0, 0);
    exportGl.drawArrays(exportGl.TRIANGLES, 0, 6);

    // Read pixels and download
    await downloadCanvas(exportCanvas, format, quality, filename || generateFilename(format));

    // Cleanup
    exportGl.deleteProgram(program);
    exportGl.deleteShader(vertexShader);
    exportGl.deleteShader(fragmentShader);
    exportGl.deleteBuffer(quadBuffer);
  } catch (error) {
    throw new Error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Create a WebGL shader
 */
function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${info}`);
  }

  return shader;
}

/**
 * Create a WebGL program
 */
function createProgram(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) {
    throw new Error('Failed to create program');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program linking failed: ${info}`);
  }

  return program;
}

/**
 * Get vertex shader source for fullscreen quad
 */
function getVertexShaderSource(): string {
  return `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
}

/**
 * Create a fullscreen quad buffer
 */
function createQuadBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer');
  }

  // Fullscreen quad vertices (x, y)
  const vertices = new Float32Array([
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1
  ]);

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  return buffer;
}

/**
 * Download canvas as image file
 */
async function downloadCanvas(
  canvas: HTMLCanvasElement,
  format: 'png' | 'jpeg' | 'webp',
  quality: number,
  filename: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';
      
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Failed to create blob'));
            return;
          }

          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          resolve();
        },
        mimeType,
        format !== 'png' ? quality : undefined
      );
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate filename with timestamp
 */
function generateFilename(format: 'png' | 'jpeg' | 'webp'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `shader-export-${timestamp}.${format}`;
}
