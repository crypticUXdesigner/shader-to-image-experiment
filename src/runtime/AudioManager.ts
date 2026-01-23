/**
 * AudioManager - Web Audio API Integration
 * 
 * Manages audio file loading, playback, and frequency analysis.
 * Provides real-time audio data to shader uniforms.
 */

export interface FrequencyBand {
  minHz: number;
  maxHz: number;
}

export interface AudioNodeState {
  nodeId: string;
  audioContext: AudioContext | null;
  audioBuffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  analyserNode: AnalyserNode | null;
  gainNode: GainNode | null;
  isPlaying: boolean;
  startTime: number;
  currentTime: number;
  duration: number;
  frequencyData: Uint8Array | null;
  smoothedValues: Map<string, number>; // For smoothing frequency bands
}

export interface AnalyzerNodeState {
  nodeId: string;
  analyserNode: AnalyserNode | null;
  frequencyBands: FrequencyBand[];
  smoothing: number;
  fftSize: number;
  bandValues: number[];
  smoothedBandValues: number[];
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private audioNodes: Map<string, AudioNodeState> = new Map();
  private analyzerNodes: Map<string, AnalyzerNodeState> = new Map();
  private sampleRate: number = 44100; // Default, will be set from AudioContext
  private loadingNodes: Set<string> = new Set(); // Track nodes currently loading to prevent concurrent loads
  
  /**
   * Initialize AudioContext (must be called from user interaction)
   * Note: Does not automatically resume - call resume() after user interaction
   */
  async initialize(): Promise<void> {
    if (this.audioContext) {
      return; // Already initialized
    }
    
    // Create AudioContext (must be done in response to user interaction)
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.sampleRate = this.audioContext.sampleRate;
    
    // Don't automatically resume - browsers require user interaction
    // The context will be resumed when playAudio() is called (which should be after user interaction)
  }
  
  /**
   * Resume AudioContext (must be called after user interaction)
   */
  async resume(): Promise<void> {
    if (!this.audioContext) {
      await this.initialize();
    }
    
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (error) {
        console.warn('Failed to resume AudioContext:', error);
      }
    }
  }
  
  /**
   * Load audio file for a node (from File object or URL string)
   */
  async loadAudioFile(nodeId: string, file: File | string): Promise<void> {
    // Prevent concurrent loads of the same node
    if (this.loadingNodes.has(nodeId)) {
      console.warn(`[AudioManager] Already loading audio for node ${nodeId}, skipping duplicate load`);
      return;
    }
    
    this.loadingNodes.add(nodeId);
    
    try {
      // Stop existing playback before loading new file
      this.stopAudio(nodeId);
      
      await this.initialize();
      
      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      
      let arrayBuffer: ArrayBuffer;
      
      if (file instanceof File) {
        // Read file as ArrayBuffer
        arrayBuffer = await file.arrayBuffer();
      } else {
        // Load from URL - encode the URL properly (handle spaces and special characters)
        let urlToFetch = file;
        
        // If it's a relative path starting with /, we need to handle the base path
        if (file.startsWith('/') && !file.startsWith('//')) {
          // Get base path from import.meta.env.BASE_URL (Vite provides this)
          // During dev, BASE_URL is usually '/', in production it's '/shader-composer/'
          try {
            // @ts-ignore - import.meta.env is provided by Vite
            const baseUrl = import.meta.env?.BASE_URL;
            if (baseUrl && baseUrl !== '/' && baseUrl !== '') {
              // Remove trailing slash from baseUrl and add the file path
              const cleanBase = baseUrl.replace(/\/$/, '');
              urlToFetch = cleanBase + file;
            }
          } catch (e) {
            // Fallback: check if we're in production by looking at the current path
            const currentPath = window.location.pathname;
            if (currentPath.startsWith('/shader-composer/')) {
              urlToFetch = '/shader-composer' + file;
            }
          }
        }
        
        // Encode the URL properly - encode each path segment separately to handle spaces correctly
        // Split by /, encode each part, then rejoin
        const urlParts = urlToFetch.split('/');
        const encodedParts = urlParts.map((part, index) => {
          // Don't encode the first empty part (for absolute paths starting with /)
          if (index === 0 && part === '') return '';
          // Don't encode protocol parts (http://, https://)
          if (part.includes('://')) return part;
          // Encode each path segment (handles spaces, special chars)
          return encodeURIComponent(part);
        });
        urlToFetch = encodedParts.join('/');
        
        // Try to fetch the file with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        let response: Response;
        try {
          response = await fetch(urlToFetch, { 
            signal: controller.signal,
            cache: 'no-cache' // Prevent stale cache issues
          });
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error(`Timeout loading audio file: ${file} (took longer than 30 seconds)`);
          }
          throw new Error(`Network error loading audio file: ${file} - ${fetchError.message}`);
        }
        clearTimeout(timeoutId);
        
        // If that fails and we added a base path, try without it (for development)
        if (!response.ok && urlToFetch !== file && file.startsWith('/')) {
          const fallbackParts = file.split('/');
          const fallbackEncoded = fallbackParts.map((part, index) => {
            if (index === 0 && part === '') return '';
            return encodeURIComponent(part);
          });
          const fallbackUrl = fallbackEncoded.join('/');
          
          const fallbackController = new AbortController();
          const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 30000);
          try {
            const fallbackResponse = await fetch(fallbackUrl, { 
              signal: fallbackController.signal,
              cache: 'no-cache'
            });
            clearTimeout(fallbackTimeoutId);
            if (fallbackResponse.ok) {
              response = fallbackResponse;
              urlToFetch = fallbackUrl;
            }
          } catch (e) {
            clearTimeout(fallbackTimeoutId);
            // Ignore fallback errors, use original response
          }
        }
        
        if (!response.ok) {
          // Try to read error body for more info
          const errorText = await response.text().catch(() => 'Unable to read error response');
          throw new Error(
            `Failed to load audio file from URL: ${file} (tried: ${urlToFetch}, status: ${response.status} ${response.statusText}). ` +
            `Response: ${errorText.substring(0, 200)}. ` +
            `Make sure the file exists and is accessible.`
          );
        }
        
        // Check content type if available
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        
        arrayBuffer = await response.arrayBuffer();
        
        // Verify we didn't get an HTML error page
        if (arrayBuffer.byteLength > 0) {
          const view = new Uint8Array(arrayBuffer, 0, Math.min(100, arrayBuffer.byteLength));
          const textDecoder = new TextDecoder('utf-8', { fatal: false });
          const preview = textDecoder.decode(view);
          if (preview.trim().toLowerCase().startsWith('<!doctype') || preview.trim().toLowerCase().startsWith('<html')) {
            throw new Error(`Server returned HTML instead of audio file. URL: ${urlToFetch}`);
          }
        }
      }
      
      // Validate ArrayBuffer
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error(`Audio file is empty or invalid: ${file instanceof File ? file.name : file}`);
      }
      
      // Ensure AudioContext is in a valid state
      if (!this.audioContext) {
        throw new Error('AudioContext not initialized');
      }
      
      // Check if context was closed
      if (this.audioContext.state === 'closed') {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.sampleRate = this.audioContext.sampleRate;
      }
      
      // Note: decodeAudioData works fine even when AudioContext is suspended
      // We don't need to resume here - resume will happen when playAudio() is called
      // (which requires user interaction per browser autoplay policies)
      
      // Verify context is in a valid state (not closed)
      if (this.audioContext.state === 'closed') {
        throw new Error('AudioContext is closed and cannot decode audio');
      }
      
      // Decode audio data - use the original ArrayBuffer directly (no need to slice)
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError: any) {
        const errorMessage = decodeError?.message || String(decodeError);
        const contextState = this.audioContext.state;
        const bufferSize = arrayBuffer.byteLength;
        
        // Provide detailed error information
        throw new Error(
          `Failed to decode audio data: ${errorMessage}. ` +
          `AudioContext state: ${contextState}, ` +
          `ArrayBuffer size: ${bufferSize} bytes, ` +
          `File: ${file instanceof File ? file.name : file}`
        );
      }
      
      // Validate decoded audio buffer
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error(`Decoded audio buffer is empty for file: ${file instanceof File ? file.name : file}`);
      }
      
      // Create analyser node for frequency analysis (must be created before state)
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 4096; // Good resolution for frequency analysis
      analyser.smoothingTimeConstant = 0.8;
      
      // Create gain node for volume control (must be created before state)
      const gain = this.audioContext.createGain();
      gain.gain.value = 1.0;
      
      // Create state with all nodes initialized
      const state: AudioNodeState = {
        nodeId,
        audioContext: this.audioContext,
        audioBuffer,
        sourceNode: null,
        analyserNode: analyser,
        gainNode: gain,
        isPlaying: false,
        startTime: 0,
        currentTime: 0,
        duration: audioBuffer.duration,
        frequencyData: new Uint8Array(analyser.frequencyBinCount),
        smoothedValues: new Map()
      };
      
      this.audioNodes.set(nodeId, state);
    } catch (error: any) {
      // Log the error with full details
      console.error(`[AudioManager] Error in loadAudioFile for node ${nodeId}:`, error);
      // Re-throw so caller can handle it
      throw error;
    } finally {
      // Remove from loading set when done (success or failure)
      this.loadingNodes.delete(nodeId);
    }
  }
  
  /**
   * Play audio for a node
   * Automatically resumes AudioContext if suspended (requires user interaction)
   */
  async playAudio(nodeId: string, offset: number = 0): Promise<void> {
    const state = this.audioNodes.get(nodeId);
    if (!state) {
      console.warn(`[AudioManager] No audio state found for node ${nodeId}. Available nodes: ${Array.from(this.audioNodes.keys()).join(', ')}`);
      return;
    }
    
    // Ensure AudioContext is initialized and resumed
    if (!this.audioContext) {
      await this.initialize();
    }
    
    if (!this.audioContext) {
      console.warn('[AudioManager] AudioContext not available');
      return;
    }
    
    // Resume context if suspended (required for autoplay policies)
    // This must be called after user interaction
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        // Verify it actually resumed
        if (this.audioContext.state === 'suspended') {
          throw new Error('AudioContext could not be resumed - user interaction required');
        }
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        // Only log if it's not the expected autoplay policy error
        if (!errorMsg.includes('user gesture') && !errorMsg.includes('user interaction') && !errorMsg.includes('not allowed to start')) {
          console.warn('[AudioManager] Failed to resume AudioContext:', error);
        }
        // Re-throw so caller knows playback failed
        throw error;
      }
    }
    
    // Check if we have an audio buffer
    if (!state.audioBuffer) {
      console.warn(`[AudioManager] No audio buffer available for node ${nodeId}`);
      return;
    }
    
    // Check if gain and analyser nodes are set up
    if (!state.gainNode || !state.analyserNode) {
      console.warn(`[AudioManager] Audio nodes not properly initialized for node ${nodeId}. gainNode: ${!!state.gainNode}, analyserNode: ${!!state.analyserNode}`);
      return;
    }
    
    // Stop existing playback if any
    this.stopAudio(nodeId);
    
    // Clamp offset to valid range
    const clampedOffset = Math.max(0, Math.min(offset, state.audioBuffer.duration));
    
    try {
      // Create new source node
      const source = this.audioContext.createBufferSource();
      source.buffer = state.audioBuffer;
      source.loop = true; // Loop playback
      
      // Connect: source -> gain -> analyser -> destination
      source.connect(state.gainNode);
      state.gainNode.connect(state.analyserNode);
      state.analyserNode.connect(this.audioContext.destination);
      
      // Start playback at offset
      state.sourceNode = source;
      state.startTime = this.audioContext.currentTime - clampedOffset;
      state.currentTime = clampedOffset;
      state.isPlaying = true;
      
      source.start(0, clampedOffset);
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      console.error(`[AudioManager] Failed to start audio playback for node ${nodeId}:`, errorMessage);
      state.isPlaying = false;
      state.sourceNode = null;
      throw error; // Re-throw so caller can handle it
    }
  }
  
  /**
   * Stop audio playback
   */
  stopAudio(nodeId: string): void {
    const state = this.audioNodes.get(nodeId);
    if (!state || !state.sourceNode) {
      return;
    }
    
    try {
      state.sourceNode.stop();
    } catch (e) {
      // Already stopped, ignore
    }
    
    state.sourceNode = null;
    state.isPlaying = false;
    state.currentTime = 0;
  }
  
  /**
   * Pause audio playback
   */
  pauseAudio(nodeId: string): void {
    this.stopAudio(nodeId);
  }
  
  /**
   * Create analyzer node
   */
  createAnalyzer(
    nodeId: string,
    audioFileNodeId: string,
    frequencyBands: FrequencyBand[],
    smoothing: number = 0.8,
    fftSize: number = 4096
  ): void {
    const audioState = this.audioNodes.get(audioFileNodeId);
    if (!audioState || !audioState.analyserNode) {
      throw new Error(`Audio file node ${audioFileNodeId} not found or not initialized`);
    }
    
    // Use the same analyser node from the audio file (shared FFT)
    const analyserState: AnalyzerNodeState = {
      nodeId,
      analyserNode: audioState.analyserNode,
      frequencyBands,
      smoothing,
      fftSize,
      bandValues: new Array(frequencyBands.length).fill(0),
      smoothedBandValues: new Array(frequencyBands.length).fill(0)
    };
    
    this.analyzerNodes.set(nodeId, analyserState);
  }
  
  /**
   * Extract frequency bands from analyser data
   */
  private extractFrequencyBands(
    frequencyData: Uint8Array,
    frequencyBands: FrequencyBand[],
    sampleRate: number,
    fftSize: number
  ): number[] {
    const bandValues: number[] = [];
    
    for (const band of frequencyBands) {
      // Convert Hz to FFT bin indices
      const minBin = Math.floor((band.minHz / sampleRate) * fftSize);
      const maxBin = Math.ceil((band.maxHz / sampleRate) * fftSize);
      
      // Sum energy in this band
      let sum = 0;
      let count = 0;
      for (let i = minBin; i <= maxBin && i < frequencyData.length; i++) {
        sum += frequencyData[i];
        count++;
      }
      
      // Normalize: 0-255 range → 0-1 range
      const average = count > 0 ? sum / count : 0;
      const normalized = average / 255.0;
      
      bandValues.push(normalized);
    }
    
    return bandValues;
  }
  
  /**
   * Update all audio uniforms (called each frame)
   */
  updateUniforms(
    setUniform: (nodeId: string, paramName: string, value: number) => void,
    setUniforms: (updates: Array<{ nodeId: string, paramName: string, value: number }>) => void
  ): void {
    // Update audio file node uniforms
    for (const [nodeId, state] of this.audioNodes.entries()) {
      if (!state.audioBuffer) {
        continue;
      }
      
      if (state.analyserNode && state.frequencyData) {
        // Get current frequency data
        state.analyserNode.getByteFrequencyData(state.frequencyData);
      }
      
      // Update playback state
      if (state.isPlaying && this.audioContext && state.startTime > 0) {
        let elapsed = this.audioContext.currentTime - state.startTime;
        // Handle looping
        if (elapsed >= state.duration) {
          elapsed = elapsed % state.duration;
          // Restart from beginning if we've looped
          if (elapsed < 0.1) { // Small threshold to avoid rapid restarts
            state.startTime = this.audioContext.currentTime;
            elapsed = 0;
          }
        }
        state.currentTime = Math.max(0, elapsed);
      }
      
      // Set uniforms
      setUniform(nodeId, 'currentTime', state.currentTime);
      setUniform(nodeId, 'duration', state.duration);
      setUniform(nodeId, 'isPlaying', state.isPlaying ? 1.0 : 0.0);
    }
    
    // Update analyzer node uniforms
    const analyzerUpdates: Array<{ nodeId: string, paramName: string, value: number }> = [];
    
    for (const [nodeId, analyzerState] of this.analyzerNodes.entries()) {
      if (!analyzerState.analyserNode) continue;
      
      // Get frequency data
      const frequencyData = new Uint8Array(analyzerState.analyserNode.frequencyBinCount);
      analyzerState.analyserNode.getByteFrequencyData(frequencyData);
      
      // Extract frequency bands
      analyzerState.bandValues = this.extractFrequencyBands(
        frequencyData,
        analyzerState.frequencyBands,
        this.sampleRate,
        analyzerState.fftSize
      );
      
      // Apply smoothing
      for (let i = 0; i < analyzerState.bandValues.length; i++) {
        const newValue = analyzerState.bandValues[i];
        const oldValue = analyzerState.smoothedBandValues[i] || 0;
        const smoothed = analyzerState.smoothing * newValue + (1 - analyzerState.smoothing) * oldValue;
        analyzerState.smoothedBandValues[i] = smoothed;
        
        // Add uniform update
        analyzerUpdates.push({
          nodeId,
          paramName: `band${i}`,
          value: smoothed
        });
      }
    }
    
    // Batch update all analyzer uniforms
    if (analyzerUpdates.length > 0) {
      setUniforms(analyzerUpdates);
    }
  }
  
  /**
   * Get audio node state
   */
  getAudioNodeState(nodeId: string): AudioNodeState | undefined {
    return this.audioNodes.get(nodeId);
  }
  
  /**
   * Get analyzer node state
   */
  getAnalyzerNodeState(nodeId: string): AnalyzerNodeState | undefined {
    return this.analyzerNodes.get(nodeId);
  }
  
  /**
   * Play all audio nodes
   */
  async playAllAudio(offset: number = 0): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const nodeId of this.audioNodes.keys()) {
      promises.push(this.playAudio(nodeId, offset));
    }
    await Promise.all(promises);
  }
  
  /**
   * Stop all audio nodes
   */
  stopAllAudio(): void {
    for (const nodeId of this.audioNodes.keys()) {
      this.stopAudio(nodeId);
    }
  }
  
  /**
   * Get global audio state (from first loaded audio file)
   */
  getGlobalAudioState(): { isPlaying: boolean; currentTime: number; duration: number } | null {
    for (const state of this.audioNodes.values()) {
      if (state.audioBuffer) {
        let currentTime = state.currentTime;
        if (state.isPlaying && state.sourceNode && this.audioContext) {
          currentTime = (this.audioContext.currentTime - state.startTime) % state.audioBuffer.duration;
          if (currentTime < 0) currentTime = 0;
          state.currentTime = currentTime;
        }
        
        return {
          isPlaying: state.isPlaying,
          currentTime,
          duration: state.audioBuffer.duration
        };
      }
    }
    return null;
  }
  
  /**
   * Seek all audio to a specific time
   */
  async seekAllAudio(time: number): Promise<void> {
    const isPlaying = Array.from(this.audioNodes.values()).some(s => s.isPlaying);
    await this.playAllAudio(time);
    if (!isPlaying) {
      // If it wasn't playing before, stop it after seeking
      this.stopAllAudio();
    }
  }
  
  /**
   * Remove audio node
   */
  removeAudioNode(nodeId: string): void {
    this.stopAudio(nodeId);
    this.audioNodes.delete(nodeId);
  }
  
  /**
   * Remove analyzer node
   */
  removeAnalyzerNode(nodeId: string): void {
    this.analyzerNodes.delete(nodeId);
  }
  
  /**
   * Cleanup all resources
   */
  destroy(): void {
    // Stop all audio
    for (const nodeId of this.audioNodes.keys()) {
      this.stopAudio(nodeId);
    }
    
    this.audioNodes.clear();
    this.analyzerNodes.clear();
    
    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
