/**
 * Single source of truth for parameters that live in the graph but do not generate
 * shader uniforms (runtime-only). Used by UniformGenerator, CompilationManager,
 * RuntimeManager, and ExportRenderPath so behavior is consistent.
 *
 * Drift is guarded by `runtimeOnlyParams.test.ts`: every `RUNTIME_ONLY_EXACT_ENTRIES`
 * pair must exist on the matching `NodeSpec` in `nodeSystemSpecs`, and pattern rules
 * must match at least one parameter name on that node type.
 *
 * To add a new runtime-only parameter: append a row to `RUNTIME_ONLY_EXACT_ENTRIES`
 * (keep sorted by node id, then param name) or add a `[nodeType, patternSource]` to
 * `RUNTIME_ONLY_PATTERN_RULE_SOURCES` (each pattern must match ≥ one real param name; see test).
 */

/** Exact (node id, param name) pairs — sorted by node id, then param name; builds exact-match sets. */
export const RUNTIME_ONLY_EXACT_ENTRIES: ReadonlyArray<readonly [string, string]> = [
  ['radial-pulse', 'pulseDrive'],
  ['radial-pulse', 'pulseFallThreshold'],
  ['radial-pulse', 'pulseRiseThreshold']
];

/**
 * Regex sources per node id (passed to `RegExp`). Each must match at least one key in that
 * node's `NodeSpec.parameters` (see `runtimeOnlyParams.test.ts`).
 */
export const RUNTIME_ONLY_PATTERN_RULE_SOURCES: ReadonlyArray<readonly [string, string]> = [];

function buildExactMap(entries: ReadonlyArray<readonly [string, string]>): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const [nodeType, paramName] of entries) {
    let set = out[nodeType];
    if (!set) {
      set = new Set();
      out[nodeType] = set;
    }
    set.add(paramName);
  }
  return out;
}

/** Exact parameter names that are runtime-only (no shader uniform) per node type. */
const RUNTIME_ONLY_EXACT: Record<string, Set<string>> = buildExactMap(RUNTIME_ONLY_EXACT_ENTRIES);

/**
 * Regex patterns for runtime-only params.
 * Param names matching any pattern for the node type are treated as runtime-only.
 */
const RUNTIME_ONLY_PATTERNS: Record<string, RegExp[]> = (() => {
  const out: Record<string, RegExp[]> = {};
  for (const [nodeType, source] of RUNTIME_ONLY_PATTERN_RULE_SOURCES) {
    let list = out[nodeType];
    if (!list) {
      list = [];
      out[nodeType] = list;
    }
    list.push(new RegExp(source));
  }
  return out;
})();

/**
 * Returns true if the given (nodeType, paramName) is runtime-only (no shader uniform).
 */
export function isRuntimeOnlyParameter(nodeType: string, paramName: string): boolean {
  const exact = RUNTIME_ONLY_EXACT[nodeType];
  if (exact?.has(paramName)) return true;
  const patterns = RUNTIME_ONLY_PATTERNS[nodeType];
  if (patterns) {
    for (const re of patterns) {
      if (re.test(paramName)) return true;
    }
  }
  return false;
}
