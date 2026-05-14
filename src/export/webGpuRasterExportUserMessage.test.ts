import { describe, expect, it } from 'vitest';
import { formatWebGpuRasterExportUserMessage } from './webGpuRasterExportUserMessage';

describe('formatWebGpuRasterExportUserMessage', () => {
  it('includes reason, optional detail, and WebGL switch hint', () => {
    const msg = formatWebGpuRasterExportUserMessage('compile.unsupported', 'node X; node Y');
    expect(msg).toContain('compile.unsupported');
    expect(msg).toContain('node X; node Y');
    expect(msg).toContain('?renderBackend=webgl');
  });

  it('works without detail', () => {
    const msg = formatWebGpuRasterExportUserMessage('navigator.gpu.absent');
    expect(msg).toContain('navigator.gpu.absent');
    expect(msg).toContain('?renderBackend=webgl');
  });
});
