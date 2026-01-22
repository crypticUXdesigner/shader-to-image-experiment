# Data Model Module - Node-Based Shader System (v2.0)

This module implements the complete data model for the node-based shader system, including data structures, validation, serialization, and utility functions.

## Overview

The data model provides:

- **TypeScript Interfaces**: Core data structures (`NodeInstance`, `Connection`, `NodeGraph`)
- **Validation System**: Comprehensive validation for graphs, nodes, and connections
- **Serialization/Deserialization**: JSON serialization format (`.shadergraph` files)
- **Utility Functions**: ID generation, parameter value retrieval, graph helpers

## File Structure

```
src/data-model/
├── index.ts              # Main export file
├── types.ts              # TypeScript interfaces and types
├── validation.ts         # Validation functions
├── serialization.ts      # Serialization/deserialization
├── utils.ts              # Utility functions
├── data-model.test.ts    # Unit tests
└── README.md            # This file
```

## Usage

### Basic Usage

```typescript
import {
  createEmptyGraph,
  validateGraph,
  serializeGraph,
  deserializeGraph,
  generateNodeId,
  type NodeGraph,
} from './data-model';

// Create a new graph
const graph = createEmptyGraph('My Shader');

// Add nodes
const nodeId = generateNodeId();
graph.nodes.push({
  id: nodeId,
  type: 'fbm-noise',
  position: { x: 100, y: 100 },
  parameters: {
    scale: 2.0,
    octaves: 4,
  },
});

// Validate the graph
const nodeSpecs = [/* ... node specifications ... */];
const result = validateGraph(graph, nodeSpecs);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Serialize to JSON
const json = serializeGraph(graph);

// Deserialize from JSON
const deserialized = deserializeGraph(json, nodeSpecs);
if (deserialized.graph) {
  console.log('Graph loaded:', deserialized.graph.name);
}
```

### Type Definitions

#### NodeInstance

Represents a single node in the graph:

```typescript
interface NodeInstance {
  id: string;                    // Unique node ID
  type: string;                  // Node type ID (from Node Specification)
  position: { x: number; y: number };  // Position in canvas (pixels)
  parameters: Record<string, ParameterValue>;  // Parameter values
  label?: string;                // Optional custom label
  collapsed?: boolean;           // Whether node UI is collapsed
  color?: string;                // Optional node color (hex)
}
```

#### Connection

Represents a link between node outputs and inputs:

```typescript
interface Connection {
  id: string;                    // Unique connection ID
  sourceNodeId: string;          // Source node ID
  sourcePort: string;            // Source port name
  targetNodeId: string;          // Target node ID
  targetPort: string;            // Target port name
}
```

#### NodeGraph

The complete graph structure:

```typescript
interface NodeGraph {
  id: string;                    // Unique graph ID
  name: string;                  // Graph name
  version: string;               // Graph format version ("2.0")
  nodes: NodeInstance[];         // All nodes
  connections: Connection[];    // All connections
  metadata?: GraphMetadata;      // Optional metadata
  viewState?: GraphViewState;    // Optional UI state
}
```

### Validation

The validation system checks:

- **Graph-level**: Required fields, version, ID uniqueness
- **Node-level**: Node type validity, parameter types and ranges
- **Connection-level**: Node references, port existence, type compatibility

```typescript
import { validateGraph, type NodeSpecification } from './data-model';

const nodeSpecs: NodeSpecification[] = [
  {
    id: 'fbm-noise',
    inputs: [{ name: 'in', type: 'vec2' }],
    outputs: [{ name: 'out', type: 'float' }],
    parameters: {
      scale: { type: 'float', default: 2.0, min: 0.1, max: 10.0 },
    },
  },
];

const result = validateGraph(graph, nodeSpecs);
if (result.valid) {
  console.log('Graph is valid!');
} else {
  console.error('Errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}
```

### Serialization Format

Graphs are serialized to JSON with the following structure:

```json
{
  "format": "shader-composer-node-graph",
  "formatVersion": "2.0",
  "graph": {
    "id": "graph-001",
    "name": "My Shader",
    "version": "2.0",
    "nodes": [...],
    "connections": [...],
    "metadata": {...},
    "viewState": {...}
  }
}
```

### Utility Functions

#### ID Generation

```typescript
import { generateNodeId, generateConnectionId, generateGraphId } from './data-model';

const nodeId = generateNodeId();
const connId = generateConnectionId();
const graphId = generateGraphId();
```

#### Parameter Value Retrieval

```typescript
import { getParameterValue } from './data-model';

// Gets parameter value, using defaults from node specification
const value = getParameterValue(node, 'scale', nodeSpec);
```

#### Graph Helpers

```typescript
import {
  findNode,
  findConnection,
  getConnectionsFromNode,
  getConnectionsToNode,
} from './data-model';

const node = findNode(graph, 'node-id');
const connections = getConnectionsFromNode(graph, 'node-id');
```

## Testing

The module includes comprehensive unit tests in `data-model.test.ts`. To run tests:

1. Install a test framework (e.g., Vitest):
   ```bash
   npm install -D vitest
   ```

2. Add test script to `package.json`:
   ```json
   {
     "scripts": {
       "test": "vitest"
     }
   }
   ```

3. Run tests:
   ```bash
   npm test
   ```

## Implementation Notes

### Node Specification Interface

The validation system uses a minimal `NodeSpecification` interface that can be extended when the full Node Specification is implemented:

```typescript
interface NodeSpecification {
  id: string;
  inputs?: Array<{ name: string; type: string }>;
  outputs?: Array<{ name: string; type: string }>;
  parameters?: Record<string, {
    type: 'float' | 'int' | 'string' | 'vec4' | 'array';
    default?: ParameterValue;
    min?: number;
    max?: number;
    required?: boolean;
  }>;
}
```

### Parameter Value Types

Parameter values can be:
- `number` - For float/int parameters
- `string` - For string parameters (swizzle, etc.)
- `[number, number, number, number]` - For vec4 parameters (bezier curves)
- `number[]` - For array parameters (color stops)

### Error Handling

All validation functions return a `ValidationResult` with:
- `valid: boolean` - Whether validation passed
- `errors: string[]` - Critical errors that prevent graph compilation
- `warnings: string[]` - Non-critical issues (unknown parameters, etc.)

### Type Safety

The implementation uses strict TypeScript types throughout. All functions are type-safe and provide IntelliSense support.

## Compliance with Specification

This implementation follows the `DATA_MODEL_SPECIFICATION.md` exactly:

- ✅ All interfaces match the specification
- ✅ All validation rules implemented
- ✅ Serialization format matches specification
- ✅ Default value handling implemented
- ✅ ID generation and uniqueness validation
- ✅ Edge cases handled (empty graph, orphaned connections, etc.)

## Dependencies

- **None** - This module has no external dependencies
- Uses only TypeScript standard library

## Future Enhancements

- Binary serialization format for large graphs
- Graph diff/merge utilities
- Graph optimization helpers
- Migration utilities for version upgrades
