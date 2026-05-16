<script lang="ts">
  /**
   * Full-viewport branding overlay until the user dismisses it (after the app is ready).
   * Logo: place `public/ShaderNoice-logo.png` (optional; hidden if missing or broken).
   */
  import { fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { IconSvg } from '../icon';
  import AudiotoolMarkSvg from '../icon/AudiotoolMarkSvg.svelte';
  import Button from '../button/Button.svelte';
  import Message from './Message.svelte';
  import LayeredAppLogo from './LayeredAppLogo.svelte';
  import { readCssTimeMs } from '../../../../utils/readCssTimeMs';

  interface Props {
    /** `'checking'` while resolving OAuth/session; `'signin'` shows the Audiotool action when callbacks are wired. */
    audiotoolPhase?: 'checking' | 'signin';
    /** Phase `signin`: optional error detail under the subtitle. */
    audiotoolError?: string | null;
    /** Phase `signin`: starts redirect to Audiotool consent screen (omit when OAuth gate is inactive). */
    onAudiotoolSignIn?: () => void;
    /** Phase `signin`: primary action label (e.g. Retry after a failed init). */
    audiotoolSignInLabel?: string;
    /** Phase `signin`: enter the editor without an Audiotool session (optional OAuth gate). */
    onContinueWithoutAudiotool?: () => void | Promise<void>;
    /** While editor bootstrap runs after "Continue without signing in", disable actions. */
    audiotoolBootstrapping?: boolean;

    /** When true, initial load finished — user can dismiss. */
    ready?: boolean;
    onDismiss?: () => void;
    titleShader?: string;
    titleNoice?: string;
    /** `font-weight` for the “Shader” segment (number or CSS value). */
    titleShaderWeight?: number | string;
    /** `font-weight` for the “Noice” segment (number or CSS value). */
    titleNoiceWeight?: number | string;
    subtitle?: string;
    /**
     * Optional legacy single-image logo. If omitted, the splash uses the layered
     * mask-based logo from `public/app-logo/`.
     *
     * Resolved against site base, e.g. `/ShaderNoice/ShaderNoice-logo.png`
     */
    logoSrc?: string;
    /**
     * When set (project hub inside splash), wide layout + interactive panel.
     * Parent should set {@link preventActivateDismiss} while the hub is actionable.
     */
    hub?: import('svelte').Snippet;
    /** Block backdrop / Escape dismiss (e.g. project hub picking). */
    preventActivateDismiss?: boolean;
  }

  let {
    audiotoolPhase = 'checking',
    audiotoolError = null,
    onAudiotoolSignIn,
    audiotoolSignInLabel = 'Sign in',
    onContinueWithoutAudiotool,
    audiotoolBootstrapping = false,
    ready = false,
    onDismiss,
    titleShader = 'Shader',
    titleNoice = 'Noice',
    titleShaderWeight = 400,
    titleNoiceWeight = 900,
    subtitle = 'Fries GPUs for breakfast.',
    logoSrc,
    hub,
    preventActivateDismiss = false,
  }: Props = $props();

  /** Splash dismiss is blocked while resolving OAuth or when Audiotool / continue actions must capture input. */
  const oauthSplashBlocksDismiss = $derived(
    audiotoolPhase === 'checking' ||
      onAudiotoolSignIn != null ||
      onContinueWithoutAudiotool != null ||
      audiotoolBootstrapping ||
      preventActivateDismiss
  );

  /** When OAuth-phase controls are actionable, constrain pointer-events/cursor vs overlay dismiss. */
  const oauthSignInChromeVisible = $derived(
    audiotoolPhase === 'signin' &&
      (onAudiotoolSignIn != null ||
        onContinueWithoutAudiotool != null ||
        audiotoolBootstrapping ||
        hub != null)
  );

  let logoFailed = $state(false);

  let reduceMotion = $state(false);
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = mq.matches;
    const handler = (): void => {
      reduceMotion = mq.matches;
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  });

  const fadeMs = $derived.by(() => {
    if (typeof window === 'undefined') return 200;
    const fast = readCssTimeMs('--motion-effects-fast-duration');
    const normal = readCssTimeMs('--motion-effects-normal-duration');
    // Shorter when reduced motion; never 0 or the dismiss feels like a hard cut.
    if (reduceMotion) {
      return Number.isFinite(fast) ? fast : 150;
    }
    return Number.isFinite(normal) ? normal : Number.isFinite(fast) ? fast : 200;
  });

  function handleActivate(): void {
    if (!ready || !onDismiss || oauthSplashBlocksDismiss) return;
    onDismiss();
  }

  function handleAudiotoolSignInClick(e: MouseEvent): void {
    e.stopPropagation();
    if (audiotoolBootstrapping) return;
    onAudiotoolSignIn?.();
  }

  function handleContinueWithoutAudiotoolClick(e: MouseEvent): void {
    e.stopPropagation();
    if (audiotoolBootstrapping || !onContinueWithoutAudiotool) return;
    void onContinueWithoutAudiotool();
  }

  /** Escape dismisses without moving focus onto the overlay (no focus steal on open). */
  $effect(() => {
    if (typeof window === 'undefined' || oauthSplashBlocksDismiss || !ready || !onDismiss) return;
    function onGlobalKeydown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss?.();
      }
    }
    window.addEventListener('keydown', onGlobalKeydown);
    return () => window.removeEventListener('keydown', onGlobalKeydown);
  });

  const splashAriaBusy = $derived(
    audiotoolPhase === 'checking' ||
      audiotoolBootstrapping ||
      (!ready && onAudiotoolSignIn == null && onContinueWithoutAudiotool == null)
  );
</script>

<div
  id="app-splash-root"
  class="app-splash"
  class:app-splash--ready={ready && !oauthSplashBlocksDismiss}
  class:app-splash--audiotool={oauthSignInChromeVisible}
  class:app-splash--hub={hub != null}
  role={oauthSplashBlocksDismiss || ready ? 'dialog' : 'status'}
  aria-modal={audiotoolPhase === 'checking' ||
  onAudiotoolSignIn != null ||
  onContinueWithoutAudiotool != null ||
  audiotoolBootstrapping ||
  ready
    ? 'true'
    : undefined}
  aria-busy={splashAriaBusy}
  aria-labelledby="app-splash-title"
  aria-describedby="app-splash-desc"
  transition:fade={() => ({ duration: fadeMs, easing: cubicOut })}
  onclick={handleActivate}
>
  <div class="app-splash__inner">
    {#if logoSrc && !logoFailed}
      <img
        src={logoSrc}
        alt=""
        class="app-splash__logo"
        width="40"
        height="40"
        onerror={() => {
          logoFailed = true;
        }}
      />
    {:else if !logoSrc}
      <LayeredAppLogo variant="full" class="app-splash__brand-mark" />
    {/if}
    <h1 id="app-splash-title" class="app-splash__title">
      <span
        class="app-splash__title-part app-splash__title-part--shader"
        style:font-weight={titleShaderWeight}>{titleShader}</span><span
        class="app-splash__title-part app-splash__title-part--noice"
        style:font-weight={titleNoiceWeight}>{titleNoice}</span>
    </h1>
    <p id="app-splash-desc" class="app-splash__subtitle app-splash__subtitle--warn">
      <span class="app-splash__warn-icon-wrap" aria-hidden="true">
        <IconSvg name="flame" variant="filled" class="app-splash__warn-icon" />
      </span>
      <span class="app-splash__subtitle-text">{subtitle}</span>
    </p>
    {#if audiotoolPhase === 'signin'}
      {#if audiotoolError?.trim()}
        <div class="app-splash__auth-alert" role="alert">
          <Message inline variant="error">
            <span>{audiotoolError.trim()}</span>
          </Message>
        </div>
      {/if}
      {#if onContinueWithoutAudiotool || onAudiotoolSignIn}
        <div class="app-splash__actions">
          {#if onAudiotoolSignIn}
            <Button
              variant="primary"
              size="lg"
              mode="both"
              disabled={audiotoolBootstrapping}
              class="app-splash__signin-btn"
              onclick={handleAudiotoolSignInClick}
            >
              <span class="app-splash__signin-btn-icon" aria-hidden="true">
                <AudiotoolMarkSvg />
              </span>
              <span class="app-splash__signin-btn-label">{audiotoolSignInLabel}</span>
            </Button>
          {/if}
          {#if onContinueWithoutAudiotool}
            <Button
              variant="ghost"
              size="lg"
              mode="both"
              disabled={audiotoolBootstrapping}
              class="app-splash__continue-btn"
              onclick={handleContinueWithoutAudiotoolClick}
            >
              {audiotoolBootstrapping ? 'Starting…' : 'Continue as guest'}
            </Button>
          {/if}
        </div>
      {/if}
    {/if}
    {#if hub}
      <div class="app-splash__hub-panel">
        {@render hub()}
      </div>
    {/if}
    <span
      class="app-splash__compat"
      role="note"
      aria-label="Best in Chrome or Chromium-based browsers. Video export uses WebCodecs (VideoEncoder and AudioEncoder), so other browsers may be limited."
      title="Video export uses WebCodecs; other browsers may be limited."
    >
      <span class="app-splash__compat-icon" aria-hidden="true">
        <IconSvg name="google-chrome-logo" variant="filled" />
      </span>
      Best in Chrome/Chromium
    </span>
  </div>
</div>

<style>
  .app-splash {
    position: fixed;
    inset: 0;
    z-index: 1100;
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: var(--pd-2xl);
    font-family: var(--font-sans);
    background: var(--layout-bg);
    color: var(--print-default);
    pointer-events: auto;
    cursor: wait;
    outline: none;
  }

  .app-splash--ready {
    cursor: pointer;
  }

  .app-splash--audiotool {
    cursor: default;
  }

  .app-splash--audiotool.app-splash--ready {
    cursor: default;
  }

  .app-splash--ready:focus-visible {
    box-shadow: inset 0 0 0 2px var(--color-blue-90);
  }

  .app-splash__auth-alert {
    margin: var(--pd-sm) 0 0;
    width: 100%;
    max-width: 100%;
  }

  /* Technical OAuth/API messages: match previous mono handling */
  .app-splash__auth-alert :global(.message.is-inline.is-error .message-content) {
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    line-height: 1.35;
  }

  .app-splash__actions {
    margin-top: var(--pd-4xl);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: var(--pd-md);
    width: 100%;
    max-width: 20rem;
  }

  /**
   * Leading icon + label centered in the full button width (empty 1fr column mirrors the icon column).
   */
  .app-splash__actions :global(button.button.app-splash__signin-btn.both) {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: var(--pd-sm);
    padding: var(--pd-md) var(--pd-lg);
  }

  .app-splash__actions :global(.app-splash__signin-btn-icon) {
    grid-column: 1;
    justify-self: start;
    display: inline-flex;
    align-items: center;
    margin: 0;
  }

  .app-splash__actions :global(.app-splash__signin-btn-icon .audiotool-mark-svg) {
    margin-right: 0;
  }

  .app-splash__actions :global(.app-splash__signin-btn-label) {
    grid-column: 2;
    text-align: center;
    min-width: 0;
  }

  /**
   * So clicks anywhere… still targets the splash root handler in intro mode;
   * audiotool mode uses actionable controls only on the inner action row.
   */
  .app-splash--audiotool .app-splash__inner * {
    pointer-events: none;
  }

  .app-splash--audiotool .app-splash__actions,
  .app-splash--audiotool .app-splash__actions * {
    pointer-events: auto;
  }

  .app-splash__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding-bottom: 3.7%;
    gap: var(--pd-xs);
    max-width: min(100%, 28rem);
    pointer-events: none;
  }

  .app-splash--hub .app-splash__inner {
    max-width: min(100%, 44rem);
  }

  /** Hub content is rendered via snippet (child components); targets must be global */
  .app-splash :global(.app-splash__hub-panel),
  .app-splash :global(.app-splash__hub-panel *) {
    pointer-events: auto;
    cursor: default;
  }

  .app-splash--hub:not(.app-splash--audiotool) {
    cursor: default;
  }

  /* So clicks anywhere on the overlay hit the root handler (pointer-events is not inherited). */
  .app-splash__inner * {
    pointer-events: none;
  }

  /**
   * Slow CCW drift: each half-revolution uses a different ease so speed is non-linear
   * but the loop stays seamless at 0°/360°.
   */
  @keyframes app-splash-logo-ccw {
    0% {
      transform: rotate(0deg);
      animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    50% {
      transform: rotate(-180deg);
      animation-timing-function: cubic-bezier(0.64, 0, 0.78, 0.39);
    }
    100% {
      transform: rotate(-360deg);
    }
  }

  /** Pulses halo strength only (paired with rotate on the same element). */
  @keyframes app-splash-logo-glow {
    0%,
    100% {
      filter: drop-shadow(0 0 7px color-mix(in srgb, var(--color-violet-90) 22%, transparent))
        drop-shadow(0 0 16px color-mix(in srgb, var(--print-light) 10%, transparent))
        drop-shadow(0 0 32px color-mix(in srgb, var(--print-light) 5%, transparent));
    }
    50% {
      filter: drop-shadow(0 0 14px color-mix(in srgb, var(--color-purple-110) 42%, transparent))
        drop-shadow(0 0 28px color-mix(in srgb, var(--print-light) 18%, transparent))
        drop-shadow(0 0 48px color-mix(in srgb, var(--color-red-orange-110) 9%, transparent));
    }
  }

  .app-splash__logo {
    width: 120px;
    height: 120px;
    object-fit: contain;
    border-radius: var(--radius-md);
    flex-shrink: 0;
    transform-origin: center center;
    animation:
      app-splash-logo-ccw 42s infinite,
      app-splash-logo-glow 31s ease-in-out infinite;
    margin-bottom: var(--pd-lg);
    /* drop-shadow follows non-transparent pixels (works with PNG alpha); box-shadow does not */
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--print-light) 22%, transparent))
      drop-shadow(0 0 16px color-mix(in srgb, var(--print-light) 10%, transparent))
      drop-shadow(0 0 32px color-mix(in srgb, var(--print-light) 5%, transparent));
  }

  .app-splash__brand-mark {
    margin-bottom: var(--pd-lg);
  }

  @media (prefers-reduced-motion: reduce) {
    .app-splash__logo {
      animation: none;
      filter: drop-shadow(0 0 10px color-mix(in srgb, var(--print-light) 30%, transparent))
        drop-shadow(0 0 22px color-mix(in srgb, var(--print-light) 14%, transparent))
        drop-shadow(0 0 40px color-mix(in srgb, var(--print-light) 6%, transparent));
    }
  }

  .app-splash__title {
    margin: 0;
    font-size: var(--text-3xl);
    color: var(--print-light);
    letter-spacing: -0.03em;
    line-height: 1.15;
  }

  .app-splash__title-part {
    letter-spacing: inherit;
  }

  .app-splash__subtitle {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: 400;
    line-height: 1;
    font-family: var(--font-mono);
  }

  .app-splash__subtitle--warn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--pd-sm);
    max-width: 100%;
    box-sizing: border-box;
    color: var(--color-red-orange-100);
    text-align: left;
  }

  .app-splash__warn-icon-wrap {
    display: inline-flex;
    flex-shrink: 0;
    color: var(--color-red-orange-90);
    font-size: 20px;
  }

  .app-splash__subtitle-text {
    flex: 1;
    min-width: 0;
  }

  .app-splash__compat {
    position: absolute;
    left: 50%;
    bottom: var(--pd-xl);
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--pd-md);
    border-radius: 999px;
    font-size: var(--text-sm);
    line-height: 1;
    font-weight: 300;
    font-family: var(--font-mono);
    color: var(--color-yellow-gray-100);
    user-select: none;
    pointer-events: none;
  }

  .app-splash__compat-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    opacity: 0.9;
  }

</style>
