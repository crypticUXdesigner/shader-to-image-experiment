import type { CompilationResult } from '../types';
import { getWebGpuPreviewCacheMaxModules, previewPerfCounters } from '../previewPerformanceMarks';

/**
 * Compare WebGPU fullscreen preview param slot maps for pipeline reuse decisions.
 */
export function webGpuParamLayoutsEqual(
  a: CompilationResult['paramLayout'],
  b: CompilationResult['paramLayout']
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Drop oldest fullscreen shader+pipeline pairs when the module cache grows past the preview cap.
 * WebGPU lacks `GPUShaderModule.destroy()`; eviction releases JS references so the driver can reclaim.
 * Keys must match between `shaderModuleCache` and `renderPipelineCache` (same insertion order).
 */
export function trimWebGpuShaderPipelineCaches(
  shaderModuleCache: Map<string, GPUShaderModule>,
  renderPipelineCache: Map<string, GPURenderPipeline>
): void {
  const maxModules = getWebGpuPreviewCacheMaxModules();
  while (shaderModuleCache.size > maxModules) {
    const oldest = shaderModuleCache.keys().next().value;
    if (oldest === undefined) break;
    shaderModuleCache.delete(oldest);
    renderPipelineCache.delete(oldest);
    previewPerfCounters.webgpuShaderPipelineCacheEvictions += 1;
  }
}
