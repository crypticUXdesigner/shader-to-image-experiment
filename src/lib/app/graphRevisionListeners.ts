/**
 * Wire graphStore revision listeners with shared hydrating guard (App shell).
 */

import type { NodeGraph } from '../../data-model/types';
import type { GraphChangedOptions } from '../stores';

export interface GraphRevisionListenerHost {
  setGraphChangedListener(fn: ((g: NodeGraph, options?: GraphChangedOptions) => void) | null): void;
  setAudioChangedListener(fn: (() => void) | null): void;
}

/**
 * Registers listeners; returned disposer clears both (call on hub teardown / symmetry with bootstrap).
 */
export function attachGraphRevisionListeners(deps: {
  host: GraphRevisionListenerHost;
  getHydrating: () => boolean;
  onGraphChanged: (g: NodeGraph, options?: GraphChangedOptions) => void;
  onAudioChanged: () => void;
}): () => void {
  deps.host.setGraphChangedListener((g, options) => {
    if (deps.getHydrating()) return;
    deps.onGraphChanged(g, options);
  });
  deps.host.setAudioChangedListener(() => {
    if (deps.getHydrating()) return;
    deps.onAudioChanged();
  });
  return () => {
    deps.host.setGraphChangedListener(null);
    deps.host.setAudioChangedListener(null);
  };
}
