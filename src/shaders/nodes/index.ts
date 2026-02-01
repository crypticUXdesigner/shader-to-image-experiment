// Node specs for the node system (all VisualElements have been migrated to native NodeSpecs)

import type { NodeSpec } from '../../types';
import { colorMapNodeSpec } from './color-map';
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
import {
  translateNodeSpec,
  rotateNodeSpec,
  scaleNodeSpec
} from './transform-nodes';
import { polarCoordinatesNodeSpec } from './polar-coordinates';
import { vectorFieldNodeSpec } from './vector-field';
import { turbulenceNodeSpec } from './turbulence';
import { twistDistortionNodeSpec } from './twist-distortion';
import { kaleidoscopeNodeSpec } from './kaleidoscope';
import { fbmNoiseNodeSpec } from './fbm-noise';
import { simplexNoiseNodeSpec } from './simplex-noise';
import { voronoiNoiseNodeSpec } from './voronoi-noise';
import { ringsNodeSpec } from './rings';
import { wavePatternsNodeSpec } from './wave-patterns';
import { hexagonalGridNodeSpec } from './hexagonal-grid';
import { particleSystemNodeSpec } from './particle-system';
import { sphereRaymarchNodeSpec } from './sphere-raymarch';
import { boxTorusSdfNodeSpec } from './box-torus-sdf';
import { fractalNodeSpec } from './fractal';
import { planeGridNodeSpec } from './plane-grid';
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
import { blendModeNodeSpec } from './blending-nodes';
import {
  compareNodeSpec,
  selectNodeSpec
} from './masking-nodes';
import { blurNodeSpec } from './blur';
import { glowBloomNodeSpec } from './glow-bloom';
import { edgeDetectionNodeSpec } from './edge-detection';
import { chromaticAberrationNodeSpec } from './chromatic-aberration';
import { rgbSeparationNodeSpec } from './rgb-separation';
import { scanlinesNodeSpec } from './scanlines';
import { colorGradingNodeSpec } from './color-grading';
import { normalMappingNodeSpec } from './normal-mapping';
import { lightingShadingNodeSpec } from './lighting-shading';
import { blendingModesNodeSpec } from './blending-modes';
// Post-processing nodes are now native NodeSpecs (migrated from VisualElements)
import {
  oneMinusNodeSpec,
  negateNodeSpec,
  reciprocalNodeSpec,
  remapNodeSpec,
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
import {
  audioFileInputNodeSpec,
  audioAnalyzerNodeSpec,
  audioRemapNodeSpec
} from './audio-nodes';

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
  oklchColorNodeSpec,
  bezierCurveNodeSpec,
  
  // Transform nodes
  translateNodeSpec,
  rotateNodeSpec,
  scaleNodeSpec,
  
  // Distort/Transform nodes
  polarCoordinatesNodeSpec,
  vectorFieldNodeSpec,
  turbulenceNodeSpec,
  twistDistortionNodeSpec,
  kaleidoscopeNodeSpec,
  
  // Pattern/Noise nodes
  fbmNoiseNodeSpec,
  simplexNoiseNodeSpec,
  voronoiNoiseNodeSpec,
  ringsNodeSpec,
  wavePatternsNodeSpec,
  hexagonalGridNodeSpec,
  particleSystemNodeSpec,
  
  // Shape/Geometry nodes
  sphereRaymarchNodeSpec,
  boxTorusSdfNodeSpec,
  fractalNodeSpec,
  planeGridNodeSpec,
  
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
  
  // Masking/Control nodes
  compareNodeSpec,
  selectNodeSpec,
  
  // Post-Processing nodes
  blurNodeSpec,
  glowBloomNodeSpec,
  edgeDetectionNodeSpec,
  chromaticAberrationNodeSpec,
  rgbSeparationNodeSpec,
  scanlinesNodeSpec,
  colorGradingNodeSpec,
  normalMappingNodeSpec,
  lightingShadingNodeSpec,
  blendingModesNodeSpec,
  
  // Utility nodes
  oneMinusNodeSpec,
  negateNodeSpec,
  reciprocalNodeSpec,
  remapNodeSpec,
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
  
  // Operation nodes
  colorMapNodeSpec,
  
  // Output nodes
  finalOutputNodeSpec,
  
  // Audio nodes
  audioFileInputNodeSpec,
  audioAnalyzerNodeSpec,
  audioRemapNodeSpec
];
