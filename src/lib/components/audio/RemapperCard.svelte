<script lang="ts">
  /**
   * RemapperCard - Single remapper card in the large audio signal picker.
   * Shows remapper name (with band prefix), range editor, and Connect action.
   */
  import { Button, IconSvg, EditableLabel, RemapRangeEditor } from '../ui';
  import type { AudioRemapperEntry } from '../../../data-model/audioSetupTypes';

  interface LiveValues {
    incoming: number | null;
    outgoing: number | null;
  }

  interface Props {
    remapper: AudioRemapperEntry;
    bandName?: string;
    isSelected?: boolean;
    liveValues?: LiveValues | null;
    onSelect?: (e: MouseEvent) => void;
    onConnect?: () => void;
    onDelete?: () => void;
    onRemapperChange?: (updater: (r: AudioRemapperEntry) => AudioRemapperEntry) => void;
  }

  let {
    remapper,
    bandName = 'Band',
    isSelected = false,
    liveValues = null,
    onSelect,
    onConnect,
    onDelete,
    onRemapperChange,
  }: Props = $props();
</script>

<div
  class="remapper-card panel-card"
  class:selected={isSelected}
  role="option"
  aria-selected={isSelected}
  tabindex="0"
  aria-label="Remapper. Click or press Space to select or deselect. Delete key removes selected."
  onclick={onSelect}
  onkeydown={(e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelect?.(e as unknown as MouseEvent);
    }
  }}
>
  <div class="header">
    <div class="label-wrap" role="presentation" ondblclick={(e) => e.stopPropagation()}>
      <EditableLabel
        value={remapper.name}
        prefix={`${bandName}: `}
        placeholder="Remapper name"
        ariaLabel="Remapper name"
        onCommit={(value) => onRemapperChange?.((r) => ({ ...r, name: value }))}
      />
    </div>
    <Button
      variant="ghost"
      size="sm"
      mode="icon-only"
      title="Delete remapper"
      aria-label={`Delete remapper: ${remapper.name || remapper.id}`}
      onclick={(e) => {
        e.stopPropagation();
        onDelete?.();
      }}
    >
      <IconSvg name="trash" variant="line" />
    </Button>
    {#if onConnect}
      <Button
        variant="ghost"
        size="sm"
        mode="both"
        title="Connect"
        aria-label={`Connect: ${remapper.name || remapper.id}`}
        onclick={(e) => { e.stopPropagation(); onConnect?.(); }}
      >
        <IconSvg name="plug" variant="line" />
        Connect
      </Button>
    {/if}
  </div>
  <div class="editor-wrap">
    <RemapRangeEditor
      inMin={remapper.inMin}
      inMax={remapper.inMax}
      outMin={remapper.outMin}
      outMax={remapper.outMax}
      liveInValue={liveValues?.incoming ?? null}
      liveOutValue={liveValues?.outgoing ?? null}
      onChange={(payload) => onRemapperChange?.((r) => ({ ...r, ...payload }))}
    />
  </div>
</div>

<style>
  .remapper-card {
    /* Layout */
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
    padding-bottom: var(--pd-sm);

    /* Other */
    cursor: default;

    .header {
      display: flex;
      align-items: center;
      gap: var(--pd-sm);
      width: 100%;
      height: var(--size-md);
      min-height: 0;
      padding: 0 var(--pd-sm);

      :global(.button) {
        border-radius: calc(var(--radius-md) - var(--pd-sm));
      }
    }

    .label-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
    }

    .editor-wrap {
      display: flex;
      flex-direction: column;
      width: 100%;
      padding: 0 var(--pd-sm);
    }
  }
</style>
