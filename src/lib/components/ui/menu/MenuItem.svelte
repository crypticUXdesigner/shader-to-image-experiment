<script lang="ts">
  import type { IconName } from '../../../../utils/icons';
  import IconSvg from '../icon/IconSvg.svelte';

  interface Props {
    label: string;
    disabled?: boolean;
    selected?: boolean;
    desc?: string;
    /** Optional shortcut hint rendered as a keycap on the right side. */
    shortcut?: string;
    icon?: import('svelte').Snippet<[]>;
    /** Optional decorative leading icon name (used when `icon` snippet not provided). */
    iconName?: IconName;
    iconVariant?: 'line' | 'filled';
    /** Optional right-side content (overrides `shortcut` when provided). */
    trailing?: import('svelte').Snippet<[]>;
    onclick?: (e: MouseEvent) => void;
    class?: string;
  }

  let {
    label,
    disabled = false,
    selected = false,
    desc = '',
    shortcut = '',
    icon,
    iconName,
    iconVariant,
    trailing,
    onclick,
    class: className = ''
  }: Props = $props();

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    if (!disabled) {
      onclick?.(e);
    }
  }
</script>

<button
  type="button"
  class="menu-item {className}"
  class:is-disabled={disabled}
  class:is-selected={selected}
  {disabled}
  onclick={handleClick}
>
  {#if icon}
    <span class="icon" aria-hidden="true">
      {@render icon()}
    </span>
  {:else if iconName}
    <span class="icon" aria-hidden="true">
      <IconSvg name={iconName} variant={iconVariant} />
    </span>
  {/if}
  <span class="content">
    <span class="name">{label}</span>
    {#if desc}
      <span class="desc">{desc}</span>
    {/if}
  </span>
  {#if trailing}
    <span class="trailing">
      {@render trailing()}
    </span>
  {:else if shortcut}
    <span class="trailing">
      <span class="keycaps" aria-hidden="true">
        <span class="keycap">{shortcut}</span>
      </span>
    </span>
  {/if}
</button>

<style>
  /* MenuItem styles */
  .menu-item {
    /* Layout */
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--pd-md);
    min-height: var(--size-md);

    /* Box model */
    padding: var(--pd-sm) var(--pd-md);
    border-radius: var(--radius-sm);

    /* Visual */
    background: transparent;
    color: var(--print-default);

    /* Typography */
    font-size: var(--text-sm);
    text-align: left;

    /* Other */
    cursor: default;
    outline: none;
    transition: background var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);

    &:hover:not(.is-disabled),
    &:focus-visible:not(.is-disabled) {
      background: var(--ghost-bg-hover);
      color: var(--print-highlight);
    }

    &.is-selected:not(.is-disabled) {
      background: var(--ghost-bg-active);
      color: var(--color-blue-110);
    }

    &.is-disabled {
      opacity: var(--opacity-disabled);
      cursor: not-allowed;
    }

    .icon {
      /* Layout */
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      /* Box model */
      width: calc(var(--size-xs) + var(--scale-1));
      height: calc(var(--size-xs) + var(--scale-1));

      /* Visual */
      color: currentColor;

      :global(svg) {
        width: var(--scale-5);
        height: var(--scale-5);
      }
    }

    .content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      .name {
        font-weight: bold;
      }

      .desc {
        margin-top: var(--pd-xs);
        font-size: var(--text-sm);
        color: var(--print-default);
      }
    }

    .trailing {
      flex-shrink: 0;
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      padding-left: var(--pd-md);
    }

    /* Shortcut chip: matches ShortcutRow keycap styling */
    .keycaps {
      display: inline-flex;
      align-items: center;
      gap: var(--pd-2xs);
      font-family: var(--font-mono, ui-monospace, monospace);
      color: var(--color-yellow-110);
      white-space: nowrap;
    }

    .keycap {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-gray-70);
      background: var(--color-gray-30);
      font-size: var(--text-xs);
      line-height: 1.3;
      letter-spacing: 0.01em;
    }
  }
</style>
