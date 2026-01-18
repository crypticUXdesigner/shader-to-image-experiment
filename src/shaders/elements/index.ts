import type { VisualElement } from '../../types';
import { fbmNoiseElement } from './fbm-noise';
import { fbmValueNoiseElement } from './fbm-value-noise';
import { ringsElement } from './rings';
import { vectorFieldElement } from './vector-field';
import { sphereRaymarchElement } from './sphere-raymarch';
import { fractalElement } from './fractal';
import { voronoiNoiseElement } from './voronoi-noise';
import { polarCoordinatesElement } from './polar-coordinates';
import { wavePatternsElement } from './wave-patterns';
import { glowBloomElement } from './glow-bloom';
import { twistDistortionElement } from './twist-distortion';
import { kaleidoscopeElement } from './kaleidoscope';
import { turbulenceElement } from './turbulence';
import { gradientMaskElement } from './gradient-mask';
import { hexagonalGridElement } from './hexagonal-grid';
import { simplexNoiseElement } from './simplex-noise';
import { particleSystemElement } from './particle-system';
import { planeGridElement } from './plane-grid';
import { boxTorusSdfElement } from './box-torus-sdf';
import { edgeDetectionElement } from './edge-detection';
import { blurElement } from './blur';
import { normalMappingElement } from './normal-mapping';
import { lightingShadingElement } from './lighting-shading';
import { blendingModesElement } from './blending-modes';
import { chromaticAberrationElement } from './chromatic-aberration';
import { colorGradingElement } from './color-grading';
import { blockDisplacementElement } from './block-displacement';
import { blockEdgeBrightnessElement } from './block-edge-brightness';
import { blockColorGlitchElement } from './block-color-glitch';
import { scanlinesElement } from './scanlines';
import { rgbSeparationElement } from './rgb-separation';
// Bayer dithering is now controlled via ColorConfig, not as a visual element
// import { bayerDitherElement } from './bayer-dither';

export const elementLibrary: VisualElement[] = [
  fbmNoiseElement,
  fbmValueNoiseElement,
  ringsElement,
  vectorFieldElement,
  sphereRaymarchElement,
  fractalElement,
  voronoiNoiseElement,
  polarCoordinatesElement,
  wavePatternsElement,
  glowBloomElement,
  twistDistortionElement,
  kaleidoscopeElement,
  turbulenceElement,
  gradientMaskElement,
  hexagonalGridElement,
  simplexNoiseElement,
  particleSystemElement,
  planeGridElement,
  boxTorusSdfElement,
  edgeDetectionElement,
  blurElement,
  normalMappingElement,
  lightingShadingElement,
  blendingModesElement,
  chromaticAberrationElement,
  colorGradingElement,
  blockDisplacementElement,
  blockEdgeBrightnessElement,
  blockColorGlitchElement,
  scanlinesElement,
  rgbSeparationElement
  // bayerDitherElement removed - controlled via ColorConfig instead
];

export function getElementById(id: string): VisualElement | undefined {
  return elementLibrary.find(el => el.id === id);
}

export function getElementsByCategory(category: string): VisualElement[] {
  return elementLibrary.filter(el => el.category === category);
}

