/**
 * Tests for CompilationManager: no-worker path, worker path (mock), and destroy.
 * Ensures recompile applies result on main thread when worker is null, and posts
 * correct payload / applies result when worker is set; destroy terminates worker.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildArrangementSnapshot } from '../audiotool/arrangement/buildArrangementSnapshot';
import type { RawArrangementEntities } from '../audiotool/arrangement/rawEntities';
import spikeFixture from '../audiotool/arrangement/__fixtures__/spike-arrangement-raw.json';
import type { NodeGraph } from '../data-model/types';
import type { AudioSetup } from '../data-model/audioSetupTypes';
import type { PreviewCompileUiSink } from './previewCompileUiSink';
import type { CompilationResult } from './types';
import { createCompilationManager } from './factories';
import type { ShaderCompiler } from './types';
import type { RenderBackendSelection } from './renderBackends/renderBackendTypes';
import * as runtimeUtils from './utils';

// Mock ShaderInstance so we don't need WebGL. CompilationManager and parameterTransfer
// only need: setParameter, getParameters, setTimelineTime, setTime, getTimelineTime, getTime, destroy.
const mockInstanceMethods = {
  setParameter: vi.fn(),
  getParameters: vi.fn(() => [] as [string, number | [number, number, number, number]][]),
  setTimelineTime: vi.fn(),
  setTime: vi.fn(),
  getTimelineTime: vi.fn(() => 0),
  getTime: vi.fn(() => 0),
  destroy: vi.fn(),
};

vi.mock('./ShaderInstance', () => ({
  ShaderInstance: class MockShaderInstance {
    constructor(_gl: unknown, _result: CompilationResult, _opts?: unknown) {
      Object.assign(this, mockInstanceMethods);
    }
  },
  SHADER_INSTANCE_PROGRAM_PENDING_MESSAGE: 'WEBGL_PROGRAM_PENDING',
}));

function minimalCompilationResult(finalOutputNodeId: string | null = 'n2'): CompilationResult {
  return {
    backend: 'webgl',
    supported: true,
    unsupportedReasons: undefined,
    code: 'void main() { gl_FragColor = vec4(0.0); }',
    shaderCode: 'void main() { gl_FragColor = vec4(0.0); }',
    uniforms: [],
    metadata: {
      warnings: [],
      errors: [],
      executionOrder: [],
      finalOutputNodeId,
      previewDependencies: {
        usesWallTime: false,
        usesTimelineTime: false,
        usesAudioUniforms: false,
        usesRadialPulseVirtualDrive: false,
        usesRadialPulseSpawnUniformPass: false,
        usesResolutionUniform: false,
        usesMouseUniforms: false,
        usesFrameIndex: false
      }
    },
    paramLayout: {},
    resources: undefined,
    webgpuPassPlan: undefined,
  };
}

function minimalGraph(): NodeGraph {
  return {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n2', type: 'final-output', position: { x: 0, y: 0 }, parameters: {} },
    ],
    connections: [{ id: 'c1', sourceNodeId: 'n1', sourcePort: 'out', targetNodeId: 'n2', targetPort: 'in' }],
  };
}

function createMockCompiler(): ShaderCompiler {
  return {
    compile: vi.fn(() => minimalCompilationResult()),
    compileIncremental: vi.fn(() => null),
  };
}

function createMockRenderer() {
  const setShaderInstance = vi.fn();
  const markDirty = vi.fn();
  const render = vi.fn();
  const mockGL = {
    isContextLost: vi.fn(() => false),
  };
  const selection: RenderBackendSelection = { mode: 'auto', selected: 'webgl2', reason: 'test' };
  return {
    selection,
    getPreviewCompileExclusiveGpu: () => selection.selected,
    setShaderInstance,
    markDirty,
    render,
    getGLContext: vi.fn(() => mockGL),
    getCanvas: vi.fn(() => ({ width: 1, height: 1 }) as unknown as HTMLCanvasElement),
    setOnContextRestored: vi.fn(),
    setOnContextLost: vi.fn(),
  };
}

function createFakePreviewCompileUiSink(): PreviewCompileUiSink {
  return {
    beginPreviewCompileProgressToast: vi.fn(),
    clearPreviewCompileProgressToast: vi.fn(),
    previewCompileFailedKeptLastGood: vi.fn(),
  };
}

// CompilationManager uses window.setTimeout / window.cancelIdleCallback; ensure window exists in Node test env.
function ensureWindow() {
  if (typeof (globalThis as unknown as { window?: unknown }).window === 'undefined') {
    (globalThis as unknown as { window: typeof globalThis }).window = globalThis as unknown as Window;
  }
}

describe('CompilationManager', () => {
  beforeEach(() => {
    ensureWindow();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('no-worker path', () => {
    it('applies compilation result when recompile runs on main thread', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true); // immediate → setTimeout(80ms) then recompile

      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledWith(minimalGraph(), null, { backend: 'webgl' });
      expect(renderer.setShaderInstance).toHaveBeenCalled();
      expect(cm.getShaderInstance()).not.toBeNull();
      expect(cm.getPreviewDependencyMask()).toEqual({
        usesWallTime: false,
        usesTimelineTime: false,
        usesAudioUniforms: false,
        usesRadialPulseVirtualDrive: false,
        usesRadialPulseSpawnUniformPass: false,
        usesResolutionUniform: false,
        usesMouseUniforms: false,
        usesFrameIndex: false
      });
    });

    it('does not compile WebGL when WebGPU compile is unusable (main thread, exclusive session)', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      renderer.selection.selected = 'webgpu';
      const report = vi.fn();
      const cm = createCompilationManager(compiler, renderer, {
        reportError: vi.fn(),
        report,
        onError: vi.fn(),
        offError: vi.fn(),
      });
      compiler.compile = vi.fn((_g, _a, opts?: { backend?: string }) => {
        if (opts?.backend === 'webgpu') {
          return {
            ...minimalCompilationResult(),
            backend: 'webgpu',
            supported: true,
            metadata: {
              ...minimalCompilationResult().metadata,
              errors: ['WGSL failure'],
            },
          } satisfies CompilationResult;
        }
        return minimalCompilationResult();
      });

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(1);
      expect(compiler.compile).toHaveBeenCalledWith(minimalGraph(), null, { backend: 'webgpu' });
      expect(renderer.setShaderInstance).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledWith(
        'runtime',
        'error',
        expect.stringContaining('WebGPU cannot preview'),
        expect.any(Array)
      );
    });

    it('WebGPU apply does not destroy the program when setWebGpuProgram reuses the same instance', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      renderer.selection.selected = 'webgpu';
      (renderer as unknown as { isWebGpuPreviewBlocked?: () => boolean }).isWebGpuPreviewBlocked = () => false;

      const sharedDestroy = vi.fn();
      const sharedProgram = {
        setParameter: vi.fn(),
        setParameters: vi.fn(),
        setAudioUniform: vi.fn(),
        getParameters: vi.fn(() => new Map<string, number | [number, number, number, number]>()),
        setTimelineTime: vi.fn(),
        setTime: vi.fn(),
        getTimelineTime: vi.fn(() => 0),
        getTime: vi.fn(() => 0),
        destroy: sharedDestroy,
      };

      (renderer as unknown as { setWebGpuProgram?: (r: CompilationResult) => unknown }).setWebGpuProgram = vi.fn(
        () => sharedProgram
      );

      const webGpuOk = (): CompilationResult => ({
        ...minimalCompilationResult(),
        backend: 'webgpu',
        supported: true,
        code: '@fragment fn fs() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }',
        metadata: {
          ...minimalCompilationResult().metadata,
          errors: [],
        },
      });

      compiler.compile = vi.fn((_g, _a, opts?: { backend?: string }) => {
        if (opts?.backend === 'webgpu') return webGpuOk();
        return minimalCompilationResult();
      });

      const cm = createCompilationManager(compiler, renderer);
      const g = minimalGraph();

      cm.setGraph(g);
      cm.setAudioSetup({
        files: [{ id: 'f1', name: 't', autoPlay: false }],
        bands: [],
        remappers: [],
      });
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(sharedDestroy).not.toHaveBeenCalled();

      cm.setGraph(g);
      cm.setAudioSetup({
        files: [{ id: 'f2', name: 't2', autoPlay: false }],
        bands: [],
        remappers: [],
      });
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(2);
      expect(sharedDestroy).not.toHaveBeenCalled();
    });

    it('recompiles when audio setup changes even if the graph reference is unchanged', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      const g = minimalGraph();
      const audioV1: AudioSetup = {
        files: [{ id: 'f1', name: 't', autoPlay: false }],
        bands: [],
        remappers: [],
      };
      const audioV2: AudioSetup = {
        files: [{ id: 'f1', name: 't', autoPlay: false }],
        bands: [
          {
            id: 'band-1',
            name: 'Bass',
            sourceFileId: 'f1',
            frequencyBands: [[20, 120]],
            fftSize: 2048,
          },
        ],
        remappers: [],
      };

      cm.setGraph(g);
      cm.setAudioSetup(audioV1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      cm.setGraph(g);
      cm.setAudioSetup(audioV2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(2);
    });

    it('first compile after project load includes arrangement snapshot when audio is set before graph', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);
      const snapshot = buildArrangementSnapshot(spikeFixture as RawArrangementEntities);
      const g = minimalGraph();
      const audioWithSnapshot: AudioSetup = {
        files: [],
        bands: [],
        remappers: [],
        primarySource: { type: 'playlist', trackId: snapshot.source.trackName },
        arrangementSnapshot: snapshot,
      };
      const audioEmpty: AudioSetup = { files: [], bands: [], remappers: [] };

      const snapshotAtCompile: unknown[] = [];
      (compiler.compile as ReturnType<typeof vi.fn>).mockImplementation((_graph, audio) => {
        snapshotAtCompile.push(audio?.arrangementSnapshot);
        return minimalCompilationResult();
      });

      // Buggy hub load order: graph compile kick before audio setup is on CompilationManager.
      cm.setGraph(g);
      cm.onGraphStructureChange(true);
      cm.setAudioSetup(audioEmpty);
      vi.runAllTimers();
      expect(snapshotAtCompile[0]).toBeUndefined();

      snapshotAtCompile.length = 0;
      (compiler.compile as ReturnType<typeof vi.fn>).mockClear();

      // Fixed order: audio setup before graph, then forced full recompile (RuntimeManager.loadProject).
      cm.setAudioSetup(audioWithSnapshot);
      cm.setGraph(g);
      cm.requestFullPreviewRecompile();
      vi.runAllTimers();
      expect(snapshotAtCompile[snapshotAtCompile.length - 1]).toEqual(snapshot);
    });

    it('requestFullPreviewRecompile runs even when graph reference is unchanged', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);
      const g = minimalGraph();

      cm.setGraph(g);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      (compiler.compile as ReturnType<typeof vi.fn>).mockClear();
      cm.requestFullPreviewRecompile();
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('skips recompilation when only disconnected nodes change', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      const g1 = minimalGraph();
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(1);

      // Add a disconnected node (idle slice): no connections added/removed.
      const g2: NodeGraph = {
        ...g1,
        nodes: [...g1.nodes, { id: 'idle1', type: 'float', position: { x: 10, y: 10 }, parameters: { value: 1 } }],
      };
      cm.setGraph(g2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      // Should not recompile because output-reachable slice is unchanged.
      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('skips recompilation when only idle-to-idle connections change', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      const g1: NodeGraph = {
        ...minimalGraph(),
        nodes: [
          ...minimalGraph().nodes,
          { id: 'idle1', type: 'float', position: { x: 1, y: 1 }, parameters: { value: 0.5 } },
          { id: 'idle2', type: 'float', position: { x: 2, y: 2 }, parameters: { value: 0.25 } },
        ],
      };
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      const g2: NodeGraph = {
        ...g1,
        connections: [
          ...g1.connections,
          {
            id: 'cIdle',
            sourceNodeId: 'idle2',
            sourcePort: 'out',
            targetNodeId: 'idle1',
            targetParameter: 'value',
          },
        ],
      };
      cm.setGraph(g2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('recompiles when output path is rewired to a previously idle node', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      const g1: NodeGraph = {
        ...minimalGraph(),
        nodes: [
          ...minimalGraph().nodes,
          { id: 'idle1', type: 'float', position: { x: 1, y: 1 }, parameters: { value: 0.9 } },
        ],
      };
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);

      const g2: NodeGraph = {
        ...g1,
        connections: [
          {
            id: 'c2',
            sourceNodeId: 'idle1',
            sourcePort: 'out',
            targetNodeId: 'n2',
            targetPort: 'in',
          },
        ],
      };
      cm.setGraph(g2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(2);
    });

    it('begins preview compile progress toast when only graph automation changes (no new nodes)', () => {
      const sink = createFakePreviewCompileUiSink();

      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer, undefined, null, sink);

      const g1 = minimalGraph();
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(compiler.compile).toHaveBeenCalledTimes(1);
      vi.mocked(sink.beginPreviewCompileProgressToast).mockClear();

      const g2: NodeGraph = {
        ...g1,
        automation: {
          bpm: 120,
          durationSeconds: 60,
          lanes: [
            {
              id: 'lane-1',
              nodeId: 'n2',
              paramName: 'opacity',
              regions: [],
            },
          ],
        },
      };
      cm.setGraph(g2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(2);
      expect(sink.beginPreviewCompileProgressToast).toHaveBeenCalledTimes(1);
    });

    it('calls previewCompileFailedKeptLastGood after metadata compile failure when shader instance exists', () => {
      const sink = createFakePreviewCompileUiSink();
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer, undefined, null, sink);

      const g1 = minimalGraph();
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      expect(cm.getShaderInstance()).not.toBeNull();

      compiler.compile = vi.fn(() => ({
        ...minimalCompilationResult(),
        metadata: {
          ...minimalCompilationResult().metadata,
          errors: ['fixture: compile metadata error'],
        },
      }));
      vi.mocked(sink.previewCompileFailedKeptLastGood).mockClear();

      const g2: NodeGraph = {
        ...g1,
        automation: {
          bpm: 120,
          durationSeconds: 60,
          lanes: [{ id: 'lane-1', nodeId: 'n2', paramName: 'opacity', regions: [] }],
        },
      };
      cm.setGraph(g2);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(sink.previewCompileFailedKeptLastGood).toHaveBeenCalledTimes(1);
    });

    it('ignores parameter updates for nodes outside the preview slice', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      const g1: NodeGraph = {
        ...minimalGraph(),
        nodes: [
          ...minimalGraph().nodes,
          { id: 'idle1', type: 'float', position: { x: 1, y: 1 }, parameters: { value: 1 } },
        ],
      };
      cm.setGraph(g1);
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      mockInstanceMethods.setParameter.mockClear();
      cm.onParameterChange('idle1', 'value', 2);
      vi.runAllTimers();

      expect(mockInstanceMethods.setParameter).not.toHaveBeenCalled();
    });

    it('applies parameter updates on forward branches from the preview chain (e.g. multiply → mask stack)', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      try {
        const compiler = createMockCompiler();
        const renderer = createMockRenderer();
        const cm = createCompilationManager(compiler, renderer);

        const g1: NodeGraph = {
          id: 'g-branch',
          name: 'Test',
          version: '2.0',
          nodes: [
            { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
            { id: 'n2', type: 'final-output', position: { x: 1, y: 0 }, parameters: {} },
            {
              id: 'dead',
              type: 'constant-float',
              position: { x: 2, y: 0 },
              parameters: { value: 0.5 },
            },
          ],
          connections: [
            {
              id: 'to-final',
              sourceNodeId: 'n1',
              sourcePort: 'out',
              targetNodeId: 'n2',
              targetPort: 'in',
            },
            {
              id: 'to-side',
              sourceNodeId: 'n1',
              sourcePort: 'out',
              targetNodeId: 'dead',
              targetParameter: 'value',
            },
          ],
        };
        cm.setGraph(g1);
        cm.onGraphStructureChange(true);
        vi.runAllTimers();

        mockInstanceMethods.setParameter.mockClear();
        cm.onParameterChange('dead', 'value', 0.25);
        vi.runAllTimers();

        expect(mockInstanceMethods.setParameter).toHaveBeenCalledWith('dead', 'value', 0.25);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('debounced scheduleRecompile uses requestAnimationFrame after idle (not recompile inside idle callback)', () => {
      const rafMock = vi.fn((cb: FrameRequestCallback): number => {
        return 1;
      });
      vi.stubGlobal('requestAnimationFrame', rafMock);
      vi.stubGlobal('cancelAnimationFrame', vi.fn());
      const idleCallbacks: Array<() => void> = [];
      vi.stubGlobal(
        'requestIdleCallback',
        (cb: IdleRequestCallback) => {
          idleCallbacks.push(() =>
            cb({ didTimeout: false, timeRemaining: () => 5 } as IdleDeadline)
          );
          return idleCallbacks.length;
        }
      );
      vi.stubGlobal('cancelIdleCallback', vi.fn());
      try {
        const compiler = createMockCompiler();
        const renderer = createMockRenderer();
        const cm = createCompilationManager(compiler, renderer);
        cm.setGraph(minimalGraph());
        cm.onGraphStructureChange(false);

        expect(idleCallbacks).toHaveLength(1);
        expect(compiler.compile).not.toHaveBeenCalled();

        idleCallbacks[0]?.();
        expect(compiler.compile).not.toHaveBeenCalled();
        expect(rafMock).toHaveBeenCalled();

        const rafCb = rafMock.mock.calls[rafMock.mock.calls.length - 1]?.[0] as FrameRequestCallback;
        rafCb(0);

        expect(compiler.compile).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('coalesces multiple immediate structure changes into one compile', () => {
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      cm.onGraphStructureChange(true);
      cm.onGraphStructureChange(true);

      vi.runAllTimers();

      expect(compiler.compile).toHaveBeenCalledTimes(1);
    });

    it('does not call hashGraph on uniform onParameterChange when compile identity is synced', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      const hashSpy = vi.spyOn(runtimeUtils, 'hashGraph');
      try {
        const compiler = createMockCompiler();
        const renderer = createMockRenderer();
        const cm = createCompilationManager(compiler, renderer);

        const graphWithUniform: NodeGraph = {
          id: 'g-hash-skip',
          name: 'Test',
          version: '2.0',
          nodes: [
            { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
            {
              id: 'nf',
              type: 'constant-float',
              position: { x: 1, y: 0 },
              parameters: { value: 0.5 },
            },
            { id: 'n2', type: 'final-output', position: { x: 2, y: 0 }, parameters: {} },
          ],
          connections: [
            {
              id: 'c1',
              sourceNodeId: 'n1',
              sourcePort: 'out',
              targetNodeId: 'nf',
              targetPort: 'in',
            },
            {
              id: 'c2',
              sourceNodeId: 'nf',
              sourcePort: 'out',
              targetNodeId: 'n2',
              targetPort: 'in',
            },
          ],
        };
        cm.setGraph(graphWithUniform);
        cm.onGraphStructureChange(true);
        vi.runAllTimers();
        expect(cm.getShaderInstance()).not.toBeNull();

        hashSpy.mockClear();
        cm.onParameterChange('nf', 'value', 0.25);
        cm.onParameterChange('nf', 'value', 0.5);
        expect(hashSpy).not.toHaveBeenCalled();
      } finally {
        hashSpy.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    it('does not call hashGraph on uniform onParameterChange while compile identity is ahead of last sync', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      const hashSpy = vi.spyOn(runtimeUtils, 'hashGraph');
      try {
        const compiler = createMockCompiler();
        const renderer = createMockRenderer();
        const cm = createCompilationManager(compiler, renderer);

        cm.setGraph(minimalGraph());
        cm.onGraphStructureChange(true);
        vi.runAllTimers();
        expect(cm.getShaderInstance()).not.toBeNull();

        hashSpy.mockClear();
        cm.onGraphStructureChange(true);
        cm.onParameterChange('n1', 'nonexistent', 1);
        cm.onParameterChange('n1', 'nonexistent', 2);
        cm.onParameterChange('n1', 'nonexistent', 3);
        expect(hashSpy).not.toHaveBeenCalled();
      } finally {
        hashSpy.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    it('reuses preview parameter surface cache across uniform onParameterChange on the same graph', () => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
      try {
        const compiler = createMockCompiler();
        const renderer = createMockRenderer();
        const cm = createCompilationManager(compiler, renderer);

        const g1: NodeGraph = {
          id: 'g-surface-cache',
          name: 'Test',
          version: '2.0',
          nodes: [
            { id: 'n1', type: 'time', position: { x: 0, y: 0 }, parameters: {} },
            { id: 'n2', type: 'final-output', position: { x: 1, y: 0 }, parameters: {} },
            {
              id: 'dead',
              type: 'constant-float',
              position: { x: 2, y: 0 },
              parameters: { value: 0.5 },
            },
          ],
          connections: [
            {
              id: 'to-final',
              sourceNodeId: 'n1',
              sourcePort: 'out',
              targetNodeId: 'n2',
              targetPort: 'in',
            },
            {
              id: 'to-side',
              sourceNodeId: 'n1',
              sourcePort: 'out',
              targetNodeId: 'dead',
              targetParameter: 'value',
            },
          ],
        };
        cm.setGraph(g1);
        cm.onGraphStructureChange(true);
        vi.runAllTimers();
        expect(cm.getShaderInstance()).not.toBeNull();

        cm.resetPreviewParameterSurfaceFullWalkCountForTests();
        cm.onParameterChange('dead', 'value', 0.25);
        expect(cm.getPreviewParameterSurfaceFullWalkCountForTests()).toBe(1);
        cm.onParameterChange('dead', 'value', 0.5);
        expect(cm.getPreviewParameterSurfaceFullWalkCountForTests()).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('worker path (mock)', () => {
    /** Node test env may lack rAF; stub so worker path runs, with immediate callback like production's next frame. */
    beforeEach(() => {
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });
      vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('posts compile payload and applies result when worker replies with matching id', () => {
      const postMessageCalls: unknown[] = [];
      const mockWorker = {
        postMessage: vi.fn((payload: unknown) => postMessageCalls.push(payload)),
        onmessage: null as ((ev: MessageEvent) => void) | null,
        terminate: vi.fn(),
      };

      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer, undefined, mockWorker as unknown as Worker);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);

      vi.runAllTimers();

      expect(postMessageCalls.length).toBeGreaterThanOrEqual(1);
      const payload = postMessageCalls[0] as {
        type: string;
        id: number;
        targetBackend: string;
        graph: NodeGraph;
        audioSetup: unknown;
        previousResult: CompilationResult | null;
        affectedNodeIds: string[];
        tryIncremental: boolean;
      };
      expect(payload.type).toBe('compile');
      expect(typeof payload.id).toBe('number');
      expect(payload.targetBackend).toBe('webgl');
      expect(payload.graph).toEqual(minimalGraph());
      expect(payload.audioSetup).toBeNull();
      expect(payload.previousResult).toBeNull();
      expect(Array.isArray(payload.affectedNodeIds)).toBe(true);
      expect(typeof payload.tryIncremental).toBe('boolean');

      // Main-thread compiler should not be used when worker is set
      expect(compiler.compile).not.toHaveBeenCalled();

      // Simulate worker reply with matching id
      const result = minimalCompilationResult();
      const replyId = payload.id;
      mockWorker.onmessage?.({
        data: { type: 'result', id: replyId, result },
      } as MessageEvent);

      expect(renderer.setShaderInstance).toHaveBeenCalled();
      expect(cm.getShaderInstance()).not.toBeNull();
      expect(cm.getPreviewDependencyMask()).toEqual(result.metadata.previewDependencies);
    });

    it('hard-blocks WebGPU worker result when unusable — no WebGL recompile (exclusive session)', () => {
      const postMessageCalls: unknown[] = [];
      const mockWorker = {
        postMessage: vi.fn((payload: unknown) => postMessageCalls.push(payload)),
        onmessage: null as ((ev: MessageEvent) => void) | null,
        terminate: vi.fn(),
      };
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      // Force WebGPU as the requested backend so the fallback path is exercised.
      renderer.selection.selected = 'webgpu';
      const reportCalls: Array<{
        category: string;
        severity: string;
        message: string;
        details: string[] | undefined;
      }> = [];
      const errorHandler = {
        reportError: vi.fn(),
        report: vi.fn(
          (
            category: string,
            severity: string,
            message: string,
            details?: string[] | Record<string, unknown>
          ) => {
            reportCalls.push({
              category,
              severity,
              message,
              details: Array.isArray(details) ? details : undefined,
            });
          }
        ),
        onError: vi.fn(),
        offError: vi.fn(),
      };
      const cm = createCompilationManager(compiler, renderer, errorHandler, mockWorker as unknown as Worker);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      expect(postMessageCalls.length).toBeGreaterThanOrEqual(1);
      const initialPayload = postMessageCalls[0] as { id: number; targetBackend: string };
      expect(initialPayload.targetBackend).toBe('webgpu');

      // Reply with an unsupported WebGPU result mirroring leftover WebGL-only fragments.
      const webgpuUnsupported: CompilationResult = {
        ...minimalCompilationResult(),
        backend: 'webgpu',
        supported: false,
        unsupportedReasons: ['unsupported node type: ___webgpu_fixture_placeholder_node___'],
        code: '',
      };
      mockWorker.onmessage?.({
        data: { type: 'result', id: initialPayload.id, result: webgpuUnsupported },
      } as MessageEvent);

      expect(postMessageCalls.length).toBe(1);
      expect(reportCalls).toHaveLength(1);
      expect(reportCalls[0].severity).toBe('error');
      expect(reportCalls[0].message).toContain('WebGPU cannot preview');
      expect(reportCalls[0].details).toEqual(webgpuUnsupported.unsupportedReasons);

      // Replaying the same unsupported snapshot must not double-toast.
      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      vi.runAllTimers();
      const followupPayload = postMessageCalls[postMessageCalls.length - 1] as { id: number };
      mockWorker.onmessage?.({
        data: { type: 'result', id: followupPayload.id, result: webgpuUnsupported },
      } as MessageEvent);
      expect(reportCalls).toHaveLength(1);
    });

    it('hard-blocks when WebGPU worker result has metadata errors — no WebGL follow-up compile', () => {
      const postMessageCalls: unknown[] = [];
      const mockWorker = {
        postMessage: vi.fn((payload: unknown) => postMessageCalls.push(payload)),
        onmessage: null as ((ev: MessageEvent) => void) | null,
        terminate: vi.fn(),
      };
      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      renderer.selection.selected = 'webgpu';

      const cm = createCompilationManager(compiler, renderer, undefined, mockWorker as unknown as Worker);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      const initialPayload = postMessageCalls[0] as { id: number; targetBackend: string };
      expect(initialPayload.targetBackend).toBe('webgpu');

      const webgpuWithErrors: CompilationResult = {
        ...minimalCompilationResult(),
        backend: 'webgpu',
        supported: true,
        metadata: {
          ...minimalCompilationResult().metadata,
          errors: ['WGSL compile failed (fixture)'],
        },
      };
      mockWorker.onmessage?.({
        data: { type: 'result', id: initialPayload.id, result: webgpuWithErrors },
      } as MessageEvent);

      expect(postMessageCalls.length).toBe(1);
      expect(renderer.setShaderInstance).not.toHaveBeenCalled();
      expect(cm.getShaderInstance()).toBeNull();
    });

    it('ignores worker result when id does not match', () => {
      const postMessageCalls: unknown[] = [];
      const mockWorker = {
        postMessage: vi.fn((payload: unknown) => postMessageCalls.push(payload)),
        onmessage: null as ((ev: MessageEvent) => void) | null,
        terminate: vi.fn(),
      };

      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer, undefined, mockWorker as unknown as Worker);

      cm.setGraph(minimalGraph());
      cm.onGraphStructureChange(true);
      vi.runAllTimers();

      const payload = postMessageCalls[0] as { id: number };
      const wrongId = payload.id + 999;
      mockWorker.onmessage?.({
        data: { type: 'result', id: wrongId, result: minimalCompilationResult() },
      } as MessageEvent);

      // setShaderInstance should not have been called from this stale reply
      expect(renderer.setShaderInstance).not.toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('terminates worker when destroy is called', () => {
      const terminate = vi.fn();
      const mockWorker = {
        postMessage: vi.fn(),
        onmessage: null,
        terminate,
      };

      const compiler = createMockCompiler();
      const renderer = createMockRenderer();
      const cm = createCompilationManager(compiler, renderer, undefined, mockWorker as unknown as Worker);

      cm.destroy();
      expect(terminate).toHaveBeenCalledTimes(1);
    });
  });
});
