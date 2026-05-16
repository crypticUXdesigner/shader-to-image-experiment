<script lang="ts">
  /**
   * Top bar center section: view mode (Node | Split | Full).
   */
  import { Button, ButtonGroup, IconSvg } from '../ui';
  import type { ViewMode } from '../editor/types';

  interface Props {
    viewMode: ViewMode;
    setViewMode: (mode: ViewMode) => void;
  }

  let { viewMode, setViewMode }: Props = $props();
</script>

<div class="top-bar-view-controls">
  <ButtonGroup class="top-bar-view-mode-group" role="group" ariaLabel="View mode">
    <Button
      variant="ghost"
      size="sm"
      mode="both"
      class={viewMode === 'node' ? 'is-active' : ''}
      onclick={() => setViewMode('node')}
      title="Node [1] — Node editor with small shader preview"
    >
      <IconSvg name="tree-structure" />
      <span>1</span>
    </Button>
    <Button
      variant="ghost"
      size="sm"
      mode="both"
      class={viewMode === 'split' ? 'is-active' : ''}
      onclick={() => setViewMode('split')}
      title="Split [2] — Node editor and shader preview side by side"
    >
      <IconSvg name="square-split-horizontal" />
      <span>2</span>
    </Button>
    <Button
      variant="ghost"
      size="sm"
      mode="both"
      class={viewMode === 'full' ? 'is-active' : ''}
      onclick={() => setViewMode('full')}
      title="Shader [3] — Shader fills viewport"
    >
      <IconSvg name="frame-corners" variant="line" />
      <span>3</span>
    </Button>
  </ButtonGroup>
</div>

<style>
  .top-bar-view-controls {
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    justify-content: center;
    min-width: 0;
    pointer-events: none;
  }

  :global(.top-bar-view-mode-group) {
    display: inline-flex;
    align-items: stretch;
    pointer-events: auto;
  }
</style>
