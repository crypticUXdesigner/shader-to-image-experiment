import { describe, expect, it } from 'vitest';
import type { NodeGraph } from '../../data-model/types';
import type { NodeSpec } from '../../types/nodeSpec';
import { nodeSystemSpecs } from '../nodes';
import { computePreviewDependencyMask, mergeWebGpuPreviewDependencyMask } from './previewDependencyMask';
import type { PreviewDependencyMask } from '../../runtime/types';

function allFalseMask(): PreviewDependencyMask {
  return {
    usesWallTime: false,
    usesTimelineTime: false,
    usesAudioUniforms: false,
    usesRadialPulseVirtualDrive: false,
    usesRadialPulseSpawnUniformPass: false,
    usesResolutionUniform: false,
    usesMouseUniforms: false,
    usesFrameIndex: false
  };
}

function specsMap(): Map<string, NodeSpec> {
  return new Map(nodeSystemSpecs.map((s) => [s.id, s]));
}

describe('computePreviewDependencyMask (radial pulse spawn)', () => {
  it('sets usesRadialPulseVirtualDrive when Drive is wired to a virtual audio node on the preview path', () => {
    const virtualRemap = 'audio-signal:remap-r1';
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'n-p',
          type: 'radial-pulse',
          position: { x: 0, y: 0 },
          parameters: {},
          parameterInputModes: {},
        },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-p', targetPort: 'in' },
        {
          id: 'c2',
          sourceNodeId: virtualRemap,
          sourcePort: 'out',
          targetNodeId: 'n-p',
          targetParameter: 'pulseDrive',
        },
        { id: 'c3', sourceNodeId: 'n-p', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
      ],
    };

    const mask = computePreviewDependencyMask(graph, [], 'void main(){}', specsMap(), null);
    expect(mask.usesRadialPulseVirtualDrive).toBe(true);
    expect(mask.usesRadialPulseSpawnUniformPass).toBe(true);
  });

  it('does not set usesRadialPulseVirtualDrive when radial-pulse is not upstream of final-output', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'n-p',
          type: 'radial-pulse',
          position: { x: 0, y: 0 },
          parameters: {},
          parameterInputModes: {},
        },
        { id: 'n-other', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        {
          id: 'cDrive',
          sourceNodeId: 'audio-signal:remap-x',
          sourcePort: 'out',
          targetNodeId: 'n-p',
          targetParameter: 'pulseDrive',
        },
        { id: 'cMain', sourceNodeId: 'n-other', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
      ],
    };

    const mask = computePreviewDependencyMask(graph, [], '', specsMap(), null);
    expect(mask.usesRadialPulseVirtualDrive).toBe(false);
    expect(mask.usesRadialPulseSpawnUniformPass).toBe(false);
  });

  it('sets spawn uniform pass when loop interval is enabled and Drive has no virtual connection', () => {
    const graph: NodeGraph = {
      id: 'g',
      name: 't',
      version: '2.0',
      nodes: [
        { id: 'n-uv', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
        {
          id: 'n-p',
          type: 'radial-pulse',
          position: { x: 0, y: 0 },
          parameters: { pulseFreeRunInterval: 2 },
          parameterInputModes: {},
        },
        { id: 'n-out', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
      ],
      connections: [
        { id: 'c1', sourceNodeId: 'n-uv', sourcePort: 'out', targetNodeId: 'n-p', targetPort: 'in' },
        { id: 'c2', sourceNodeId: 'n-p', sourcePort: 'out', targetNodeId: 'n-out', targetPort: 'in' },
      ],
    };

    const mask = computePreviewDependencyMask(graph, [], 'uniform float uTime;', specsMap(), null);
    expect(mask.usesRadialPulseVirtualDrive).toBe(false);
    expect(mask.usesRadialPulseSpawnUniformPass).toBe(true);
  });
});

describe('mergeWebGpuPreviewDependencyMask', () => {
  it('returns computed unchanged when no pass plan and no provided mask', () => {
    const computed = { ...allFalseMask(), usesWallTime: true };
    expect(mergeWebGpuPreviewDependencyMask(computed, undefined, false)).toEqual(computed);
    expect(mergeWebGpuPreviewDependencyMask(computed, null, false)).toEqual(computed);
  });

  it('forces usesWallTime when a WebGPU pass plan is active', () => {
    const computed = allFalseMask();
    const merged = mergeWebGpuPreviewDependencyMask(computed, undefined, true);
    expect(merged.usesWallTime).toBe(true);
    expect(merged.usesAudioUniforms).toBe(false);
  });

  it('forces usesWallTime when panel audio uniforms are present (no pass plan)', () => {
    const computed = { ...allFalseMask(), usesAudioUniforms: true, usesWallTime: false };
    const merged = mergeWebGpuPreviewDependencyMask(computed, undefined, false);
    expect(merged.usesWallTime).toBe(true);
    expect(merged.usesAudioUniforms).toBe(true);
  });

  it('OR-merges provided snapshot with computed', () => {
    const computed = { ...allFalseMask(), usesWallTime: false, usesAudioUniforms: true };
    const provided: PreviewDependencyMask = {
      ...allFalseMask(),
      usesWallTime: true,
      usesAudioUniforms: false
    };
    const merged = mergeWebGpuPreviewDependencyMask(computed, provided, false);
    expect(merged.usesWallTime).toBe(true);
    expect(merged.usesAudioUniforms).toBe(true);
  });
});
