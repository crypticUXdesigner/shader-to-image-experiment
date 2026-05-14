/**
 * Audit: list node doc entries missing setupExampleGraph (or with empty nodes).
 * Run: node scripts/audit-setup-examples.mjs
 * Used when auditing setup examples (see docs/implementation/ if a task spec exists).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const docPath = path.join(root, 'src/data/node-documentation.json');
const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));
const helpItems = doc.helpItems || {};

const nodeKeys = Object.keys(helpItems).filter((k) => k.startsWith('node:'));
const missing = nodeKeys.filter((k) => {
  const entry = helpItems[k];
  const graph = entry.setupExampleGraph;
  return (
    !graph ||
    !Array.isArray(graph.nodes) ||
    graph.nodes.length === 0
  );
});

const missingIds = missing.map((k) => k.replace(/^node:/, '')).sort();

// Category order from src/shaders/nodes/index.ts (spec order)
const CATEGORIES = [
  ['input', ['uv-coordinates', 'time', 'resolution', 'fragment-coordinates', 'constant-float', 'constant-vec2', 'constant-vec3', 'constant-vec4', 'orbit-camera', 'look-at-camera', 'oklch-color', 'bezier-curve']],
  ['transform', ['translate', 'rotate', 'scale']],
  ['distort/pattern', ['polar-coordinates', 'vector-field', 'turbulence', 'kaleidoscope', 'radial-uv-warp', 'ripple', 'mirror-flip', 'displace', 'rain-drops', 'vortex', 'quad-warp', 'directional-displace', 'brick-tiling', 'infinite-zoom', 'kaleidoscope-smooth']],
  ['pattern/noise', ['noise', 'warp-terrain', 'voronoi-noise', 'cubic-curl-noise', 'rings', 'gradient', 'radial-rays', 'crepuscular-rays', 'volume-rays', 'streak', 'flow-field-pattern', 'hexagonal-grid', 'stripes', 'dots', 'disco-pattern', 'triangle-grid', 'particle-system']],
  ['shape/geometry', ['sphere-raymarch', 'spherical-fibonacci', 'bloom-sphere', 'box-torus-sdf', 'glass-shell', 'hex-prism-sdf', 'radial-repeat-sdf', 'repeated-hex-prism-sdf', 'kifs-sdf', 'ether-sdf', 'displacement-3d', 'generic-raymarcher', 'iridescent-tunnel', 'inflated-icosahedron', 'shapes-2d', 'star-shape-2d', 'metaballs', 'star-2d', 'superellipse', 'fractal', 'iterated-inversion', 'plane-grid', 'sky-dome', 'bokeh-point', 'drive-home-lights']],
  ['math', ['add', 'subtract', 'multiply', 'divide', 'power', 'square-root', 'absolute', 'floor', 'ceil', 'fract', 'modulo', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'sine', 'cosine', 'tangent', 'arc-sine', 'arc-cosine', 'arc-tangent', 'arc-tangent-2', 'exponential', 'natural-logarithm', 'length', 'distance', 'dot-product', 'cross-product', 'normalize', 'reflect', 'refract']],
  ['blending', ['blend-mode']],
  ['masking', ['compare', 'select', 'mask-composite-float', 'mask-composite-vec3']],
  ['post-process/color', ['blur', 'glow-bloom', 'edge-detection', 'chromatic-aberration', 'rgb-separation', 'scanlines', 'color-grading', 'normal-mapping', 'lighting-shading']],
  ['utility', ['hash32', 'one-minus', 'negate', 'reciprocal', 'clamp-01', 'saturate', 'sign', 'round', 'truncate', 'lerp', 'swizzle', 'split-vector', 'combine-vector']],
  ['color-system', ['oklch-color-map-bezier', 'oklch-color-map-threshold', 'bayer-dither', 'tone-mapping']],
  ['output', ['final-output']],
];

const idToCategory = new Map();
for (const [cat, ids] of CATEGORIES) {
  for (const id of ids) idToCategory.set(id, cat);
}

const byCategory = {};
for (const id of missingIds) {
  const cat = idToCategory.get(id) || 'legacy/unknown';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(id);
}

console.log('Node doc entries missing setupExampleGraph (or empty nodes):', missingIds.length);
console.log('');
console.log('By category:');
for (const [cat, ids] of Object.entries(byCategory).sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(`  ${cat}: ${ids.length} — ${ids.join(', ')}`);
}
console.log('');
console.log('All missing ids (one per line):');
missingIds.forEach((id) => console.log(id));
