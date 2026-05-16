import { describe, it, expect } from 'vitest';
import { buildArrangementSnapshot } from '../../audiotool/arrangement/buildArrangementSnapshot';
import type { RawArrangementEntities } from '../../audiotool/arrangement/rawEntities';
import type { ArrangementSnapshot } from '../../audiotool/arrangement/types';
import spikeFixture from '../../audiotool/arrangement/__fixtures__/spike-arrangement-raw.json';
import type { NodeInstance } from '../../data-model/types';
import {
  buildArrangementNotesGlslBake,
  filterNotesForNode,
  packArrangementNotesForGlsl,
  type ArrangementNotesPackOptions,
} from './packArrangementNotesForGlsl';

const raw = spikeFixture as RawArrangementEntities;
const snapshot = buildArrangementSnapshot(raw);

const defaultPackOpts: ArrangementNotesPackOptions = {
  trackFilterMode: 0,
  trackFilterList: '',
  trackLayout: 0,
};

const node: NodeInstance = {
  id: 'n-notes',
  type: 'arrangement-notes',
  position: { x: 0, y: 0 },
  parameters: {},
};

const dualTrackSnapshot: ArrangementSnapshot = {
  tracks: [
    { id: 'ta', kind: 'note', orderAmongTracks: 0, enabled: true },
    { id: 'tb', kind: 'note', orderAmongTracks: 1, enabled: true },
  ],
  regions: [],
  notes: [
    {
      id: 'n1',
      collectionId: 'c',
      trackId: 'ta',
      startSeconds: 0,
      durationSeconds: 1,
      pitch: 60,
      velocity: 0.9,
    },
    {
      id: 'n2',
      collectionId: 'c',
      trackId: 'tb',
      startSeconds: 0,
      durationSeconds: 1,
      pitch: 60,
      velocity: 0.9,
    },
  ],
  bpm: 120,
  durationSeconds: 60,
  timeSignature: { numerator: 4, denominator: 4 },
  source: {
    trackName: 'tracks/t',
    projectName: 'projects/p',
    commitIndex: 0,
  },
};

describe('packArrangementNotesForGlsl', () => {
  it('packs notes from snapshot with pitch range', () => {
    const packed = packArrangementNotesForGlsl(snapshot, defaultPackOpts);
    expect(packed.notes).toHaveLength(3);
    expect(packed.pitchYNorms).toHaveLength(3);
    expect(packed.pitchMin).toBe(60);
    expect(packed.pitchMax).toBe(67);
    expect(packed.notes[0]?.startSeconds).toBeLessThan(packed.notes[1]?.startSeconds ?? 0);
  });

  it('filters by track id list', () => {
    const packed = packArrangementNotesForGlsl(snapshot, {
      ...defaultPackOpts,
      trackFilterMode: 1,
      trackFilterList: 'track-note-2',
    });
    expect(packed.notes).toHaveLength(0);
  });

  it('Overlap mode uses global pitch norm (same pitch → same Y slot)', () => {
    const packed = packArrangementNotesForGlsl(dualTrackSnapshot, { ...defaultPackOpts, trackLayout: 0 });
    expect(packed.pitchYNorms).toEqual([0, 0]);
  });

  it('Lanes mode splits same MIDI pitch across stacked track bands', () => {
    const packed = packArrangementNotesForGlsl(dualTrackSnapshot, { ...defaultPackOpts, trackLayout: 1 });
    expect(packed.notes).toHaveLength(2);
    expect(packed.pitchYNorms[0]).toBeCloseTo(0, 5);
    expect(packed.pitchYNorms[1]).toBeCloseTo(0.5, 5);
  });

  it('emits GLSL bake constants', () => {
    const packed = filterNotesForNode(snapshot, node);
    const bake = buildArrangementNotesGlslBake('n-notes', packed);
    expect(bake).toContain('ARR_NOTE_COUNT_n_notes = 3');
    expect(bake).toContain('ARR_NOTES_n_notes');
    expect(bake).toContain('ARR_NOTE_Y_NORM_n_notes');
  });
});
