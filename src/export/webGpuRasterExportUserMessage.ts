/**
 * User-facing copy when a WebGPU-session export job cannot finish on the WebGPU raster path.
 * Matches preview hard-block guidance (exclusive GPU modes).
 */
export function formatWebGpuRasterExportUserMessage(reason: string, detail?: string): string {
  const extra = detail && detail.length > 0 ? ` — ${detail}` : '';
  return `WebGPU export cannot complete (${reason})${extra}. Add ?renderBackend=webgl to the URL, reload, and export again in WebGL mode, or simplify the graph for WGSL-supported nodes.`;
}
