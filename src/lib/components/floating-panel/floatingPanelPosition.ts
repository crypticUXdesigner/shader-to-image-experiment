/**
 * Shared persistence for floating panel positions (e.g. per panel type and variant).
 * Each panel type can have its own coordinates; variants (e.g. "large" vs "compact")
 * each get a separate stored position. Use getStoredPosition when opening a panel,
 * and setStoredPosition in onPositionChange when the user drags it.
 */

const STORAGE_KEY_PREFIX = 'shadernoice.floatingPanel.';
const LEGACY_STORAGE_KEY_PREFIX = 'shader-composer.floatingPanel.';

function buildLegacyPrefixKey(panelId: string, variant?: string): string {
  if (variant) {
    return `${LEGACY_STORAGE_KEY_PREFIX}${panelId}.${variant}`;
  }
  return `${LEGACY_STORAGE_KEY_PREFIX}${panelId}`;
}

export interface StoredPositionOptions {
  /** Variant of the panel (e.g. "large" | "compact"). Each variant has its own position. */
  variant?: string;
  /** Fallback position when nothing is stored (e.g. screen center). */
  fallback: { x: number; y: number };
  /** Legacy localStorage key(s) to try in order after the default key (for migration). */
  legacyKey?: string | string[];
}

/**
 * Build the localStorage key for a panel (and optional variant).
 */
export function buildStorageKey(panelId: string, variant?: string): string {
  if (variant) {
    return `${STORAGE_KEY_PREFIX}${panelId}.${variant}`;
  }
  return `${STORAGE_KEY_PREFIX}${panelId}`;
}

/**
 * Read stored position for a panel. Tries: default key (with variant) → legacyKey → fallback.
 */
export function getStoredPosition(
  panelId: string,
  options: StoredPositionOptions
): { x: number; y: number } {
  const { variant, fallback, legacyKey } = options;

  const read = (key: string): { x: number; y: number } | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { x?: number; y?: number };
      if (
        typeof parsed?.x === 'number' &&
        typeof parsed?.y === 'number'
      ) {
        return { x: parsed.x, y: parsed.y };
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const key = buildStorageKey(panelId, variant);
  const legacyKeys = legacyKey === undefined
    ? []
    : Array.isArray(legacyKey)
      ? legacyKey
      : [legacyKey];
  const stored =
    read(key) ??
    read(buildLegacyPrefixKey(panelId, variant)) ??
    legacyKeys.reduce<{ x: number; y: number } | null>(
      (acc, k) => acc ?? read(k),
      null
    );
  return stored ?? fallback;
}

/**
 * Persist position for a panel (and optional variant). Call from onPositionChange.
 */
export function setStoredPosition(
  panelId: string,
  x: number,
  y: number,
  variant?: string
): void {
  try {
    const key = buildStorageKey(panelId, variant);
    localStorage.setItem(key, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}

/**
 * Conservative outer box for clamping the **large** audio signal picker center
 * (`AudioSignalPickerPanel` + `FloatingPanel` chrome). Slightly oversized so the
 * real panel stays inside the viewport after resize / monitor changes.
 */
export const AUDIO_SIGNAL_PICKER_LARGE_CLAMP_BOX = { width: 900, height: 800 } as const;

/**
 * Conservative outer box for the **compact** connected-signal picker.
 */
export const AUDIO_SIGNAL_PICKER_COMPACT_CLAMP_BOX = { width: 440, height: 360 } as const;

/**
 * Conservative outer box for the draggable timeline + automation floating panel
 * (`TimelinePanelFloatingShell` + `FloatingPanel` chrome + curve editor slot).
 */
export const TIMELINE_PANEL_FLOATING_CLAMP_BOX = { width: 1040, height: 640 } as const;

/**
 * Clamp a fixed `Popover` / `FloatingPanel` center (`align="center"`, `alignY="center"`)
 * so the panel bounding box fits in the viewport with `inset` px margin.
 * Used when restoring stored coordinates that may be off-screen.
 */
export function clampPanelCenterToViewport(
  center: { x: number; y: number },
  panelWidth: number,
  panelHeight: number,
  inset = 16
): { x: number; y: number } {
  if (typeof window === 'undefined') return center;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(panelWidth, Math.max(1, vw - 2 * inset));
  const h = Math.min(panelHeight, Math.max(1, vh - 2 * inset));
  const halfW = w / 2;
  const halfH = h / 2;
  let x = center.x;
  let y = center.y;
  const minX = inset + halfW;
  const maxX = vw - inset - halfW;
  const minY = inset + halfH;
  const maxY = vh - inset - halfH;
  if (minX <= maxX) x = Math.min(Math.max(x, minX), maxX);
  else x = vw / 2;
  if (minY <= maxY) y = Math.min(Math.max(y, minY), maxY);
  else y = vh / 2;
  return { x, y };
}
