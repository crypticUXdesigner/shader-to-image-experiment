import { describe, it, expect } from 'vitest';
import { buildArrangementSnapshot } from '../../audiotool/arrangement/buildArrangementSnapshot';
import type { RawArrangementEntities } from '../../audiotool/arrangement/rawEntities';
import spikeFixture from '../../audiotool/arrangement/__fixtures__/spike-arrangement-raw.json';
import {
  buildArrangementLanesGlslBake,
  buildArrangementLanesWgslNodeHelper,
  filterRegionsForNode,
  packArrangementRegionsForGlsl,
  resolveVisibleTracks,
} from './packArrangementRegionsForGlsl';
import type { NodeInstance } from '../../data-model/types';

const snapshot = buildArrangementSnapshot(spikeFixture as RawArrangementEntities);

function lanesNode(overrides?: Partial<NodeInstance['parameters']>): NodeInstance {
  return {
    id: 'node-arr-1',
    type: 'arrangement-lanes',
    parameters: {
      trackFilterMode: 0,
      trackFilterList: '',
      ...overrides,
    },
    position: { x: 0, y: 0 },
  };
}

describe('packArrangementRegionsForGlsl', () => {
  it('packs enabled regions on enabled tracks', () => {
    const { regions, trackCount } = packArrangementRegionsForGlsl(snapshot, {
      trackFilterMode: 0,
      trackFilterList: '',
    });
    expect(trackCount).toBe(3);
    // region-note-2 is on disabled track-note-2 and is omitted from the lane pack
    expect(regions).toHaveLength(3);
    expect(regions[0]?.startSeconds).toBeGreaterThanOrEqual(0);
    expect(regions.every((r) => r.endSeconds > r.startSeconds)).toBe(true);
  });

  it('filters to subset of track ids', () => {
    const { regions, trackCount } = packArrangementRegionsForGlsl(snapshot, {
      trackFilterMode: 1,
      trackFilterList: 'track-note-1,track-audio-1',
    });
    expect(trackCount).toBe(2);
    expect(regions.every((r) => r.trackRow >= 0 && r.trackRow <= 1)).toBe(true);
    expect(regions).toHaveLength(2);
  });

  it('resolveVisibleTracks follows comma-separated order over project track order', () => {
    const projectOrder = resolveVisibleTracks(snapshot, {
      trackFilterMode: 1,
      trackFilterList: 'track-note-1,track-audio-1',
    }).map((t) => t.id);
    const reversed = resolveVisibleTracks(snapshot, {
      trackFilterMode: 1,
      trackFilterList: 'track-audio-1,track-note-1',
    }).map((t) => t.id);
    expect(projectOrder).toEqual(['track-note-1', 'track-audio-1']);
    expect(reversed).toEqual(['track-audio-1', 'track-note-1']);
  });

  it('returns empty pack without snapshot', () => {
    expect(
      packArrangementRegionsForGlsl(undefined, { trackFilterMode: 0, trackFilterList: '' })
    ).toEqual({ regions: [], trackCount: 0 });
  });

  it('buildArrangementLanesGlslBake emits const arrays', () => {
    const packed = filterRegionsForNode(snapshot, lanesNode());
    const bake = buildArrangementLanesGlslBake('node-arr-1', packed);
    expect(bake).toContain('ARR_LANE_COUNT_node_arr_1 = 3');
    expect(bake).toContain('ARR_LANE_REGIONS_node_arr_1');
  });

  it('buildArrangementLanesWgslNodeHelper emits per-node eval and region table', () => {
    const packed = filterRegionsForNode(snapshot, lanesNode());
    const wgsl = buildArrangementLanesWgslNodeHelper('node-arr-1', packed);
    expect(wgsl).toContain('const ARR_LANE_COUNT_node_arr_1: i32 = 3');
    expect(wgsl).toContain('ARR_LANE_REGIONS_node_arr_1');
    expect(wgsl).toContain('fn evalArrangementLanes_node_arr_1');
    expect(wgsl).not.toContain('globals.v0.y');
  });
});
