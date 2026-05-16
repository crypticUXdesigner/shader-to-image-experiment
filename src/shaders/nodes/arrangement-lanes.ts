import type { NodeSpec } from '../../types/nodeSpec';
import { MAX_ARRANGEMENT_REGIONS } from '../../audiotool/arrangement/types';

/**
 * Pillar 1: DAW region lanes baked from `audioSetup.arrangementSnapshot` at compile time.
 * Placeholder `{{ARRANGEMENT_BAKE}}` is replaced per node instance in FunctionGenerator.
 */
export const arrangementLanesNodeSpec: NodeSpec = {
  id: 'arrangement-lanes',
  category: 'Patterns',
  displayName: 'Arrangement Lanes',
  description:
    'Draws DAW region blocks per track row, windowed against timeline time. Requires an imported arrangement snapshot on the playlist primary.',
  icon: 'rows',
  inputs: [
    {
      name: 'in',
      type: 'vec2',
      label: 'UV',
    },
    {
      name: 'time',
      type: 'float',
      label: 'Time',
      fallbackExpression: 'uTimelineTime',
    },
  ],
  outputs: [
    {
      name: 'out',
      type: 'vec4',
      label: 'Color',
    },
  ],
  parameters: {
    uvInputMode: {
      type: 'int',
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      label: 'UV in',
    },
    viewportMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Viewport',
    },
    windowSeconds: {
      type: 'float',
      default: 32.0,
      min: 1.0,
      max: 600.0,
      step: 0.5,
      label: 'Window',
    },
    fixedStartSeconds: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 3600.0,
      step: 0.1,
      label: 'Fixed start',
    },
    trackFilterMode: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Tracks',
    },
    trackFilterList: {
      type: 'string',
      default: '',
      label: 'Track ids',
    },
    colorSource: {
      type: 'int',
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      label: 'Colors',
    },
    laneHeight: {
      type: 'float',
      default: 0.75,
      min: 0.1,
      max: 1.0,
      step: 0.01,
      label: 'Lane height',
    },
    laneSpacing: {
      type: 'float',
      default: 0.04,
      min: 0.0,
      max: 0.4,
      step: 0.01,
      label: 'Gap',
    },
    edgeFade: {
      type: 'float',
      default: 0.08,
      min: 0.0,
      max: 0.5,
      step: 0.01,
      label: 'Edge fade',
    },
    opacity: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity',
    },
    backgroundR: {
      type: 'float',
      default: 0.04,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Bg R',
    },
    backgroundG: {
      type: 'float',
      default: 0.05,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Bg G',
    },
    backgroundB: {
      type: 'float',
      default: 0.08,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Bg B',
    },
  },
  parameterGroups: [
    {
      id: 'arr-lanes-view',
      label: 'View',
      parameters: ['uvInputMode', 'viewportMode', 'windowSeconds', 'fixedStartSeconds'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-lanes-tracks',
      label: 'Tracks',
      parameters: [],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-lanes-style',
      label: 'Style',
      parameters: ['colorSource', 'laneHeight', 'laneSpacing', 'edgeFade', 'opacity'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-lanes-bg',
      label: 'Background',
      parameters: ['backgroundR', 'backgroundG', 'backgroundB'],
      collapsible: true,
      defaultCollapsed: true,
    },
  ],
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        label: 'View',
        parameters: ['uvInputMode', 'viewportMode', 'windowSeconds', 'fixedStartSeconds'],
        layout: { columns: 'auto' },
      },
      {
        type: 'arrangement-track-filter',
        label: 'Tracks',
        hideEmpty: true,
      },
      {
        type: 'grid',
        label: 'Style',
        parameters: ['colorSource', 'laneHeight', 'laneSpacing', 'edgeFade', 'opacity'],
        layout: { columns: 'auto' },
      },
      {
        type: 'grid',
        label: 'Background',
        parameters: ['backgroundR', 'backgroundG', 'backgroundB'],
        layout: { columns: 'auto' },
      },
    ],
    parametersWithoutPorts: [
      'trackFilterMode',
      'trackFilterList',
      'backgroundR',
      'backgroundG',
      'backgroundB',
    ],
    minColumns: 3,
  },
  functions: `
{{ARRANGEMENT_BAKE}}

vec3 arrangementLanesPaletteColor(float colorIndex, float trackRow, int colorSource) {
  if (colorSource == 1) {
    float hue = fract(colorIndex * 0.0625 + 0.02);
  return vec3(
      0.55 + 0.45 * cos(6.28318 * (hue + 0.0)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.33)),
      0.55 + 0.45 * cos(6.28318 * (hue + 0.66))
    );
  }
  float hue = fract(trackRow * 0.17 + 0.41);
  return vec3(
    0.5 + 0.5 * cos(6.28318 * (hue + 0.0)),
    0.5 + 0.5 * cos(6.28318 * (hue + 0.33)),
    0.5 + 0.5 * cos(6.28318 * (hue + 0.66))
  );
}

float arrangementLanesEdgeFade(vec2 uv, float fadeAmount) {
  if (fadeAmount <= 0.0001) return 1.0;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, fadeAmount, edge);
}

float arrangementLanesPlayheadX(float timelineTime, int viewportMode, float windowSeconds, float fixedStart) {
  if (viewportMode == 0) return 0.5;
  return clamp((timelineTime - fixedStart) / max(windowSeconds, 0.0001), 0.0, 1.0);
}

bool arrangementLanesPlayheadVisible(float timelineTime, int viewportMode, float windowSeconds, float fixedStart) {
  if (viewportMode == 0) return true;
  float windowEnd = fixedStart + max(windowSeconds, 0.0001);
  return timelineTime >= fixedStart && timelineTime <= windowEnd;
}

float arrangementLanesPlayheadLine(vec2 uv, float playheadX) {
  float dist = abs(uv.x - playheadX);
  float lineWidth = max(fwidth(uv.x), 0.001) * 1.25;
  return 1.0 - smoothstep(lineWidth * 0.5, lineWidth, dist);
}

/** Map UV Coords node output (aspect-corrected p) to 0–1 lane UV; passthrough when uvInputMode == 0. */
vec2 arrangementLanesScreenUv(vec2 inUv, int uvInputMode) {
  if (uvInputMode == 0) return inUv;
  float aspect = uResolution.x / uResolution.y;
  return vec2(inUv.x / (2.0 * aspect) + 0.5, inUv.y * 0.5 + 0.5);
}

vec4 evalArrangementLanes(
  vec2 uv,
  float timelineTime,
  int viewportMode,
  float windowSeconds,
  float fixedStart,
  int colorSource,
  float laneHeight,
  float laneSpacing,
  float edgeFade,
  float opacity,
  vec3 backgroundRgb
) {
  float windowStart = (viewportMode == 0) ? (timelineTime - windowSeconds * 0.5) : fixedStart;
  float timeAtX = windowStart + clamp(uv.x, 0.0, 1.0) * max(windowSeconds, 0.0001);
  float tracks = max(ARR_LANE_TRACKS_{{NODE_SUFFIX}}, 1.0);
  float rowStep = (1.0 - laneSpacing) / tracks;
  float halfLane = laneHeight * rowStep * 0.5;
  vec3 color = backgroundRgb;
  float alpha = 0.0;

  for (int i = 0; i < ${MAX_ARRANGEMENT_REGIONS}; i++) {
    if (i >= ARR_LANE_COUNT_{{NODE_SUFFIX}}) break;
    vec4 reg = ARR_LANE_REGIONS_{{NODE_SUFFIX}}[i];
    float rowCenter = 1.0 - reg.z;
    float rowDist = abs(uv.y - rowCenter);
    if (rowDist > halfLane) continue;
    if (timeAtX < reg.x || timeAtX > reg.y) continue;
    float rowFade = 1.0 - smoothstep(halfLane * 0.65, halfLane, rowDist);
    vec3 regionRgb = arrangementLanesPaletteColor(reg.w, reg.z, colorSource);
    color = mix(color, regionRgb, rowFade);
    alpha = max(alpha, rowFade);
  }

  float playheadX = arrangementLanesPlayheadX(timelineTime, viewportMode, windowSeconds, fixedStart);
  if (arrangementLanesPlayheadVisible(timelineTime, viewportMode, windowSeconds, fixedStart)) {
    float playheadLine = arrangementLanesPlayheadLine(uv, playheadX);
    if (playheadLine > 0.0) {
      vec3 playheadRgb = vec3(0.72, 0.92, 0.88);
      color = mix(color, playheadRgb, playheadLine);
      alpha = max(alpha, playheadLine);
    }
  }

  float edge = arrangementLanesEdgeFade(uv, edgeFade);
  return vec4(color, alpha * opacity * edge);
}
`,
  mainCode: `
  vec2 laneUv = arrangementLanesScreenUv($input.in, int($param.uvInputMode));
  float timelineTime = $input.time;
  vec4 lanes = evalArrangementLanes(
    laneUv,
    timelineTime,
    int($param.viewportMode),
    $param.windowSeconds,
    $param.fixedStartSeconds,
    int($param.colorSource),
    $param.laneHeight,
    $param.laneSpacing,
    $param.edgeFade,
    $param.opacity,
    vec3($param.backgroundR, $param.backgroundG, $param.backgroundB)
  );
  $output.out = lanes;
`,
};
