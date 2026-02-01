import type { NodeSpec } from '../../types';

/**
 * Audio Nodes - Phase 1: Core audio reactivity
 */

/**
 * Audio File Input Node
 * Loads and plays MP3 audio files, provides playback state
 */
export const audioFileInputNodeSpec: NodeSpec = {
  id: 'audio-file-input',
  category: 'Audio',
  displayName: 'Audio File',
  description: 'Load and play MP3 audio files. Provides playback state and timing.',
  inputs: [],
  outputs: [
    {
      name: 'currentTime',
      type: 'float',
      label: 'Current Time'
    },
    {
      name: 'duration',
      type: 'float',
      label: 'Duration'
    },
    {
      name: 'isPlaying',
      type: 'float',
      label: 'Is Playing'
    }
  ],
  parameters: {
    filePath: {
      type: 'string',
      default: ''
    },
    autoPlay: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1
    }
  },
  parameterLayout: {
    elements: [{ type: 'audio-file-input-slot' }],
    parametersWithoutPorts: ['filePath', 'autoPlay'],
    /** Same width as audio-analyzer (3 columns) */
    extraColumns: 1
  },
  // Audio nodes don't generate GLSL code - they provide uniforms
  // The compiler will handle this specially
  mainCode: `
    // Audio file input node - data comes from AudioManager as uniforms
    // No GLSL code needed, outputs are uniforms
  `
};

/**
 * Audio Analyzer Node
 * Extracts frequency bands from audio using FFT analysis
 */
export const audioAnalyzerNodeSpec: NodeSpec = {
  id: 'audio-analyzer',
  category: 'Audio',
  displayName: 'Audio Analyzer',
  description: 'Analyzes audio frequencies and extracts user-defined frequency bands.',
  inputs: [
    {
      name: 'audioFile',
      type: 'float', // Dummy type for connection validation
      label: 'Audio File'
    }
  ],
  outputs: [
    // Dynamic outputs based on frequencyBands parameter (1-based labels: Band 1..4)
    {
      name: 'band0',
      type: 'float',
      label: 'Band 1'
    },
    {
      name: 'band1',
      type: 'float',
      label: 'Band 2'
    },
    {
      name: 'band2',
      type: 'float',
      label: 'Band 3'
    },
    {
      name: 'band3',
      type: 'float',
      label: 'Band 4'
    },
    // Optional per-band remapped outputs (band value remapped by band remap UI)
    {
      name: 'remap0',
      type: 'float',
      label: 'Remap 1'
    },
    {
      name: 'remap1',
      type: 'float',
      label: 'Remap 2'
    },
    {
      name: 'remap2',
      type: 'float',
      label: 'Remap 3'
    },
    {
      name: 'remap3',
      type: 'float',
      label: 'Remap 4'
    }
  ],
  parameters: {
    frequencyBands: {
      type: 'array',
      default: [
        [20, 120],    // Bass
        [120, 300],   // Low mid
        [300, 4000],  // Mid
        [4000, 20000] // Treble
      ]
    },
    smoothing: {
      type: 'float',
      default: 0.8,
      min: 0.0,
      max: 1.0,
      step: 0.01
    },
    fftSize: {
      type: 'int',
      default: 4096,
      min: 256,
      max: 8192
    },
    // Optional per-band remap (inMin, inMax, outMin, outMax). Default 0–1 → 0–1 (no-op).
    band0RemapInMin: { type: 'float', default: 0 },
    band0RemapInMax: { type: 'float', default: 1 },
    band0RemapOutMin: { type: 'float', default: 0 },
    band0RemapOutMax: { type: 'float', default: 1 },
    band1RemapInMin: { type: 'float', default: 0 },
    band1RemapInMax: { type: 'float', default: 1 },
    band1RemapOutMin: { type: 'float', default: 0 },
    band1RemapOutMax: { type: 'float', default: 1 },
    band2RemapInMin: { type: 'float', default: 0 },
    band2RemapInMax: { type: 'float', default: 1 },
    band2RemapOutMin: { type: 'float', default: 0 },
    band2RemapOutMax: { type: 'float', default: 1 },
    band3RemapInMin: { type: 'float', default: 0 },
    band3RemapInMax: { type: 'float', default: 1 },
    band3RemapOutMin: { type: 'float', default: 0 },
    band3RemapOutMax: { type: 'float', default: 1 }
  },
  parameterLayout: {
    elements: [
      { type: 'frequency-range', parameter: 'frequencyBands', bandIndex: 0, label: 'Band 1', scale: 'audio' },
      { type: 'analyzer-band-remap', bandIndex: 0 },
      { type: 'frequency-range', parameter: 'frequencyBands', bandIndex: 1, label: 'Band 2', scale: 'audio' },
      { type: 'analyzer-band-remap', bandIndex: 1 },
      { type: 'frequency-range', parameter: 'frequencyBands', bandIndex: 2, label: 'Band 3', scale: 'audio' },
      { type: 'analyzer-band-remap', bandIndex: 2 },
      { type: 'frequency-range', parameter: 'frequencyBands', bandIndex: 3, label: 'Band 4', scale: 'audio' },
      { type: 'analyzer-band-remap', bandIndex: 3 },
      {
        type: 'grid',
        parameters: ['smoothing', 'fftSize'],
        layout: { columns: 1, cellHeight: 120, respectMinWidth: true }
      }
    ],
    parametersWithoutPorts: [
      'smoothing',
      'band0RemapInMin', 'band0RemapInMax', 'band0RemapOutMin', 'band0RemapOutMax',
      'band1RemapInMin', 'band1RemapInMax', 'band1RemapOutMin', 'band1RemapOutMax',
      'band2RemapInMin', 'band2RemapInMax', 'band2RemapOutMin', 'band2RemapOutMax',
      'band3RemapInMin', 'band3RemapInMax', 'band3RemapOutMin', 'band3RemapOutMax'
    ],
    /** One extra column of width so remap sliders and labels have enough space */
    extraColumns: 1
  },
  mainCode: `
    // Audio analyzer node - data comes from AudioManager as uniforms
    // No GLSL code needed, outputs are uniforms
  `
};

/**
 * Audio Remap Node
 * Remaps audio values from one range to another (optimized for audio)
 */
export const audioRemapNodeSpec: NodeSpec = {
  id: 'audio-remap',
  category: 'Audio',
  displayName: 'Audio Remap',
  description: 'Remaps audio values from one range to another, with optional smoothing.',
  inputs: [
    { name: 'audioValue', type: 'float', label: 'Audio Value' }
  ],
  outputs: [
    { name: 'out', type: 'float' }
  ],
  parameters: {
    inMin: {
      type: 'float',
      default: 0.0,
      label: 'In Min'
    },
    inMax: {
      type: 'float',
      default: 1.0,
      label: 'In Max'
    },
    outMin: {
      type: 'float',
      default: 0.0,
      label: 'Out Min'
    },
    outMax: {
      type: 'float',
      default: 1.0,
      label: 'Out Max'
    },
    clamp: {
      type: 'int',
      default: 1,
      min: 0,
      max: 1
    }
  },
  parameterLayout: {
    elements: [
      {
        type: 'remap-range'
      },
      {
        type: 'grid',
        parameters: ['clamp'],
        layout: {
          columns: 1,
          cellHeight: 120,
          respectMinWidth: true
        },
        parameterUI: {
          clamp: 'toggle'
        }
      }
    ]
  },
  mainCode: `
    float t = ($input.audioValue - $param.inMin) / max($param.inMax - $param.inMin, 0.0001);
    float remapped = mix($param.outMin, $param.outMax, t);
    if ($param.clamp > 0) {
      remapped = clamp(remapped, min($param.outMin, $param.outMax), max($param.outMin, $param.outMax));
    }
    $output.out = remapped;
  `
};
