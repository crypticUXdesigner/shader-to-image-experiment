import { baseVertexShader } from './elements/base';
import type { ColorConfig } from '../types';
import { generateColorStops } from '../utils/colorStops';

export class ShaderInstance {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  private time: number = 0.0;
  private uniforms: Map<string, WebGLUniformLocation> = new Map();
  private parameters: Map<string, number> = new Map();
  
  constructor(gl: WebGL2RenderingContext, fragmentShaderSource: string) {
    this.gl = gl;
    this.createProgram(fragmentShaderSource);
  }
  
  private createProgram(fragmentShaderSource: string): void {
    // Create vertex shader
    this.vertexShader = this.createShader(this.gl.VERTEX_SHADER, baseVertexShader);
    if (!this.vertexShader) return;
    
    // Create fragment shader
    this.fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
    if (!this.fragmentShader) return;
    
    // Create program
    this.program = this.gl.createProgram();
    if (!this.program) return;
    
    this.gl.attachShader(this.program, this.vertexShader);
    this.gl.attachShader(this.program, this.fragmentShader);
    this.gl.linkProgram(this.program);
    
    if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(this.program);
      console.error('Program link error:', error);
      console.error('Shader source:', fragmentShaderSource);
      alert('Shader compilation failed! Check console for details.');
      return;
    }
    
    // Cache uniform locations
    this.cacheUniformLocations();
  }
  
  private createShader(type: number, source: string): WebGLShader | null {
    const shader = this.gl.createShader(type);
    if (!shader) return null;
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', this.gl.getShaderInfoLog(shader));
      this.gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }
  
  private cacheUniformLocations(): void {
    if (!this.program) return;
    
    const uniformCount = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
    const uniformTypes: Record<string, number> = {};
    for (let i = 0; i < uniformCount; i++) {
      const info = this.gl.getActiveUniform(this.program, i);
      if (info) {
        const location = this.gl.getUniformLocation(this.program, info.name);
        if (location) {
          this.uniforms.set(info.name, location);
          uniformTypes[info.name] = info.type;
        }
      }
    }
    // Store uniform types for later use
    (this as any).uniformTypes = uniformTypes;
  }
  
  setTime(time: number): void {
    this.time = time;
    // Also set layer-specific time uniforms (both layers use the same time for now)
    // This can be overridden by setLayerTime if needed
    if (this.program) {
      this.gl.useProgram(this.program);
      const setFloat = (name: string, value: number) => {
        const loc = this.uniforms.get(name);
        if (loc) this.gl.uniform1f(loc, value);
      };
      setFloat('uLayer1Time', time);
      setFloat('uLayer2Time', time);
    }
  }
  
  setLayerTime(layerNum: number, time: number): void {
    if (!this.program) return;
    this.gl.useProgram(this.program);
    const uniformName = layerNum === 1 ? 'uLayer1Time' : 'uLayer2Time';
    const loc = this.uniforms.get(uniformName);
    if (loc) {
      this.gl.uniform1f(loc, time);
    }
  }
  
  getTime(): number {
    return this.time;
  }
  
  setParameter(elementId: string, paramName: string, value: number, layerNum?: number): void {
    // Store parameter with layer info if provided
    const key = layerNum ? `${layerNum}.${elementId}.${paramName}` : `${elementId}.${paramName}`;
    this.parameters.set(key, value);
  }
  
  getParameter(elementId: string, paramName: string, layerNum?: number): number | undefined {
    const key = layerNum ? `${layerNum}.${elementId}.${paramName}` : `${elementId}.${paramName}`;
    return this.parameters.get(key);
  }
  
  setLayerProperties(layerNum: number, blendMode: number, opacity: number, visible: boolean): void {
    if (!this.program) return;
    
    this.gl.useProgram(this.program);
    
    const setInt = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform1i(loc, value);
    };
    
    const setFloat = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform1f(loc, value);
    };
    
    if (layerNum === 1) {
      setInt('uLayer1BlendMode', blendMode);
      setFloat('uLayer1Opacity', opacity);
      setInt('uLayer1Visible', visible ? 1 : 0);
    } else if (layerNum === 2) {
      setInt('uLayer2BlendMode', blendMode);
      setFloat('uLayer2Opacity', opacity);
      setInt('uLayer2Visible', visible ? 1 : 0);
    }
  }
  
  setLayerColorConfig(layerNum: number, colorConfig: ColorConfig): void {
    if (!this.program) return;
    
    this.gl.useProgram(this.program);
    
    const setVec3 = (name: string, value: [number, number, number]) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform3f(loc, value[0], value[1], value[2]);
      }
    };
    
    const setVec4 = (name: string, value: [number, number, number, number]) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
    };
    
    const setInt = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform1i(loc, value);
      }
    };
    
    const setFloat = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform1f(loc, value);
    };
    
    const prefix = layerNum === 1 ? 'uLayer1' : 'uLayer2';
    
    // Set color mode: 0 = bezier, 1 = thresholds
    const mode = colorConfig.mode === 'bezier' ? 0 : 1;
    setInt(`${prefix}ColorMode`, mode);
    
    // Set transition width and dithering (for threshold mode)
    const transitionWidth = colorConfig.transitionWidth ?? 0.005;
    const ditherStrength = colorConfig.ditherStrength ?? 0.0;
    const pixelSize = colorConfig.pixelSize ?? 1.0;
    
    // Set layer-specific dithering uniforms
    setFloat(`${prefix}PixelSize`, pixelSize);
    setFloat(`${prefix}DitherStrength`, ditherStrength);
    
    setFloat(`${prefix}TransitionWidth`, transitionWidth);
    
    if (colorConfig.mode === 'bezier') {
      // Bezier mode: set start/end colors and curves
      setVec3(`${prefix}ColorStart`, [colorConfig.startColor.l, colorConfig.startColor.c, colorConfig.startColor.h]);
      setVec3(`${prefix}ColorEnd`, [colorConfig.endColor.l, colorConfig.endColor.c, colorConfig.endColor.h]);
      setInt(`${prefix}ColorStops`, colorConfig.stops);
      setVec4(`${prefix}ColorLCurve`, [colorConfig.lCurve.x1, colorConfig.lCurve.y1, colorConfig.lCurve.x2, colorConfig.lCurve.y2]);
      setVec4(`${prefix}ColorCCurve`, [colorConfig.cCurve.x1, colorConfig.cCurve.y1, colorConfig.cCurve.x2, colorConfig.cCurve.y2]);
      setVec4(`${prefix}ColorHCurve`, [colorConfig.hCurve.x1, colorConfig.hCurve.y1, colorConfig.hCurve.x2, colorConfig.hCurve.y2]);
    } else {
      // Threshold mode: generate and set color stops array
      const stops = generateColorStops(colorConfig);
      // Reverse the array for threshold mode since shader expects brightest->darkest
      const reversedStops = [...stops].reverse();
      const numStops = Math.min(reversedStops.length, 50);
      setInt(`${prefix}ColorStops`, numStops);
      
      // Create flattened array for uniform3fv: [l0, c0, h0, l1, c1, h1, ...]
      const stopsArray = new Float32Array(50 * 3);
      for (let i = 0; i < numStops; i++) {
        stopsArray[i * 3] = reversedStops[i].l;
        stopsArray[i * 3 + 1] = reversedStops[i].c;
        stopsArray[i * 3 + 2] = reversedStops[i].h;
      }
      // Fill remaining slots with last stop to avoid undefined behavior
      const lastStop = reversedStops[numStops - 1];
      for (let i = numStops; i < 50; i++) {
        stopsArray[i * 3] = lastStop.l;
        stopsArray[i * 3 + 1] = lastStop.c;
        stopsArray[i * 3 + 2] = lastStop.h;
      }
      
      // Use uniform3fv with base array location
      const baseLoc = this.gl.getUniformLocation(this.program!, `${prefix}ColorStopsArray`);
      if (baseLoc) {
        this.gl.uniform3fv(baseLoc, stopsArray);
      } else {
        // Fallback: set each element individually
        console.warn(`${prefix}ColorStopsArray base location not found, using individual elements`);
        for (let i = 0; i < numStops; i++) {
          const loc = this.gl.getUniformLocation(this.program!, `${prefix}ColorStopsArray[${i}]`);
          if (loc) {
            this.gl.uniform3f(loc, reversedStops[i].l, reversedStops[i].c, reversedStops[i].h);
          }
        }
      }
    }
    
    // Set tone mapping uniforms
    const toneMapping = colorConfig.toneMapping ?? {};
    setFloat(`${prefix}ToneExposure`, toneMapping.exposure ?? 1.0);
    setFloat(`${prefix}ToneContrast`, toneMapping.contrast ?? 1.0);
    setFloat(`${prefix}ToneSaturation`, toneMapping.saturation ?? 1.0);
  }
  
  setColorConfig(colorConfig: ColorConfig): void {
    if (!this.program) return;
    
    // CRITICAL: Must use program before setting uniforms
    this.gl.useProgram(this.program);
    
    // Convert OKLCH to RGB for uniforms (simplified - we'll do conversion in shader)
    const setVec3 = (name: string, value: [number, number, number]) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform3f(loc, value[0], value[1], value[2]);
      }
    };
    
    const setVec4 = (name: string, value: [number, number, number, number]) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
      }
    };
    
    const setInt = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) {
        this.gl.uniform1i(loc, value);
      }
    };
    
    // Set color mode: 0 = bezier, 1 = thresholds
    const mode = colorConfig.mode === 'bezier' ? 0 : 1;
    setInt('uColorMode', mode);
    
    // Set transition width and dithering (for threshold mode)
    const transitionWidth = colorConfig.transitionWidth ?? 0.005;
    const ditherStrength = colorConfig.ditherStrength ?? 0.0;
    const pixelSize = colorConfig.pixelSize ?? 1.0;
    const setFloat = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform1f(loc, value);
    };
    setFloat('uTransitionWidth', transitionWidth);
    setFloat('uDitherStrength', ditherStrength);
    setFloat('uPixelSize', pixelSize);
    
    if (colorConfig.mode === 'bezier') {
      // Bezier mode: set start/end colors and curves
      setVec3('uColorStart', [colorConfig.startColor.l, colorConfig.startColor.c, colorConfig.startColor.h]);
      setVec3('uColorEnd', [colorConfig.endColor.l, colorConfig.endColor.c, colorConfig.endColor.h]);
      setInt('uColorStops', colorConfig.stops);
      setVec4('uColorLCurve', [colorConfig.lCurve.x1, colorConfig.lCurve.y1, colorConfig.lCurve.x2, colorConfig.lCurve.y2]);
      setVec4('uColorCCurve', [colorConfig.cCurve.x1, colorConfig.cCurve.y1, colorConfig.cCurve.x2, colorConfig.cCurve.y2]);
      setVec4('uColorHCurve', [colorConfig.hCurve.x1, colorConfig.hCurve.y1, colorConfig.hCurve.x2, colorConfig.hCurve.y2]);
    } else {
      // Threshold mode: generate and set color stops array
      const stops = generateColorStops(colorConfig);
      // Reverse the array for threshold mode since shader expects brightest->darkest
      // (shader maps high values to first colors in array, low values to last colors)
      const reversedStops = [...stops].reverse();
      const numStops = Math.min(reversedStops.length, 50);
      setInt('uColorStops', numStops);
      
      // Create flattened array for uniform3fv: [l0, c0, h0, l1, c1, h1, ...]
      const stopsArray = new Float32Array(50 * 3);
      for (let i = 0; i < numStops; i++) {
        stopsArray[i * 3] = reversedStops[i].l;
        stopsArray[i * 3 + 1] = reversedStops[i].c;
        stopsArray[i * 3 + 2] = reversedStops[i].h;
      }
      // Fill remaining slots with last stop to avoid undefined behavior
      const lastStop = reversedStops[numStops - 1];
      for (let i = numStops; i < 50; i++) {
        stopsArray[i * 3] = lastStop.l;
        stopsArray[i * 3 + 1] = lastStop.c;
        stopsArray[i * 3 + 2] = lastStop.h;
      }
      
      // Use uniform3fv with base array location (more reliable than individual elements)
      const baseLoc = this.gl.getUniformLocation(this.program!, 'uColorStopsArray');
      if (baseLoc) {
        this.gl.uniform3fv(baseLoc, stopsArray);
      } else {
        // Fallback: set each element individually if base location not found
        console.warn('uColorStopsArray base location not found, using individual elements');
        for (let i = 0; i < numStops; i++) {
          const loc = this.gl.getUniformLocation(this.program!, `uColorStopsArray[${i}]`);
          if (loc) {
            this.gl.uniform3f(loc, reversedStops[i].l, reversedStops[i].c, reversedStops[i].h);
          } else {
            console.warn(`uColorStopsArray[${i}] location not found`);
          }
        }
      }
    }
    
    // Set tone mapping uniforms
    const toneMapping = colorConfig.toneMapping ?? {};
    setFloat('uToneExposure', toneMapping.exposure ?? 1.0);
    setFloat('uToneContrast', toneMapping.contrast ?? 1.0);
    setFloat('uToneSaturation', toneMapping.saturation ?? 1.0);
  }
  
  updateUniforms(elementId: string, paramName: string, value: number, uniformName: string): void {
    if (!this.program) return;
    
    const loc = this.uniforms.get(uniformName);
    if (!loc) return;
    
    const param = this.parameters.get(`${elementId}.${paramName}`);
    if (param === undefined) return;
    
    // Determine uniform type and set value
    // For now, assume all are floats
    this.gl.uniform1f(loc, value);
  }
  
  render(width: number, height: number): void {
    if (!this.program) return;
    
    this.gl.useProgram(this.program);
    
    // Set common uniforms
    const setFloat = (name: string, value: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform1f(loc, value);
    };
    
    const setVec2 = (name: string, x: number, y: number) => {
      const loc = this.uniforms.get(name);
      if (loc) this.gl.uniform2f(loc, x, y);
    };
    
    // Set layer-specific time uniforms (both use the same time for now)
    // Individual layers can override with setLayerTime if needed
    setFloat('uLayer1Time', this.time);
    setFloat('uLayer2Time', this.time);
    
    // Set shared resolution (same for both layers)
    setVec2('uResolution', width, height);
    
    // Note: uLayer1PixelSize, uLayer1DitherStrength, uLayer2PixelSize, uLayer2DitherStrength
    // are set in setLayerColorConfig per layer
    
    // Set element-specific uniforms
    const uniformTypes = (this as any).uniformTypes || {};
    this.parameters.forEach((value, key) => {
      // Key format: "layerNum.elementId.paramName" or "elementId.paramName" (for backward compatibility)
      const parts = key.split('.');
      let layerNum: number | undefined;
      let elementId: string;
      let paramName: string;
      
      if (parts.length === 3 && !isNaN(parseInt(parts[0]))) {
        // Layer-specific: "1.fbm-noise.fbmScale"
        layerNum = parseInt(parts[0]);
        elementId = parts[1];
        paramName = parts[2];
      } else if (parts.length === 2) {
        // Legacy format: "fbm-noise.fbmScale"
        elementId = parts[0];
        paramName = parts[1];
      } else {
        return; // Invalid format
      }
      
      const uniformName = this.getUniformName(elementId, paramName, layerNum);
      if (uniformName) {
        const loc = this.uniforms.get(uniformName);
        if (loc) {
          // Check actual uniform type from shader, not parameter name
          const uniformType = uniformTypes[uniformName];
          const isInt = uniformType === this.gl.INT || uniformType === this.gl.UNSIGNED_INT || uniformType === this.gl.SAMPLER_2D || uniformType === this.gl.SAMPLER_CUBE;
          if (isInt) {
            this.gl.uniform1i(loc, Math.round(value));
          } else {
            this.gl.uniform1f(loc, value);
          }
        }
      }
    });
    
    // Render fullscreen quad
    const positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
    const positions = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);
    
    const positionLoc = this.gl.getAttribLocation(this.program!, 'a_position');
    this.gl.enableVertexAttribArray(positionLoc);
    this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 0, 0);
    
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
  
  private getUniformName(elementId: string, paramName: string, layerNum?: number): string | null {
    // Map parameter names to uniform names based on actual uniform declarations
    const uniformMap: Record<string, string> = {
      'fbm-noise.fbmScale': 'uFbmScale',
      'fbm-noise.fbmOctaves': 'uFbmOctaves',
      'fbm-noise.fbmLacunarity': 'uFbmLacunarity',
      'fbm-noise.fbmGain': 'uFbmGain',
      'fbm-noise.fbmTimeSpeed': 'uFbmTimeSpeed',
      'fbm-noise.fbmIntensity': 'uFbmIntensity',
      'fbm-noise.fbmTimeOffset': 'uFbmTimeOffset',
      'rings.ringCenterX': 'uRingCenterX',
      'rings.ringCenterY': 'uRingCenterY',
      'rings.ringRadius': 'uRingRadius',
      'rings.ringFrequency': 'uRingFrequency',
      'rings.ringAmplitude': 'uRingAmplitude',
      'rings.ringIntensity': 'uRingIntensity',
      'rings.ringTimeOffset': 'uRingTimeOffset',
      'vector-field.vfFrequencyX': 'uVfFrequencyX',
      'vector-field.vfFrequencyY': 'uVfFrequencyY',
      'vector-field.vfFrequencyZ': 'uVfFrequencyZ',
      'vector-field.vfAmplitude': 'uVfAmplitude',
      'vector-field.vfAmplitudeX': 'uVfAmplitudeX',
      'vector-field.vfAmplitudeY': 'uVfAmplitudeY',
      'vector-field.vfAmplitudeZ': 'uVfAmplitudeZ',
      'vector-field.vfRadialStrength': 'uVfRadialStrength',
      'vector-field.vfRadialCenterX': 'uVfRadialCenterX',
      'vector-field.vfRadialCenterY': 'uVfRadialCenterY',
      'vector-field.vfHarmonicAmplitude': 'uVfHarmonicAmplitude',
      'vector-field.vfTimeOffset': 'uVfTimeOffset',
      'sphere-raymarch.sphereRadius': 'uSphereRadius',
      'sphere-raymarch.sphereGlowIntensity': 'uSphereGlowIntensity',
      'sphere-raymarch.raymarchSteps': 'uRaymarchSteps',
      'fractal.fractalIntensity': 'uFractalIntensity',
      'fractal.fractalLayers': 'uFractalLayers',
      'fractal.fractalIterations': 'uFractalIterations',
      'fractal.fractalTimeOffset': 'uFractalTimeOffset',
      'fbm-value-noise.fbmValueScale': 'uFbmValueScale',
      'fbm-value-noise.fbmValueOctaves': 'uFbmValueOctaves',
      'fbm-value-noise.fbmValueLacunarity': 'uFbmValueLacunarity',
      'fbm-value-noise.fbmValueGain': 'uFbmValueGain',
      'fbm-value-noise.fbmValueTimeSpeed': 'uFbmValueTimeSpeed',
      'fbm-value-noise.fbmValueTimeOffset': 'uFbmValueTimeOffset',
      'bayer-dither.pixelSize': 'uPixelSize',
      'bayer-dither.ditherStrength': 'uDitherStrength',
      // New elements
      'voronoi-noise.voronoiScale': 'uVoronoiScale',
      'voronoi-noise.voronoiJitter': 'uVoronoiJitter',
      'voronoi-noise.voronoiDistanceMetric': 'uVoronoiDistanceMetric',
      'voronoi-noise.voronoiTimeSpeed': 'uVoronoiTimeSpeed',
      'voronoi-noise.voronoiIntensity': 'uVoronoiIntensity',
      'voronoi-noise.voronoiTimeOffset': 'uVoronoiTimeOffset',
      'polar-coordinates.polarCenterX': 'uPolarCenterX',
      'polar-coordinates.polarCenterY': 'uPolarCenterY',
      'polar-coordinates.polarScale': 'uPolarScale',
      'polar-coordinates.polarRadiusScale': 'uPolarRadiusScale',
      'polar-coordinates.polarRotation': 'uPolarRotation',
      'polar-coordinates.polarEnabled': 'uPolarEnabled',
      'wave-patterns.waveScale': 'uWaveScale',
      'wave-patterns.waveFrequency': 'uWaveFrequency',
      'wave-patterns.waveAmplitude': 'uWaveAmplitude',
      'wave-patterns.waveType': 'uWaveType',
      'wave-patterns.waveDirection': 'uWaveDirection',
      'wave-patterns.wavePhaseSpeed': 'uWavePhaseSpeed',
      'wave-patterns.wavePhaseOffset': 'uWavePhaseOffset',
      'wave-patterns.waveTimeSpeed': 'uWaveTimeSpeed',
      'wave-patterns.waveIntensity': 'uWaveIntensity',
      'wave-patterns.waveTimeOffset': 'uWaveTimeOffset',
      'glow-bloom.glowThreshold': 'uGlowThreshold',
      'glow-bloom.glowIntensity': 'uGlowIntensity',
      'glow-bloom.glowRadius': 'uGlowRadius',
      'glow-bloom.glowStrength': 'uGlowStrength',
      'twist-distortion.twistCenterX': 'uTwistCenterX',
      'twist-distortion.twistCenterY': 'uTwistCenterY',
      'twist-distortion.twistStrength': 'uTwistStrength',
      'twist-distortion.twistRadius': 'uTwistRadius',
      'twist-distortion.twistFalloff': 'uTwistFalloff',
      'twist-distortion.twistTimeSpeed': 'uTwistTimeSpeed',
      'twist-distortion.twistTimeOffset': 'uTwistTimeOffset',
      'kaleidoscope.kaleidCenterX': 'uKaleidCenterX',
      'kaleidoscope.kaleidCenterY': 'uKaleidCenterY',
      'kaleidoscope.kaleidSegments': 'uKaleidSegments',
      'kaleidoscope.kaleidRotation': 'uKaleidRotation',
      'turbulence.turbulenceScale': 'uTurbulenceScale',
      'turbulence.turbulenceStrength': 'uTurbulenceStrength',
      'turbulence.turbulenceIterations': 'uTurbulenceIterations',
      'turbulence.turbulenceTimeSpeed': 'uTurbulenceTimeSpeed',
      'turbulence.turbulenceTimeOffset': 'uTurbulenceTimeOffset',
      'gradient-mask.maskType': 'uMaskType',
      'gradient-mask.maskCenterX': 'uMaskCenterX',
      'gradient-mask.maskCenterY': 'uMaskCenterY',
      'gradient-mask.maskRadius': 'uMaskRadius',
      'gradient-mask.maskFalloff': 'uMaskFalloff',
      'gradient-mask.maskWidth': 'uMaskWidth',
      'gradient-mask.maskDirection': 'uMaskDirection',
      'gradient-mask.maskSizeX': 'uMaskSizeX',
      'gradient-mask.maskSizeY': 'uMaskSizeY',
      'gradient-mask.maskRotation': 'uMaskRotation',
      'gradient-mask.maskStrength': 'uMaskStrength',
      'gradient-mask.maskInvert': 'uMaskInvert',
      'hexagonal-grid.hexScale': 'uHexScale',
      'hexagonal-grid.hexSize': 'uHexSize',
      'hexagonal-grid.hexRotation': 'uHexRotation',
      'hexagonal-grid.hexIntensity': 'uHexIntensity',
      'simplex-noise.simplexScale': 'uSimplexScale',
      'simplex-noise.simplexOctaves': 'uSimplexOctaves',
      'simplex-noise.simplexLacunarity': 'uSimplexLacunarity',
      'simplex-noise.simplexGain': 'uSimplexGain',
      'simplex-noise.simplexTimeSpeed': 'uSimplexTimeSpeed',
      'simplex-noise.simplexIntensity': 'uSimplexIntensity',
      'simplex-noise.simplexTimeOffset': 'uSimplexTimeOffset',
      'particle-system.particleScale': 'uParticleScale',
      'particle-system.particleCellSize': 'uParticleCellSize',
      'particle-system.particleCount': 'uParticleCount',
      'particle-system.particleSize': 'uParticleSize',
      'particle-system.particleIntensity': 'uParticleIntensity',
      'particle-system.particleFalloff': 'uParticleFalloff',
      'particle-system.particleTimeSpeed': 'uParticleTimeSpeed',
      'particle-system.particleTimeOffset': 'uParticleTimeOffset',
      'plane-grid.planeType': 'uPlaneType',
      'plane-grid.planeScale': 'uPlaneScale',
      'plane-grid.planeSpacing': 'uPlaneSpacing',
      'plane-grid.planeIntensity': 'uPlaneIntensity',
      'plane-grid.planeRotation': 'uPlaneRotation',
      'plane-grid.planeNormalX': 'uPlaneNormalX',
      'plane-grid.planeNormalY': 'uPlaneNormalY',
      'plane-grid.planeNormalZ': 'uPlaneNormalZ',
      'plane-grid.planeHeight': 'uPlaneHeight',
      'box-torus-sdf.primitiveType': 'uPrimitiveType',
      'box-torus-sdf.primitiveCenterX': 'uPrimitiveCenterX',
      'box-torus-sdf.primitiveCenterY': 'uPrimitiveCenterY',
      'box-torus-sdf.primitiveCenterZ': 'uPrimitiveCenterZ',
      'box-torus-sdf.primitiveSizeX': 'uPrimitiveSizeX',
      'box-torus-sdf.primitiveSizeY': 'uPrimitiveSizeY',
      'box-torus-sdf.primitiveSizeZ': 'uPrimitiveSizeZ',
      'box-torus-sdf.primitiveRotationX': 'uPrimitiveRotationX',
      'box-torus-sdf.primitiveRotationY': 'uPrimitiveRotationY',
      'box-torus-sdf.primitiveRotationZ': 'uPrimitiveRotationZ',
      'box-torus-sdf.primitiveGlowIntensity': 'uPrimitiveGlowIntensity',
      'box-torus-sdf.primitiveRaymarchSteps': 'uPrimitiveRaymarchSteps',
      'edge-detection.edgeThreshold': 'uEdgeThreshold',
      'edge-detection.edgeWidth': 'uEdgeWidth',
      'edge-detection.edgeIntensity': 'uEdgeIntensity',
      'edge-detection.edgeStrength': 'uEdgeStrength',
      'blur.blurAmount': 'uBlurAmount',
      'blur.blurRadius': 'uBlurRadius',
      'blur.blurType': 'uBlurType',
      'blur.blurDirection': 'uBlurDirection',
      'blur.blurCenterX': 'uBlurCenterX',
      'blur.blurCenterY': 'uBlurCenterY',
      'normal-mapping.normalScale': 'uNormalScale',
      'normal-mapping.normalStrength': 'uNormalStrength',
      'normal-mapping.normalLightX': 'uNormalLightX',
      'normal-mapping.normalLightY': 'uNormalLightY',
      'normal-mapping.normalLightZ': 'uNormalLightZ',
      'lighting-shading.lightType': 'uLightType',
      'lighting-shading.lightDirX': 'uLightDirX',
      'lighting-shading.lightDirY': 'uLightDirY',
      'lighting-shading.lightDirZ': 'uLightDirZ',
      'lighting-shading.lightPosX': 'uLightPosX',
      'lighting-shading.lightPosY': 'uLightPosY',
      'lighting-shading.lightPosZ': 'uLightPosZ',
      'lighting-shading.lightIntensity': 'uLightIntensity',
      'lighting-shading.lightAmbient': 'uLightAmbient',
      'lighting-shading.lightFalloff': 'uLightFalloff',
      'lighting-shading.lightColorR': 'uLightColorR',
      'lighting-shading.lightColorG': 'uLightColorG',
      'lighting-shading.lightColorB': 'uLightColorB',
      'blending-modes.blendMode': 'uBlendMode',
      'blending-modes.blendOpacity': 'uBlendOpacity',
      'blending-modes.blendSource': 'uBlendSource',
      'blending-modes.blendValue': 'uBlendValue',
      'blending-modes.blendScale': 'uBlendScale',
      'blending-modes.blendFrequency': 'uBlendFrequency',
      'blending-modes.blendTimeSpeed': 'uBlendTimeSpeed',
      'blending-modes.blendTimeOffset': 'uBlendTimeOffset',
      'chromatic-aberration.chromaticStrength': 'uChromaticStrength',
      'chromatic-aberration.chromaticDirection': 'uChromaticDirection',
      'chromatic-aberration.chromaticCenterX': 'uChromaticCenterX',
      'chromatic-aberration.chromaticCenterY': 'uChromaticCenterY',
      'chromatic-aberration.chromaticFalloff': 'uChromaticFalloff',
      'color-grading.colorShadowsR': 'uColorShadowsR',
      'color-grading.colorShadowsG': 'uColorShadowsG',
      'color-grading.colorShadowsB': 'uColorShadowsB',
      'color-grading.colorMidtonesR': 'uColorMidtonesR',
      'color-grading.colorMidtonesG': 'uColorMidtonesG',
      'color-grading.colorMidtonesB': 'uColorMidtonesB',
      'color-grading.colorHighlightsR': 'uColorHighlightsR',
      'color-grading.colorHighlightsG': 'uColorHighlightsG',
      'color-grading.colorHighlightsB': 'uColorHighlightsB',
      'color-grading.levelsInMin': 'uLevelsInMin',
      'color-grading.levelsInMax': 'uLevelsInMax',
      'color-grading.levelsOutMin': 'uLevelsOutMin',
      'color-grading.levelsOutMax': 'uLevelsOutMax',
      'color-grading.levelsGamma': 'uLevelsGamma',
      'block-displacement.blockDirection': 'uBlockDirection',
      'block-displacement.blockCount': 'uBlockCount',
      'block-displacement.blockMaxOffsetX': 'uBlockMaxOffsetX',
      'block-displacement.blockMaxOffsetY': 'uBlockMaxOffsetY',
      'block-displacement.blockMinSize': 'uBlockMinSize',
      'block-displacement.blockMaxSize': 'uBlockMaxSize',
      'block-displacement.blockTimeSpeed': 'uBlockTimeSpeed',
      'block-displacement.blockTimeOffset': 'uBlockTimeOffset',
      'block-displacement.blockSeed': 'uBlockSeed',
      'block-color-glitch.blockGlitchDirection': 'uBlockGlitchDirection',
      'block-color-glitch.blockGlitchCount': 'uBlockGlitchCount',
      'block-color-glitch.blockGlitchMinSize': 'uBlockGlitchMinSize',
      'block-color-glitch.blockGlitchMaxSize': 'uBlockGlitchMaxSize',
      'block-color-glitch.blockGlitchSeed': 'uBlockGlitchSeed',
      'block-color-glitch.blockGlitchMode': 'uBlockGlitchMode',
      'block-color-glitch.blockGlitchEffect': 'uBlockGlitchEffect',
      'block-color-glitch.blockGlitchIntensity': 'uBlockGlitchIntensity',
      'block-color-glitch.blockGlitchAmount': 'uBlockGlitchAmount',
      'block-color-glitch.blockGlitchBlockSelection': 'uBlockGlitchBlockSelection',
      'block-color-glitch.blockGlitchSelectionThreshold': 'uBlockGlitchSelectionThreshold',
      'block-color-glitch.blockGlitchTintR': 'uBlockGlitchTintR',
      'block-color-glitch.blockGlitchTintG': 'uBlockGlitchTintG',
      'block-color-glitch.blockGlitchTintB': 'uBlockGlitchTintB',
      'block-color-glitch.blockGlitchNoiseIntensity': 'uBlockGlitchNoiseIntensity',
      'block-edge-brightness.blockEdgeDirection': 'uBlockEdgeDirection',
      'block-edge-brightness.blockEdgeCount': 'uBlockEdgeCount',
      'block-edge-brightness.blockEdgeBrightness': 'uBlockEdgeBrightness',
      'block-edge-brightness.blockEdgeWidth': 'uBlockEdgeWidth',
      'block-edge-brightness.blockEdgeSpacingChaos': 'uBlockEdgeSpacingChaos',
      'block-edge-brightness.blockEdgeTimeSpeed': 'uBlockEdgeTimeSpeed',
      'block-edge-brightness.blockEdgeTimeOffset': 'uBlockEdgeTimeOffset',
      'scanlines.scanlineFrequency': 'uScanlineFrequency',
      'scanlines.scanlineThickness': 'uScanlineThickness',
      'scanlines.scanlineOpacity': 'uScanlineOpacity',
      'scanlines.scanlineTimeSpeed': 'uScanlineTimeSpeed',
      'scanlines.scanlineTimeOffset': 'uScanlineTimeOffset',
      'rgb-separation.rgbSeparationRX': 'uRgbSeparationRX',
      'rgb-separation.rgbSeparationRY': 'uRgbSeparationRY',
      'rgb-separation.rgbSeparationGX': 'uRgbSeparationGX',
      'rgb-separation.rgbSeparationGY': 'uRgbSeparationGY',
      'rgb-separation.rgbSeparationBX': 'uRgbSeparationBX',
      'rgb-separation.rgbSeparationBY': 'uRgbSeparationBY',
      'rgb-separation.rgbSeparationStrength': 'uRgbSeparationStrength',
    };
    
    const baseUniformName = uniformMap[`${elementId}.${paramName}`];
    if (!baseUniformName) return null;
    
    // If layerNum is provided, generate layer-specific uniform name
    if (layerNum !== undefined) {
      const layerPrefix = layerNum === 1 ? 'uLayer1' : 'uLayer2';
      // Replace the 'u' prefix with layer prefix: "uFbmScale" -> "uLayer1FbmScale"
      return baseUniformName.replace(/^u/, layerPrefix);
    }
    
    return baseUniformName;
  }
  
  destroy(): void {
    if (this.vertexShader) {
      this.gl.deleteShader(this.vertexShader);
    }
    if (this.fragmentShader) {
      this.gl.deleteShader(this.fragmentShader);
    }
    if (this.program) {
      this.gl.deleteProgram(this.program);
    }
  }
}

