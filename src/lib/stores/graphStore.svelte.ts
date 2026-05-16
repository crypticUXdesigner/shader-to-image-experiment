/**
 * Reactive Graph Store
 *
 * Single source of truth for node graph and related UI state.
 * Uses Svelte 5 runes ($state, $derived) for reactivity.
 * Components import graphStore and read properties; changes propagate reactively.
 */

import type {
  NodeGraph,
  Connection,
  GraphViewState,
  ParameterValue,
  GraphUndoRecordingOptions,
} from '../../data-model/types';
import type { AudioSetup } from '../../data-model/audioSetupTypes';
import {
  createEmptyGraph,
  createDefaultViewState,
} from '../../data-model/utils';
import {
  updateNodePosition,
  updateNodeParameter,
  updateNodeParameterInputMode,
  resetNodeParametersToDefaults,
  updateNodeLabel,
  setNodeBypassed,
  addNode,
  removeNode,
  addConnection,
  removeConnection,
  setConnectionDisabled,
  updateViewState,
} from '../../data-model/immutableUpdates';
import type { NodeInstance } from '../../data-model/types';
import type { NodeSpecification } from '../../data-model/validationTypes';
import type { ConnectionValidationContext } from '../../data-model/connectionValidationContext';
import type { ParameterInputMode, ParameterSpec } from '../../types/nodeSpec';
import type { ToolType } from '../../types/editor';

/** Passed to `graphChangedListener`; view-only updates set `recordUndo: false`. */
export type GraphChangedOptions = GraphUndoRecordingOptions;

export type { ToolType };

export interface TimelineState {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
}

const defaultViewState = createDefaultViewState();

// --- Reactive state ---

let graph = $state<NodeGraph>(createEmptyGraph('Untitled'));
let audioSetup = $state<AudioSetup>({
  files: [],
  bands: [],
  remappers: [],
});
let timelineState = $state<TimelineState>({
  currentTime: 0,
  isPlaying: false,
  duration: 0,
});
let activeTool = $state<ToolType>('cursor');
let isSpacebarPressed = $state(false);
/** Patch tool: first picked connection id, or null. */
let patchWireConnectionId = $state<string | null>(null);
/** Patch tool: node to insert, or null. */
let patchInsertNodeId = $state<string | null>(null);

/** Optional listener invoked whenever the graph is mutated (undo + autosave revision). Set by App. */
let graphChangedListener: ((g: NodeGraph, options?: GraphChangedOptions) => void) | null = null;

/** Invoked when leaving patch tool so chrome (e.g. toasts) can clean up. Set by App; keep out of the store graph layer. */
let patchToolExitListener: (() => void) | null = null;

export type SetGraphOptions = {
  /** When true, `graphChangedListener` is not invoked (e.g. undo/redo restoring a snapshot). */
  skipGraphChangedListener?: boolean;
};
/** Invoked whenever audioSetup is replaced (autosave/revision helpers). Set by App. */
let audioChangedListener: (() => void) | null = null;

// --- Derived ---

const viewState = $derived<GraphViewState>(graph.viewState ?? defaultViewState);

// --- Actions ---

function setGraphAction(newGraph: NodeGraph, options?: SetGraphOptions): void {
  graph = newGraph;
  if (!options?.skipGraphChangedListener) {
    graphChangedListener?.(graph);
  }
}

function setAudioSetupAction(newSetup: AudioSetup): void {
  audioSetup = newSetup;
  audioChangedListener?.();
}

function updateNodePositionAction(
  nodeId: string,
  position: { x: number; y: number }
): void {
  graph = updateNodePosition(graph, nodeId, position);
  graphChangedListener?.(graph);
}

function updateNodeParameterAction(
  nodeId: string,
  paramName: string,
  value: ParameterValue,
  options?: GraphChangedOptions
): void {
  graph = updateNodeParameter(graph, nodeId, paramName, value);
  graphChangedListener?.(graph, options);
}

/** Push one undo snapshot for the current graph (e.g. end of a drag after transient `recordUndo: false` updates). */
function recordUndoSnapshotAction(): void {
  graphChangedListener?.(graph, { recordUndo: true });
}

function updateNodeParameterInputModeAction(
  nodeId: string,
  paramName: string,
  mode: ParameterInputMode
): void {
  graph = updateNodeParameterInputMode(graph, nodeId, paramName, mode);
  graphChangedListener?.(graph);
}

function resetNodeParametersToDefaultsAction(
  nodeId: string,
  parameterSpecs: Record<string, ParameterSpec>
): void {
  graph = resetNodeParametersToDefaults(graph, nodeId, parameterSpecs);
  graphChangedListener?.(graph);
}

function updateNodeLabelAction(nodeId: string, label: string | undefined): void {
  graph = updateNodeLabel(graph, nodeId, label);
  graphChangedListener?.(graph);
}

function setNodeBypassedAction(nodeId: string, bypassed: boolean): void {
  graph = setNodeBypassed(graph, nodeId, bypassed);
  graphChangedListener?.(graph);
}

function addNodeAction(node: NodeInstance): void {
  graph = addNode(graph, node);
  graphChangedListener?.(graph);
}

function removeNodeAction(
  nodeId: string,
  nodeSpecs?: NodeSpecification[],
  connectionValidation?: ConnectionValidationContext
): void {
  const hasSpecs = nodeSpecs && nodeSpecs.length > 0;
  graph = removeNode(
    graph,
    nodeId,
    hasSpecs
      ? {
          nodeSpecs: nodeSpecs!,
          ...(connectionValidation ? { connectionValidation } : {}),
        }
      : undefined
  );
  graphChangedListener?.(graph);
}

function addConnectionAction(connection: Connection): void {
  graph = addConnection(graph, connection);
  graphChangedListener?.(graph);
}

function removeConnectionAction(connectionId: string): void {
  graph = removeConnection(graph, connectionId);
  graphChangedListener?.(graph);
}

function setConnectionDisabledAction(connectionId: string, disabled: boolean): void {
  graph = setConnectionDisabled(graph, connectionId, disabled);
  graphChangedListener?.(graph);
}

function updateViewStateAction(partial: Partial<GraphViewState>): void {
  graph = updateViewState(graph, partial);
  graphChangedListener?.(graph, { recordUndo: false });
}

function setTimelineStateAction(partial: Partial<TimelineState>): void {
  timelineState = { ...timelineState, ...partial };
}

function clearPatchPicksAction(): void {
  patchWireConnectionId = null;
  patchInsertNodeId = null;
}

function setPatchWirePickAction(id: string | null): void {
  patchWireConnectionId = id;
}

function setPatchInsertNodePickAction(id: string | null): void {
  patchInsertNodeId = id;
}

function setActiveToolAction(tool: ToolType): void {
  if (activeTool === 'patch' && tool !== 'patch') {
    patchToolExitListener?.();
  }
  if (tool !== 'patch' || activeTool !== 'patch') {
    clearPatchPicksAction();
  }
  activeTool = tool;
}

function setSpacebarPressedAction(pressed: boolean): void {
  isSpacebarPressed = pressed;
}

/**
 * Sets the listener invoked whenever the graph is mutated via the store.
 * Used by the app to push undo state in one place. Pass null to clear.
 */
function setGraphChangedListener(fn: ((g: NodeGraph, options?: GraphChangedOptions) => void) | null): void {
  graphChangedListener = fn;
}

function setAudioChangedListener(fn: (() => void) | null): void {
  audioChangedListener = fn;
}

function setPatchToolExitListener(fn: (() => void) | null): void {
  patchToolExitListener = fn;
}

/**
 * Returns current graph. Use in $effect for reactive reads:
 * $effect(() => { const g = getGraph(); ... })
 */
export function getGraph(): NodeGraph {
  return graph;
}

// --- Public store API ---

export const graphStore = {
  get graph(): NodeGraph {
    return graph;
  },
  get audioSetup(): AudioSetup {
    return audioSetup;
  },
  get viewState(): GraphViewState {
    return viewState;
  },
  get timelineState(): TimelineState {
    return timelineState;
  },
  get activeTool(): ToolType {
    return activeTool;
  },
  get isSpacebarPressed(): boolean {
    return isSpacebarPressed;
  },
  get patchWireConnectionId(): string | null {
    return patchWireConnectionId;
  },
  get patchInsertNodeId(): string | null {
    return patchInsertNodeId;
  },
  setGraph: setGraphAction,
  setAudioSetup: setAudioSetupAction,
  updateNodePosition: updateNodePositionAction,
  updateNodeParameter: updateNodeParameterAction,
  recordUndoSnapshot: recordUndoSnapshotAction,
  updateNodeParameterInputMode: updateNodeParameterInputModeAction,
  resetNodeParametersToDefaults: resetNodeParametersToDefaultsAction,
  updateNodeLabel: updateNodeLabelAction,
  setNodeBypassed: setNodeBypassedAction,
  addNode: addNodeAction,
  removeNode: removeNodeAction,
  addConnection: addConnectionAction,
  removeConnection: removeConnectionAction,
  setConnectionDisabled: setConnectionDisabledAction,
  updateViewState: updateViewStateAction,
  setTimelineState: setTimelineStateAction,
  setActiveTool: setActiveToolAction,
  setPatchWirePick: setPatchWirePickAction,
  setPatchInsertNodePick: setPatchInsertNodePickAction,
  clearPatchPicks: clearPatchPicksAction,
  setSpacebarPressed: setSpacebarPressedAction,
  setGraphChangedListener,
  setAudioChangedListener,
  setPatchToolExitListener,
};
