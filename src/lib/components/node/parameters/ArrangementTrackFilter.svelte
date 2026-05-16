<script lang="ts">
  import { Button, Checkbox, IconSvg } from '../../ui';
  import FloatingPanel from '../../floating-panel/FloatingPanel.svelte';
  import {
    ARRANGEMENT_TRACK_FILTER_CLAMP_BOX,
    clampPanelCenterToViewport,
    getStoredPosition,
    setStoredPosition,
  } from '../../floating-panel/floatingPanelPosition';
  import type { AudioSetup } from '../../../../data-model/audioSetupTypes';
  import {
    type ArrangementTrackKind,
    MAX_ARRANGEMENT_NOTES_PACKED,
    MAX_ARRANGEMENT_REGIONS,
  } from '../../../../audiotool/arrangement/types';
  import {
    arrangementTrackFilterButtonLabel,
    buildTrackFilterParams,
    listArrangementTracksForFilter,
    parseTrackFilterListOrdered,
    readSelectedTrackIds,
  } from '../../../../audiotool/arrangement/arrangementTrackFilter';

  interface Props {
    trackFilterMode: number;
    trackFilterList: string;
    audioSetup: AudioSetup;
    kinds?: ArrangementTrackKind[];
    hideEmpty?: boolean;
    showNoteCounts?: boolean;
    disabled?: boolean;
    /** Persist floating-panel position per node (`node.id`). */
    positionStorageVariant?: string;
    onFilterChange: (trackFilterMode: number, trackFilterList: string) => void;
    class?: string;
  }

  const PANEL_STORAGE_ID = 'arrangement-track-filter';

  let {
    trackFilterMode,
    trackFilterList,
    audioSetup,
    kinds,
    hideEmpty = false,
    showNoteCounts = false,
    disabled = false,
    positionStorageVariant,
    onFilterChange,
    class: className = '',
  }: Props = $props();

  let panelOpen = $state(false);
  let panelX = $state(0);
  let panelY = $state(0);
  let triggerEl = $state<HTMLElement | null>(null);

  const kindSet = $derived(
    kinds === undefined ? undefined : new Set<ArrangementTrackKind>(kinds)
  );

  const rows = $derived(
    listArrangementTracksForFilter(audioSetup.arrangementSnapshot, {
      kinds: kindSet,
      hideEmpty,
    })
  );

  const allTrackIds = $derived(rows.map((r) => r.id));

  /** Persisted stacking order when `trackFilterMode === 1`; DAW row order otherwise. */
  const orderedSelectionIds = $derived.by((): string[] => {
    if (trackFilterMode !== 1) {
      return allTrackIds.slice();
    }
    const parsed = parseTrackFilterListOrdered(trackFilterList);
    const allowed = new Set(allTrackIds);
    return parsed.filter((id) => allowed.has(id));
  });

  const rowsById = $derived(new Map(rows.map((r) => [r.id, r] as const)));

  const selectedIds = $derived(readSelectedTrackIds(trackFilterMode, trackFilterList, allTrackIds));

  /** Not baked — check to append at end of bake order. */
  const excludedRows = $derived(rows.filter((r) => !selectedIds.has(r.id)));

  const canReorderLanes = $derived(trackFilterMode === 1 && orderedSelectionIds.length >= 2);

  const bakeOrderSubtitle = $derived(
    trackFilterMode === 1
      ? '#1 … #n = lane stack position for these tracks.'
      : 'Projects use project track order (#1 … top of list). Exclude a track below to reorder the subset.'
  );

  const buttonLabel = $derived(arrangementTrackFilterButtonLabel(rows, selectedIds));

  /** Sum of notes (or regions when `showNoteCounts` is false) on the currently selected tracks. */
  const selectedItemsTotal = $derived.by(() => {
    let sum = 0;
    for (const row of rows) {
      if (!selectedIds.has(row.id)) continue;
      sum += showNoteCounts ? row.noteCount : row.regionCount;
    }
    return sum;
  });

  const totalUnit = $derived(showNoteCounts ? 'notes' : 'regions');

  /** GPU bake cap for the active mode (arrangement-notes vs arrangement-lanes packing). */
  const itemsBakeCap = $derived(
    showNoteCounts ? MAX_ARRANGEMENT_NOTES_PACKED : MAX_ARRANGEMENT_REGIONS
  );

  /** Near cap (warn) when at 90%+ of bake limit; over when selection exceeds what the shader packs. */
  const bakeSummaryTone = $derived.by((): 'ok' | 'warn' | 'over' => {
    const n = selectedItemsTotal;
    const cap = itemsBakeCap;
    if (n > cap) return 'over';
    if (cap > 0 && n >= cap * 0.9) return 'warn';
    return 'ok';
  });

  const summaryTitle = $derived(
    bakeSummaryTone === 'over'
      ? `Selected count exceeds the GPU bake limit (${itemsBakeCap.toLocaleString()} ${totalUnit}); extras are omitted in the shader.`
      : bakeSummaryTone === 'warn'
        ? `Close to the GPU bake limit (${itemsBakeCap.toLocaleString()} ${totalUnit}); some items may be omitted if you add more or widen the selection.`
        : 'In the imported arrangement, for the tracks currently included in this filter'
  );

  const noSnapshot = $derived(audioSetup.arrangementSnapshot === undefined);
  const controlDisabled = $derived(disabled || noSnapshot || rows.length === 0);

  function triggerCenter(): { x: number; y: number } {
    if (!triggerEl) {
      if (typeof window === 'undefined') return { x: 0, y: 0 };
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const r = triggerEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function openPanelFromTriggerOrStorage() {
    const fallback = triggerCenter();
    const stored = getStoredPosition(PANEL_STORAGE_ID, {
      variant: positionStorageVariant,
      fallback,
    });
    const box = ARRANGEMENT_TRACK_FILTER_CLAMP_BOX;
    const clamped = clampPanelCenterToViewport(stored, box.width, box.height);
    panelX = clamped.x;
    panelY = clamped.y;
  }

  function togglePanel() {
    if (controlDisabled) return;
    if (!panelOpen) {
      openPanelFromTriggerOrStorage();
    }
    panelOpen = !panelOpen;
  }

  function handlePanelMove(x: number, y: number) {
    panelX = x;
    panelY = y;
    setStoredPosition(PANEL_STORAGE_ID, x, y, positionStorageVariant);
  }

  function persistSelectionOrder(nextOrdered: string[]) {
    const params = buildTrackFilterParams(nextOrdered, allTrackIds);
    onFilterChange(params.trackFilterMode, params.trackFilterList);
  }

  function addTrackToBake(trackId: string) {
    if (selectedIds.has(trackId)) return;
    persistSelectionOrder([...orderedSelectionIds, trackId]);
  }

  function removeFromBake(trackId: string) {
    persistSelectionOrder(orderedSelectionIds.filter((id) => id !== trackId));
  }

  function selectAll() {
    persistSelectionOrder(allTrackIds.slice());
  }

  function clearAll() {
    persistSelectionOrder([]);
  }

  function moveSelectionOrder(trackId: string, delta: number) {
    if (trackFilterMode !== 1) return;
    const next = [...orderedSelectionIds];
    const idx = next.indexOf(trackId);
    if (idx < 0) return;
    const j = idx + delta;
    if (j < 0 || j >= next.length) return;
    const swap = next[j]!;
    next[j] = next[idx]!;
    next[idx] = swap;
    persistSelectionOrder(next);
  }
</script>

<div bind:this={triggerEl} class="arrangement-track-filter {className}">
  <Button
    variant="secondary"
    size="md"
    mode="label-only"
    disabled={controlDisabled}
    onclick={togglePanel}
    aria-haspopup="dialog"
    aria-expanded={panelOpen}
    title={noSnapshot ? 'Import arrangement from the audio panel first' : undefined}
  >
    <span class="label">{noSnapshot ? 'No arrangement' : buttonLabel}</span>
  </Button>
</div>

<FloatingPanel
  open={panelOpen}
  x={panelX}
  y={panelY}
  triggerElement={triggerEl}
  onClose={() => {
    panelOpen = false;
  }}
  onPositionChange={handlePanelMove}
  ariaLabel="Arrangement track filter"
  dragSurface="grip-only"
  mainOverflow="hidden"
  class="arrangement-track-filter-panel"
>
  {#snippet headerLeft()}
    <span class="panel-title">Bake tracks</span>
  {/snippet}

  {#snippet children()}
    <div class="track-filter-menu">
      {#if rows.length > 0}
        <div
          class="track-filter-summary"
          class:is-warn={bakeSummaryTone === 'warn'}
          class:is-over={bakeSummaryTone === 'over'}
          aria-live="polite"
          title={summaryTitle}
        >
          <span class="current-count">{selectedItemsTotal.toLocaleString()}</span>
          <span class="summary-rest">
            <span class="slash" aria-hidden="true">/</span>
            <span class="bake-cap">{itemsBakeCap.toLocaleString()}</span>
            {` ${totalUnit}`}
          </span>
        </div>
      {/if}
      <div class="track-filter-scroll scrollbar-styled">
        <section class="track-section" aria-label="Bake order">
          <div class="track-section-head">
            <span class="track-section-title">Bake order</span>
          </div>
          <p class="track-section-hint">{bakeOrderSubtitle}</p>

          {#if orderedSelectionIds.length === 0}
            <div class="track-empty" id="included-empty-hint">
              No tracks baked. Pick tracks below under "Tracks not baked".
            </div>
          {:else}
            <div class="included-grid included-grid-head" aria-hidden="true">
              <span>#</span>
              <span>Track</span>
              <span class="included-actions-head">Order</span>
            </div>
            {#each orderedSelectionIds as trackId, stackIdx (trackId)}
              {@const row = rowsById.get(trackId)}
              {#if row}
                <div
                  class="included-grid included-row"
                  role="group"
                  aria-label="Position {stackIdx + 1}, {row.label}"
                >
                  <span class="stack-rank" aria-hidden="true">{stackIdx + 1}</span>
                  <div class="stack-label">
                    <span class="stack-name">{row.label}</span>
                    {#if showNoteCounts && row.noteCount > 0}
                      <span class="stack-meta">{row.noteCount} notes</span>
                    {:else if !showNoteCounts && row.regionCount > 0}
                      <span class="stack-meta">{row.regionCount} clips</span>
                    {/if}
                  </div>
                  <div class="included-actions">
                    {#if canReorderLanes}
                      <div class="track-reorder" role="group" aria-label="Reorder lane position">
                        <button
                          type="button"
                          class="track-reorder-btn"
                          aria-label={`Move ${row.label} earlier in bake order`}
                          title="Earlier in bake list"
                          disabled={stackIdx <= 0}
                          onclick={() => moveSelectionOrder(trackId, -1)}
                        >
                          <IconSvg name="chevron-up" variant="line" class="track-reorder-icon" />
                        </button>
                        <button
                          type="button"
                          class="track-reorder-btn"
                          aria-label={`Move ${row.label} later in bake order`}
                          title="Later in bake list"
                          disabled={stackIdx >= orderedSelectionIds.length - 1}
                          onclick={() => moveSelectionOrder(trackId, 1)}
                        >
                          <IconSvg name="chevron-down" variant="line" class="track-reorder-icon" />
                        </button>
                      </div>
                    {:else}
                      <span class="reorder-spacer" aria-hidden="true"></span>
                    {/if}
                    <button
                      type="button"
                      class="included-remove"
                      aria-label={`Remove ${row.label} from bake`}
                      title="Remove from bake"
                      onclick={() => removeFromBake(trackId)}
                    >
                      <IconSvg name="trash" variant="line" class="included-remove-icon" />
                    </button>
                  </div>
                </div>
              {:else}
                <div class="included-grid included-row stale" role="status">
                  <span class="stack-rank">{stackIdx + 1}</span>
                  <span class="stale-track-id">{trackId}</span>
                  <div class="included-actions stale-actions">
                    <span class="reorder-spacer" aria-hidden="true"></span>
                    <button
                      type="button"
                      class="included-remove"
                      aria-label={`Remove stale id ${trackId} from bake`}
                      title="Remove from bake list"
                      onclick={() => removeFromBake(trackId)}
                    >
                      <IconSvg name="trash" variant="line" class="included-remove-icon" />
                    </button>
                  </div>
                </div>
              {/if}
            {/each}
          {/if}
        </section>

        {#if excludedRows.length > 0}
          <div class="track-section-divider" role="presentation"></div>
          <section class="track-section" aria-labelledby="pool-heading">
            <div class="track-section-head">
              <span id="pool-heading" class="track-section-title">Tracks not baked</span>
              <span class="track-section-badge">{excludedRows.length}</span>
            </div>
            <p class="track-section-hint">Check a track to add it to the end of bake order.</p>
            <div class="pool-list">
              {#each excludedRows as row (row.id)}
                <div class="pool-row">
                  <Checkbox
                    checked={false}
                    label={row.label}
                    onchange={(picked) => {
                      if (picked) addTrackToBake(row.id);
                    }}
                  />
                  {#if showNoteCounts && row.noteCount > 0}
                    <span class="count" aria-hidden="true">{row.noteCount}</span>
                  {:else if !showNoteCounts && row.regionCount > 0}
                    <span class="count" aria-hidden="true">{row.regionCount}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {:else if selectedIds.size > 0}
          <div class="track-section-divider" role="presentation"></div>
          <p class="track-section-hint only-hint">All listed tracks are in the bake stack.</p>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet footer()}
    <div class="track-filter-actions">
      <button type="button" class="action" onclick={selectAll}>Select all</button>
      <span class="sep" aria-hidden="true">·</span>
      <button type="button" class="action" onclick={clearAll}>Clear</button>
    </div>
  {/snippet}
</FloatingPanel>

<style>
  /* Narrow floating shell + single scroll region inside FloatingPanel `.main`. */
  :global(.popover-base.frame.floating-panel.arrangement-track-filter-panel) {
    width: auto;
    min-width: 280px;
    max-width: 340px;
    max-height: min(520px, 85vh);
  }

  .panel-title {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--print-highlight);
    letter-spacing: 0.02em;
  }

  .arrangement-track-filter {
    display: flex;
    min-width: 120px;
    max-width: 220px;
    width: fit-content;

    :global(.button) {
      flex: 1;
      min-width: 0;
      justify-content: flex-start;
    }

    .label {
      min-width: 0;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  :global(.floating-panel.arrangement-track-filter-panel) .track-filter-menu {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 280px;
    max-width: 340px;
    min-height: 0;
    overflow: hidden;
  }

  :global(.floating-panel.arrangement-track-filter-panel) .track-filter-summary {
    flex-shrink: 0;
    padding: var(--menu-item-padding);
    font-size: var(--text-xs);
    color: var(--search-result-desc-color);
    font-variant-numeric: tabular-nums;
    border-bottom: 1px solid var(--divider);

    .current-count {
      font-weight: 600;
      color: var(--print-highlight);
    }

    .summary-rest {
      font-weight: 400;
    }

    .slash {
      margin: 0 0.12em;
      color: var(--print-subtle);
    }

    &.is-warn .current-count {
      color: var(--color-orange-100);
    }

    &.is-over .current-count {
      color: var(--color-red-100);
    }
  }

  :global(.floating-panel.arrangement-track-filter-panel) .track-filter-scroll {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: var(--pd-sm) 0 var(--pd-xs);
  }

  .track-section {
    padding: 0 var(--pd-md);

    .track-section-head {
      display: flex;
      align-items: center;
      gap: var(--pd-sm);
      margin-bottom: 2px;

      .track-section-title {
        font-size: var(--text-xs);
        font-weight: 600;
        color: var(--print-highlight);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .track-section-badge {
        font-size: var(--text-xs);
        font-variant-numeric: tabular-nums;
        color: var(--print-subtle);
      }
    }

    .track-section-hint {
      margin: 0 0 var(--pd-xs);
      font-size: var(--text-xs);
      line-height: 1.35;
      color: var(--search-result-desc-color);
    }

    .track-empty {
      font-size: var(--text-sm);
      color: var(--print-subtle);
      padding: var(--pd-xs) 0 var(--pd-sm);
    }
  }

  .track-section-hint.only-hint {
    margin-bottom: var(--pd-xs);
  }

  .track-section-divider {
    height: 1px;
    margin: var(--pd-sm) 0;
    background: var(--divider);
  }

  .included-grid {
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr) auto;
    column-gap: var(--pd-xs);
    align-items: center;
    padding: var(--pd-xs) 0 var(--pd-xs) var(--pd-md);

    &.included-grid-head {
      padding-top: var(--pd-xs);
      padding-bottom: 4px;
      font-size: 10px;
      font-weight: 600;
      color: var(--print-subtle);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .included-actions-head {
      text-align: right;
      padding-right: calc(var(--pd-md) + 22px);
    }

    &.included-row {
      border-radius: var(--radius-sm, 4px);

      &.stale {
        border-left: 2px solid var(--color-orange-100);
        padding-left: calc(var(--pd-md) - 2px);
      }

      .stack-label {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;

        .stack-name {
          font-size: var(--text-sm);
          color: var(--print-default);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stack-meta {
          font-size: var(--text-xs);
          color: var(--search-result-desc-color);
          font-variant-numeric: tabular-nums;
        }
      }

      .stale-track-id {
        font-size: var(--text-xs);
        font-family: ui-monospace, monospace;
        color: var(--color-orange-100);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .stack-rank {
      font-size: var(--text-sm);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      color: var(--print-highlight);
      text-align: right;
      padding-right: 2px;
    }
  }

  .included-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    padding-right: var(--pd-md);

    &.stale-actions {
      gap: var(--pd-xs);
    }

    .reorder-spacer {
      width: calc(22px + 22px + 6px);
      flex-shrink: 0;
    }

    .track-reorder {
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      gap: 1px;
    }

    .track-reorder-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin: 0;
      border: none;
      background: none;
      color: var(--print-subtle);
      line-height: 0;

      &:hover:not(:disabled) {
        color: var(--print-highlight);
      }

      &:disabled {
        opacity: var(--opacity-disabled, 0.35);
        color: var(--print-subtle);
      }
    }

    :global(.track-reorder-icon svg) {
      min-width: 12px;
      min-height: 12px;
      width: 0.75em;
      height: 0.75em;
    }

    .included-remove {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px;
      margin: 0;
      margin-left: 2px;
      border: none;
      background: none;
      color: var(--print-subtle);
      border-radius: var(--radius-sm, 4px);

      &:hover {
        color: var(--color-red-100);
      }

      &:focus-visible {
        outline: 1px solid var(--primary-bg, currentColor);
        outline-offset: 1px;
      }
    }

    :global(.included-remove-icon svg) {
      min-width: 14px;
      min-height: 14px;
      width: 0.875em;
      height: 0.875em;
    }
  }

  .pool-list .pool-row {
    display: flex;
    align-items: center;
    gap: calc(2 * var(--pd-xs));
    padding: var(--pd-xs) var(--pd-md) var(--pd-xs) calc(var(--pd-md) + 2px);

    :global(.checkbox) {
      flex: 1;
      min-width: 0;
    }

    .count {
      flex-shrink: 0;
      font-size: var(--text-xs);
      color: var(--search-result-desc-color);
      font-variant-numeric: tabular-nums;
    }
  }

  :global(.floating-panel.arrangement-track-filter-panel) .track-filter-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--pd-xs);
    padding: var(--menu-item-padding);
    border-top: 1px solid var(--divider);

    :global(.action) {
      background: none;
      border: none;
      padding: 0;
      font-size: var(--text-xs);
      color: var(--print-default);
      cursor: default;

      &:hover {
        color: var(--print-highlight);
      }
    }

    :global(.sep) {
      color: var(--print-subtle);
    }
  }
</style>
