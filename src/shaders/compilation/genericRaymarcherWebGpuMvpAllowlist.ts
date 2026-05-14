/**
 * WebGPU MVP bounds for `generic-raymarcher` — shared with wire-time validation
 * (`src/data-model/webGpuExclusiveConnectionValidation.ts`) and `WgslMvpCompiler`.
 */

/** Bounded generic-raymarcher pilot: sdf port allow-list (parity with WGSL helpers + marching loop). */
export const GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES = new Set<string>([
  'mandelbulb-sdf',
  'julia-slab-sdf',
  'mandelbox-sdf',
  'menger-sponge-sdf',
  'sierpinski-tetra-sdf',
  'hex-prism-sdf',
  'repeated-hex-prism-sdf',
  'radial-repeat-sdf',
  'ether-sdf',
  'kifs-sdf',
  'metaballs',
  'box-torus-sdf',
  'sphere-raymarch',
]);

export function genericRaymarcherWebGpuMvpSdfAllowedListSentence(): string {
  return [...GENERIC_RAYMARCHER_WEBGPU_MVP_SDF_TYPES].sort((a, b) => a.localeCompare(b)).join(', ');
}
