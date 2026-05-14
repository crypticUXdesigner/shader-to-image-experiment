import { describe, expect, it } from 'vitest';
import { nodeSystemSpecs } from '../shaders/nodes/index';
import {
  RUNTIME_ONLY_EXACT_ENTRIES,
  RUNTIME_ONLY_PATTERN_RULE_SOURCES,
  isRuntimeOnlyParameter
} from './runtimeOnlyParams';

const specById = new Map(nodeSystemSpecs.map((s) => [s.id, s]));

function compareEntry(a: readonly [string, string], b: readonly [string, string]): number {
  const c = a[0].localeCompare(b[0]);
  if (c !== 0) return c;
  return a[1].localeCompare(b[1]);
}

describe('runtimeOnlyParams registry', () => {
  it('keeps RUNTIME_ONLY_EXACT_ENTRIES strictly sorted and unique', () => {
    for (let i = 1; i < RUNTIME_ONLY_EXACT_ENTRIES.length; i++) {
      const prev = RUNTIME_ONLY_EXACT_ENTRIES[i - 1]!;
      const curr = RUNTIME_ONLY_EXACT_ENTRIES[i]!;
      expect(compareEntry(prev, curr)).toBeLessThan(0);
    }
  });

  it('maps every exact entry to a real NodeSpec parameter', () => {
    for (const [nodeId, paramName] of RUNTIME_ONLY_EXACT_ENTRIES) {
      const spec = specById.get(nodeId);
      expect(spec, `unknown node id in runtime-only registry: ${nodeId}`).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(spec!.parameters, paramName),
        `runtime-only param "${paramName}" missing from NodeSpec.parameters for ${nodeId}`
      ).toBe(true);
      expect(isRuntimeOnlyParameter(nodeId, paramName)).toBe(true);
    }
  });

  it('maps every pattern rule to at least one real parameter name on that node', () => {
    for (const [nodeId, patternSource] of RUNTIME_ONLY_PATTERN_RULE_SOURCES) {
      const spec = specById.get(nodeId);
      expect(spec, `unknown node id in runtime-only pattern rules: ${nodeId}`).toBeDefined();
      const re = new RegExp(patternSource);
      const names = Object.keys(spec!.parameters);
      expect(
        names.some((k) => re.test(k)),
        `pattern /${patternSource}/ for ${nodeId} matched no NodeSpec.parameters keys`
      ).toBe(true);
    }
  });
});
