import { describe, it, expect } from 'vitest';
import { buildArrangementSnapshot } from './buildArrangementSnapshot';
import type { RawArrangementEntities } from './rawEntities';
import spikeFixture from './__fixtures__/spike-arrangement-raw.json';
import {
  buildTrackFilterParams,
  listArrangementTracksForFilter,
  parseTrackFilterList,
  readSelectedTrackIds,
  arrangementTrackFilterButtonLabel,
} from './arrangementTrackFilter';

const snapshot = buildArrangementSnapshot(spikeFixture as RawArrangementEntities);

describe('arrangementTrackFilter', () => {
  it('lists note tracks with counts for notes node filter', () => {
    const rows = listArrangementTracksForFilter(snapshot, {
      kinds: new Set(['note']),
      hideEmpty: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('track-note-1');
    expect(rows[0]?.noteCount).toBe(3);
  });

  it('readSelectedTrackIds treats mode 0 as all tracks', () => {
    const ids = ['track-note-1'];
    expect(readSelectedTrackIds(0, '', ids)).toEqual(new Set(ids));
  });

  it('buildTrackFilterParams uses mode 0 when all tracks selected', () => {
    const all = ['a', 'b'];
    expect(buildTrackFilterParams(all, all)).toEqual({
      trackFilterMode: 0,
      trackFilterList: '',
    });
  });

  it('buildTrackFilterParams uses mode 1 subset', () => {
    expect(buildTrackFilterParams(['a'], ['a', 'b'])).toEqual({
      trackFilterMode: 1,
      trackFilterList: 'a',
    });
  });

  it('buildTrackFilterParams preserves id order in trackFilterList', () => {
    expect(buildTrackFilterParams(['b', 'a'], ['a', 'b', 'c'])).toEqual({
      trackFilterMode: 1,
      trackFilterList: 'b,a',
    });
  });

  it('button label reflects subset when multiple tracks exist', () => {
    const rows = listArrangementTracksForFilter(snapshot, { kinds: new Set(['note', 'audio']) });
    const label = arrangementTrackFilterButtonLabel(
      rows,
      parseTrackFilterList('track-note-1')
    );
    expect(label).toBe('1 / 2 tracks');
  });
});
