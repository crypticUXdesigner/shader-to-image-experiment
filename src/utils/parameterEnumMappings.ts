/**
 * Central enum label mappings for int parameters that use the select (dropdown) UI.
 * Used by NodeBody (EnumSelector) and OverlayManager dropdown so the same labels appear.
 */

export function isEnumParameter(specId: string, paramName: string): boolean {
  return getParameterEnumMappings(specId, paramName) !== null;
}

export function getParameterEnumMappings(
  nodeId: string,
  paramName: string
): Record<number, string> | null {
  // compare node - operation
  if (nodeId === 'compare' && paramName === 'operation') {
    return {
      0: 'Equal (==)',
      1: 'Not Equal (!=)',
      2: 'Less Than (<)',
      3: 'Less or Equal (<=)',
      4: 'Greater Than (>)',
      5: 'Greater or Equal (>=)'
    };
  }

  // blend-mode node - mode
  if (nodeId === 'blend-mode' && paramName === 'mode') {
    return {
      0: 'Normal',
      1: 'Multiply',
      2: 'Screen',
      3: 'Overlay',
      4: 'Soft Light',
      5: 'Hard Light',
      6: 'Color Dodge',
      7: 'Color Burn',
      8: 'Linear Dodge',
      9: 'Linear Burn',
      10: 'Difference',
      11: 'Exclusion'
    };
  }

  // blend-color — same mode index semantics as blend-mode
  if (nodeId === 'blend-color' && paramName === 'mode') {
    return {
      0: 'Normal',
      1: 'Multiply',
      2: 'Screen',
      3: 'Overlay',
      4: 'Soft Light',
      5: 'Hard Light',
      6: 'Color Dodge',
      7: 'Color Burn',
      8: 'Linear Dodge',
      9: 'Linear Burn',
      10: 'Difference',
      11: 'Exclusion'
    };
  }

  // gradient-mask node - maskType
  if (nodeId === 'gradient-mask' && paramName === 'maskType') {
    return {
      0: 'Radial',
      1: 'Linear',
      2: 'Elliptical'
    };
  }

  // block-edge-brightness node - direction
  if (nodeId === 'block-edge-brightness' && paramName === 'direction') {
    return { 0: 'Horizontal', 1: 'Vertical' };
  }

  // block-color-glitch node - direction
  if (nodeId === 'block-color-glitch' && paramName === 'direction') {
    return { 0: 'Horizontal', 1: 'Vertical' };
  }

  // plane-grid node - planeType
  if (nodeId === 'plane-grid' && paramName === 'planeType') {
    return {
      0: 'Raymarched',
      1: 'Grid',
      2: 'Checkerboard'
    };
  }

  // box-torus-sdf node - primitiveType
  if (nodeId === 'box-torus-sdf' && paramName === 'primitiveType') {
    return {
      0: 'Box',
      1: 'Torus',
      2: 'Capsule',
      3: 'Cylinder',
      4: 'Cone',
      5: 'Round Cone',
      6: 'Octahedron',
      7: 'Icosahedron'
    };
  }

  // box-torus-sdf node - mode (directional vs point light)
  if (nodeId === 'box-torus-sdf' && paramName === 'mode') {
    return { 0: 'Directional', 1: 'Point' };
  }

  // voronoi-noise
  if (nodeId === 'voronoi-noise' && paramName === 'voronoiDistanceMetric') {
    return { 0: 'Euclidean', 1: 'Manhattan', 2: 'Chebyshev' };
  }
  if (nodeId === 'voronoi-noise' && paramName === 'voronoiAnimationMode') {
    return { 0: 'Drift', 1: 'Rotate', 2: 'Still' };
  }
  if (nodeId === 'voronoi-noise' && paramName === 'voronoiOutputMode') {
    return { 0: 'F1', 1: 'F2−F1', 2: 'Edge', 3: 'Cell ID' };
  }

  // gradient
  if (nodeId === 'gradient' && paramName === 'gradientType') {
    return { 0: 'Radial', 1: 'Linear' };
  }

  // shapes-2d
  if (nodeId === 'shapes-2d' && paramName === 'shapeType') {
    return {
      0: 'Circle / Ellipse',
      1: 'Square / Box (rounded)',
      2: 'Superellipse',
      3: 'Regular polygon',
      4: 'Capsule',
    };
  }

  // hex-voxel - shapeType
  if (nodeId === 'hex-voxel' && paramName === 'shapeType') {
    return { 0: 'Boxy', 1: 'Sphere minus box', 2: 'Heightmap' };
  }

  // worley-noise
  if (nodeId === 'worley-noise' && paramName === 'worleyDistanceMetric') {
    return { 0: 'Euclidean', 1: 'Manhattan', 2: 'Chebyshev' };
  }
  if (nodeId === 'worley-noise' && paramName === 'worleyOutputMode') {
    return { 0: 'F1', 1: 'F2−F1', 2: 'Edge' };
  }

  // reaction-diffusion
  if (nodeId === 'reaction-diffusion' && paramName === 'steps') {
    return { 1: '1 Step', 2: '2 Steps', 3: '3 Steps', 4: '4 Steps', 5: '5 Steps' };
  }

  // noise
  if (nodeId === 'noise' && paramName === 'noiseMode') {
    return { 0: 'Simplex 2D', 1: 'Simplex 3D', 2: 'Value fBm' };
  }

  // wave-patterns
  if (nodeId === 'wave-patterns' && paramName === 'waveType') {
    return { 0: 'Sine', 1: 'Cosine', 2: 'Square', 3: 'Triangle' };
  }

  // mixed-wave-signal (per-wave shape; same labels for w0Shape / w1Shape / w2Shape)
  if (
    nodeId === 'mixed-wave-signal' &&
    (paramName === 'w0Shape' || paramName === 'w1Shape' || paramName === 'w2Shape')
  ) {
    return {
      0: 'Sine',
      1: 'Cosine',
      2: 'Square',
      3: 'Triangle',
      4: 'Saw up',
      5: 'Saw down',
      6: 'Abs sine',
      7: 'Smooth square',
    };
  }

  // blur
  if (nodeId === 'blur' && paramName === 'blurType') {
    return { 0: 'Gaussian', 1: 'Directional', 2: 'Radial' };
  }

  // particle-system
  if (nodeId === 'particle-system' && paramName === 'particleCount') {
    return { 1: '1', 2: '2', 3: '3', 4: '4' };
  }

  // lighting-shading
  if (nodeId === 'lighting-shading' && paramName === 'lightType') {
    return { 0: 'Directional', 1: 'Point' };
  }

  // combine-vector (utility) - outputType 2=vec2, 3=vec3, 4=vec4
  if (nodeId === 'combine-vector' && paramName === 'outputType') {
    return { 2: 'vec2', 3: 'vec3', 4: 'vec4' };
  }

  // ripple
  if (nodeId === 'ripple' && paramName === 'rippleMode') {
    return { 0: 'Concentric', 1: 'Directional' };
  }

  // oscillator-2d - layerCombine (same merge rule on X and Y stacks)
  if (nodeId === 'oscillator-2d' && paramName === 'layerCombine') {
    return {
      0: 'Sum',
      1: 'Normalized',
      2: 'Product',
      3: 'Max |·|',
    };
  }

  // glass-shell - outer / inner SDF shapes
  if (nodeId === 'glass-shell' && paramName === 'outerShape') {
    return {
      0: 'Sphere',
      1: 'Box',
      2: 'Icosahedron',
    };
  }
  if (nodeId === 'glass-shell' && paramName === 'innerShape') {
    return {
      0: 'Sphere',
      1: 'Box',
      2: 'Sphere + box (smooth)',
    };
  }

  // triangle-grid
  if (nodeId === 'triangle-grid' && paramName === 'triProjection') {
    return { 0: 'Infinite plane', 1: 'UV' };
  }

  // radial-uv-warp
  if (nodeId === 'radial-uv-warp' && paramName === 'warpMode') {
    return {
      0: 'Bulge / pinch',
      1: 'Fisheye',
      2: 'Spherize',
    };
  }

  // displace
  if (nodeId === 'displace' && paramName === 'displaceMode') {
    return { 0: 'Vector offset', 1: 'Directional' };
  }

  // uv-band-shift
  if (nodeId === 'uv-band-shift' && paramName === 'uvBandShiftOrientation') {
    return { 0: 'Horizontal', 1: 'Vertical' };
  }

  // infinite-zoom
  if (nodeId === 'infinite-zoom' && paramName === 'infiniteZoomMotion') {
    return {
      0: 'Ping-pong loop',
      1: 'Snap zoom in',
      2: 'Snap zoom out',
    };
  }

  if (nodeId === 'arrangement-lanes') {
    if (paramName === 'uvInputMode') {
      return { 0: 'Normalized', 1: 'UV Coords' };
    }
    if (paramName === 'viewportMode') {
      return { 0: 'Follow', 1: 'Fixed' };
    }
  }

  if (nodeId === 'arrangement-notes') {
    if (paramName === 'trackLayout') {
      return { 0: 'Overlap', 1: 'Lanes' };
    }
    if (paramName === 'layoutOrientation') {
      return { 0: 'Horizontal', 1: 'Vertical' };
    }
    if (paramName === 'playheadShow') {
      return { 0: 'Off', 1: 'On' };
    }
    if (paramName === 'timelineAnchor') {
      return { 0: 'Center', 1: 'Start' };
    }
  }

  if (nodeId === 'arrangement-lanes' && paramName === 'colorSource') {
    return { 0: 'Palette', 1: 'DAW' };
  }

  return null;
}
