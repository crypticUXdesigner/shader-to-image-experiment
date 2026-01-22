// Node specs that are specific to the node system (not converted from VisualElements)

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
  gradientMaskNodeSpec,
  compareNodeSpec,
  selectNodeSpec
} from './masking-nodes';
import {
  glowBloomNodeSpec,
  blurNodeSpec,
  edgeDetectionNodeSpec,
  chromaticAberrationNodeSpec,
  colorGradingNodeSpec,
  rgbSeparationNodeSpec,
  scanlinesNodeSpec,
  blockEdgeBrightnessNodeSpec,
  blockColorGlitchNodeSpec,
  normalMappingNodeSpec,
  lightingShadingNodeSpec
} from './post-processing-nodes';
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
  gradientMaskNodeSpec,
  compareNodeSpec,
  selectNodeSpec,
  
  // Post-Processing nodes
  glowBloomNodeSpec,
  blurNodeSpec,
  edgeDetectionNodeSpec,
  chromaticAberrationNodeSpec,
  colorGradingNodeSpec,
  rgbSeparationNodeSpec,
  scanlinesNodeSpec,
  blockEdgeBrightnessNodeSpec,
  blockColorGlitchNodeSpec,
  normalMappingNodeSpec,
  lightingShadingNodeSpec,
  
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
  finalOutputNodeSpec
];
