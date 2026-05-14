<script lang="ts">
  /**
   * AudioSignalPicker — public entry for the audio signal floating panel.
   * Double-click on parameter port opens this picker. Forwards to AudioSignalPickerPanel.
   * Export lives here so App and others import from components; the concrete panel lives in this folder.
   */
  import AudioSignalPickerPanel from './AudioSignalPickerPanel.svelte';
  import type { NodeGraph } from '../../../data-model/types';
  import type { NodeSpec } from '../../../types/nodeSpec';
  import type { AudioSetup } from '../../../data-model/audioSetupTypes';
  import type { SignalSelectPayload } from '../../../types/editor';

  export type { SignalSelectPayload };

  interface Props {
    open: boolean;
    xLarge: number;
    yLarge: number;
    xCompact: number;
    yCompact: number;
    onPositionChangeLarge?: (x: number, y: number) => void;
    onPositionChangeCompact?: (x: number, y: number) => void;
    targetNodeId: string;
    targetParameter: string;
    triggerElement?: HTMLElement | null;
    graph: NodeGraph;
    audioSetup: AudioSetup;
    nodeSpecs: Map<string, NodeSpec>;
    onSelect: (signal: SignalSelectPayload) => void;
    onClose: () => void;
    onAudioSetupChange: (setup: AudioSetup) => void;
    getAudioManager?: () => import('../../../runtime/types').IAudioManager | null;
    /**
     * Browse-only mode: opened from a global entry point (e.g. bottom-bar audio
     * button) rather than a parameter port. Hides Connect actions; bands and
     * remappers can still be created, edited, and deleted.
     */
    browseOnly?: boolean;
    class?: string;
  }

  let {
    open,
    xLarge,
    yLarge,
    xCompact,
    yCompact,
    onPositionChangeLarge,
    onPositionChangeCompact,
    targetNodeId,
    targetParameter,
    triggerElement = null,
    graph,
    audioSetup,
    nodeSpecs,
    onSelect,
    onClose,
    onAudioSetupChange,
    getAudioManager,
    browseOnly = false,
    class: className = ''
  }: Props = $props();
</script>

<AudioSignalPickerPanel
  open={open}
  xLarge={xLarge}
  yLarge={yLarge}
  xCompact={xCompact}
  yCompact={yCompact}
  onPositionChangeLarge={onPositionChangeLarge}
  onPositionChangeCompact={onPositionChangeCompact}
  targetNodeId={targetNodeId}
  targetParameter={targetParameter}
  triggerElement={triggerElement}
  graph={graph}
  audioSetup={audioSetup}
  nodeSpecs={nodeSpecs}
  onSelect={onSelect}
  onClose={onClose}
  onAudioSetupChange={onAudioSetupChange}
  getAudioManager={getAudioManager}
  browseOnly={browseOnly}
  class={className}
/>
