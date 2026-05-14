# Node port labels (reference + audit tables)

**Authoritative rules:** **`.cursor/rules/shaders/node-standards.mdc`** — checklist item **7** and subsection **Port label rules (agreed conventions)**. Follow that when adding or changing `NodeSpec` ports.

**Mechanics:** `PortSpec.name` is stable for GLSL and connections. Optional **`label`** is display-only. UI: `port.label ?? port.name` (`NodeHeader.svelte`). **Inputs** category single-output redundancy: omit **`label`** when `isRedundantOutputLabel` applies (`src/utils/nodeSpecUtils.ts`) so the canvas chip stays clean without duplicating **`displayName`**.

**Summary (keep in sync with `node-standards.mdc`):**

- **Casing:** Sentence case for multi-word labels; keep allowed tokens as-is (`UV`, `SDF`, `OKLCH`, `Vec2`, `=`, `A`, `B`, …).
- **Math / mix-style:** Symbolic **`A`**, **`B`**, output **`=`**. For **`mix()`**-like nodes (`mix`, `lerp`): weight port **`t` → `Mix`**.
- **Vec2 `in`:** Choose by **intent** — **`UV`** (sampling / warp domain), **`Position`** (planar geometric, not “UV chain”), **`Screen position`** (camera / fullscreen plane), **`Frag coords`** (pixel / `gl_FragCoord`-style). Prefer meaning over blind uniformity.
- **Scalar outputs:** Prefer a **semantic** label when clear (`Noise`, `Rays`, …); else **`Value`**.
- **Color pipes:** Default **`Color`** on **in**; **out** may rename when meaning shifts (e.g. **`Edges`**).
- **Branching:** Prose (**Condition**, **If true**, **If false**) — not symbolic like math.
- **Constants (`constant-*`):** Output label matches **panel primary concept** (`Value` ↔ float `value`; vec2–4 with component-only controls → **`Vec2`** / **`Vec3`** / **`Vec4`** per arity, not generic **`UV`**/**`Color`** unless color controls say so).

The sections below are a **node-by-node audit workbook**. **Suggested label** rows may lag the rule file; resolve conflicts in favor of **`node-standards.mdc`**.

---

## 1. Input nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| uv-coordinates | out | vec2 | — | **UV** |
| time | out | float | — | **Time** |
| resolution | out | vec2 | — | **Resolution** |
| fragment-coordinates | out | vec2 | — | **Frag coords** |
| constant-float | out | float | — | **Value** (matches param **`value`**) |
| constant-vec2 | out | vec2 | UV | **Vec2** — omit **`label`** if redundant chip policy applies |
| constant-vec3 | out | vec3 | — | Omit **`label`** (redundant with node + special-case in `isRedundantOutputLabel`) |
| constant-vec4 | out | vec4 | — | Omit **`label`** (same) |
| orbit-camera | in | vec2 | Screen position | **Screen position** (keep) |
| orbit-camera | ro | vec3 | — | **Ray origin** |
| orbit-camera | rd | vec3 | — | **Ray direction** |
| look-at-camera | in | vec2 | — | **Screen position** |
| look-at-camera | ro | vec3 | — | **Ray origin** |
| look-at-camera | rd | vec3 | — | **Ray direction** |

---

## 2. Transform nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| translate | in | vec2 | — | **UV** |
| translate | out | vec2 | — | **UV** |
| rotate | in | vec2 | — | **UV** |
| rotate | out | vec2 | — | **UV** |
| scale | in | vec2 | — | **UV** |
| scale | out | vec2 | — | **UV** |

---

## 3. Distort / transform (polar, vector field, warp, etc.)

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| polar-coordinates | in | vec2 | — | **UV** |
| polar-coordinates | out | vec2 | — | **Polar UV** |
| vector-field | in | vec2 | — | **UV** |
| vector-field | out | vec2 | — | **Displaced UV** |
| turbulence | in | vec2 | — | **UV** |
| turbulence | out | vec2 | — | **Displaced UV** |
| kaleidoscope | in | vec2 | — | **Position** |
| kaleidoscope | out | vec2 | — | **UV** |
| bulge-pinch | in | vec2 | — | **UV** |
| bulge-pinch | out | vec2 | — | **UV** |
| ripple | in | vec2 | — | **UV** |
| ripple | out | vec2 | — | **UV** |
| fisheye | in | vec2 | — | **UV** |
| fisheye | out | vec2 | — | **UV** |
| mirror-flip | in | vec2 | — | **Position** |
| mirror-flip | out | vec2 | — | **UV** |
| displace | in | vec2 | — | **UV** |
| displace | out | vec2 | — | **UV** |
| vortex | in | vec2 | — | **UV** |
| vortex | out | vec2 | — | **UV** |
| spherize | in | vec2 | — | **UV** |
| spherize | out | vec2 | — | **UV** |
| quad-warp | in | vec2 | — | **UV** |
| quad-warp | out | vec2 | — | **UV** |
| brick-tiling | in | vec2 | — | **UV** |
| brick-tiling | out | vec2 | — | **UV** |
| infinite-zoom | in | vec2 | — | **UV** |
| infinite-zoom | out | vec2 | — | **UV** |
| fractal | in | vec2 | — | **UV** |
| fractal | out | vec2 | — | **UV** |

---

## 4. Pattern / noise nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| noise | in | vec2 | — | **UV** |
| noise | out | float | — | **Noise** |
| warp-terrain | in | vec2 | — | **UV** |
| warp-terrain | out | vec4 | — | **Color** |
| voronoi-noise | in | vec2 | — | **UV** |
| voronoi-noise | out | float | — | **Value** |
| cubic-curl-noise | in | vec2 | — | **UV** |
| cubic-curl-noise | out | vec3 | — | **Noise** |
| worley-noise | in | vec2 | — | **UV** |
| worley-noise | out | float | — | **Noise** |
| rings | in | vec2 | — | **Position** |
| rings | out | float | — | **Value** |
| gradient | in | vec2 | — | **Position** |
| gradient | out | float | — | **Value** |
| radial-rays | in | vec2 | — | **Position** |
| radial-rays | out | float | — | **Rays** |
| crepuscular-rays | in | vec2 | — | **UV** |
| crepuscular-rays | out | float | — | **Rays** |
| volume-rays | in | vec2 | — | **UV** |
| volume-rays | out | vec4 | — | **Color** |
| streak | in | vec2 | — | **UV** |
| streak | out | float | — | **Value** |
| flow-field-pattern | in | vec2 | — | **UV** |
| flow-field-pattern | out | float | — | **Value** |
| hexagonal-grid | in | vec2 | — | **UV** |
| hexagonal-grid | out | float | — | **Value** |
| stripes | in | vec2 | — | **UV** |
| stripes | in | float | — | **Time** |
| stripes | out | float | — | **Value** |
| dots | in | vec2 | — | **UV** |
| dots | out | float | — | **Value** |
| disco-pattern | in | vec2 | — | **UV** |
| disco-pattern | out | vec4 | — | **Color** |
| reaction-diffusion | in | vec2 | — | **UV** |
| reaction-diffusion | out | vec3 | — | **Color** |
| triangle-grid | in | vec2 | — | **Position** |
| triangle-grid | out | float | — | **Value** |
| particle-system | in | vec2 | — | **UV** |
| particle-system | out | float | — | **Particles** |
| rain-drops | in | vec2 | UV | **UV** (keep) |
| rain-drops | out | vec2 | — | **UV** |
| hash32 | in | vec2 | — | **Seed** |
| hash32 | out | vec3 | — | **Color** |

---

## 5. Shape / geometry / SDF / raymarch nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| sphere-raymarch | in | vec2 | — | **UV** |
| sphere-raymarch | out | float | — | **Glow** |
| sphere-raymarch | color | vec3 | Color | **Color** (keep) |
| spherical-fibonacci | (outputs only) | — | — | — |
| spherical-fibonacci | index | float | Index | **Index** (keep) |
| spherical-fibonacci | direction | vec3 | Direction | **Direction** (keep) |
| spherical-fibonacci | nearestPoint | vec3 | Nearest | **Nearest** (keep) |
| bloom-sphere | in | vec2 | — | **UV** |
| bloom-sphere | out | float | — | **Value** |
| box-torus-sdf | in | vec2 | — | **UV** |
| box-torus-sdf | out | float | — | **Shading** |
| glass-shell | in | vec2 | — | **UV** |
| glass-shell | out | vec4 | Color | **Color** (keep) |
| hex-prism-sdf | (see node) | — | — | (position, etc. already labeled where used) |
| radial-repeat-sdf | position | vec3 | Position | **Position** (keep) |
| radial-repeat-sdf | out | float | — | **SDF** |
| repeated-hex-prism-sdf | position | vec3 | Position | **Position** (keep) |
| repeated-hex-prism-sdf | out | float | — | **SDF** |
| kifs-sdf | position | vec3 | Position | **Position** (keep) |
| kifs-sdf | out | float | — | **SDF** |
| ether-sdf | position | vec3 | Position | **Position** (keep) |
| ether-sdf | out | float | — | **SDF** |
| displacement-3d | (see node) | — | — | (inputs/outputs as in spec) |
| generic-raymarcher | in | vec2 | — | **UV** |
| generic-raymarcher | sdf | float | SDF | **SDF** (keep) |
| generic-raymarcher | displacement | vec3 | Displacement | **Displacement** (keep) |
| generic-raymarcher | ro | vec3 | Ray origin | **Ray origin** (keep) |
| generic-raymarcher | rd | vec3 | Ray direction | **Ray direction** (keep) |
| generic-raymarcher | out | float | — | **Glow** |
| generic-raymarcher | color | vec3 | Color | **Color** (keep) |
| iridescent-tunnel | in | vec2 | UV | **UV** (keep) |
| iridescent-tunnel | out | vec4 | Color | **Color** (keep) |
| inflated-icosahedron | in | vec2 | Screen position | **Screen position** (keep) |
| inflated-icosahedron | out | vec3 | Color | **Color** (keep) |
| shapes-2d | in | vec2 | — | **Position** |
| shapes-2d | out | float | — | **Value** |
| star-shape-2d | in | vec2 | — | **Position** |
| star-shape-2d | out | float | — | **Value** |
| metaballs | in | vec2 | — | **UV** |
| metaballs | out | float | — | **Glow** |
| star-2d | in | vec2 | — | **Position** |
| star-2d | out | float | — | **Value** |
| plane-grid | in | vec2 | — | **UV** |
| plane-grid | out | float | — | **Grid** |
| sky-dome | in | vec2 | — | **UV** |
| sky-dome | out | vec3 | — | **Color** |
| bokeh-point | ro | vec3 | Ray origin | **Ray origin** (keep) |
| bokeh-point | rd | vec3 | Ray direction | **Ray direction** (keep) |
| bokeh-point | point | vec3 | Light position | **Light position** (keep) |
| bokeh-point | out | float | — | **Intensity** |
| drive-home-lights | ro | vec3 | Ray origin | **Ray origin** (keep) |
| drive-home-lights | rd | vec3 | Ray direction | **Ray direction** (keep) |
| drive-home-lights | out | vec3 | — | **Color** |
| iterated-inversion | in | vec2 | — | **UV** |
| iterated-inversion | out | vec3 | — | **Color** |

---

## 6. Math nodes (primitives, trig, vector ops)

### 6.1 Math primitives (add, subtract, multiply, divide, power, sqrt, abs, floor, ceil, fract, modulo, min, max, clamp, mix, step, smoothstep)

Binary float ops use symbolic **`A`**, **`B`** and output **`=`**. Named ports use short prose (sentence case where multi-word).

| Port | Type | Label |
|------|------|--------|
| a | float | **A** |
| b | float | **B** |
| base | float | **Base** |
| exponent | float | **Exponent** |
| in | float | **Value** (unary) |
| min | float | **Minimum** |
| max | float | **Maximum** |
| edge | float | **Threshold** |
| edge0 | float | **Lower edge** |
| edge1 | float | **Upper edge** |
| x | float | **Value** |
| t | float | **Mix** (`mix` node only — weight) |
| out | float | **=** |

### 6.2 Math trig/exp (sin, cos, tan, asin, acos, atan, atan2, exp, log)

| Port | Type | Label |
|------|------|--------|
| in | float | **Angle** (trig) or **Value** (exp/log) |
| y | float | **Y** (atan2) |
| x | float | **X** (atan2) |
| out | float | **=** |

### 6.3 Math vector ops (length, distance, dot, cross, normalize, reflect, refract)

| Port | Type | Label |
|------|------|--------|
| in | vec2 | **Vector** |
| a | vec2/vec3 | **A** |
| b | vec2/vec3 | **B** |
| I | vec2 | **Incident** |
| N | vec2 | **Normal** |
| eta | float | **Ratio** |
| out | float/vec2/vec3 | **=** (length node: still **`=`** in spec) |

---

## 7. Blending and masking nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| blend-mode | base | float | — | **Background** |
| blend-mode | blend | float | — | **Blend** |
| blend-mode | out | float | — | **Result** |
| compare | a | float | A | **A** |
| compare | b | float | B | **B** |
| compare | out | float | Result | **Result** (keep) |
| select | condition | float | Condition | **Condition** (keep) |
| select | trueValue | any | If true | **If true** (keep) |
| select | falseValue | any | If false | **If false** (keep) |
| select | out | any | Result | **Result** (keep) |
| mask-composite-float | bg | float | Background | **Background** (keep) |
| mask-composite-float | mask | float | Mask | **Mask** (keep) |
| mask-composite-float | fg | float | Foreground | **Foreground** (keep) |
| mask-composite-float | out | float | — | **Result** |
| mask-composite-vec3 | bg | vec3 | Background | **Background** (keep) |
| mask-composite-vec3 | mask | float | — | **Mask** |
| mask-composite-vec3 | fg | vec3 | Foreground | **Foreground** (keep) |
| mask-composite-vec3 | out | vec3 | — | **Color** |

---

## 8. Post-processing nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| blur | in | vec4 | — | **Color** |
| blur | out | vec4 | — | **Color** |
| glow-bloom | in | vec4 | — | **Color** |
| glow-bloom | out | vec4 | — | **Color** |
| edge-detection | in | vec4 | — | **Color** |
| edge-detection | out | vec4 | — | **Edges** |
| chromatic-aberration | in | vec4 | — | **Color** |
| chromatic-aberration | out | vec4 | — | **Color** |
| rgb-separation | in | vec4 | — | **Color** |
| rgb-separation | out | vec4 | — | **Color** |
| scanlines | in | vec4 | — | **Color** |
| scanlines | out | vec4 | — | **Color** |
| color-grading | in | vec4 | — | **Color** |
| color-grading | out | vec4 | — | **Color** |
| normal-mapping | in | vec4 | — | **Height** |
| normal-mapping | out | float | — | **Value** |
| lighting-shading | in | vec4 | — | **Luminance** |
| lighting-shading | out | float | — | **Shading** |
---

## 9. Color system nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| oklch-color-map-bezier | in | float | — | **Value** |
| oklch-color-map-bezier | startColor | vec3 | — | **Start color** |
| oklch-color-map-bezier | endColor | vec3 | — | **End color** |
| oklch-color-map-bezier | lCurve | vec4 | — | **L curve** |
| oklch-color-map-bezier | cCurve | vec4 | — | **C curve** |
| oklch-color-map-bezier | hCurve | vec4 | — | **H curve** |
| oklch-color-map-bezier | out | vec3 | — | **Color** |
| oklch-color-map-threshold | in | float | — | **Value** |
| oklch-color-map-threshold | startColor | vec3 | — | **Start color** |
| oklch-color-map-threshold | endColor | vec3 | — | **End color** |
| oklch-color-map-threshold | lCurve | vec4 | — | **L curve** |
| oklch-color-map-threshold | cCurve | vec4 | — | **C curve** |
| oklch-color-map-threshold | hCurve | vec4 | — | **H curve** |
| oklch-color-map-threshold | fragCoord | vec2 | — | **Frag coords** |
| oklch-color-map-threshold | resolution | vec2 | — | **Resolution** |
| oklch-color-map-threshold | out | vec3 | — | **Color** |
| tone-mapping (color-system-effects) | in | vec3 | — | **Color** |
| tone-mapping | out | vec3 | — | **Color** |
| oklch-color (color-system-primitives) | out | vec3 | — | **Color** |
| bezier-curve (color-system-primitives) | out | vec4 | — | **Color** |
| bayer-dither (color-system-primitives) | in | float | — | **Value** |
| bayer-dither | fragCoord | vec2 | — | **Frag coords** |
| bayer-dither | resolution | vec2 | — | **Resolution** |
| bayer-dither | out | float | — | **Value** |

---

## 10. Utility nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| one-minus | in | float | — | **Value** |
| one-minus | out | float | — | **Result** |
| negate | in | float | — | **Value** |
| negate | out | float | — | **Result** |
| reciprocal | in | float | — | **Value** |
| reciprocal | out | float | — | **Result** |
| clamp-01 | in | float | — | **Value** |
| clamp-01 | out | float | — | **Result** |
| saturate | in | float | — | **Value** |
| saturate | out | float | — | **Result** |
| sign | in | float | — | **Value** |
| sign | out | float | — | **Result** |
| round | in | float | — | **Value** |
| round | out | float | — | **Result** |
| truncate | in | float | — | **Value** |
| truncate | out | float | — | **Result** |
| lerp | a | float | — | **A** |
| lerp | b | float | — | **B** |
| lerp | t | float | — | **Mix** |
| lerp | out | float | — | **=** |
| swizzle | in | vec4 | — | **Vector** |
| swizzle | out | vec4 | — | **Result** |
| split-vector | in | vec4 | — | **Vector** |
| split-vector | x | float | — | **X** |
| split-vector | y | float | — | **Y** |
| split-vector | z | float | — | **Z** |
| split-vector | w | float | — | **W** |
| combine-vector | x | float | — | **X** |
| combine-vector | y | float | — | **Y** |
| combine-vector | z | float | — | **Z** |
| combine-vector | w | float | — | **W** |
| combine-vector | out | vec4 | — | **Vector** |

---

## 11. Operation / output nodes

| Node ID | Port | Type | Current label | Suggested label |
|---------|------|------|---------------|-----------------|
| color-map | in | float | — | **Value** |
| color-map | out | vec3 | — | **Color** |
| final-output | in | vec3 | — | **Color** |

---

## 12. Quick reference: code `name` → display `label`

Use when a port is not spelled out in the tables above; **defer to `.cursor/rules/shaders/node-standards.mdc`** if this list disagrees.

| Port name (code) | Display label |
|------------------|---------------|
| in (vec2) | **UV**, **Position**, **Screen position**, or **Frag coords** by intent |
| in (float) | **Value**, **Angle** (trig), or domain-specific prose |
| in (vec3/vec4) | **Color** default; semantic overrides where needed |
| out | Semantic when useful (**Noise**, **Rays**, **Glow**, …); **Value**, **Color**, **UV** otherwise; math → **=** |
| a, b (math / vector ops) | **A**, **B** |
| t (`mix`, `lerp`) | **Mix** |
| min, max | **Minimum**, **Maximum** |
| base, exponent | **Base**, **Exponent** |
| edge, edge0, edge1 | **Threshold**, **Lower edge**, **Upper edge** |
| x, y, z, w | **X**, **Y**, **Z**, **W** (components) vs **Value** (unary scalar `x` on some nodes) |
| ro, rd | **Ray origin**, **Ray direction** |
| position | **Position** |
| sdf | **SDF** |
| displacement | **Displacement** |
| condition | **Condition** |
| trueValue, falseValue | **If true**, **If false** |
| bg, fg | **Background**, **Foreground** |
| mask | **Mask** |
| blend | **Blend** |
| fragCoord | **Frag coords** |
| resolution | **Resolution** |
| startColor, endColor | **Start color**, **End color** |
| lCurve, cCurve, hCurve | **L curve**, **C curve**, **H curve** |
| I, N | **Incident**, **Normal** |
| eta | **Ratio** |
| point | **Point** |

---

## 13. Maintenance

1. Prefer **`node-standards.mdc`** when rules evolve; mirror a short summary at the top of **this** file.
2. When bulk-updating nodes, add `label` on each port per rules; **omit** `label` on redundant **Inputs** outputs per **G2** policy.
3. `npm run check` / smoke-test — `name` stays stable; only display changes.
