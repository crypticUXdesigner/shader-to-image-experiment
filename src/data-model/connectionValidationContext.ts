/**
 * Optional context for connection validation when the editor session uses an exclusive GPU path.
 * See `docs/architecture/WIRE-VALIDATION-DESIGN.md`.
 */

export type ConnectionValidationExclusiveGpu = 'webgl2' | 'webgpu';

export interface ConnectionValidationContext {
  exclusiveRasterGpu: ConnectionValidationExclusiveGpu;
}
