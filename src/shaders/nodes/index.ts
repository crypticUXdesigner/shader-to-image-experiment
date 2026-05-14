// Node specs for the node system (all VisualElements have been migrated to native NodeSpecs)

import type { NodeSpec } from '../../types/nodeSpec';
import { finalOutputNodeSpec } from './final-output';
import {
  uvCoordinatesNodeSpec,
  timeNodeSpec,
  resolutionNodeSpec,
  fragmentCoordinatesNodeSpec,
  constantFloatNodeSpec,
  constantVec2NodeSpec,
  constantVec3NodeSpec,
  constantVec4NodeSpec
} from './input-nodes';
import { mixedWaveSignalNodeSpec } from './mixed-wave-signal';
import { oscillator2dNodeSpec } from './oscillator-2d';
import { orbitCameraNodeSpec } from './orbit-camera';
import { lookAtCameraNodeSpec } from './look-at-camera';
import { rotateNodeSpec, scaleNodeSpec } from './transform-nodes';
import { polarCoordinatesNodeSpec } from './polar-coordinates';
import { vectorFieldNodeSpec } from './vector-field';
import { turbulenceNodeSpec } from './turbulence';
import { kaleidoscopeNodeSpec } from './kaleidoscope';
import { radialUvWarpNodeSpec } from './radial-uv-warp';
import { rippleNodeSpec } from './ripple';
import { mirrorFlipNodeSpec } from './mirror-flip';
import { displaceNodeSpec } from './displace';
import { vortexNodeSpec } from './vortex';
import { quadWarpNodeSpec } from './quad-warp';
import { brickTilingNodeSpec } from './brick-tiling';
import { uvBlockGlitchNodeSpec } from './uv-block-glitch';
import { uvBandShiftNodeSpec } from './uv-band-shift';
import { infiniteZoomNodeSpec } from './infinite-zoom';
import { noiseNodeSpec } from './noise';
import { warpTerrainNodeSpec } from './warp-terrain';
import { voronoiNoiseNodeSpec } from './voronoi-noise';
import { cubicCurlNoiseNodeSpec } from './cubic-curl-noise';
import { ringsNodeSpec } from './rings';
import { radialPulseNodeSpec } from './radial-pulse';
import { gradientNodeSpec } from './gradient';
import { radialRaysNodeSpec } from './radial-rays';
import { volumeRaysNodeSpec } from './volume-rays';
import { streakNodeSpec } from './streak';
import { crepuscularRaysNodeSpec } from './crepuscular-rays';
import { hexagonalGridNodeSpec } from './hexagonal-grid';
import { stripesNodeSpec } from './stripes';
import { dotsNodeSpec } from './dots';
import { discoPatternNodeSpec } from './disco-pattern';
import { triangleGridNodeSpec } from './triangle-grid';
import { particleSystemNodeSpec } from './particle-system';
import { sphereRaymarchNodeSpec } from './sphere-raymarch';
import { sphericalFibonacciNodeSpec } from './spherical-fibonacci';
import { bloomSphereNodeSpec } from './bloom-sphere';
import { boxTorusSdfNodeSpec } from './box-torus-sdf';
import { glassShellNodeSpec } from './glass-shell';
import { hexPrismSdfNodeSpec } from './hex-prism-sdf';
import { radialRepeatSdfNodeSpec } from './radial-repeat-sdf';
import { repeatedHexPrismSdfNodeSpec } from './repeated-hex-prism-sdf';
import { kifsSdfNodeSpec } from './kifs-sdf';
import { mandelboxSdfNodeSpec } from './mandelbox-sdf';
import { mengerSpongeSdfNodeSpec } from './menger-sponge-sdf';
import { sierpinskiTetraSdfNodeSpec } from './sierpinski-tetra-sdf';
import { etherSdfNodeSpec } from './ether-sdf';
import { juliaSlabSdfNodeSpec } from './julia-slab-sdf';
import { mandelbulbSdfNodeSpec } from './mandelbulb-sdf';
import { displacement3dNodeSpec } from './displacement-3d';
import { genericRaymarcherNodeSpec } from './generic-raymarcher';
import { iridescentTunnelNodeSpec } from './iridescent-tunnel';
import { inflatedIcosahedronNodeSpec } from './inflated-icosahedron';
import { shapes2dNodeSpec } from './shapes-2d';
import { starShape2dNodeSpec } from './star-shape-2d';
import { metaballsNodeSpec } from './metaballs';
import { flowFieldPatternNodeSpec } from './flow-field-pattern';
import { fractalNodeSpec } from './fractal';
import { iteratedInversionNodeSpec } from './iterated-inversion';
import { planeGridNodeSpec } from './plane-grid';
import { skyDomeNodeSpec } from './sky-dome';
import { rainDropsNodeSpec } from './rain-drops';
import { bokehPointNodeSpec } from './bokeh-point';
import { driveHomeLightsNodeSpec } from './drive-home-lights';
import {
  addNodeSpec,
  subtractNodeSpec,
  multiplyNodeSpec,
  divideNodeSpec,
  powerNodeSpec,
  squareRootNodeSpec,
  absoluteNodeSpec,
  floorNodeSpec,
  ceilNodeSpec,
  fractNodeSpec,
  moduloNodeSpec,
  minNodeSpec,
  maxNodeSpec,
  clampNodeSpec,
  mixNodeSpec,
  stepNodeSpec,
  smoothstepNodeSpec,
  sineNodeSpec,
  cosineNodeSpec,
  tangentNodeSpec,
  arcSineNodeSpec,
  arcCosineNodeSpec,
  arcTangentNodeSpec,
  arcTangent2NodeSpec,
  exponentialNodeSpec,
  naturalLogarithmNodeSpec,
  lengthNodeSpec,
  distanceNodeSpec,
  dotProductNodeSpec,
  crossProductNodeSpec,
  normalizeNodeSpec,
  reflectNodeSpec,
  refractNodeSpec
} from './math-operations';
import { blendColorNodeSpec, blendModeNodeSpec } from './blending-nodes';
import {
  compareNodeSpec,
  selectNodeSpec,
  maskCompositeFloatNodeSpec,
  maskCompositeVec3NodeSpec
} from './masking-nodes';
import { blurNodeSpec } from './blur';
import { glowBloomNodeSpec } from './glow-bloom';
import { bokehNodeSpec } from './bokeh';
import { edgeDetectionNodeSpec } from './edge-detection';
import { chromaticAberrationNodeSpec } from './chromatic-aberration';
import { rgbSeparationNodeSpec } from './rgb-separation';
import { scanlinesNodeSpec } from './scanlines';
import { colorGradingNodeSpec } from './color-grading';
import { normalMappingNodeSpec } from './normal-mapping';
import { lightingShadingNodeSpec } from './lighting-shading';
// Post-processing nodes are now native NodeSpecs (migrated from VisualElements)
import { hash32NodeSpec } from './hash32';
import {
  oneMinusNodeSpec,
  negateNodeSpec,
  reciprocalNodeSpec,
  clamp01NodeSpec,
  saturateNodeSpec,
  signNodeSpec,
  roundNodeSpec,
  truncateNodeSpec,
  lerpNodeSpec,
  swizzleNodeSpec,
  splitVectorNodeSpec,
  combineVectorNodeSpec
} from './utility-nodes';
import {
  oklchColorNodeSpec,
  bezierCurveNodeSpec,
  bayerDitherNodeSpec,
  oklchColorMapBezierNodeSpec,
  oklchColorMapThresholdNodeSpec,
  toneMappingNodeSpec
} from './color-system-nodes';
const _metaballs = metaballsNodeSpec;
export const nodeSystemSpecs: NodeSpec[] = [
  // Input nodes
  uvCoordinatesNodeSpec,
  timeNodeSpec,
  resolutionNodeSpec,
  fragmentCoordinatesNodeSpec,
  constantFloatNodeSpec,
  constantVec2NodeSpec,
  constantVec3NodeSpec,
  constantVec4NodeSpec,
  mixedWaveSignalNodeSpec,
  oscillator2dNodeSpec,
  orbitCameraNodeSpec,
  lookAtCameraNodeSpec,
  oklchColorNodeSpec,
  bezierCurveNodeSpec,
  
  // Transform nodes
  rotateNodeSpec,
  scaleNodeSpec,

  // Distort/Transform nodes
  polarCoordinatesNodeSpec,
  vectorFieldNodeSpec,
  turbulenceNodeSpec,
  kaleidoscopeNodeSpec,
  radialUvWarpNodeSpec,
  rippleNodeSpec,
  mirrorFlipNodeSpec,
  displaceNodeSpec,
  vortexNodeSpec,
  quadWarpNodeSpec,
  brickTilingNodeSpec,
  uvBlockGlitchNodeSpec,
  uvBandShiftNodeSpec,
  infiniteZoomNodeSpec,

  // Pattern/Noise nodes
  noiseNodeSpec,
  warpTerrainNodeSpec,
  voronoiNoiseNodeSpec,
  cubicCurlNoiseNodeSpec,
  ringsNodeSpec,
  radialPulseNodeSpec,
  gradientNodeSpec,
  radialRaysNodeSpec,
  crepuscularRaysNodeSpec,
  volumeRaysNodeSpec,
  streakNodeSpec,
  flowFieldPatternNodeSpec,
  hexagonalGridNodeSpec,
  stripesNodeSpec,
  dotsNodeSpec,
  discoPatternNodeSpec,
  triangleGridNodeSpec,
  particleSystemNodeSpec,
  rainDropsNodeSpec,

  // Shape/Geometry nodes
  sphereRaymarchNodeSpec,
  sphericalFibonacciNodeSpec,
  bloomSphereNodeSpec,
  boxTorusSdfNodeSpec,
  glassShellNodeSpec,
  hexPrismSdfNodeSpec,
  radialRepeatSdfNodeSpec,
  repeatedHexPrismSdfNodeSpec,
  kifsSdfNodeSpec,
  mandelboxSdfNodeSpec,
  mengerSpongeSdfNodeSpec,
  sierpinskiTetraSdfNodeSpec,
  etherSdfNodeSpec,
  juliaSlabSdfNodeSpec,
  mandelbulbSdfNodeSpec,
  displacement3dNodeSpec,
  genericRaymarcherNodeSpec,
  iridescentTunnelNodeSpec,
  inflatedIcosahedronNodeSpec,
  shapes2dNodeSpec,
  starShape2dNodeSpec,
  _metaballs,
  fractalNodeSpec,
  iteratedInversionNodeSpec,
  planeGridNodeSpec,
  skyDomeNodeSpec,
  bokehPointNodeSpec,
  driveHomeLightsNodeSpec,

  // Math/Operation nodes
  addNodeSpec,
  subtractNodeSpec,
  multiplyNodeSpec,
  divideNodeSpec,
  powerNodeSpec,
  squareRootNodeSpec,
  absoluteNodeSpec,
  floorNodeSpec,
  ceilNodeSpec,
  fractNodeSpec,
  moduloNodeSpec,
  minNodeSpec,
  maxNodeSpec,
  clampNodeSpec,
  mixNodeSpec,
  stepNodeSpec,
  smoothstepNodeSpec,
  sineNodeSpec,
  cosineNodeSpec,
  tangentNodeSpec,
  arcSineNodeSpec,
  arcCosineNodeSpec,
  arcTangentNodeSpec,
  arcTangent2NodeSpec,
  exponentialNodeSpec,
  naturalLogarithmNodeSpec,
  lengthNodeSpec,
  distanceNodeSpec,
  dotProductNodeSpec,
  crossProductNodeSpec,
  normalizeNodeSpec,
  reflectNodeSpec,
  refractNodeSpec,
  
  // Blending nodes
  blendModeNodeSpec,
  blendColorNodeSpec,
  
  // Masking/Control nodes
  compareNodeSpec,
  selectNodeSpec,
  maskCompositeFloatNodeSpec,
  maskCompositeVec3NodeSpec,
  
  // Post-Processing nodes
  blurNodeSpec,
  glowBloomNodeSpec,
  bokehNodeSpec,
  edgeDetectionNodeSpec,
  chromaticAberrationNodeSpec,
  rgbSeparationNodeSpec,
  scanlinesNodeSpec,
  colorGradingNodeSpec,
  normalMappingNodeSpec,
  lightingShadingNodeSpec,
  
  // Utility nodes
  hash32NodeSpec,
  oneMinusNodeSpec,
  negateNodeSpec,
  reciprocalNodeSpec,
  clamp01NodeSpec,
  saturateNodeSpec,
  signNodeSpec,
  roundNodeSpec,
  truncateNodeSpec,
  lerpNodeSpec,
  swizzleNodeSpec,
  splitVectorNodeSpec,
  combineVectorNodeSpec,
  
  // Color System nodes
  oklchColorMapBezierNodeSpec,
  oklchColorMapThresholdNodeSpec,
  bayerDitherNodeSpec,
  toneMappingNodeSpec,
  
  // Output nodes
  finalOutputNodeSpec,
];
