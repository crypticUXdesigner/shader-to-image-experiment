/**
 * Audio Signal Picker — slot contracts for 02A (large) and 02B (compact).
 * WP audio-signal-picker-01.
 */

import type { NodeGraph } from '../../../data-model/types';
import type { NodeSpec } from '../../../types/nodeSpec';
import type { AudioSetup } from '../../../data-model/audioSetupTypes';
import type { SignalSelectPayload } from '../../../types/editor';
import type { IAudioManager } from '../../../runtime/types';

/** Props passed to the large slot (02A). */
export interface LargeSlotProps {
  targetNodeId: string;
  targetParameter: string;
  triggerElement: HTMLElement | null;
  graph: NodeGraph;
  audioSetup: AudioSetup;
  nodeSpecs: Map<string, NodeSpec>;
  onSelect: (signal: SignalSelectPayload) => void;
  onClose: () => void;
  /** Called when bands/remappers are added or updated so parent can persist audioSetup. */
  onAudioSetupChange: (setup: AudioSetup) => void;
  /** Optional: for live spectrum and remapper value visualization in the picker. */
  getAudioManager?: () => IAudioManager | null;
  /** When opening from compact "expand to full", pre-select this band in the list. */
  initialBandId?: string | null;
  /** Register a handler to run when user presses Delete (only when focus is not in an input). */
  registerDeleteHandler?: (handler: (() => void) | null) => void;
  /**
   * Browse-only mode: opened from a global entry point (e.g. bottom-bar audio button),
   * not from a parameter port. Hides Connect actions on bands/remappers; everything
   * else (create, edit, delete) stays available.
   */
  browseOnly?: boolean;
}

/** Props passed to the compact slot (02B). */
export interface CompactSlotProps {
  targetNodeId: string;
  targetParameter: string;
  triggerElement: HTMLElement | null;
  graph: NodeGraph;
  audioSetup: AudioSetup;
  nodeSpecs: Map<string, NodeSpec>;
  onSelect: (signal: SignalSelectPayload) => void;
  onClose: () => void;
  /** Called when band or remapper config is edited; 02B uses for persistence. */
  onAudioSetupChange: (setup: AudioSetup) => void;
  /** Virtual node id of the connected audio signal (e.g. audio-signal:band-xyz-raw). */
  connectedVirtualNodeId: string;
  /** Signal id (e.g. band-{id}-raw, remap-{id}) so 02B can resolve band/remapper. */
  connectedSignalId: string;
  /** Connection id for disconnect. */
  connectionId: string;
  /** True when the underlying connection is disabled (bypassed). */
  connectionDisabled: boolean;
  /** Optional: for live spectrum and remapper value visualization in the picker. */
  getAudioManager?: () => IAudioManager | null;
  /** When provided, compact shows a control to open the large picker with this band selected. */
  onOpenLargeWithBand?: (bandId: string) => void;
}
