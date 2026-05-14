import type { NodeGraph } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import { LEGACY_WORLEY_DRIFT_AMOUNT, LEGACY_WORLEY_DRIFT_DIRECTION_DEG } from '../data-model/worleyNoiseMigration';
import { linearRgbToOklch } from '../utils/colorConversion';

/**
 * Per-node Power, Rule A (passthrough): `uv → rotate(bypassed) → noise → final-output`.
 * The bypassed rotate is a vec2 → vec2 node (Rule A applies). After the rewrite, noise reads
 * its `in` directly from `uv`; rotate emits no WGSL.
 */
export function mvpBypassRuleARotateGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bypass-rule-a-rotate',
    name: 'MVP bypass Rule A rotate',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-rotate', type: 'rotate', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
      { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-rotate', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-rotate', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/**
 * Per-node Power, Rule B (disconnect): `uv → noise(bypassed) → final-output`.
 * The bypassed noise has vec2 → float (Rule B). All outgoing wires drop, so final-output falls
 * back to its defaults; noise emits no WGSL.
 */
export function mvpBypassRuleBNoiseGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bypass-rule-b-noise',
    name: 'MVP bypass Rule B noise',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-noise', type: 'noise', position: { x: 0, y: 0 }, parameters: {}, bypassed: true },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Smallest supported WebGPU MVP graph: solid color from constant-vec3. */
export function mvpConstantVec3Graph(): NodeGraph {
  return {
    id: 'fixture-mvp-const-vec3',
    name: 'MVP constant vec3',
    version: '2.0',
    nodes: [
      { id: 'n-const', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.2, y: 0.4, z: 0.8 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }
    ]
  };
}

/** Time drives a grayscale multiply (fixed param b) — exercises wall-clock uniform path. */
export function mvpTimeMultiplyGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-time-mul',
    name: 'MVP time multiply',
    version: '2.0',
    nodes: [
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-mul',
        type: 'multiply',
        position: { x: 0, y: 0 },
        parameters: { b: 0.25 },
        parameterInputModes: {}
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-mul', targetPort: 'a' },
      { id: 'c2', sourceNodeId: 'n-mul', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }
    ]
  };
}

/** Clamp(time, 0, 1) — exercises clamp + multiple constant-float params. */
export function mvpClampTimeGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-clamp-time',
    name: 'MVP clamp time',
    version: '2.0',
    nodes: [
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-lo', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0 } },
      { id: 'n-hi', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 1 } },
      { id: 'n-cl', type: 'clamp', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} }
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-cl', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-lo', sourcePort: 'out', targetNodeId: 'n-cl', targetPort: 'min' },
      { id: 'c3', sourceNodeId: 'n-hi', sourcePort: 'out', targetNodeId: 'n-cl', targetPort: 'max' },
      { id: 'c4', sourceNodeId: 'n-cl', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }
    ]
  };
}

/** Fragment coords → length → normalize → grayscale output. */
export function mvpFragmentCoordinatesGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-frag-coords',
    name: 'MVP fragment coordinates',
    version: '2.0',
    nodes: [
      { id: 'n-frag', type: 'fragment-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-div', type: 'divide', position: { x: 0, y: 0 }, parameters: { b: 1000.0 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-frag', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-div', targetPort: 'a' },
      { id: 'c3', sourceNodeId: 'n-div', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Oscillator 2D (06D): oscillator.x -> output grayscale (also asserts param layout stability for many params). */
export function mvpOscillator2dGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oscillator-2d',
    name: 'MVP oscillator 2d',
    version: '2.0',
    nodes: [
      {
        id: 'n-osc',
        type: 'oscillator-2d',
        position: { x: 0, y: 0 },
        parameters: {
          globalSpeed: 1.0,
          globalOffset: 0.0,
          layerCombine: 0,

          x1On: 1,
          x1Amp: 0.5,
          x1Freq: 1.0,
          x1Phase: 0.0,
          x2On: 1,
          x2Amp: 0.2,
          x2Freq: 1.07,
          x2Phase: 2.31,
          x3On: 0,
          x3Amp: 0.0,
          x3Freq: 1.03,
          x3Phase: 4.12,

          y1On: 1,
          y1Amp: 0.25,
          y1Freq: 1.0,
          y1Phase: 0.0,
          y2On: 0,
          y2Amp: 0.0,
          y2Freq: 1.13,
          y2Phase: 1.2,
          y3On: 0,
          y3Amp: 0.0,
          y3Freq: 0.97,
          y3Phase: 3.1,

          rotationSpeed: 0.0,
          rotationPhase: 0.0,
          rotWobbleAmp: 0.0,
          rotWobbleFreq: 1.0,
          rotWobblePhase: 0.0,

          offsetX: 0.0,
          offsetY: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-osc', sourcePort: 'x', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** UV transforms: uv -> scale -> rotate -> polar -> output vec2 length as grayscale */
export function mvpUvTransformBatchGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-uv-transform-batch',
    name: 'MVP UV transform batch',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-scale',
        type: 'scale',
        position: { x: 0, y: 0 },
        parameters: { scaleX: 1.5, scaleY: 0.9, centerX: 0.5, centerY: 0.5 },
      },
      {
        id: 'n-rot',
        type: 'rotate',
        position: { x: 0, y: 0 },
        parameters: { angle: 1.2, centerX: 0.5, centerY: 0.5 },
      },
      {
        id: 'n-polar',
        type: 'polar-coordinates',
        position: { x: 0, y: 0 },
        parameters: {
          polarCenterX: 0.5,
          polarCenterY: 0.5,
          polarScale: 1.1,
          polarRadiusScale: 1.0,
          polarRotation: 0.25,
        },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-scale', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-scale', sourcePort: 'out', targetNodeId: 'n-rot', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-rot', sourcePort: 'out', targetNodeId: 'n-polar', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-polar', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c5', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Brick tiling UV distort: uv -> brick-tiling -> length -> grayscale */
export function mvpBrickTilingGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-brick-tiling',
    name: 'MVP brick tiling',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-brick',
        type: 'brick-tiling',
        position: { x: 0, y: 0 },
        parameters: {
          brickScaleX: 6.0,
          brickScaleY: 4.0,
          offsetX: 0.1,
          brickOffsetY: -0.2,
          brickAmount: 0.75,
          brickOffsetX: 0.5,
        },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-brick', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-brick', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Mirror/Flip: uv -> mirror-flip -> length -> grayscale */
export function mvpMirrorFlipGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-mirror-flip',
    name: 'MVP mirror flip',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-mir',
        type: 'mirror-flip',
        position: { x: 0, y: 0 },
        parameters: { mirrorFlipX: 1, mirrorFlipY: 0, mirrorCenterX: 0.5, mirrorCenterY: 0.5 },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-mir', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-mir', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Ripple: uv -> ripple (radial mode) -> length -> grayscale */
export function mvpRippleGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-ripple',
    name: 'MVP ripple',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-rip',
        type: 'ripple',
        position: { x: 0, y: 0 },
        parameters: {
          rippleCenterX: 0.5,
          rippleCenterY: 0.5,
          rippleMode: 0,
          rippleFrequency: 8.0,
          rippleAmplitude: 0.05,
          ripplePhase: 0.25,
          rippleTimeSpeed: 1.0,
          rippleTimeOffset: 0.0,
        },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-rip', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-rip', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Rain drops: procedural UV offset magnitude (length) for WGSL codegen coverage. */
export function mvpRainDropsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-rain-drops',
    name: 'MVP rain drops',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-rain',
        type: 'rain-drops',
        position: { x: 0, y: 0 },
        parameters: {
          scale: 1.15,
          seed: 2.75,
          speed: 1.1,
          layers: 3,
          sizeVariation: 0.6,
          quantityPerLayer: 1.2,
        },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-rain', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-rain', targetPort: 'time' },
      { id: 'c3', sourceNodeId: 'n-rain', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Mixed wave signal: three shaped waves blended and range-remapped (float scalar out). */
export function mvpMixedWaveSignalGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-mixed-wave-signal',
    name: 'MVP mixed wave signal',
    version: '2.0',
    nodes: [
      {
        id: 'n-wave',
        type: 'mixed-wave-signal',
        position: { x: 0, y: 0 },
        parameters: {
          globalSpeed: 1.1,
          globalOffset: 0.25,
          w0Speed: 1.0,
          w0Offset: 0.0,
          w0Weight: 1.0,
          w0Shape: 3,
          w1Speed: 0.85,
          w1Offset: 2.17,
          w1Weight: 0.8,
          w1Shape: 6,
          w2Speed: 1.31,
          w2Offset: 4.03,
          w2Weight: 1.1,
          w2Shape: 7,
          outMin: -0.35,
          outMax: 0.85,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'n-wave', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }],
  };
}

/** Blur pass-plan (Task 10B): `... → blur → final-output` pattern; blurAmount=0 keeps WebGL/WebGPU parity. */
export function mvpBlurPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-blur-passplan',
    name: 'MVP blur pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 0.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-blur',
        type: 'blur',
        position: { x: 0, y: 0 },
        parameters: {
          blurAmount: 0.0,
          blurRadius: 6.0,
          blurType: 0,
          blurDirection: 45.0,
          blurCenterX: 0.0,
          blurCenterY: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Glow/bloom pass-plan: bright color source -> glow-bloom -> final-output. */
export function mvpGlowBloomPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-glow-bloom-passplan',
    name: 'MVP glow bloom pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 0.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.25, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-glow',
        type: 'glow-bloom',
        position: { x: 0, y: 0 },
        parameters: {
          glowThreshold: 0.45,
          glowIntensity: 1.4,
          glowRadius: 5.0,
          glowStrength: 0.65,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-glow', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-glow', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Bokeh pass-plan: bright-pass + shaped blur + combine. */
export function mvpBokehPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bokeh-passplan',
    name: 'MVP bokeh pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-dots',
        type: 'dots',
        position: { x: 0, y: 0 },
        parameters: { dotsGap: 0.096, dotsSize: 0.012, dotsFeather: 0.0012, dotsIntensity: 12.0 },
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-bokeh',
        type: 'bokeh',
        position: { x: 0, y: 0 },
        parameters: {
          bokehThreshold: 0.35,
          bokehIntensity: 1.0,
          bokehRadius: 14.0,
          bokehStrength: 1.0,
          bokehBlades: 6,
          bokehRotation: 15.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-dots', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-dots', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-dots', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-dots', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-bokeh', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Crepuscular-rays pass-plan: noise color image -> crepuscular-rays -> final-output. */
export function mvpCrepuscularRaysPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-crepuscular-rays-passplan',
    name: 'MVP crepuscular rays pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 0.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.25, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-crep',
        type: 'crepuscular-rays',
        position: { x: 0, y: 0 },
        parameters: {
          sourceX: 0.3,
          sourceY: 0.2,
          rayCount: 16,
          spread: 360.0,
          width: 0.06,
          distanceFalloff: 1.0,
          intensity: 1.4,
          rotationSpeed: 0.0,
          rotationOffset: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-crep', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-crep', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/**
 * Blur pass-plan (Task 10B): non-zero blur (directional).
 * This intentionally allows higher WebGL/WebGPU RMS than the identity case; used by the golden harness.
 */
export function mvpBlurPassPlanDirectionalGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-blur-passplan-directional',
    name: 'MVP blur pass plan (directional)',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 0.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-blur',
        type: 'blur',
        position: { x: 0, y: 0 },
        parameters: {
          blurAmount: 0.85,
          blurRadius: 8.0,
          blurType: 1,
          blurDirection: 32.0,
          blurCenterX: 0.0,
          blurCenterY: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/**
 * Blur pass-plan (Task 10B): non-zero blur (radial).
 * This intentionally allows higher WebGL/WebGPU RMS than the identity case; used by the golden harness.
 */
export function mvpBlurPassPlanRadialGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-blur-passplan-radial',
    name: 'MVP blur pass plan (radial)',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 0.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-c',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-blur',
        type: 'blur',
        position: { x: 0, y: 0 },
        parameters: {
          blurAmount: 0.9,
          blurRadius: 10.0,
          blurType: 2,
          blurDirection: 0.0,
          blurCenterX: 0.35,
          blurCenterY: -0.15,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-blur', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-blur', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Vector basics (06C): normalize(uv) -> length -> output grayscale */
export function mvpVectorBasicsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-vector-basics',
    name: 'MVP vector basics',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-nrm', type: 'normalize', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-nrm', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-nrm', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Utility floats: time -> fract -> reciprocal -> output grayscale */
export function mvpUtilityFloatsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-utility-floats',
    name: 'MVP utility floats',
    version: '2.0',
    nodes: [
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-fr', type: 'fract', position: { x: 0, y: 0 }, parameters: { in: 0 } },
      { id: 'n-rcp', type: 'reciprocal', position: { x: 0, y: 0 }, parameters: { in: 1 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-fr', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-fr', sourcePort: 'out', targetNodeId: 'n-rcp', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-rcp', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Combine floats into vec4 and swizzle to validate vec4 plumbing + string-param swizzle support. */
export function mvpCombineSwizzleGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-combine-swizzle',
    name: 'MVP combine vector + swizzle',
    version: '2.0',
    nodes: [
      { id: 'n-x', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.1 } },
      { id: 'n-y', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.3 } },
      { id: 'n-z', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.6 } },
      { id: 'n-w', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 1.0 } },
      {
        id: 'n-combine',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-swiz',
        type: 'swizzle',
        position: { x: 0, y: 0 },
        parameters: { swizzle: 'wzyx' },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-x', sourcePort: 'out', targetNodeId: 'n-combine', targetPort: 'x' },
      { id: 'c2', sourceNodeId: 'n-y', sourcePort: 'out', targetNodeId: 'n-combine', targetPort: 'y' },
      { id: 'c3', sourceNodeId: 'n-z', sourcePort: 'out', targetNodeId: 'n-combine', targetPort: 'z' },
      { id: 'c4', sourceNodeId: 'n-w', sourcePort: 'out', targetNodeId: 'n-combine', targetPort: 'w' },
      { id: 'c5', sourceNodeId: 'n-combine', sourcePort: 'out', targetNodeId: 'n-swiz', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-swiz', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Split a vec4 into scalars and recombine; validates multi-output port resolution in WGSL MVP. */
export function mvpSplitVectorGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-split-vector',
    name: 'MVP split vector',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.2, y: 0.4, z: 0.6, w: 1.0 } },
      { id: 'n-split', type: 'split-vector', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-combine',
        type: 'combine-vector',
        position: { x: 0, y: 0 },
        parameters: { outputType: 4, z: 0.0, w: 1.0 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-split', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-split', sourcePort: 'x', targetNodeId: 'n-combine', targetPort: 'x' },
      { id: 'c3', sourceNodeId: 'n-split', sourcePort: 'y', targetNodeId: 'n-combine', targetPort: 'y' },
      { id: 'c4', sourceNodeId: 'n-split', sourcePort: 'z', targetNodeId: 'n-combine', targetPort: 'z' },
      { id: 'c5', sourceNodeId: 'n-split', sourcePort: 'w', targetNodeId: 'n-combine', targetPort: 'w' },
      { id: 'c6', sourceNodeId: 'n-combine', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Compare + Select: compare(time, b) -> select between two constants. */
export function mvpCompareSelectGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-compare-select',
    name: 'MVP compare + select',
    version: '2.0',
    nodes: [
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-cmpr',
        type: 'compare',
        position: { x: 0, y: 0 },
        parameters: { operation: 4, b: 0.25 },
        parameterInputModes: {},
      },
      { id: 'n-true', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 1.0 } },
      { id: 'n-false', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.0 } },
      {
        id: 'n-sel',
        type: 'select',
        position: { x: 0, y: 0 },
        parameters: {},
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-cmpr', targetPort: 'a' },
      { id: 'c2', sourceNodeId: 'n-cmpr', sourcePort: 'out', targetNodeId: 'n-sel', targetPort: 'condition' },
      { id: 'c3', sourceNodeId: 'n-true', sourcePort: 'out', targetNodeId: 'n-sel', targetPort: 'trueValue' },
      { id: 'c4', sourceNodeId: 'n-false', sourcePort: 'out', targetNodeId: 'n-sel', targetPort: 'falseValue' },
      { id: 'c5', sourceNodeId: 'n-sel', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Cross product: cross(constVec3, constVec3) -> output. */
export function mvpCrossProductGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-cross-product',
    name: 'MVP cross product',
    version: '2.0',
    nodes: [
      { id: 'n-a', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 1.0, y: 0.0, z: 0.0 } },
      { id: 'n-b', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.0, y: 1.0, z: 0.0 } },
      { id: 'n-x', type: 'cross-product', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-a', sourcePort: 'out', targetNodeId: 'n-x', targetPort: 'a' },
      { id: 'c2', sourceNodeId: 'n-b', sourcePort: 'out', targetNodeId: 'n-x', targetPort: 'b' },
      { id: 'c3', sourceNodeId: 'n-x', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Mask composite float: mix(bg, fg, mask). */
export function mvpMaskCompositeFloatGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-mask-composite-float',
    name: 'MVP mask composite float',
    version: '2.0',
    nodes: [
      { id: 'n-bg', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.1 } },
      { id: 'n-fg', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.9 } },
      { id: 'n-m', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.25 } },
      { id: 'n-mask', type: 'mask-composite-float', position: { x: 0, y: 0 }, parameters: { bg: 0, fg: 1, mask: 0.5 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-bg', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'bg' },
      { id: 'c2', sourceNodeId: 'n-fg', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'fg' },
      { id: 'c3', sourceNodeId: 'n-m', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'mask' },
      { id: 'c4', sourceNodeId: 'n-mask', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Mask composite vec3: mix(bg.rgb, fg.rgb, mask). */
export function mvpMaskCompositeVec3Graph(): NodeGraph {
  return {
    id: 'fixture-mvp-mask-composite-vec3',
    name: 'MVP mask composite vec3',
    version: '2.0',
    nodes: [
      { id: 'n-bg', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.1, y: 0.2, z: 0.3 } },
      { id: 'n-fg', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.9, y: 0.6, z: 0.2 } },
      { id: 'n-m', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.75 } },
      { id: 'n-mask', type: 'mask-composite-vec3', position: { x: 0, y: 0 }, parameters: { mask: 0.5 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-bg', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'bg' },
      { id: 'c2', sourceNodeId: 'n-fg', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'fg' },
      { id: 'c3', sourceNodeId: 'n-m', sourcePort: 'out', targetNodeId: 'n-mask', targetPort: 'mask' },
      { id: 'c4', sourceNodeId: 'n-mask', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Reflect: reflect(uv, constantNormal) -> length -> grayscale */
export function mvpReflectGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-reflect',
    name: 'MVP reflect',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-n', type: 'constant-vec2', position: { x: 0, y: 0 }, parameters: { x: 0.0, y: 1.0 } },
      { id: 'n-r', type: 'reflect', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'I' },
      { id: 'c2', sourceNodeId: 'n-n', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'N' },
      { id: 'c3', sourceNodeId: 'n-r', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Refract: refract(uv, constantNormal, eta) -> length -> grayscale */
export function mvpRefractGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-refract',
    name: 'MVP refract',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-n', type: 'constant-vec2', position: { x: 0, y: 0 }, parameters: { x: 0.0, y: 1.0 } },
      { id: 'n-r', type: 'refract', position: { x: 0, y: 0 }, parameters: { eta: 0.92 }, parameterInputModes: {} },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'I' },
      { id: 'c2', sourceNodeId: 'n-n', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'N' },
      { id: 'c3', sourceNodeId: 'n-r', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Hash32: hash32(floor(uv * scale)) -> output vec3 */
export function mvpHash32Graph(): NodeGraph {
  return {
    id: 'fixture-mvp-hash32',
    name: 'MVP hash32',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-scale',
        type: 'multiply',
        position: { x: 0, y: 0 },
        parameters: { b: 12.0 },
        parameterInputModes: {},
      },
      { id: 'n-floor', type: 'floor', position: { x: 0, y: 0 }, parameters: { in: 0 }, parameterInputModes: {} },
      { id: 'n-h', type: 'hash32', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-scale', targetPort: 'a' },
      { id: 'c2', sourceNodeId: 'n-scale', sourcePort: 'out', targetNodeId: 'n-floor', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-floor', sourcePort: 'out', targetNodeId: 'n-h', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Gradient: radial and linear paths (via select on gradientType) -> output grayscale. */
export function mvpGradientGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-gradient',
    name: 'MVP gradient',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-g',
        type: 'gradient',
        position: { x: 0, y: 0 },
        parameters: {
          gradientType: 0,
          centerX: 0.0,
          centerY: 0.0,
          radius: 0.65,
          falloff: 0.2,
          invert: 0,
          angle: 45.0,
          linearScale: 1.4,
          intensity: 1.0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-g', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-g', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Noise: uv -> noise (value fBm mode) -> grayscale output. */
export function mvpNoiseGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-noise',
    name: 'MVP noise',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-noise',
        type: 'noise',
        position: { x: 0, y: 0 },
        parameters: {
          noiseMode: 2,
          noiseScale: 2.0,
          noiseOctaves: 4,
          noiseLacunarity: 2.0,
          noiseGain: 0.5,
          noiseTimeSpeed: 1.0,
          noiseTimeOffset: 0.0,
          noiseIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-noise', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-noise', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Bayer dither: constant value + fragCoord + resolution -> output float. */
export function mvpBayerDitherGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bayer-dither',
    name: 'MVP bayer dither',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.42 } },
      { id: 'n-fc', type: 'fragment-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-res', type: 'resolution', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-d',
        type: 'bayer-dither',
        position: { x: 0, y: 0 },
        parameters: { strength: 0.75, pixelSize: 2.0 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-d', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-fc', sourcePort: 'out', targetNodeId: 'n-d', targetPort: 'fragCoord' },
      { id: 'c3', sourceNodeId: 'n-res', sourcePort: 'out', targetNodeId: 'n-d', targetPort: 'resolution' },
      { id: 'c4', sourceNodeId: 'n-d', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Bezier curve: params-only input node -> output vec4. */
export function mvpBezierCurveGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bezier-curve',
    name: 'MVP bezier curve',
    version: '2.0',
    nodes: [
      { id: 'n-b', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.1, y1: 0.2, x2: 0.7, y2: 0.9 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'n-b', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }],
  };
}

/** OKLCH color: params-only input node -> output vec3. */
export function mvpOklchColorGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oklch-color',
    name: 'MVP OKLCH color',
    version: '2.0',
    nodes: [
      { id: 'n-c', type: 'oklch-color', position: { x: 0, y: 0 }, parameters: { l: 0.6, c: 0.12, h: 210.0 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }],
  };
}

/** Constant float → final-output (float→vec3 promotion); legacy `color-map` id kept for harness stability. */
export function mvpColorMapGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-color-map',
    name: 'MVP float scalar to output',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.33 } },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' }],
  };
}

/** Blend mode: time (base) blended with constant float using a non-trivial mode + opacity. */
export function mvpBlendModeGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-blend-mode',
    name: 'MVP blend mode',
    version: '2.0',
    nodes: [
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-b', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.65 } },
      {
        id: 'n-blend',
        type: 'blend-mode',
        position: { x: 0, y: 0 },
        parameters: { mode: 3, opacity: 0.75, blend: 0.5 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-blend', targetPort: 'base' },
      { id: 'c2', sourceNodeId: 'n-b', sourcePort: 'out', targetNodeId: 'n-blend', targetPort: 'blend' },
      { id: 'c3', sourceNodeId: 'n-blend', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Blend Color: two constant vec4s merged with Overlay + fractional opacity (per-channel + alpha mix). */
export function mvpBlendColorGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-blend-color',
    name: 'MVP blend color',
    version: '2.0',
    nodes: [
      {
        id: 'n-bg',
        type: 'constant-vec4',
        position: { x: 0, y: 0 },
        parameters: { x: 0.82, y: 0.12, z: 0.15, w: 1.0 },
        parameterInputModes: {},
      },
      {
        id: 'n-fg',
        type: 'constant-vec4',
        position: { x: 0, y: 0 },
        parameters: { x: 0.08, y: 0.55, z: 0.22, w: 0.65 },
        parameterInputModes: {},
      },
      {
        id: 'n-bc',
        type: 'blend-color',
        position: { x: 0, y: 0 },
        parameters: { mode: 3, opacity: 0.7 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c-bg', sourceNodeId: 'n-bg', sourcePort: 'out', targetNodeId: 'n-bc', targetPort: 'base' },
      { id: 'c-fg', sourceNodeId: 'n-fg', sourcePort: 'out', targetNodeId: 'n-bc', targetPort: 'blend' },
      { id: 'c-out', sourceNodeId: 'n-bc', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Scanlines: constant grayscale -> scanlines -> output vec4. */
export function mvpScanlinesGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-scanlines',
    name: 'MVP scanlines',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.8 } },
      { id: 'n-c', type: 'combine-vector', position: { x: 0, y: 0 }, parameters: { x: 0, y: 0, z: 0, w: 1 }, parameterInputModes: {} },
      {
        id: 'n-s',
        type: 'scanlines',
        position: { x: 0, y: 0 },
        parameters: { scanlineFrequency: 140.0, scanlineThickness: 0.12, scanlineOpacity: 0.35, scanlineTimeSpeed: 0.5, scanlineTimeOffset: 0.0 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c2', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c3', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c4', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-s', targetPort: 'in' },
      { id: 'c5', sourceNodeId: 'n-s', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Stripes: uv -> stripes (waveshapes) -> grayscale output. */
export function mvpStripesGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-stripes',
    name: 'MVP stripes',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-st',
        type: 'stripes',
        position: { x: 0, y: 0 },
        parameters: {
          waveScale: 1.4,
          waveFrequency: 10.0,
          waveAmplitude: 1.0,
          waveType: 3,
          waveDirection: 25.0,
          wavePhaseSpeed: 1.3,
          wavePhaseOffset: 0.25,
          waveTimeSpeed: 0.7,
          waveIntensity: 0.8,
          waveTimeOffset: 0.1,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-st', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-st', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Dots: uv -> dots -> grayscale output. */
export function mvpDotsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-dots',
    name: 'MVP dots',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-d',
        type: 'dots',
        position: { x: 0, y: 0 },
        parameters: { dotsGap: 0.06, dotsSize: 0.03, dotsFeather: 0.0072, dotsIntensity: 1.0 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-d', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-d', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Rings: uv -> rings -> grayscale output. */
export function mvpRingsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-rings',
    name: 'MVP rings',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-r',
        type: 'rings',
        position: { x: 0, y: 0 },
        parameters: {
          ringCenterX: 0.0,
          ringCenterY: 0.0,
          ringSpacing: (2 * Math.PI) / 18.0,
          ringLevel: 0.7,
          ringTimeOffset: 0.25,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-r', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Radial pulse: uv -> radial-pulse (fixed spawn time) -> final-output. */
export function mvpRadialPulseGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-radial-pulse',
    name: 'MVP radial pulse',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-p',
        type: 'radial-pulse',
        position: { x: 0, y: 0 },
        parameters: {
          pulseCenterX: 0.0,
          pulseCenterY: 0.0,
          pulseDistanceScale: 1.0,
          pulseSpeed: 0.55,
          pulseThickness: 0.045,
          pulseFeather: 0.3,
          pulseFalloff: 0.0,
          pulseLevel: 1.05,
          pulseSpawnTimeline: 100.25,
          pulseDrive: 0.0,
          pulseRiseThreshold: 0.55,
          pulseFallThreshold: 0.35,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-p', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-p', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Triangle grid: uv -> triangle grid -> grayscale output. */
export function mvpTriangleGridGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-triangle-grid',
    name: 'MVP triangle grid',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-tri',
        type: 'triangle-grid',
        position: { x: 0, y: 0 },
        parameters: { triScale: 0.25, triLineWidth: 0.04, triIntensity: 1.0, triFill: 0.0 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-tri', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-tri', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Disco pattern: uv -> disco-pattern -> output vec4. */
export function mvpDiscoPatternGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-disco-pattern',
    name: 'MVP disco pattern',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-d',
        type: 'disco-pattern',
        position: { x: 0, y: 0 },
        parameters: { discoScale: 5.0, phaseOffsetX: 0.2, phaseOffsetY: -0.1 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-d', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-d', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Hexagonal grid: uv -> hexagonal-grid -> grayscale output. */
export function mvpHexagonalGridGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-hexagonal-grid',
    name: 'MVP hexagonal grid',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-hex',
        type: 'hexagonal-grid',
        position: { x: 0, y: 0 },
        parameters: {
          hexSize: 0.6,
          hexGap: 0.1,
          hexCellRotation: 15.0,
          hexSizeVariation: 0.35,
          hexSizeVariationSteps: 4,
          hexVariationAnimationSpeed: 0.0,
          hexRotation: 20.0,
          hexIntensity: 0.45,
          hexIntensityVariation: 0.25,
          hexSoftness: 0.01,
          hexEdgeThickness: 0.12,
          hexEdgeIntensity: 0.35,
          hexRimWidth: 0.08,
          hexRimIntensity: 0.4,
          hexSeed: 7,
          hexPulseSpeed: 0.0,
          hexPulseDepth: 0.0,
          hexPulseVariationImpact: 0.0,
          hexWaveDirection: 30.0,
          hexWaveFrequency: 0.0,
          hexWaveSpeed: 0.0,
          hexWaveDepth: 0.0,
          hexWaveVariationImpact: 0.0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-hex', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-hex', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Flow field: uv -> flow-field-pattern -> grayscale output. */
export function mvpFlowFieldPatternGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-flow-field-pattern',
    name: 'MVP flow field pattern',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-f',
        type: 'flow-field-pattern',
        position: { x: 0, y: 0 },
        parameters: {
          flowScale: 2.2,
          flowCurlScale: 1.0,
          flowTimeSpeed: 1.1,
          flowTimeOffset: 0.0,
          flowOctaves: 3,
          flowGain: 0.6,
          flowIntensity: 1.0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-f', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-f', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Radial rays: uv -> radial-rays -> grayscale output. */
export function mvpRadialRaysGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-radial-rays',
    name: 'MVP radial rays',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-r',
        type: 'radial-rays',
        position: { x: 0, y: 0 },
        parameters: {
          centerX: 0.0,
          centerY: 0.0,
          rayCount: 12,
          spreadAngle: 270.0,
          width: 0.08,
          falloff: 0.06,
          rotation: -15.0,
          intensity: 1.0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-r', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-r', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Streak: uv -> streak -> grayscale output. */
export function mvpStreakGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-streak',
    name: 'MVP streak',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-st',
        type: 'streak',
        position: { x: 0, y: 0 },
        parameters: {
          streakAngleDeg: (1.2 * 180) / Math.PI,
          streakStretch: 2.8,
          streakWidth: 0.18,
          streakIntensity: 1.0
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-st', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-st', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Tone mapping: vec3 color -> tone mapping -> vec3 out -> final output. */
export function mvpToneMappingGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-tone-mapping',
    name: 'MVP tone mapping',
    version: '2.0',
    nodes: [
      { id: 'n-c', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.8, y: 0.4, z: 0.2 } },
      {
        id: 'n-tm',
        type: 'tone-mapping',
        position: { x: 0, y: 0 },
        parameters: { exposure: 1.4, contrast: 1.2, saturation: 1.1 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-tm', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-tm', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Color grading: constant vec4 -> color grading -> vec4 out. */
export function mvpColorGradingGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-color-grading',
    name: 'MVP color grading',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.65 } },
      { id: 'n-c', type: 'combine-vector', position: { x: 0, y: 0 }, parameters: { x: 0, y: 0, z: 0, w: 1 }, parameterInputModes: {} },
      {
        id: 'n-cg',
        type: 'color-grading',
        position: { x: 0, y: 0 },
        parameters: {
          colorShadowsR: 1.05,
          colorShadowsG: 0.95,
          colorShadowsB: 1.0,
          colorMidtonesR: 1.0,
          colorMidtonesG: 1.05,
          colorMidtonesB: 0.95,
          colorHighlightsR: 1.0,
          colorHighlightsG: 1.0,
          colorHighlightsB: 1.1,
          levelsInMin: 0.0,
          levelsInMax: 1.0,
          levelsOutMin: 0.0,
          levelsOutMax: 1.0,
          levelsGamma: 1.2,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'x' },
      { id: 'c2', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'y' },
      { id: 'c3', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-c', targetPort: 'z' },
      { id: 'c4', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-cg', targetPort: 'in' },
      { id: 'c5', sourceNodeId: 'n-cg', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** OKLCH stepped color map: value + start/end + curves + dithering inputs -> vec3 output. */
export function mvpOklchColorMapThresholdGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oklch-color-map-threshold',
    name: 'MVP OKLCH stepped color map',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.42 } },
      { id: 'n-start', type: 'oklch-color', position: { x: 0, y: 0 }, parameters: { l: 0.45, c: 0.12, h: 20.0 } },
      { id: 'n-end', type: 'oklch-color', position: { x: 0, y: 0 }, parameters: { l: 0.85, c: 0.12, h: 220.0 } },
      { id: 'n-l', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-c', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-h', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-fc', type: 'fragment-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-res', type: 'resolution', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-map',
        type: 'oklch-color-map-threshold',
        position: { x: 0, y: 0 },
        parameters: {
          stops: 6,
          transitionWidth: 0.01,
          ditherStrength: 0.8,
          pixelSize: 2.0,
          startColorL: 0.45,
          startColorC: 0.12,
          startColorH: 20.0,
          endColorL: 0.85,
          endColorC: 0.12,
          endColorH: 220.0,
          lCurveX1: 0.0,
          lCurveY1: 0.0,
          lCurveX2: 1.0,
          lCurveY2: 1.0,
          cCurveX1: 0.0,
          cCurveY1: 0.0,
          cCurveX2: 1.0,
          cCurveY2: 1.0,
          hCurveX1: 0.0,
          hCurveY1: 0.0,
          hCurveX2: 1.0,
          hCurveY2: 1.0,
          reverseHue: 0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-start', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'startColor' },
      { id: 'c3', sourceNodeId: 'n-end', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'endColor' },
      { id: 'c4', sourceNodeId: 'n-l', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'lCurve' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'cCurve' },
      { id: 'c6', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'hCurve' },
      { id: 'c7', sourceNodeId: 'n-fc', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'fragCoord' },
      { id: 'c8', sourceNodeId: 'n-res', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'resolution' },
      { id: 'c9', sourceNodeId: 'n-map', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** OKLCH stepped color map without dither: isolates stops/thresholds from bayer/fragCoord behavior. */
export function mvpOklchColorMapThresholdNoDitherGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oklch-color-map-threshold-no-dither',
    name: 'MVP OKLCH stepped color map no dither',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.42 } },
      { id: 'n-l', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-c', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-h', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      {
        id: 'n-map',
        type: 'oklch-color-map-threshold',
        position: { x: 0, y: 0 },
        parameters: {
          stops: 6,
          transitionWidth: 0.01,
          ditherStrength: 0.0,
          pixelSize: 2.0,
          startColorL: 0.45,
          startColorC: 0.12,
          startColorH: 20.0,
          endColorL: 0.85,
          endColorC: 0.12,
          endColorH: 220.0,
          lCurveX1: 0.0,
          lCurveY1: 0.0,
          lCurveX2: 1.0,
          lCurveY2: 1.0,
          cCurveX1: 0.0,
          cCurveY1: 0.0,
          cCurveX2: 1.0,
          cCurveY2: 1.0,
          hCurveX1: 0.0,
          hCurveY1: 0.0,
          hCurveX2: 1.0,
          hCurveY2: 1.0,
          reverseHue: 0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-l', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'lCurve' },
      { id: 'c3', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'cCurve' },
      { id: 'c4', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'hCurve' },
      { id: 'c5', sourceNodeId: 'n-map', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** OKLCH smooth color map: value + start/end + curves -> vec3 output. */
export function mvpOklchColorMapBezierGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oklch-color-map-bezier',
    name: 'MVP OKLCH smooth color map',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.66 } },
      { id: 'n-start', type: 'oklch-color', position: { x: 0, y: 0 }, parameters: { l: 0.4, c: 0.12, h: 320.0 } },
      { id: 'n-end', type: 'oklch-color', position: { x: 0, y: 0 }, parameters: { l: 0.9, c: 0.12, h: 120.0 } },
      { id: 'n-l', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.2, y1: 0.0, x2: 0.8, y2: 1.0 } },
      { id: 'n-c', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.2, x2: 1.0, y2: 0.8 } },
      { id: 'n-h', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      {
        id: 'n-map',
        type: 'oklch-color-map-bezier',
        position: { x: 0, y: 0 },
        parameters: {
          // Intentionally wrong vs n-start / n-end — ports are wired; shader must use OKLCH nodes.
          startColorL: 0.05,
          startColorC: 0.02,
          startColorH: 10.0,
          endColorL: 0.06,
          endColorC: 0.03,
          endColorH: 11.0,
          lCurveX1: 0.2,
          lCurveY1: 0.0,
          lCurveX2: 0.8,
          lCurveY2: 1.0,
          cCurveX1: 0.0,
          cCurveY1: 0.2,
          cCurveX2: 1.0,
          cCurveY2: 0.8,
          hCurveX1: 0.0,
          hCurveY1: 0.0,
          hCurveX2: 1.0,
          hCurveY2: 1.0,
          reverseHue: 0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-start', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'startColor' },
      { id: 'c3', sourceNodeId: 'n-end', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'endColor' },
      { id: 'c4', sourceNodeId: 'n-l', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'lCurve' },
      { id: 'c5', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'cCurve' },
      { id: 'c6', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'hCurve' },
      { id: 'c7', sourceNodeId: 'n-map', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** OKLCH smooth color map with start=end: isolates OKLCH-to-RGB conversion from interpolation. */
export function mvpOklchColorMapBezierSolidGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-oklch-color-map-bezier-solid',
    name: 'MVP OKLCH smooth color map solid',
    version: '2.0',
    nodes: [
      { id: 'n-v', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.5 } },
      { id: 'n-l', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-c', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      { id: 'n-h', type: 'bezier-curve', position: { x: 0, y: 0 }, parameters: { x1: 0.0, y1: 0.0, x2: 1.0, y2: 1.0 } },
      {
        id: 'n-map',
        type: 'oklch-color-map-bezier',
        position: { x: 0, y: 0 },
        parameters: {
          startColorL: 0.7,
          startColorC: 0.14,
          startColorH: 40.0,
          endColorL: 0.7,
          endColorC: 0.14,
          endColorH: 40.0,
          lCurveX1: 0.0,
          lCurveY1: 0.0,
          lCurveX2: 1.0,
          lCurveY2: 1.0,
          cCurveX1: 0.0,
          cCurveY1: 0.0,
          cCurveX2: 1.0,
          cCurveY2: 1.0,
          hCurveX1: 0.0,
          hCurveY1: 0.0,
          hCurveX2: 1.0,
          hCurveY2: 1.0,
          reverseHue: 0,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-v', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-l', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'lCurve' },
      { id: 'c3', sourceNodeId: 'n-c', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'cCurve' },
      { id: 'c4', sourceNodeId: 'n-h', sourcePort: 'out', targetNodeId: 'n-map', targetPort: 'hCurve' },
      { id: 'c5', sourceNodeId: 'n-map', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Distort batch: exercises new WGSL MVP UV-warp nodes (radial-uv-warp/displace/vortex chain/etc.). */
export function mvpDistortBatchGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-distort-batch',
    name: 'MVP distort batch',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-bulge',
        type: 'radial-uv-warp',
        position: { x: 0, y: 0 },
        parameters: {
          warpMode: 0,
          warpCenterX: 0.5,
          warpCenterY: 0.5,
          bulgeStrength: 0.35,
          bulgeRadius: 0.9,
          bulgeFalloff: 1.2,
          fisheyeStrength: -0.3,
          fisheyeAspect: 1,
          spherizeRadius: 1,
          spherizeStrength: 1,
        },
      },
      {
        id: 'n-fish',
        type: 'radial-uv-warp',
        position: { x: 0, y: 0 },
        parameters: {
          warpMode: 1,
          warpCenterX: 0.5,
          warpCenterY: 0.5,
          bulgeStrength: 0.5,
          bulgeRadius: 1,
          bulgeFalloff: 1,
          fisheyeStrength: -0.25,
          fisheyeAspect: 1.15,
          spherizeRadius: 1,
          spherizeStrength: 1,
        },
      },
      {
        id: 'n-dis',
        type: 'displace',
        position: { x: 0, y: 0 },
        parameters: {
          displaceMode: 0,
          displaceScale: 1.0,
          offsetX: 0.08,
          offsetY: -0.03,
          directionalDisplaceAngle: 0.0,
          amount: 0.6,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-vortex-a',
        type: 'vortex',
        position: { x: 0, y: 0 },
        parameters: {
          vortexCenterX: 0.5,
          vortexCenterY: 0.5,
          vortexStrength: 1.8,
          vortexRadius: 1.8,
          vortexFalloff: 1.0,
          vortexTimeSpeed: 0.25,
          vortexRadialPull: 0.0,
        },
      },
      {
        id: 'n-vortex',
        type: 'vortex',
        position: { x: 0, y: 0 },
        parameters: {
          vortexCenterX: 0.5,
          vortexCenterY: 0.5,
          vortexStrength: 1.2,
          vortexRadius: 1.6,
          vortexFalloff: 1.2,
          vortexTimeSpeed: 0.2,
          vortexRadialPull: 1.0,
        },
      },
      {
        id: 'n-sph',
        type: 'radial-uv-warp',
        position: { x: 0, y: 0 },
        parameters: {
          warpMode: 2,
          warpCenterX: 0.5,
          warpCenterY: 0.5,
          bulgeStrength: 0.5,
          bulgeRadius: 1,
          bulgeFalloff: 1,
          fisheyeStrength: -0.3,
          fisheyeAspect: 1,
          spherizeRadius: 0.95,
          spherizeStrength: 0.75,
        },
      },
      {
        id: 'n-quad',
        type: 'quad-warp',
        position: { x: 0, y: 0 },
        parameters: {
          quadCorner0X: 0.02,
          quadCorner0Y: 0.01,
          quadCorner1X: 0.98,
          quadCorner1Y: 0.03,
          quadCorner2X: 0.06,
          quadCorner2Y: 0.96,
          quadCorner3X: 0.94,
          quadCorner3Y: 0.98,
        },
      },
      {
        id: 'n-zoom',
        type: 'infinite-zoom',
        position: { x: 0, y: 0 },
        parameters: {
          infiniteZoomMotion: 0,
          infiniteZoomCenterX: 0.5,
          infiniteZoomCenterY: 0.5,
          infiniteZoomLoopPeriod: 12.0,
          infiniteZoomStep: 1.06,
          infiniteZoomDepth: 0.65
        },
      },
      {
        id: 'n-vf',
        type: 'vector-field',
        position: { x: 0, y: 0 },
        parameters: {
          vectorFieldFrequencyX: 4.0,
          vectorFieldFrequencyY: 2.0,
          vectorFieldFrequencyZ: 0.0,
          vectorFieldAmplitude: 1.0,
          vectorFieldRadialStrength: 8.0,
          vectorFieldHarmonicAmplitude: 1.0,
          vectorFieldComplexity: 6.0,
          vectorFieldDistanceContribution: 0.04,
          vectorFieldSpeed: 0.3,
          animationSpeed: 0.3,
        },
      },
      {
        id: 'n-turb',
        type: 'turbulence',
        position: { x: 0, y: 0 },
        parameters: { turbulenceScale: 1.5, turbulenceStrength: 0.6, turbulenceIterations: 3, turbulenceTimeSpeed: 8.0, turbulenceTimeOffset: 0.0 },
      },
      {
        id: 'n-kaleid',
        type: 'kaleidoscope',
        position: { x: 0, y: 0 },
        parameters: { kaleidCenterX: 0.5, kaleidCenterY: 0.5, kaleidSegments: 7, kaleidRotation: 0.2, kaleidEdgeSmooth: 0.05 },
      },
      { id: 'n-len', type: 'length', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bulge', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-bulge', sourcePort: 'out', targetNodeId: 'n-fish', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-fish', sourcePort: 'out', targetNodeId: 'n-dis', targetPort: 'in' },
      { id: 'c6', sourceNodeId: 'n-dis', sourcePort: 'out', targetNodeId: 'n-vortex-a', targetPort: 'in' },
      { id: 'c7', sourceNodeId: 'n-vortex-a', sourcePort: 'out', targetNodeId: 'n-vortex', targetPort: 'in' },
      { id: 'c8', sourceNodeId: 'n-vortex', sourcePort: 'out', targetNodeId: 'n-sph', targetPort: 'in' },
      { id: 'c9', sourceNodeId: 'n-sph', sourcePort: 'out', targetNodeId: 'n-quad', targetPort: 'in' },
      { id: 'c10', sourceNodeId: 'n-quad', sourcePort: 'out', targetNodeId: 'n-zoom', targetPort: 'in' },
      { id: 'c11', sourceNodeId: 'n-zoom', sourcePort: 'out', targetNodeId: 'n-vf', targetPort: 'in' },
      { id: 'c12', sourceNodeId: 'n-vf', sourcePort: 'out', targetNodeId: 'n-turb', targetPort: 'in' },
      { id: 'c13', sourceNodeId: 'n-turb', sourcePort: 'out', targetNodeId: 'n-kaleid', targetPort: 'in' },
      { id: 'c14', sourceNodeId: 'n-kaleid', sourcePort: 'out', targetNodeId: 'n-len', targetPort: 'in' },
      { id: 'c15', sourceNodeId: 'n-len', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Shape masks: shapes-2d + star-shape-2d (float outputs). */
export function mvpShapeMasksGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-shape-masks',
    name: 'MVP shape masks',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-shapes',
        type: 'shapes-2d',
        position: { x: 0, y: 0 },
        parameters: {
          shapeType: 1, // rounded box
          sizeX: 0.9,
          sizeY: 0.55,
          centerX: 0.5,
          centerY: 0.5,
          roundness: 0.18,
          rotation: 18,
          polygonSides: 6,
          superPower: 2.5,
          softness: 0.03,
          intensity: 1.0,
        },
      },
      {
        id: 'n-star',
        type: 'star-shape-2d',
        position: { x: 0, y: 0 },
        parameters: {
          style: 0,
          starCenterX: 0.5,
          starCenterY: 0.5,
          starPoints: 7,
          starInnerRadius: 0.12,
          starOuterRadius: 0.38,
          starRoundness: 0.7,
          starRotation: -20,
          starSoftness: 0.025,
          starIntensity: 1.0,
        },
      },
      { id: 'n-add', type: 'add', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-shapes', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-star', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-shapes', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'a' },
      { id: 'c4', sourceNodeId: 'n-star', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'b' },
      { id: 'c5', sourceNodeId: 'n-add', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Orbit camera: visualize ray direction mapped to 0..1. */
export function mvpOrbitCameraGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-orbit-camera',
    name: 'MVP orbit camera',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-cam',
        type: 'orbit-camera',
        position: { x: 0, y: 0 },
        parameters: {
          orbitRadius: 3.2,
          orbitSpeed: 0.35,
          targetX: 0.1,
          targetY: 0.0,
          targetZ: 0.0,
          inclination: 0.4,
          fovScale: 1.0,
        },
      },
      { id: 'n-half', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.5 } },
      { id: 'n-offset', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: 'n-mul', type: 'multiply', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-add', type: 'add', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-cam', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-cam', sourcePort: 'rd', targetNodeId: 'n-mul', targetPort: 'a' },
      { id: 'c3', sourceNodeId: 'n-half', sourcePort: 'out', targetNodeId: 'n-mul', targetPort: 'b' },
      { id: 'c4', sourceNodeId: 'n-mul', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'a' },
      { id: 'c5', sourceNodeId: 'n-offset', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'b' },
      { id: 'c6', sourceNodeId: 'n-add', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Look-at camera: visualize ray origin mapped to 0..1. */
export function mvpLookAtCameraGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-lookat-camera',
    name: 'MVP look-at camera',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-cam',
        type: 'look-at-camera',
        position: { x: 0, y: 0 },
        parameters: {
          posX: 0.3,
          posY: 0.15,
          posZ: -1.6,
          lookatX: 0.0,
          lookatY: 0.0,
          lookatZ: 0.8,
          zoom: 2.0,
        },
      },
      { id: 'n-half', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.25 } },
      { id: 'n-offset', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: 'n-mul', type: 'multiply', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-add', type: 'add', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-cam', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-cam', sourcePort: 'ro', targetNodeId: 'n-mul', targetPort: 'a' },
      { id: 'c3', sourceNodeId: 'n-half', sourcePort: 'out', targetNodeId: 'n-mul', targetPort: 'b' },
      { id: 'c4', sourceNodeId: 'n-mul', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'a' },
      { id: 'c5', sourceNodeId: 'n-offset', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'b' },
      { id: 'c6', sourceNodeId: 'n-add', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Sky dome: uv derived from fragment-coordinates / resolution. */
export function mvpSkyDomeGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-sky-dome',
    name: 'MVP sky dome',
    version: '2.0',
    nodes: [
      { id: 'n-frag', type: 'fragment-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-res', type: 'resolution', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-frag-split', type: 'split-vector', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-res-split', type: 'split-vector', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-div-x', type: 'divide', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-div-y', type: 'divide', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-uv', type: 'combine-vector', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-sky',
        type: 'sky-dome',
        position: { x: 0, y: 0 },
        // OKLCH triplets reproduce the legacy RGB defaults (zenith ~ (0.12, 0.20, 0.55),
        // horizon ~ (0.70, 0.74, 0.90)) so existing fixture coverage is preserved.
        parameters: {
          zenithL: 0.5964435928624869,
          zenithC: 0.11476754816171825,
          zenithH: 267.64874795646557,
          horizonL: 0.906443220643003,
          horizonC: 0.028120325199956643,
          horizonH: 273.8023221142671,
          horizonSharpness: 0.6,
          sunDirX: 0.2,
          sunDirY: 0.9,
          sunDirZ: -0.4,
          sunRadius: 0.03,
          sunIntensity: 1.2,
          fov: 90.0,
          viewYaw: 0.0,
          viewPitch: 0.0,
          viewRoll: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-frag', sourcePort: 'out', targetNodeId: 'n-frag-split', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-res', sourcePort: 'out', targetNodeId: 'n-res-split', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-frag-split', sourcePort: 'x', targetNodeId: 'n-div-x', targetPort: 'a' },
      { id: 'c4', sourceNodeId: 'n-res-split', sourcePort: 'x', targetNodeId: 'n-div-x', targetPort: 'b' },
      { id: 'c5', sourceNodeId: 'n-frag-split', sourcePort: 'y', targetNodeId: 'n-div-y', targetPort: 'a' },
      { id: 'c6', sourceNodeId: 'n-res-split', sourcePort: 'y', targetNodeId: 'n-div-y', targetPort: 'b' },
      { id: 'c7', sourceNodeId: 'n-div-x', sourcePort: 'out', targetNodeId: 'n-uv', targetPort: 'x' },
      { id: 'c8', sourceNodeId: 'n-div-y', sourcePort: 'out', targetNodeId: 'n-uv', targetPort: 'y' },
      { id: 'c9', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-sky', targetPort: 'in' },
      { id: 'c10', sourceNodeId: 'n-sky', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Lighting: spatial shading from a constant luminance input. */
export function mvpLightingShadingGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-lighting-shading',
    name: 'MVP lighting shading',
    version: '2.0',
    nodes: [
      { id: 'n-in', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.75, y: 0.0, z: 0.0, w: 1.0 } },
      {
        id: 'n-light',
        type: 'lighting-shading',
        position: { x: 0, y: 0 },
        parameters: {
          lightType: 0,
          lightDirX: 0.2,
          lightDirY: 0.4,
          lightDirZ: 1.0,
          lightPosX: 2.0,
          lightPosY: 2.0,
          lightPosZ: 3.0,
          lightIntensity: 1.0,
          lightAmbient: 0.22,
          lightFalloff: 1.0,
          lightColorR: 1.0,
          lightColorG: 0.95,
          lightColorB: 0.9,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-in', sourcePort: 'out', targetNodeId: 'n-light', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-light', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Normal mapping: spatial response from a constant height input. */
export function mvpNormalMappingGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-normal-mapping',
    name: 'MVP normal mapping',
    version: '2.0',
    nodes: [
      { id: 'n-in', type: 'constant-vec4', position: { x: 0, y: 0 }, parameters: { x: 0.65, y: 0.0, z: 0.0, w: 1.0 } },
      {
        id: 'n-nm',
        type: 'normal-mapping',
        position: { x: 0, y: 0 },
        parameters: {
          normalScale: 6.0,
          normalStrength: 0.7,
          normalLightX: 0.4,
          normalLightY: 0.6,
          normalLightZ: 1.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-in', sourcePort: 'out', targetNodeId: 'n-nm', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-nm', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Spherical Fibonacci: visualize nearest lattice direction mapped to 0..1. */
export function mvpSphericalFibonacciGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-spherical-fibonacci',
    name: 'MVP spherical fibonacci',
    version: '2.0',
    nodes: [
      { id: 'n-dir', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.2, y: 0.8, z: 0.55 } },
      { id: 'n-idx', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 123.0 } },
      {
        id: 'n-sf',
        type: 'spherical-fibonacci',
        position: { x: 0, y: 0 },
        parameters: {
          latticeCount: 256,
          directionX: 0,
          directionY: 0,
          directionZ: 1,
          indexInput: 0,
        },
      },
      { id: 'n-half', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.5 } },
      { id: 'n-offset', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.5, y: 0.5, z: 0.5 } },
      { id: 'n-mul', type: 'multiply', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-add', type: 'add', position: { x: 0, y: 0 }, parameters: { b: 0.0 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-dir', sourcePort: 'out', targetNodeId: 'n-sf', targetPort: 'direction' },
      { id: 'c2', sourceNodeId: 'n-idx', sourcePort: 'out', targetNodeId: 'n-sf', targetPort: 'index' },
      { id: 'c3', sourceNodeId: 'n-sf', sourcePort: 'nearestPoint', targetNodeId: 'n-mul', targetPort: 'a' },
      { id: 'c4', sourceNodeId: 'n-half', sourcePort: 'out', targetNodeId: 'n-mul', targetPort: 'b' },
      { id: 'c5', sourceNodeId: 'n-mul', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'a' },
      { id: 'c6', sourceNodeId: 'n-offset', sourcePort: 'out', targetNodeId: 'n-add', targetPort: 'b' },
      { id: 'c7', sourceNodeId: 'n-add', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Bloom Sphere: uv -> bloom-sphere -> final-output (exercises OKLCH conversion + lattice loop). */
export function mvpBloomSphereGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bloom-sphere',
    name: 'MVP bloom sphere',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-bloom',
        type: 'bloom-sphere',
        position: { x: 0, y: 0 },
        parameters: {
          mode: 0,
          bloomCenterX: 0.0,
          bloomCenterY: 0.0,
          sphereRadius: 1.0,
          spotCount: 96,
          baseSpotAngle: 0.25,
          waveSpeed: 2.0,
          wavePhase: 0.4,
          waveDetuneFreq: 2.0,
          waveDetuneAmp: 0.25,
          indexPhaseScale: 0.12,
          latticeSpinSpeed: 0.2,
          waveAmplitude: 0.12,
          spotSoftness: 0.08,
          outerL: 0.7391552434772553,
          outerC: 0.09253691178218687,
          outerH: 296.59265191815484,
          innerL: 0.7236677864677247,
          innerC: 0.20734208593918924,
          innerH: 27.587637681632806,
          brightness: 1.0,
          classicSpotSharpness: 12.0,
          classicOuterGlowR: 0.2,
          classicOuterGlowG: 0.4,
          classicOuterGlowB: 0.9,
          classicInnerGlowR: 0.9,
          classicInnerGlowG: 0.2,
          classicInnerGlowB: 0.2,
        },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-bloom', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-bloom', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Noise/pattern batch: two Cells (voronoi) variants + cubic curl + warp terrain. */
export function mvpPatternNoiseBatchGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-pattern-noise-batch',
    name: 'MVP pattern noise batch',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-voronoi',
        type: 'voronoi-noise',
        position: { x: 0, y: 0 },
        parameters: {
          voronoiScale: 4.0,
          voronoiJitter: 1.0,
          voronoiDistanceMetric: 0,
          voronoiDriftDirection: 56.0,
          voronoiDriftAmount: 0.18,
          voronoiAnimationMode: 0,
          voronoiRotationSpeed: 30.0,
          voronoiTimeSpeed: 0.5,
          voronoiIntensity: 0.8,
          voronoiTimeOffset: 0.0,
          voronoiOutputMode: 2,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-cells-b',
        type: 'voronoi-noise',
        position: { x: 0, y: 0 },
        parameters: {
          voronoiScale: 3.0,
          voronoiJitter: 1.0,
          voronoiDistanceMetric: 0,
          voronoiDriftDirection: LEGACY_WORLEY_DRIFT_DIRECTION_DEG,
          voronoiDriftAmount: LEGACY_WORLEY_DRIFT_AMOUNT,
          voronoiAnimationMode: 0,
          voronoiRotationSpeed: 30.0,
          voronoiTimeSpeed: 0.6,
          voronoiIntensity: 0.8,
          voronoiTimeOffset: 0.0,
          voronoiOutputMode: 1,
        },
        parameterInputModes: {},
      },
      {
        id: 'n-curl',
        type: 'cubic-curl-noise',
        position: { x: 0, y: 0 },
        parameters: { cubicCurlScale: 2.0, cubicCurlTimeSpeed: 1.0, cubicCurlTimeOffset: 0.0, cubicCurlIntensity: 0.9 },
      },
      { id: 'n-mix', type: 'mix', position: { x: 0, y: 0 }, parameters: { a: 0.0, b: 1.0, t: 0.5 }, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },

      // vec4 output test
      {
        id: 'n-warp',
        type: 'warp-terrain',
        position: { x: 0, y: 0 },
        parameters: {
          warpTerrainScale: 0.75,
          warpTimeSpeed: 1.0,
          warpTerrainRidge: 1.0,
          warpTerrainBump: 1.0
        },
      },
      { id: 'n-out2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-voronoi', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-cells-b', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-curl', targetPort: 'in' },
      { id: 'c4', sourceNodeId: 'n-voronoi', sourcePort: 'out', targetNodeId: 'n-mix', targetPort: 'a' },
      { id: 'c5', sourceNodeId: 'n-cells-b', sourcePort: 'out', targetNodeId: 'n-mix', targetPort: 'b' },
      { id: 'c6', sourceNodeId: 'n-curl', sourcePort: 'out', targetNodeId: 'n-mix', targetPort: 't' },
      { id: 'c7', sourceNodeId: 'n-mix', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },

      { id: 'c8', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-warp', targetPort: 'in' },
      { id: 'c9', sourceNodeId: 'n-warp', sourcePort: 'out', targetNodeId: 'n-out2', targetPort: 'in' },
    ],
  };
}

/** Bokeh point: exercises vec3 inputs + cross/length/smoothstep. */
export function mvpBokehPointGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-bokeh-point',
    name: 'MVP bokeh point',
    version: '2.0',
    nodes: [
      { id: 'n-ro', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.0, y: 0.0, z: 2.0 } },
      { id: 'n-rd', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.0, y: 0.0, z: -1.0 } },
      { id: 'n-pt', type: 'constant-vec3', position: { x: 0, y: 0 }, parameters: { x: 0.25, y: 0.1, z: 0.0 } },
      {
        id: 'n-bokeh',
        type: 'bokeh-point',
        position: { x: 0, y: 0 },
        parameters: { size: 0.08, blur: 0.25, highQuality: 1 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-ro', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'ro' },
      { id: 'c2', sourceNodeId: 'n-rd', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'rd' },
      { id: 'c3', sourceNodeId: 'n-pt', sourcePort: 'out', targetNodeId: 'n-bokeh', targetPort: 'point' },
      { id: 'c4', sourceNodeId: 'n-bokeh', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Plane grid: exercises branching + helper functions. */
export function mvpPlaneGridGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-plane-grid',
    name: 'MVP plane grid',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-grid',
        type: 'plane-grid',
        position: { x: 0, y: 0 },
        parameters: {
          planeType: 1,
          planeScale: 2.5,
          planeSpacing: 0.5,
          planeLineWidth: 0.009,
          planeIntensity: 1.0,
          planeRotation: 15.0,
          planeNormalX: 0.0,
          planeNormalY: 1.0,
          planeNormalZ: 0.0,
          planeHeight: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-grid', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-grid', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Fractal: bounded procedural iteration from UV to scalar output. */
export function mvpFractalGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-fractal',
    name: 'MVP fractal',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-fractal',
        type: 'fractal',
        position: { x: 0, y: 0 },
        parameters: {
          fractalIntensity: 0.9,
          fractalLayers: 2.2,
          fractalIterations: 6,
          fractalTimeOffset: 0.25,
          fractalAnimationSpeed: 0.4,
          fractalRotationSpeed: 0.35,
          fractalLayerPhase: 0.12,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-fractal', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-fractal', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Iterated inversion: bounded orbit/inversion loop to vec3 color. */
export function mvpIteratedInversionGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-iterated-inversion',
    name: 'MVP iterated inversion',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-inv',
        type: 'iterated-inversion',
        position: { x: 0, y: 0 },
        parameters: {
          iteratedInversionIterations: 12,
          iteratedInversionTimeSpeed: 1,
          iteratedInversionTwist: 0,
          iteratedInversionOrbitRadius: 0.2,
          iteratedInversionScale: 2,
          iteratedInversionPanX: -1.3,
          iteratedInversionPanY: -1.3,
          iteratedInversionBlobStrength: 2,
          iteratedInversionBlobSharpness: 6.5,
          iteratedInversionHueOffset: 0.9,
          iteratedInversionHueSpread: 0.05,
          iteratedInversionHueAngle: 0.35,
          iteratedInversionExposure: 2,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-inv', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-inv', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Iridescent tunnel: vec4 volumetric output -> final-output (alpha dropped like WebGL). */
export function mvpIridescentTunnelGraph(): NodeGraph {
  const a = linearRgbToOklch(0.2, 0.4, 0.9);
  const b = linearRgbToOklch(0.9, 0.3, 0.5);
  return {
    id: 'fixture-mvp-iridescent-tunnel',
    name: 'MVP iridescent tunnel',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-tun',
        type: 'iridescent-tunnel',
        position: { x: 0, y: 0 },
        parameters: {
          colorAL: a.l,
          colorAC: a.c,
          colorAH: a.h,
          colorBL: b.l,
          colorBC: b.c,
          colorBH: b.h,
          repetitionScale: 0.35,
          tubeRadius: 0.11,
          warpFreq: 4.0,
          warpStrength: 0.07,
          cameraSpeed: 0.45,
          rotateSpeed: 0.25,
          raymarchSteps: 56,
          densityScale: 1.0,
          iridescenceMix: 0.65,
          iridescenceShift: 0.55,
          fovScale: 1.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-tun', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-tun', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Inflated icosahedron raymarch (WGSL MVP fingerprint; defaults match node spec). */
export function mvpInflatedIcosahedronGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-inflated-icosahedron',
    name: 'MVP inflated icosahedron',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-ico',
        type: 'inflated-icosahedron',
        position: { x: 0, y: 0 },
        parameters: {
          timeScale: 1.0,
          twistAmount: 5.5,
          seamlessLoop: 1,
          raymarchSteps: 100,
          orbitRadius: 3.3,
          orbitSpeed: 0.5,
          brightness: 1.0,
          bgInnerL: 0.9319210526768515,
          bgInnerC: 0.01656867539003518,
          bgInnerH: 286.07385464934896,
          bgOuterL: 0.7806235084475901,
          bgOuterC: 0.045073781186323464,
          bgOuterH: 243.59027913347347,
          bgFalloff: 1.5,
          paletteHue: 0,
          shapeSize: 1.0,
          lightAngle: 0,
          contrast: 1.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ico', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-ico', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Bounded generic-raymarcher + hex-prism-sdf (pilot SDF allow-list compile fingerprint). */
export function mvpGenericRaymarcherHexPrismGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-hex-prism',
    name: 'MVP generic raymarcher hex prism',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-prism', type: 'hex-prism-sdf', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-prism',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + sphere-raymarch SDF (matches NodeShaderCompiler.test.ts GRM wiring). */
export function mvpGenericRaymarcherSphereRaymarchGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-sphere-raymarch',
    name: 'MVP generic raymarcher sphere raymarch',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-sr', type: 'sphere-raymarch', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-sr', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-sr',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + metaballs (implicit SDF pilot fingerprint). */
export function mvpGenericRaymarcherMetaballsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-metaballs',
    name: 'MVP generic raymarcher metaballs',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-meta',
        type: 'metaballs',
        position: { x: 0, y: 0 },
        parameters: { blobCount: 4, blobRadius: 0.25, threshold: 4.0 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      { id: 'c0', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-meta', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-meta',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + box-torus-sdf. */
export function mvpGenericRaymarcherBoxTorusGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-box-torus',
    name: 'MVP generic raymarcher box torus',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-btt',
        type: 'box-torus-sdf',
        position: { x: 0, y: 0 },
        parameters: { primitiveType: 0 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-btt',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + repeated-hex-prism-sdf (matches NodeShaderCompiler GRM wiring). */
export function mvpGenericRaymarcherRepeatedHexPrismGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-repeated-hex-prism',
    name: 'MVP generic raymarcher repeated hex prism',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-prism',
        type: 'repeated-hex-prism-sdf',
        position: { x: 0, y: 0 },
        parameters: { spacingX: 2.5, spacingY: 2.5, spacingZ: 2.5, hexRadius: 0.35, halfHeight: 1.2 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-prism',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + radial-repeat-sdf (matches NodeShaderCompiler GRM wiring). */
export function mvpGenericRaymarcherRadialRepeatGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-radial-repeat',
    name: 'MVP generic raymarcher radial repeat',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-rad',
        type: 'radial-repeat-sdf',
        position: { x: 0, y: 0 },
        parameters: { shellSpacing: 3.5, ringPhase: 0.5 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-rad',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + ether-sdf (matches NodeShaderCompiler GRM wiring). */
export function mvpGenericRaymarcherEtherSdfGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-ether-sdf',
    name: 'MVP generic raymarcher ether sdf',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-ether',
        type: 'ether-sdf',
        position: { x: 0, y: 0 },
        parameters: {
          rotSpeedXZ: 0.4,
          rotSpeedXY: 0.3,
          scale: 2.0,
          timeSpeed: 1.0,
          timeOffset: 0.0,
          wobbleSpeed: 0.7,
          sineAmp: 5.5,
          breatheAmount: 0.0,
          breatheSpeed: 0.7,
          positionX: 0.0,
          positionY: 0.0,
          positionZ: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-ether',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + kifs-sdf (matches NodeShaderCompiler GRM wiring). */
export function mvpGenericRaymarcherKifsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-kifs',
    name: 'MVP generic raymarcher kifs',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-kifs',
        type: 'kifs-sdf',
        position: { x: 0, y: 0 },
        parameters: {
          scale: 1.3,
          offsetX: -0.5,
          offsetY: -1.2,
          offsetZ: 0.0,
          rotationAxisX: 0.0,
          rotationAxisY: 1.0,
          rotationAxisZ: 0.0,
          rotationAngle: 0.4,
          iterations: 10,
          sphereRadius: 0.12,
          positionX: 0.0,
          positionY: 0.0,
          positionZ: 0.0,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      {
        id: 'c2',
        sourceNodeId: 'n-kifs',
        sourcePort: 'out',
        targetNodeId: 'n-ray',
        targetPort: 'sdf',
      },
      {
        id: 'c4',
        sourceNodeId: 'n-ray',
        sourcePort: 'out',
        targetNodeId: 'n-out',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + menger-sponge-sdf (matches NodeShaderCompiler.test.ts GRM wiring). */
export function mvpGenericRaymarcherMengerSpongeGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-menger-sponge',
    name: 'MVP generic raymarcher menger sponge',
    version: '2.0',
    nodes: [
      { id: 'n-uv-ms', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-menger',
        type: 'menger-sponge-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 2, domainScale: 1.0, deFudge: 0.2 },
      },
      { id: 'n-ray-ms', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-ms', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'm1', sourceNodeId: 'n-uv-ms', sourcePort: 'out', targetNodeId: 'n-ray-ms', targetPort: 'in' },
      {
        id: 'm2',
        sourceNodeId: 'n-menger',
        sourcePort: 'out',
        targetNodeId: 'n-ray-ms',
        targetPort: 'sdf',
      },
      {
        id: 'm3',
        sourceNodeId: 'n-ray-ms',
        sourcePort: 'color',
        targetNodeId: 'n-out-ms',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + mandelbox-sdf (matches NodeShaderCompiler.test.ts GRM wiring). */
export function mvpGenericRaymarcherMandelboxGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-mandelbox',
    name: 'MVP generic raymarcher mandelbox',
    version: '2.0',
    nodes: [
      { id: 'n-uv-mbox', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-mandelbox',
        type: 'mandelbox-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 8, scale: -2.0, foldingLimit: 1.0, minRadius: 0.25 },
      },
      { id: 'n-ray-mbox', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-mbox', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'b1', sourceNodeId: 'n-uv-mbox', sourcePort: 'out', targetNodeId: 'n-ray-mbox', targetPort: 'in' },
      {
        id: 'b2',
        sourceNodeId: 'n-mandelbox',
        sourcePort: 'out',
        targetNodeId: 'n-ray-mbox',
        targetPort: 'sdf',
      },
      {
        id: 'b3',
        sourceNodeId: 'n-ray-mbox',
        sourcePort: 'color',
        targetNodeId: 'n-out-mbox',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + sierpinski-tetra-sdf (matches NodeShaderCompiler.test.ts GRM wiring). */
export function mvpGenericRaymarcherSierpinskiTetraGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-sierpinski-tetra',
    name: 'MVP generic raymarcher sierpinski tetra',
    version: '2.0',
    nodes: [
      { id: 'n-uv-st', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 4, scale: 2.0, coreRadius: 0.1 },
      },
      { id: 'n-ray-st', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-st', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 's1', sourceNodeId: 'n-uv-st', sourcePort: 'out', targetNodeId: 'n-ray-st', targetPort: 'in' },
      {
        id: 's2',
        sourceNodeId: 'n-stetra',
        sourcePort: 'out',
        targetNodeId: 'n-ray-st',
        targetPort: 'sdf',
      },
      {
        id: 's3',
        sourceNodeId: 'n-ray-st',
        sourcePort: 'color',
        targetNodeId: 'n-out-st',
        targetPort: 'in',
      },
    ],
  };
}

/** Bounded generic-raymarcher + julia-slab-sdf with wired xyScale (matches NodeShaderCompiler.test.ts GRM wiring). */
export function mvpGenericRaymarcherJuliaSlabGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-julia-slab',
    name: 'MVP generic raymarcher julia slab',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-const-julia', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 2.25 } },
      { id: 'n-julia', type: 'julia-slab-sdf', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-ray-julia', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-julia', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'j1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray-julia', targetPort: 'in' },
      {
        id: 'j2',
        sourceNodeId: 'n-julia',
        sourcePort: 'out',
        targetNodeId: 'n-ray-julia',
        targetPort: 'sdf',
      },
      {
        id: 'j3',
        sourceNodeId: 'n-const-julia',
        sourcePort: 'out',
        targetNodeId: 'n-julia',
        targetParameter: 'xyScale',
      },
      {
        id: 'j4',
        sourceNodeId: 'n-ray-julia',
        sourcePort: 'color',
        targetNodeId: 'n-out-julia',
        targetPort: 'in',
      },
    ],
  };
}

/**
 * Bounded generic-raymarcher + ether-sdf + displacement-3d with wired timeOffset
 * (matches `buildGenericRaymarcherWithDisplacementGraph` in NodeShaderCompiler.test.ts).
 */
export function mvpGenericRaymarcherDisplacementGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-displacement',
    name: 'MVP generic raymarcher displacement',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-const', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 0.25 } },
      { id: 'n-ether', type: 'ether-sdf', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-disp', type: 'displacement-3d', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-ray',
        type: 'generic-raymarcher',
        position: { x: 0, y: 0 },
        parameters: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'd1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'in' },
      { id: 'd2', sourceNodeId: 'n-ether', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'sdf' },
      { id: 'd3', sourceNodeId: 'n-disp', sourcePort: 'out', targetNodeId: 'n-ray', targetPort: 'displacement' },
      {
        id: 'd4',
        sourceNodeId: 'n-const',
        sourcePort: 'out',
        targetNodeId: 'n-disp',
        targetParameter: 'timeOffset',
      },
      { id: 'd5', sourceNodeId: 'n-ray', sourcePort: 'color', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/**
 * Bounded generic-raymarcher + sierpinski-tetra-sdf with constant-float wired to `scale`
 * (matches NodeShaderCompiler.test.ts `uses constant-float output for sierpinski-tetra-sdf.scale…`).
 */
export function mvpGenericRaymarcherSierpinskiTetraScaleWireGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-stetra-scale-wire',
    name: 'MVP generic raymarcher stetra scale wire',
    version: '2.0',
    nodes: [
      { id: 'n-uv-st2', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-const-st2', type: 'constant-float', position: { x: 0, y: 0 }, parameters: { value: 2.2 } },
      {
        id: 'n-stetra2',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3 },
      },
      { id: 'n-ray-st2', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-st2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'w1', sourceNodeId: 'n-uv-st2', sourcePort: 'out', targetNodeId: 'n-ray-st2', targetPort: 'in' },
      { id: 'w2', sourceNodeId: 'n-stetra2', sourcePort: 'out', targetNodeId: 'n-ray-st2', targetPort: 'sdf' },
      {
        id: 'w3',
        sourceNodeId: 'n-const-st2',
        sourcePort: 'out',
        targetNodeId: 'n-stetra2',
        targetParameter: 'scale',
      },
      { id: 'w4', sourceNodeId: 'n-ray-st2', sourcePort: 'color', targetNodeId: 'n-out-st2', targetPort: 'in' },
    ],
  };
}

/**
 * Bounded generic-raymarcher + sierpinski-tetra-sdf with a virtual audio remap
 * driving `sierpinski-tetra-sdf.scale` (mirrors `NodeShaderCompiler.test.ts`
 * "uses audio uniform for sierpinski-tetra-sdf.scale…"). Smallest WebGPU MVP
 * fixture that exercises audio-driven WGSL parameter wiring through a GRM
 * SDF call site.
 */
const MVP_STETRA_AUDIO_REMAPPER_ID = 'mvp-stetra-audio-scale';
const MVP_STETRA_AUDIO_BAND_ID = 'band-mvp-stetra-audio';

export function mvpGenericRaymarcherSierpinskiTetraScaleAudioGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-generic-raymarcher-stetra-scale-audio',
    name: 'MVP generic raymarcher stetra scale audio',
    version: '2.0',
    nodes: [
      { id: 'n-uv-sta', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra-audio',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3, scale: 2.0 },
      },
      { id: 'n-ray-sta', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-out-sta', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'sa1', sourceNodeId: 'n-uv-sta', sourcePort: 'out', targetNodeId: 'n-ray-sta', targetPort: 'in' },
      { id: 'sa2', sourceNodeId: 'n-stetra-audio', sourcePort: 'out', targetNodeId: 'n-ray-sta', targetPort: 'sdf' },
      {
        id: 'sa3',
        sourceNodeId: `audio-signal:remap-${MVP_STETRA_AUDIO_REMAPPER_ID}`,
        sourcePort: 'out',
        targetNodeId: 'n-stetra-audio',
        targetParameter: 'scale',
      },
      { id: 'sa4', sourceNodeId: 'n-ray-sta', sourcePort: 'color', targetNodeId: 'n-out-sta', targetPort: 'in' },
    ],
  };
}

/** Audio setup paired with {@link mvpGenericRaymarcherSierpinskiTetraScaleAudioGraph}. */
export function mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup(): AudioSetup {
  return {
    files: [],
    bands: [
      {
        id: MVP_STETRA_AUDIO_BAND_ID,
        name: 'MVP STetra Audio Band',
        sourceFileId: 'mvp-stetra-audio-file',
        frequencyBands: [[0, 1000]],
        smoothingHalfLifeSeconds: 1 / 120,
        fftSize: 4096,
      },
    ],
    remappers: [
      {
        id: MVP_STETRA_AUDIO_REMAPPER_ID,
        name: 'MVP STetra Audio Remap',
        bandId: MVP_STETRA_AUDIO_BAND_ID,
        inMin: 0,
        inMax: 1,
        outMin: 1.5,
        outMax: 2.5,
      },
    ],
  };
}

/**
 * Same audio remap + GRM stetra stack as
 * {@link mvpGenericRaymarcherSierpinskiTetraScaleAudioGraph}, with a blur stage
 * before `final-output` (`blurAmount` 0 matches {@link mvpBlurPassPlanGraph}).
 * Exercises audio param wiring together with the Gaussian blur pass-plan compile path.
 */
export function mvpAudioBlurPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-audio-blur-passplan',
    name: 'MVP audio blur pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv-stab', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra-ab',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3, scale: 2.0 },
      },
      { id: 'n-ray-stab', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-blur-stab',
        type: 'blur',
        position: { x: 0, y: 0 },
        parameters: {
          blurAmount: 0.0,
          blurRadius: 6.0,
          blurType: 0,
          blurDirection: 45.0,
          blurCenterX: 0.0,
          blurCenterY: 0.0,
        },
      },
      { id: 'n-out-stab', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'ab1', sourceNodeId: 'n-uv-stab', sourcePort: 'out', targetNodeId: 'n-ray-stab', targetPort: 'in' },
      { id: 'ab2', sourceNodeId: 'n-stetra-ab', sourcePort: 'out', targetNodeId: 'n-ray-stab', targetPort: 'sdf' },
      {
        id: 'ab3',
        sourceNodeId: `audio-signal:remap-${MVP_STETRA_AUDIO_REMAPPER_ID}`,
        sourcePort: 'out',
        targetNodeId: 'n-stetra-ab',
        targetParameter: 'scale',
      },
      { id: 'ab4', sourceNodeId: 'n-ray-stab', sourcePort: 'color', targetNodeId: 'n-blur-stab', targetPort: 'in' },
      { id: 'ab5', sourceNodeId: 'n-blur-stab', sourcePort: 'out', targetNodeId: 'n-out-stab', targetPort: 'in' },
    ],
  };
}

/**
 * Same graph as {@link mvpAudioBlurPassPlanGraph} with nonzero `blurAmount` on the blur node so the
 * Gaussian separable pass-plan path exercises blur strength (not only pass-plan wiring at amount 0).
 */
export function mvpAudioBlurPassPlanNonzeroBlurGraph(): NodeGraph {
  const base = mvpAudioBlurPassPlanGraph();
  return {
    ...base,
    id: 'fixture-mvp-audio-blur-passplan-nz',
    name: 'MVP audio blur pass plan (nonzero blur)',
    nodes: base.nodes.map((n) =>
      n.id === 'n-blur-stab'
        ? {
            ...n,
            parameters: {
              ...(n.parameters as Record<string, number>),
              blurAmount: 0.35,
            },
          }
        : n
    ),
  };
}

/**
 * Same audio remap + GRM stetra stack as {@link mvpAudioBlurPassPlanGraph}, with glow-bloom before
 * `final-output` (parameters aligned with {@link mvpGlowBloomPassPlanGraph}). Exercises audio param
 * wiring with the glow-bloom pass-plan compile path.
 */
export function mvpAudioGlowBloomPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-audio-glow-bloom-passplan',
    name: 'MVP audio glow-bloom pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv-stgb', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra-gb',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3, scale: 2.0 },
      },
      { id: 'n-ray-stgb', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-glow-stgb',
        type: 'glow-bloom',
        position: { x: 0, y: 0 },
        parameters: {
          glowThreshold: 0.45,
          glowIntensity: 1.4,
          glowRadius: 5.0,
          glowStrength: 0.65,
        },
      },
      { id: 'n-out-stgb', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'gb1', sourceNodeId: 'n-uv-stgb', sourcePort: 'out', targetNodeId: 'n-ray-stgb', targetPort: 'in' },
      { id: 'gb2', sourceNodeId: 'n-stetra-gb', sourcePort: 'out', targetNodeId: 'n-ray-stgb', targetPort: 'sdf' },
      {
        id: 'gb3',
        sourceNodeId: `audio-signal:remap-${MVP_STETRA_AUDIO_REMAPPER_ID}`,
        sourcePort: 'out',
        targetNodeId: 'n-stetra-gb',
        targetParameter: 'scale',
      },
      { id: 'gb4', sourceNodeId: 'n-ray-stgb', sourcePort: 'color', targetNodeId: 'n-glow-stgb', targetPort: 'in' },
      { id: 'gb5', sourceNodeId: 'n-glow-stgb', sourcePort: 'out', targetNodeId: 'n-out-stgb', targetPort: 'in' },
    ],
  };
}

/**
 * Same audio remap + GRM stetra stack as {@link mvpAudioGlowBloomPassPlanGraph}, with bokeh before
 * `final-output` (parameters aligned with {@link mvpBokehPassPlanGraph}).
 */
export function mvpAudioBokehPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-audio-bokeh-passplan',
    name: 'MVP audio bokeh pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv-stbk', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra-bk',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3, scale: 2.0 },
      },
      { id: 'n-ray-stbk', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-bokeh-stbk',
        type: 'bokeh',
        position: { x: 0, y: 0 },
        parameters: {
          bokehThreshold: 0.35,
          bokehIntensity: 1.0,
          bokehRadius: 14.0,
          bokehStrength: 1.0,
          bokehBlades: 6,
          bokehRotation: 15.0,
        },
      },
      { id: 'n-out-stbk', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'bk1', sourceNodeId: 'n-uv-stbk', sourcePort: 'out', targetNodeId: 'n-ray-stbk', targetPort: 'in' },
      { id: 'bk2', sourceNodeId: 'n-stetra-bk', sourcePort: 'out', targetNodeId: 'n-ray-stbk', targetPort: 'sdf' },
      {
        id: 'bk3',
        sourceNodeId: `audio-signal:remap-${MVP_STETRA_AUDIO_REMAPPER_ID}`,
        sourcePort: 'out',
        targetNodeId: 'n-stetra-bk',
        targetParameter: 'scale',
      },
      { id: 'bk4', sourceNodeId: 'n-ray-stbk', sourcePort: 'color', targetNodeId: 'n-bokeh-stbk', targetPort: 'in' },
      { id: 'bk5', sourceNodeId: 'n-bokeh-stbk', sourcePort: 'out', targetNodeId: 'n-out-stbk', targetPort: 'in' },
    ],
  };
}

/**
 * Same audio remap + GRM stetra stack as {@link mvpAudioGlowBloomPassPlanGraph}, with crepuscular-rays
 * before `final-output` (parameters aligned with {@link mvpCrepuscularRaysPassPlanGraph}).
 */
export function mvpAudioCrepuscularRaysPassPlanGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-audio-crepuscular-rays-passplan',
    name: 'MVP audio crepuscular rays pass plan',
    version: '2.0',
    nodes: [
      { id: 'n-uv-stcr', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-stetra-cr',
        type: 'sierpinski-tetra-sdf',
        position: { x: 0, y: 0 },
        parameters: { iterations: 3, scale: 2.0 },
      },
      { id: 'n-ray-stcr', type: 'generic-raymarcher', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-crep-stcr',
        type: 'crepuscular-rays',
        position: { x: 0, y: 0 },
        parameters: {
          sourceX: 0.3,
          sourceY: 0.2,
          rayCount: 16,
          spread: 360.0,
          width: 0.06,
          distanceFalloff: 1.0,
          intensity: 1.4,
          rotationSpeed: 0.0,
          rotationOffset: 0.0,
        },
      },
      { id: 'n-out-stcr', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'cr1', sourceNodeId: 'n-uv-stcr', sourcePort: 'out', targetNodeId: 'n-ray-stcr', targetPort: 'in' },
      { id: 'cr2', sourceNodeId: 'n-stetra-cr', sourcePort: 'out', targetNodeId: 'n-ray-stcr', targetPort: 'sdf' },
      {
        id: 'cr3',
        sourceNodeId: `audio-signal:remap-${MVP_STETRA_AUDIO_REMAPPER_ID}`,
        sourcePort: 'out',
        targetNodeId: 'n-stetra-cr',
        targetParameter: 'scale',
      },
      { id: 'cr4', sourceNodeId: 'n-ray-stcr', sourcePort: 'color', targetNodeId: 'n-crep-stcr', targetPort: 'in' },
      { id: 'cr5', sourceNodeId: 'n-crep-stcr', sourcePort: 'out', targetNodeId: 'n-out-stcr', targetPort: 'in' },
    ],
  };
}

/** Minimal edge-detection fingerprint (inline WGSL). */
export function mvpEdgeDetectionGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-edge-detection',
    name: 'MVP edge detection',
    version: '2.0',
    nodes: [
      {
        id: 'n-const',
        type: 'constant-vec4',
        position: { x: 0, y: 0 },
        parameters: { x: 0.4, y: 0.2, z: 0.1, w: 1.0 },
      },
      {
        id: 'n-edge',
        type: 'edge-detection',
        position: { x: 0, y: 0 },
        parameters: { edgeThreshold: 0.5, edgeWidth: 0.02, edgeIntensity: 1.25, edgeStrength: 0.75 },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-const', sourcePort: 'out', targetNodeId: 'n-edge', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-edge', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Minimal volume-rays fingerprint (bounded ray accumulation). */
export function mvpVolumeRaysGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-volume-rays',
    name: 'MVP volume rays',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-x', type: 'volume-rays', position: { x: 0, y: 0 }, parameters: {}, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-x', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-x', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Minimal particle-system fingerprint (cell hash field). */
export function mvpParticleSystemGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-particle-system',
    name: 'MVP particle system',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n-p', type: 'particle-system', position: { x: 0, y: 0 }, parameters: {}, parameterInputModes: {} },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-p', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-p', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Glass shell: outer refract → inner bounded march fingerprint. */
export function mvpGlassShellGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-glass-shell',
    name: 'MVP glass shell',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-shell',
        type: 'glass-shell',
        position: { x: 0, y: 0 },
        parameters: { outerSteps: 24, innerSteps: 20 },
        parameterInputModes: {},
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-shell', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-shell', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Drive-home lights: look-at camera + time -> vec3 scene. */
export function mvpDriveHomeLightsGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-drive-home-lights',
    name: 'MVP drive home lights',
    version: '2.0',
    nodes: [
      { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-cam',
        type: 'look-at-camera',
        position: { x: 0, y: 0 },
        parameters: {
          posX: 0.15,
          posY: 0.35,
          posZ: -1.2,
          lookatX: 0.0,
          lookatY: 0.2,
          lookatZ: 6.0,
          zoom: 1.4,
        },
      },
      { id: 'n-time', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      {
        id: 'n-dhl',
        type: 'drive-home-lights',
        position: { x: 0, y: 0 },
        parameters: {
          skyGradientLowL: 0.82,
          skyGradientLowC: 0.1,
          skyGradientLowH: 320.0,
          skyGradientHighL: 0.85,
          skyGradientHighC: 0.09,
          skyGradientHighH: 335.0,
          skyStrength: 0.95,
          timeScale: 0.04,
          laneBias: 0.52,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-cam', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-cam', sourcePort: 'ro', targetNodeId: 'n-dhl', targetPort: 'ro' },
      { id: 'c3', sourceNodeId: 'n-cam', sourcePort: 'rd', targetNodeId: 'n-dhl', targetPort: 'rd' },
      { id: 'c4', sourceNodeId: 'n-time', sourcePort: 'out', targetNodeId: 'n-dhl', targetPort: 'time' },
      { id: 'c5', sourceNodeId: 'n-dhl', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

/** Chromatic aberration + RGB separation (inline MVP effects). */
export function mvpChromaticAberrationRgbSeparationGraph(): NodeGraph {
  return {
    id: 'fixture-mvp-chroma-rgb-separation',
    name: 'MVP chroma + rgb separation',
    version: '2.0',
    nodes: [
      {
        id: 'n-base',
        type: 'constant-vec4',
        position: { x: 0, y: 0 },
        parameters: { x: 0.62, y: 0.2, z: 0.95, w: 1.0 },
      },
      {
        id: 'n-chroma',
        type: 'chromatic-aberration',
        position: { x: 0, y: 0 },
        parameters: {
          chromaticStrength: 0.25,
          chromaticDirection: 0.0,
          chromaticCenterX: 0.15,
          chromaticCenterY: -0.1,
          chromaticFalloff: 1.2,
        },
      },
      {
        id: 'n-rgb',
        type: 'rgb-separation',
        position: { x: 0, y: 0 },
        parameters: {
          rgbSeparationRX: 0.25,
          rgbSeparationRY: 0.05,
          rgbSeparationGX: -0.08,
          rgbSeparationGY: 0.02,
          rgbSeparationBX: -0.22,
          rgbSeparationBY: -0.03,
          rgbSeparationStrength: 1.25,
        },
      },
      { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [
      { id: 'c1', sourceNodeId: 'n-base', sourcePort: 'out', targetNodeId: 'n-chroma', targetPort: 'in' },
      { id: 'c2', sourceNodeId: 'n-chroma', sourcePort: 'out', targetNodeId: 'n-rgb', targetPort: 'in' },
      { id: 'c3', sourceNodeId: 'n-rgb', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
    ],
  };
}

export const WEBGPU_MVP_FIXTURE_IDS = [
  'mvpConstantVec3',
  'mvpTimeMultiply',
  'mvpClampTime',
  'mvpFragmentCoordinates',
  'mvpOscillator2d',
  'mvpMixedWaveSignal',
  'mvpUvTransformBatch',
  'mvpBrickTiling',
  'mvpMirrorFlip',
  'mvpRipple',
  'mvpRainDrops',
  'mvpBlurPassPlan',
  'mvpGlowBloomPassPlan',
  'mvpBokehPassPlan',
  'mvpCrepuscularRaysPassPlan',
  'mvpBlurPassPlanDirectional',
  'mvpBlurPassPlanRadial',
  'mvpVectorBasics',
  'mvpUtilityFloats',
  'mvpCombineSwizzle',
  'mvpSplitVector',
  'mvpCompareSelect',
  'mvpCrossProduct',
  'mvpMaskCompositeFloat',
  'mvpMaskCompositeVec3',
  'mvpReflect',
  'mvpRefract',
  'mvpHash32',
  'mvpGradient',
  'mvpNoise',
  'mvpBayerDither',
  'mvpBezierCurve',
  'mvpOklchColor',
  'mvpColorMap',
  'mvpBlendMode',
  'mvpBlendColor',
  'mvpScanlines',
  'mvpStripes',
  'mvpDots',
  'mvpRings',
  'mvpRadialPulse',
  'mvpTriangleGrid',
  'mvpDiscoPattern',
  'mvpHexagonalGrid',
  'mvpFlowFieldPattern',
  'mvpRadialRays',
  'mvpStreak',
  'mvpToneMapping',
  'mvpColorGrading',
  'mvpOklchColorMapBezierSolid',
  'mvpOklchColorMapThresholdNoDither',
  'mvpOklchColorMapThreshold',
  'mvpOklchColorMapBezier',
  'mvpBokehPoint',
  'mvpPlaneGrid',
  'mvpDistortBatch',
  'mvpShapeMasks',
  'mvpPatternNoiseBatch',
  'mvpOrbitCamera',
  'mvpLookAtCamera',
  'mvpSkyDome',
  'mvpLightingShading',
  'mvpNormalMapping',
  'mvpSphericalFibonacci',
  'mvpBloomSphere',
  'mvpFractal',
  'mvpGenericRaymarcherHexPrism',
  'mvpGenericRaymarcherSphereRaymarch',
  'mvpGenericRaymarcherMetaballs',
  'mvpGenericRaymarcherBoxTorus',
  'mvpGenericRaymarcherRepeatedHexPrism',
  'mvpGenericRaymarcherRadialRepeat',
  'mvpGenericRaymarcherEtherSdf',
  'mvpGenericRaymarcherKifs',
  'mvpGenericRaymarcherMengerSponge',
  'mvpGenericRaymarcherMandelbox',
  'mvpGenericRaymarcherSierpinskiTetra',
  'mvpGenericRaymarcherJuliaSlab',
  'mvpGenericRaymarcherDisplacement',
  'mvpGenericRaymarcherSierpinskiTetraScaleWire',
  'mvpGenericRaymarcherSierpinskiTetraScaleAudio',
  'mvpAudioBlurPassPlan',
  'mvpAudioBlurPassPlanNonzeroBlur',
  'mvpAudioGlowBloomPassPlan',
  'mvpAudioBokehPassPlan',
  'mvpAudioCrepuscularRaysPassPlan',
  'mvpEdgeDetection',
  'mvpVolumeRays',
  'mvpParticleSystem',
  'mvpGlassShell',
  'mvpIteratedInversion',
  'mvpDriveHomeLights',
  'mvpIridescentTunnel',
  'mvpInflatedIcosahedron',
  'mvpChromaticAberrationRgbSeparation',
  'mvpBypassRuleARotate',
  'mvpBypassRuleBNoise',
] as const;

export type WebgpuMvpFixtureId = (typeof WEBGPU_MVP_FIXTURE_IDS)[number];

export function getWebgpuMvpFixtureGraph(id: WebgpuMvpFixtureId): NodeGraph {
  switch (id) {
    case 'mvpConstantVec3':
      return mvpConstantVec3Graph();
    case 'mvpTimeMultiply':
      return mvpTimeMultiplyGraph();
    case 'mvpClampTime':
      return mvpClampTimeGraph();
    case 'mvpFragmentCoordinates':
      return mvpFragmentCoordinatesGraph();
    case 'mvpOscillator2d':
      return mvpOscillator2dGraph();
    case 'mvpMixedWaveSignal':
      return mvpMixedWaveSignalGraph();
    case 'mvpUvTransformBatch':
      return mvpUvTransformBatchGraph();
    case 'mvpBrickTiling':
      return mvpBrickTilingGraph();
    case 'mvpMirrorFlip':
      return mvpMirrorFlipGraph();
    case 'mvpRipple':
      return mvpRippleGraph();
    case 'mvpRainDrops':
      return mvpRainDropsGraph();
    case 'mvpBlurPassPlan':
      return mvpBlurPassPlanGraph();
    case 'mvpGlowBloomPassPlan':
      return mvpGlowBloomPassPlanGraph();
    case 'mvpBokehPassPlan':
      return mvpBokehPassPlanGraph();
    case 'mvpCrepuscularRaysPassPlan':
      return mvpCrepuscularRaysPassPlanGraph();
    case 'mvpBlurPassPlanDirectional':
      return mvpBlurPassPlanDirectionalGraph();
    case 'mvpBlurPassPlanRadial':
      return mvpBlurPassPlanRadialGraph();
    case 'mvpVectorBasics':
      return mvpVectorBasicsGraph();
    case 'mvpUtilityFloats':
      return mvpUtilityFloatsGraph();
    case 'mvpCombineSwizzle':
      return mvpCombineSwizzleGraph();
    case 'mvpSplitVector':
      return mvpSplitVectorGraph();
    case 'mvpCompareSelect':
      return mvpCompareSelectGraph();
    case 'mvpCrossProduct':
      return mvpCrossProductGraph();
    case 'mvpMaskCompositeFloat':
      return mvpMaskCompositeFloatGraph();
    case 'mvpMaskCompositeVec3':
      return mvpMaskCompositeVec3Graph();
    case 'mvpReflect':
      return mvpReflectGraph();
    case 'mvpRefract':
      return mvpRefractGraph();
    case 'mvpHash32':
      return mvpHash32Graph();
    case 'mvpGradient':
      return mvpGradientGraph();
    case 'mvpNoise':
      return mvpNoiseGraph();
    case 'mvpBayerDither':
      return mvpBayerDitherGraph();
    case 'mvpBezierCurve':
      return mvpBezierCurveGraph();
    case 'mvpOklchColor':
      return mvpOklchColorGraph();
    case 'mvpColorMap':
      return mvpColorMapGraph();
    case 'mvpBlendMode':
      return mvpBlendModeGraph();
    case 'mvpBlendColor':
      return mvpBlendColorGraph();
    case 'mvpScanlines':
      return mvpScanlinesGraph();
    case 'mvpStripes':
      return mvpStripesGraph();
    case 'mvpDots':
      return mvpDotsGraph();
    case 'mvpRings':
      return mvpRingsGraph();
    case 'mvpRadialPulse':
      return mvpRadialPulseGraph();
    case 'mvpTriangleGrid':
      return mvpTriangleGridGraph();
    case 'mvpDiscoPattern':
      return mvpDiscoPatternGraph();
    case 'mvpHexagonalGrid':
      return mvpHexagonalGridGraph();
    case 'mvpFlowFieldPattern':
      return mvpFlowFieldPatternGraph();
    case 'mvpRadialRays':
      return mvpRadialRaysGraph();
    case 'mvpStreak':
      return mvpStreakGraph();
    case 'mvpToneMapping':
      return mvpToneMappingGraph();
    case 'mvpColorGrading':
      return mvpColorGradingGraph();
    case 'mvpOklchColorMapBezierSolid':
      return mvpOklchColorMapBezierSolidGraph();
    case 'mvpOklchColorMapThresholdNoDither':
      return mvpOklchColorMapThresholdNoDitherGraph();
    case 'mvpOklchColorMapThreshold':
      return mvpOklchColorMapThresholdGraph();
    case 'mvpOklchColorMapBezier':
      return mvpOklchColorMapBezierGraph();
    case 'mvpBokehPoint':
      return mvpBokehPointGraph();
    case 'mvpPlaneGrid':
      return mvpPlaneGridGraph();
    case 'mvpDistortBatch':
      return mvpDistortBatchGraph();
    case 'mvpShapeMasks':
      return mvpShapeMasksGraph();
    case 'mvpPatternNoiseBatch':
      return mvpPatternNoiseBatchGraph();
    case 'mvpOrbitCamera':
      return mvpOrbitCameraGraph();
    case 'mvpLookAtCamera':
      return mvpLookAtCameraGraph();
    case 'mvpSkyDome':
      return mvpSkyDomeGraph();
    case 'mvpLightingShading':
      return mvpLightingShadingGraph();
    case 'mvpNormalMapping':
      return mvpNormalMappingGraph();
    case 'mvpSphericalFibonacci':
      return mvpSphericalFibonacciGraph();
    case 'mvpBloomSphere':
      return mvpBloomSphereGraph();
    case 'mvpFractal':
      return mvpFractalGraph();
    case 'mvpGenericRaymarcherHexPrism':
      return mvpGenericRaymarcherHexPrismGraph();
    case 'mvpGenericRaymarcherSphereRaymarch':
      return mvpGenericRaymarcherSphereRaymarchGraph();
    case 'mvpGenericRaymarcherMetaballs':
      return mvpGenericRaymarcherMetaballsGraph();
    case 'mvpGenericRaymarcherBoxTorus':
      return mvpGenericRaymarcherBoxTorusGraph();
    case 'mvpGenericRaymarcherRepeatedHexPrism':
      return mvpGenericRaymarcherRepeatedHexPrismGraph();
    case 'mvpGenericRaymarcherRadialRepeat':
      return mvpGenericRaymarcherRadialRepeatGraph();
    case 'mvpGenericRaymarcherEtherSdf':
      return mvpGenericRaymarcherEtherSdfGraph();
    case 'mvpGenericRaymarcherKifs':
      return mvpGenericRaymarcherKifsGraph();
    case 'mvpGenericRaymarcherMengerSponge':
      return mvpGenericRaymarcherMengerSpongeGraph();
    case 'mvpGenericRaymarcherMandelbox':
      return mvpGenericRaymarcherMandelboxGraph();
    case 'mvpGenericRaymarcherSierpinskiTetra':
      return mvpGenericRaymarcherSierpinskiTetraGraph();
    case 'mvpGenericRaymarcherJuliaSlab':
      return mvpGenericRaymarcherJuliaSlabGraph();
    case 'mvpGenericRaymarcherDisplacement':
      return mvpGenericRaymarcherDisplacementGraph();
    case 'mvpGenericRaymarcherSierpinskiTetraScaleWire':
      return mvpGenericRaymarcherSierpinskiTetraScaleWireGraph();
    case 'mvpGenericRaymarcherSierpinskiTetraScaleAudio':
      return mvpGenericRaymarcherSierpinskiTetraScaleAudioGraph();
    case 'mvpAudioBlurPassPlan':
      return mvpAudioBlurPassPlanGraph();
    case 'mvpAudioBlurPassPlanNonzeroBlur':
      return mvpAudioBlurPassPlanNonzeroBlurGraph();
    case 'mvpAudioGlowBloomPassPlan':
      return mvpAudioGlowBloomPassPlanGraph();
    case 'mvpAudioBokehPassPlan':
      return mvpAudioBokehPassPlanGraph();
    case 'mvpAudioCrepuscularRaysPassPlan':
      return mvpAudioCrepuscularRaysPassPlanGraph();
    case 'mvpEdgeDetection':
      return mvpEdgeDetectionGraph();
    case 'mvpVolumeRays':
      return mvpVolumeRaysGraph();
    case 'mvpParticleSystem':
      return mvpParticleSystemGraph();
    case 'mvpGlassShell':
      return mvpGlassShellGraph();
    case 'mvpIteratedInversion':
      return mvpIteratedInversionGraph();
    case 'mvpDriveHomeLights':
      return mvpDriveHomeLightsGraph();
    case 'mvpIridescentTunnel':
      return mvpIridescentTunnelGraph();
    case 'mvpInflatedIcosahedron':
      return mvpInflatedIcosahedronGraph();
    case 'mvpChromaticAberrationRgbSeparation':
      return mvpChromaticAberrationRgbSeparationGraph();
    case 'mvpBypassRuleARotate':
      return mvpBypassRuleARotateGraph();
    case 'mvpBypassRuleBNoise':
      return mvpBypassRuleBNoiseGraph();
    default: {
      const _ex: never = id;
      throw new Error(`Unknown fixture ${_ex}`);
    }
  }
}

/**
 * Optional audio setup paired with a fixture. Returns `null` for fixtures that
 * compile without audio (the vast majority); only audio-driven WebGPU MVP
 * fixtures (e.g. `mvpGenericRaymarcherSierpinskiTetraScaleAudio`,
 * `mvpAudioBlurPassPlan`, `mvpAudioBlurPassPlanNonzeroBlur`, `mvpAudioGlowBloomPassPlan`,
 * `mvpAudioBokehPassPlan`, `mvpAudioCrepuscularRaysPassPlan`) need a setup
 * so their virtual `audio-signal:*` connections resolve to real remap uniforms.
 */
export function getWebgpuMvpFixtureAudioSetup(id: WebgpuMvpFixtureId): AudioSetup | null {
  switch (id) {
    case 'mvpGenericRaymarcherSierpinskiTetraScaleAudio':
    case 'mvpAudioBlurPassPlan':
    case 'mvpAudioBlurPassPlanNonzeroBlur':
    case 'mvpAudioGlowBloomPassPlan':
    case 'mvpAudioBokehPassPlan':
    case 'mvpAudioCrepuscularRaysPassPlan':
      return mvpGenericRaymarcherSierpinskiTetraScaleAudioSetup();
    default:
      return null;
  }
}
