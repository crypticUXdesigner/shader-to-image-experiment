<script lang="ts">
  /**
   * Toggle - Boolean switch for int params (0/1).
   * Parity with canvas ToggleParameterRenderer.
   */
  interface Props {
    value: number;
    disabled?: boolean;
    class?: string;
    onChange?: (value: number) => void;
    /** Element id of visible label text; when set, names the switch via aria-labelledby instead of On/Off. */
    labelledBy?: string;
  }

  let { value, disabled = false, class: className = '', onChange, labelledBy }: Props = $props();

  const isOn = $derived(value === 1);

  function handleClick() {
    if (disabled) return;
    onChange?.(isOn ? 0 : 1);
  }

  $effect(() => {
    if (!labelledBy) return;
    if (typeof document === 'undefined') return;

    const labelEl = document.getElementById(labelledBy);
    if (!labelEl) return;

    const onLabelClick = () => {
      if (disabled) return;
      onChange?.(isOn ? 0 : 1);
    };

    labelEl.addEventListener('click', onLabelClick);
    return () => labelEl.removeEventListener('click', onLabelClick);
  });
</script>

<button
  type="button"
  class="toggle {className}"
  class:on={isOn}
  class:disabled
  onclick={handleClick}
  disabled={disabled}
  role="switch"
  aria-checked={isOn}
  aria-labelledby={labelledBy}
  aria-label={labelledBy ? undefined : isOn ? 'On' : 'Off'}
>
  <span class="slider"></span>
</button>

<style>
  .toggle {
    position: relative;
    width: var(--toggle-width);
    height: var(--toggle-height);
    padding: 0;
    border: 1px solid var(--color-gray-70);
    border-radius: var(--toggle-border-radius);
    background: var(--toggle-bg-off);
    cursor: default;
    transition:
      background var(--motion-effects-fast-duration) var(--motion-effects-fast-easing),
      border-color var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);

    &:hover:not(:disabled):not(.on) {
      background: var(--toggle-bg-hover-off);
      border-color: var(--toggle-bg-hover-off);
    }

    &.on {
      background: var(--toggle-bg-on);
      border-color: var(--toggle-bg-on);

      &:hover:not(:disabled) {
        background: var(--toggle-bg-hover-on);
        border-color: var(--toggle-bg-hover-on);
      }
    }

    &:disabled {
      opacity: var(--opacity-disabled);
      cursor: not-allowed;
    }

    .slider {
      position: absolute;
      top: 50%;
      left: var(--toggle-slider-offset);
      width: var(--toggle-slider-size);
      height: var(--toggle-slider-size);
      margin-top: calc(var(--toggle-slider-size) / -2);
      border-radius: 50%;
      background: var(--toggle-slider-bg);
      border: var(--toggle-slider-border);
      transition: transform var(--motion-effects-fast-duration) var(--motion-effects-fast-easing);
    }

    &.on .slider {
      transform: translateX(calc(var(--toggle-width) - var(--toggle-slider-size) - var(--toggle-slider-offset) * 2));
    }
  }
</style>
