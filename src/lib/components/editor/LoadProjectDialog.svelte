<script lang="ts">
  import type { Action } from 'svelte/action';
  import { Button, ButtonGroup, IconSvg, Message, ModalDialog, SearchInput } from '../ui';
  import type { IconName } from '../../../utils/iconsUiRegistry';
  import { formatLastModifiedHuman } from '../../../utils/humanTime';
  import { resolveProjectAvatar, type ProjectAvatarFields } from '../../storage/projectAvatar';
  import type { ProjectMeta } from '../../storage/projectRepository';
  import type { HubSelection } from '../../storage/projectSessionTypes';
  import PresetListItem from './PresetListItem.svelte';
  import ProjectListItem from './ProjectListItem.svelte';

  interface PresetRow {
    name: string;
    displayName: string;
  }

  interface Props {
    open: boolean;
    /** Gate before WebGL bootstrap: backdrop/Escape/header close/Done blocked until hub pick. */
    dismissible?: boolean;
    presetLoading?: boolean;
    hubProjects?: ProjectMeta[];
    hubPresets?: PresetRow[];
    hubLastOpenedProjectId?: string | null;
    /** Matches at most one project row across Recent / My projects — never bundled presets. */
    hubPickerHighlightedProjectId?: string | null;
    hubStorageWarning?: string | null;
    hubBusy?: boolean;
    onClose: () => void;
    onHubPick: (selection: HubSelection) => void;
    onHubDuplicate?: (projectId: string) => void;
    onHubDelete?: (projectId: string) => void;
    onHubRename?: (projectId: string, nextDisplayName: string) => void;
    onHubAppearanceChange?: (projectId: string, next: ProjectAvatarFields) => void;
    onHubImportJson?: (json: string) => void;
    onHubExportAllProjects?: () => void | Promise<void>;
  }

  let {
    open,
    dismissible = true,
    presetLoading = false,
    hubProjects = [],
    hubPresets = [],
    hubLastOpenedProjectId = null,
    hubPickerHighlightedProjectId = null,
    hubStorageWarning = null,
    hubBusy = false,
    onClose,
    onHubPick,
    onHubDuplicate = () => {},
    onHubDelete = () => {},
    onHubRename = () => {},
    onHubAppearanceChange = () => {},
    onHubImportJson = () => {},
    onHubExportAllProjects = () => {},
  }: Props = $props();

  const busyCombined = $derived(hubBusy || presetLoading);
  let searchQuery = $state('');
  /** Default every time dialog opens */
  let hubTab = $state<'start' | 'own'>('start');
  let importInput: HTMLInputElement | undefined;

  const resetHubTabWhenDialogOpens: Action<
    HTMLElement,
    { open: boolean }
  > = (_node, _p) => {
    let prevOpen = false;
    return {
      update(opts: { open: boolean }) {
        if (opts.open && !prevOpen) hubTab = 'start';
        prevOpen = opts.open;
      },
    };
  };

  type PresetCategoryId = 'demos' | 'idle' | 'tests';

  const presetCategoryByName: Partial<Record<string, PresetCategoryId>> = {
    sphere: 'demos',
    'living-speaker': 'demos',
    'drive-home-lights': 'idle',
    'glass-shell': 'idle',
    'warped-drops': 'idle',
    'swirly-whirly': 'idle',
    'inflated-icosahedron': 'idle',
    'bloom-sphere': 'idle',
    'bokeh-point': 'idle',
    'hex-prism-sdf': 'idle',
    'vector-field-noise': 'demos',
    'sdf-raymarcher-hex-audio': 'tests',
    'sdf-raymarcher-ether-audio': 'tests',
    new: 'tests',
    testing: 'tests',
    weird: 'tests',
  };

  const presetIconByName: Partial<Record<string, IconName>> = {
    'living-speaker': 'waveform',
    'drive-home-lights': 'photo',
    'sdf-raymarcher-hex-audio': 'wave-sine',
    'sdf-raymarcher-ether-audio': 'sparkles',
    'glass-shell': 'sparkles',
    'warped-drops': 'wave-sine',
    'swirly-whirly': 'curly-loop',
    'inflated-icosahedron': 'grid-pattern',
    'bloom-sphere': 'flame',
    'bokeh-point': 'photo',
    'hex-prism-sdf': 'matrix',
    sphere: 'sparkles',
    'vector-field-noise': 'matrix',
    new: 'plus',
    testing: 'warning',
    weird: 'multiply',
  };

  interface PresetCategory {
    id: PresetCategoryId;
    label: string;
  }

  const categories: PresetCategory[] = [
    { id: 'demos', label: 'Demos' },
    { id: 'idle', label: 'Idle animations' },
    { id: 'tests', label: 'Early tests' },
  ];

  /** ~30 calendar days — recency gate for “Recent” on Start tab */
  const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

  function resolveCategory(p: PresetRow): PresetCategoryId {
    return presetCategoryByName[p.name] ?? 'idle';
  }

  type ChipCategorySlug = 'audio' | 'effects' | 'sdf';

  function resolveChipCategory(p: PresetRow): ChipCategorySlug {
    const c = resolveCategory(p);
    if (c === 'demos') return 'audio';
    if (c === 'tests') return 'sdf';
    return 'effects';
  }

  function resolveIcon(p: PresetRow): IconName {
    return presetIconByName[p.name] ?? 'preset';
  }

  function resolvePresetDisplayName(p: PresetRow): string {
    if (p.name === 'vector-field-noise') return 'Spinning Disc';
    return p.displayName;
  }

  function normalize(s: string): string {
    return s.toLowerCase().trim();
  }

  function sortProjects(list: ProjectMeta[]): ProjectMeta[] {
    const last = hubLastOpenedProjectId?.trim();
    return [...list].sort((a, b) => {
      if (last) {
        if (a.projectId === last && b.projectId !== last) return -1;
        if (b.projectId === last && a.projectId !== last) return 1;
      }
      const ta = Date.parse(a.lastModified) || 0;
      const tb = Date.parse(b.lastModified) || 0;
      return tb - ta;
    });
  }

  function projectsByLastTouch(list: ProjectMeta[]): ProjectMeta[] {
    return [...list].sort((a, b) => {
      const ta = Date.parse(a.lastModified) || 0;
      const tb = Date.parse(b.lastModified) || 0;
      return tb - ta;
    });
  }

  function projectMatchesSearch(p: ProjectMeta, q: string): boolean {
    if (q === '') return true;
    return (
      normalize(p.displayName).includes(q) ||
      normalize(p.projectId).includes(q)
    );
  }

  const sortedProjectsFiltered = $derived.by(() => {
    const q = normalize(searchQuery);
    return sortProjects(hubProjects).filter((p) => projectMatchesSearch(p, q));
  });

  const projectsSortedByTouch = $derived(projectsByLastTouch(hubProjects));

  const showLatestProjectsSection = $derived.by(() => {
    if (hubProjects.length === 0) return false;
    const newest = projectsSortedByTouch[0];
    if (!newest) return false;
    const t = Date.parse(newest.lastModified) || 0;
    if (t <= 0) return false;
    return Date.now() - t <= ONE_MONTH_MS;
  });

  const latestProjectsForStart = $derived.by(() => {
    if (!showLatestProjectsSection) return [];
    return projectsSortedByTouch.slice(0, 3);
  });

  const latestProjectsFilteredForStart = $derived.by(() => {
    const q = normalize(searchQuery);
    return latestProjectsForStart.filter((p) => projectMatchesSearch(p, q));
  });

  const filteredPresetsByCategory = $derived.by(() => {
    const q = normalize(searchQuery);
    const buckets: Record<PresetCategoryId, PresetRow[]> = { demos: [], idle: [], tests: [] };
    if (q === '') {
      for (const p of hubPresets) buckets[resolveCategory(p)].push(p);
    } else {
      for (const p of hubPresets) {
        const display = resolvePresetDisplayName(p);
        if (!normalize(display).includes(q) && !normalize(p.name).includes(q)) continue;
        buckets[resolveCategory(p)].push(p);
      }
    }
    for (const key of Object.keys(buckets) as PresetCategoryId[]) {
      buckets[key].sort((a, b) =>
        resolvePresetDisplayName(a).localeCompare(resolvePresetDisplayName(b))
      );
    }
    return buckets;
  });

  const totalFilteredPresets = $derived.by(() => {
    const b = filteredPresetsByCategory;
    return b.demos.length + b.idle.length + b.tests.length;
  });

  const startTabHasResults = $derived(
    totalFilteredPresets > 0 ||
      (showLatestProjectsSection && latestProjectsFilteredForStart.length > 0)
  );

  const hubListsLoaded = $derived(hubPresets.length > 0 || hubProjects.length > 0);

  const searchPlaceholder = $derived(
    hubTab === 'own' ? 'Search your projects…' : 'Search presets…'
  );

  const searchAriaLabel = $derived(
    hubTab === 'own' ? 'Search your projects' : 'Search presets'
  );

  function handleClose(): void {
    if (!dismissible) return;
    searchQuery = '';
    onClose();
  }

  function triggerImport(): void {
    importInput?.click();
  }

  async function onImportChange(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      onHubImportJson(text);
    } catch {
      // Parent reports failures
    }
  }

  function projectRowHighlighted(projectId: string): boolean {
    const id = hubPickerHighlightedProjectId?.trim();
    return id !== undefined && id !== '' && id === projectId;
  }
</script>

{#snippet searchTopbar()}
  <div class="preset-picker-topbar">
    <ButtonGroup role="tablist" ariaLabel="Load project picker sections">
      <Button
        variant="ghost"
        size="sm"
        mode="icon-only"
        class="preset-picker-tab {hubTab === 'start' ? 'is-active' : ''}"
        role="tab"
        aria-selected={hubTab === 'start'}
        aria-controls="preset-picker-panel-start"
        id="preset-picker-tab-start"
        aria-label="Start"
        title="Start"
        disabled={busyCombined}
        onclick={() => {
          hubTab = 'start';
        }}
      >
        <IconSvg name="house" variant="line" class="preset-picker-tab__icon" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        mode="icon-only"
        class="preset-picker-tab {hubTab === 'own' ? 'is-active' : ''}"
        role="tab"
        aria-selected={hubTab === 'own'}
        aria-controls="preset-picker-panel-own"
        id="preset-picker-tab-own"
        aria-label="Projects"
        title="Projects"
        disabled={busyCombined}
        onclick={() => {
          hubTab = 'own';
        }}
      >
        <IconSvg name="folder-open" variant="line" class="preset-picker-tab__icon" />
      </Button>
    </ButtonGroup>
    <div class="preset-picker-topbar__search">
      <SearchInput
        variant="primary"
        size="sm"
        bind:value={searchQuery}
        placeholder={searchPlaceholder}
        class="menu-input"
        ariaLabel={searchAriaLabel}
        disabled={busyCombined}
      />
    </div>
  </div>
{/snippet}

<ModalDialog
  {open}
  onClose={handleClose}
  variant="list"
  title="Load project"
  titleId="preset-picker-dialog-title"
  class="preset-picker-dialog"
  bodyClass="preset-picker-body"
  bodyScroll="content"
  bodyTopbar={searchTopbar}
  showHeaderClose={true}
  headerCloseDisabled={!dismissible}
  backdropDismisses={dismissible}
  escapeDismisses={dismissible}
>
  <span
    class="preset-picker-open-sync"
    aria-hidden="true"
    use:resetHubTabWhenDialogOpens={{ open }}
  ></span>
  {#snippet footer()}
    <div class="footer">
      <div class="footer-left">
        <Button variant="ghost" size="sm" mode="both" disabled={busyCombined} onclick={() => onHubPick({ kind: 'newScratch' })}>
          <IconSvg name="plus" variant="line" />
          New
        </Button>
        <Button variant="ghost" size="sm" mode="both" disabled={busyCombined} onclick={triggerImport}>
          <IconSvg name="upload-simple" variant="line" />
          Import
        </Button>
        <Button
          variant="ghost"
          size="sm"
          mode="both"
          disabled={busyCombined}
          onclick={() => void onHubExportAllProjects()}
        >
          <IconSvg name="download-simple" variant="line" />
          Export
        </Button>
      </div>
      <div class="footer-right">
        <Button variant="primary" size="sm" disabled={busyCombined || !dismissible} onclick={() => handleClose()}>
          Done
        </Button>
      </div>
    </div>
  {/snippet}

  <input
    bind:this={importInput}
    type="file"
    accept="application/json,.json"
    class="import-input-hidden"
    aria-hidden="true"
    tabindex="-1"
    onchange={onImportChange}
  />

  {#if hubStorageWarning?.trim()}
    <div class="storage-alert" role="status">
      <Message inline variant="info">
        <span>{hubStorageWarning.trim()}</span>
      </Message>
    </div>
  {/if}

  {#if !hubListsLoaded}
    <p class="empty">Loading lists…</p>
  {:else if hubTab === 'start'}
    <div id="preset-picker-panel-start" role="tabpanel" aria-labelledby="preset-picker-tab-start">
      {#if !startTabHasResults}
        <p class="empty">
          {#if normalize(searchQuery) === ''}
            Nothing to show.
          {:else}
            No presets or matching recent projects for “{searchQuery.trim()}”.
          {/if}
        </p>
      {:else}
        <div class="sections">
          {#if showLatestProjectsSection && latestProjectsFilteredForStart.length > 0}
            <section class="section recent-projects" aria-labelledby="pp-recent-projects">
              <div class="headline">
                <h3 id="pp-recent-projects" class="headline-text">Your latest projects</h3>
              </div>
              <ul class="list" aria-label="Recently updated projects">
                {#each latestProjectsFilteredForStart as p (p.projectId)}
                  <ProjectListItem
                    displayName={p.displayName}
                    lastModifiedFormatted={formatLastModifiedHuman(p.lastModified)}
                    appearance={resolveProjectAvatar(p)}
                    highlighted={projectRowHighlighted(p.projectId)}
                    busy={busyCombined}
                    onOpen={() => onHubPick({ kind: 'userProject', projectId: p.projectId })}
                    onDuplicate={() => onHubDuplicate(p.projectId)}
                    onDelete={() => onHubDelete(p.projectId)}
                    onRename={(name) => void onHubRename(p.projectId, name)}
                    onAppearanceChange={(next) => void onHubAppearanceChange(p.projectId, next)}
                  />
                {/each}
              </ul>
            </section>
          {/if}

          {#if totalFilteredPresets > 0}
            <section class="section" aria-labelledby="pp-bundled">
              {#each categories as c (c.id)}
                {@const items = filteredPresetsByCategory[c.id]}
                {#if items.length > 0}
                  <div class="headline-text">{c.label}</div>
                  <ul class="list" aria-label={c.label}>
                    {#each items as pr (pr.name)}
                      {@const chipCategory = resolveChipCategory(pr)}
                      <PresetListItem
                        displayName={resolvePresetDisplayName(pr)}
                        icon={resolveIcon(pr)}
                        chipCategory={chipCategory}
                        busy={busyCombined}
                        onFork={() => onHubPick({ kind: 'forkBundledPreset', presetName: pr.name })}
                      />
                    {/each}
                  </ul>
                {/if}
              {/each}
            </section>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div id="preset-picker-panel-own" role="tabpanel" aria-labelledby="preset-picker-tab-own">
      {#if hubProjects.length === 0}
        <!-- No empty-state messaging: user asked for presets-only UX when none exist -->
      {:else if sortedProjectsFiltered.length === 0}
        <p class="empty muted">
          No saved projects match “{searchQuery.trim()}”.
        </p>
      {:else}
        <div class="sections">
          <section class="section" aria-labelledby="pp-my-projects">
            <div class="headline">
              <h3 id="pp-my-projects" class="headline-text">Your projects</h3>
            </div>
            <ul class="list" aria-label="Your projects">
              {#each sortedProjectsFiltered as p (p.projectId)}
                <ProjectListItem
                  displayName={p.displayName}
                  lastModifiedFormatted={formatLastModifiedHuman(p.lastModified)}
                  appearance={resolveProjectAvatar(p)}
                  highlighted={projectRowHighlighted(p.projectId)}
                  busy={busyCombined}
                  onOpen={() => onHubPick({ kind: 'userProject', projectId: p.projectId })}
                  onDuplicate={() => onHubDuplicate(p.projectId)}
                  onDelete={() => onHubDelete(p.projectId)}
                  onRename={(name) => void onHubRename(p.projectId, name)}
                  onAppearanceChange={(next) => void onHubAppearanceChange(p.projectId, next)}
                />
              {/each}
            </ul>
          </section>
        </div>
      {/if}
    </div>
  {/if}
</ModalDialog>

<style>
  :global(.preset-picker-body) {
    padding: 0;
    gap: var(--pd-lg);
  }

  :global(.preset-picker-body .modal-dialog-topbar) {
    padding: var(--pd-md) var(--pd-lg);
    flex-shrink: 0;
  }

  :global(.preset-picker-body .modal-dialog-scroll) {
    padding: var(--pd-lg);
  }

  .import-input-hidden {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  :global(.content.frame.modal-dialog.modal-dialog--list.preset-picker-dialog) {
    width: min(540px, 94vw);
    min-width: min(540px, 94vw);
    height: min(720px, 92vh);
  }

  .storage-alert {
    margin: 0 0 var(--pd-md);
  }

  .preset-picker-topbar {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: var(--pd-md);
    width: 100%;
    flex-wrap: wrap;
  }

  .preset-picker-topbar__search {
    flex: 1;
    min-width: 140px;
  }

  .preset-picker-topbar__search :global(.menu-input) {
    width: 100%;
  }

  .preset-picker-topbar :global(.button-group) {
    flex-shrink: 0;
  }

  .preset-picker-topbar :global(.preset-picker-tab) {
    font-size: 1.125rem;
  }

  .empty {
    margin: 0;
    font-size: var(--text-md);
    color: var(--text-muted, var(--color-gray-100));
  }

  .empty.muted {
    opacity: 0.9;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--pd-xl);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--pd-md);

    &.recent-projects {
      padding-bottom: var(--pd-lg);
      border-bottom: 3px solid var(--color-gray-70);
    }
  }

  .headline {
    display: flex;
    align-items: center;
    gap: var(--pd-md);
    margin: 0;
  }

  .headline-text {
    padding: 0 0 0 var(--pd-md);
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--color-teal-90);
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--pd-xs);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--pd-md);
    width: 100%;
    flex-wrap: wrap;
  }

  .footer-left,
  .footer-right {
    display: flex;
    align-items: center;
    gap: var(--pd-sm);
    flex-wrap: wrap;
  }

  .footer-right {
    margin-left: auto;
  }
</style>
