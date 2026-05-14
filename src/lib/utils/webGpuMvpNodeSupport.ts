import { WGSL_SUPPORTED_NODE_TYPES } from '../../shaders/compilation/wgslSupportedNodeTypes';

/** True when `nodeType` is supported for WebGPU MVP fullscreen / worker preview compilation. */
export function isNodeTypeSupportedOnWebGpuMvp(nodeType: string): boolean {
  return WGSL_SUPPORTED_NODE_TYPES.has(nodeType);
}

/** First unsupported type in `nodeTypes`, or `undefined` if all supported. */
export function firstUnsupportedWebGpuMvpNodeType(nodeTypes: readonly string[]): string | undefined {
  for (const t of nodeTypes) {
    if (!WGSL_SUPPORTED_NODE_TYPES.has(t)) return t;
  }
  return undefined;
}
