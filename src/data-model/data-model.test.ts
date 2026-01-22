/**
 * Unit Tests for Data Model Module
 * 
 * This file contains comprehensive tests for the data model implementation.
 * These tests can be run with any test framework (Jest, Vitest, etc.) or
 * adapted to work standalone.
 * 
 * To run with Vitest (recommended):
 *   1. Install: npm install -D vitest
 *   2. Add to package.json scripts: "test": "vitest"
 *   3. Run: npm test
 */

import {
  type NodeGraph,
  type NodeInstance,
  validateGraph,
  validateNoDuplicateConnections,
  serializeGraph,
  deserializeGraph,
  generateNodeId,
  generateConnectionId,
  generateGraphId,
  getParameterValue,
  coerceParameterValue,
  createEmptyGraph,
  findNode,
  findConnection,
  getConnectionsFromNode,
  getConnectionsToNode,
  type NodeSpecification,
} from './index';

// Simple test helper (can be replaced with test framework assertions)
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message || 'Values not equal'}\n  Expected: ${expected}\n  Actual: ${actual}`
    );
  }
}

// Test data: Sample node specifications
const mockNodeSpecs: NodeSpecification[] = [
  {
    id: 'uv-coordinates',
    outputs: [{ name: 'out', type: 'vec2' }],
    parameters: {},
  },
  {
    id: 'fbm-noise',
    inputs: [{ name: 'in', type: 'vec2' }],
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {
      scale: { type: 'float', default: 2.0, min: 0.1, max: 10.0 },
      octaves: { type: 'int', default: 4, min: 1, max: 8 },
      intensity: { type: 'float', default: 0.5, min: 0.0, max: 1.0 },
    },
  },
  {
    id: 'final-output',
    inputs: [{ name: 'in', type: 'vec4' }],
    parameters: {
      alpha: { type: 'float', default: 1.0, min: 0.0, max: 1.0 },
    },
  },
];

// Test: Create empty graph
export function testCreateEmptyGraph(): void {
  const graph = createEmptyGraph('Test Graph');
  assert(graph.name === 'Test Graph', 'Graph name should match');
  assert(graph.version === '2.0', 'Graph version should be 2.0');
  assert(graph.nodes.length === 0, 'Graph should have no nodes');
  assert(graph.connections.length === 0, 'Graph should have no connections');
  assert(graph.id.length > 0, 'Graph should have an ID');
}

// Test: ID generation
export function testIdGeneration(): void {
  const nodeId1 = generateNodeId();
  const nodeId2 = generateNodeId();
  assert(nodeId1 !== nodeId2, 'Generated node IDs should be unique');

  const connId1 = generateConnectionId();
  const connId2 = generateConnectionId();
  assert(connId1 !== connId2, 'Generated connection IDs should be unique');

  const graphId1 = generateGraphId();
  const graphId2 = generateGraphId();
  assert(graphId1 !== graphId2, 'Generated graph IDs should be unique');

  // Test collision avoidance
  const existingIds = new Set(['node-1', 'node-2']);
  const newId = generateNodeId(existingIds);
  assert(!existingIds.has(newId), 'Generated ID should not collide with existing IDs');
}

// Test: Parameter value retrieval
export function testGetParameterValue(): void {
  const nodeSpec = mockNodeSpecs.find(s => s.id === 'fbm-noise')!;
  const node: NodeInstance = {
    id: 'n1',
    type: 'fbm-noise',
    position: { x: 0, y: 0 },
    parameters: {
      scale: 3.0,
    },
  };

  // Parameter exists in node
  const scale = getParameterValue(node, 'scale', nodeSpec);
  assertEqual(scale, 3.0, 'Should return parameter value from node');

  // Parameter missing, use default
  const octaves = getParameterValue(node, 'octaves', nodeSpec);
  assertEqual(octaves, 4, 'Should return default value from spec');

  // Parameter missing, no spec, use type default
  const intensity = getParameterValue(node, 'intensity', nodeSpec);
  assertEqual(intensity, 0.5, 'Should return default value from spec');
}

// Test: Parameter value coercion
export function testCoerceParameterValue(): void {
  assertEqual(coerceParameterValue('5', 'int'), 5, 'String "5" should coerce to int 5');
  assertEqual(coerceParameterValue(5.7, 'int'), 6, 'Float 5.7 should round to int 6');
  assertEqual(coerceParameterValue('2.5', 'float'), 2.5, 'String "2.5" should coerce to float 2.5');
  assertEqual(coerceParameterValue(5, 'string'), '5', 'Number 5 should coerce to string "5"');

  const vec4 = coerceParameterValue([1, 2, 3, 4], 'vec4');
  assert(Array.isArray(vec4) && vec4.length === 4, 'Should coerce to vec4 array');
  if (Array.isArray(vec4)) {
    assertEqual(vec4[0], 1, 'Vec4 first element should be 1');
  }
}

// Test: Graph validation - valid graph
export function testValidateValidGraph(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test Graph',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
      {
        id: 'n2',
        type: 'fbm-noise',
        position: { x: 100, y: 0 },
        parameters: {
          scale: 2.0,
          octaves: 4,
        },
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePort: 'out',
        targetNodeId: 'n2',
        targetPort: 'in',
      },
    ],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === true, 'Valid graph should pass validation');
  assert(result.errors.length === 0, 'Valid graph should have no errors');
}

// Test: Graph validation - missing required fields
export function testValidateMissingFields(): void {
  const graph = {
    name: 'Test',
    version: '2.0',
    nodes: [],
    connections: [],
  } as unknown as NodeGraph;

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === false, 'Graph missing id should fail validation');
  assert(result.errors.length > 0, 'Should have validation errors');
}

// Test: Graph validation - duplicate node IDs
export function testValidateDuplicateNodeIds(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
      {
        id: 'n1', // Duplicate!
        type: 'uv-coordinates',
        position: { x: 100, y: 0 },
        parameters: {},
      },
    ],
    connections: [],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === false, 'Graph with duplicate node IDs should fail validation');
  assert(
    result.errors.some(e => e.includes('Duplicate node ID')),
    'Should have error about duplicate node ID'
  );
}

// Test: Graph validation - orphaned connection
export function testValidateOrphanedConnection(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePort: 'out',
        targetNodeId: 'n2', // Non-existent node!
        targetPort: 'in',
      },
    ],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === false, 'Graph with orphaned connection should fail validation');
  assert(
    result.errors.some(e => e.includes('non-existent')),
    'Should have error about non-existent node'
  );
}

// Test: Graph validation - invalid parameter value
export function testValidateInvalidParameter(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'fbm-noise',
        position: { x: 0, y: 0 },
        parameters: {
          scale: 'invalid', // Should be number!
        },
      },
    ],
    connections: [],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === false, 'Graph with invalid parameter should fail validation');
  assert(
    result.errors.some(e => e.includes('invalid parameter value type')),
    'Should have error about invalid parameter type'
  );
}

// Test: Graph validation - parameter out of range
export function testValidateParameterOutOfRange(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'fbm-noise',
        position: { x: 0, y: 0 },
        parameters: {
          scale: 20.0, // Out of range (max is 10.0)!
        },
      },
    ],
    connections: [],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === false, 'Graph with parameter out of range should fail validation');
  assert(
    result.errors.some(e => e.includes('out of range')),
    'Should have error about parameter out of range'
  );
}

// Test: Serialization
export function testSerializeGraph(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test Graph',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
    ],
    connections: [],
  };

  const json = serializeGraph(graph);
  assert(json.includes('"format": "shader-composer-node-graph"'), 'Should include format');
  assert(json.includes('"formatVersion": "2.0"'), 'Should include format version');
  assert(json.includes('"graph"'), 'Should include graph data');
}

// Test: Deserialization - valid JSON
export function testDeserializeValidGraph(): void {
  const json = `{
    "format": "shader-composer-node-graph",
    "formatVersion": "2.0",
    "graph": {
      "id": "g1",
      "name": "Test Graph",
      "version": "2.0",
      "nodes": [
        {
          "id": "n1",
          "type": "uv-coordinates",
          "position": { "x": 0, "y": 0 },
          "parameters": {}
        }
      ],
      "connections": []
    }
  }`;

  const result = deserializeGraph(json, mockNodeSpecs);
  assert(result.graph !== null, 'Should deserialize valid graph');
  assert(result.errors.length === 0, 'Should have no errors');
  if (result.graph) {
    assertEqual(result.graph.name, 'Test Graph', 'Graph name should match');
    assertEqual(result.graph.nodes.length, 1, 'Should have one node');
  }
}

// Test: Deserialization - invalid format
export function testDeserializeInvalidFormat(): void {
  const json = `{
    "format": "wrong-format",
    "formatVersion": "2.0",
    "graph": {}
  }`;

  const result = deserializeGraph(json, mockNodeSpecs);
  assert(result.graph === null, 'Should reject invalid format');
  assert(result.errors.length > 0, 'Should have errors');
}

// Test: Deserialization - invalid JSON
export function testDeserializeInvalidJSON(): void {
  const json = '{ invalid json }';

  const result = deserializeGraph(json, mockNodeSpecs);
  assert(result.graph === null, 'Should reject invalid JSON');
  assert(result.errors.length > 0, 'Should have parse errors');
}

// Test: Graph helpers - find node
export function testFindNode(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
    ],
    connections: [],
  };

  const node = findNode(graph, 'n1');
  assert(node !== undefined, 'Should find existing node');
  assertEqual(node?.id, 'n1', 'Found node should have correct ID');

  const notFound = findNode(graph, 'n2');
  assert(notFound === undefined, 'Should not find non-existent node');
}

// Test: Graph helpers - find connection
export function testFindConnection(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      { id: 'n1', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n2', type: 'fbm-noise', position: { x: 100, y: 0 }, parameters: {} },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePort: 'out',
        targetNodeId: 'n2',
        targetPort: 'in',
      },
    ],
  };

  const conn = findConnection(graph, 'c1');
  assert(conn !== undefined, 'Should find existing connection');
  assertEqual(conn?.id, 'c1', 'Found connection should have correct ID');

  const notFound = findConnection(graph, 'c2');
  assert(notFound === undefined, 'Should not find non-existent connection');
}

// Test: Graph helpers - get connections from/to node
export function testGetConnections(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Test',
    version: '2.0',
    nodes: [
      { id: 'n1', type: 'uv-coordinates', position: { x: 0, y: 0 }, parameters: {} },
      { id: 'n2', type: 'fbm-noise', position: { x: 100, y: 0 }, parameters: {} },
      { id: 'n3', type: 'final-output', position: { x: 200, y: 0 }, parameters: {} },
    ],
    connections: [
      {
        id: 'c1',
        sourceNodeId: 'n1',
        sourcePort: 'out',
        targetNodeId: 'n2',
        targetPort: 'in',
      },
      {
        id: 'c2',
        sourceNodeId: 'n2',
        sourcePort: 'out',
        targetNodeId: 'n3',
        targetPort: 'in',
      },
    ],
  };

  const fromN1 = getConnectionsFromNode(graph, 'n1');
  assertEqual(fromN1.length, 1, 'Should find one connection from n1');
  assertEqual(fromN1[0].id, 'c1', 'Connection should be c1');

  const toN2 = getConnectionsToNode(graph, 'n2');
  assertEqual(toN2.length, 1, 'Should find one connection to n2');
  assertEqual(toN2[0].id, 'c1', 'Connection should be c1');
}

// Test: Empty graph validation
export function testValidateEmptyGraph(): void {
  const graph: NodeGraph = {
    id: 'g-empty',
    name: 'Empty Graph',
    version: '2.0',
    nodes: [],
    connections: [],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === true, 'Empty graph should be valid');
}

// Test: Single node graph validation
export function testValidateSingleNodeGraph(): void {
  const graph: NodeGraph = {
    id: 'g1',
    name: 'Single Node',
    version: '2.0',
    nodes: [
      {
        id: 'n1',
        type: 'uv-coordinates',
        position: { x: 0, y: 0 },
        parameters: {},
      },
    ],
    connections: [],
  };

  const result = validateGraph(graph, mockNodeSpecs);
  assert(result.valid === true, 'Single node graph should be valid');
}

// Test: Duplicate connection validation
export function testValidateNoDuplicateConnections(): void {
  const existingConnections = [
    {
      id: 'c1',
      sourceNodeId: 'n1',
      sourcePort: 'out',
      targetNodeId: 'n2',
      targetPort: 'in',
    },
  ];

  // Valid: different target port
  const validConn = {
    id: 'c2',
    sourceNodeId: 'n3',
    sourcePort: 'out',
    targetNodeId: 'n2',
    targetPort: 'other', // Different port
  };
  const result1 = validateNoDuplicateConnections(validConn, existingConnections);
  assert(result1.valid === true, 'Connection to different port should be valid');

  // Invalid: same target port
  const invalidConn = {
    id: 'c3',
    sourceNodeId: 'n3',
    sourcePort: 'out',
    targetNodeId: 'n2',
    targetPort: 'in', // Same port as existing
  };
  const result2 = validateNoDuplicateConnections(invalidConn, existingConnections);
  assert(result2.valid === false, 'Connection to same port should be invalid');
  assert(result2.error !== undefined, 'Should have error message');
}

// Run all tests (if executed directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = [
    testCreateEmptyGraph,
    testIdGeneration,
    testGetParameterValue,
    testCoerceParameterValue,
    testValidateValidGraph,
    testValidateMissingFields,
    testValidateDuplicateNodeIds,
    testValidateOrphanedConnection,
    testValidateInvalidParameter,
    testValidateParameterOutOfRange,
    testSerializeGraph,
    testDeserializeValidGraph,
    testDeserializeInvalidFormat,
    testDeserializeInvalidJSON,
    testFindNode,
    testFindConnection,
    testGetConnections,
    testValidateEmptyGraph,
    testValidateSingleNodeGraph,
    testValidateNoDuplicateConnections,
  ];

  console.log('Running data model tests...\n');
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      test();
      passed++;
      console.log(`✓ ${test.name}`);
    } catch (error) {
      failed++;
      console.error(`✗ ${test.name}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nTests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}
