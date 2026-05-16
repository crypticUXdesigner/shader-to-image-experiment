import type { NodeSpec } from '../../types/nodeSpec';
import { MAX_ARRANGEMENT_NOTES_PACKED } from '../../audiotool/arrangement/types';

/**
 * Pillar 2: MIDI notes baked from `audioSetup.arrangementSnapshot` at compile time.
 * Placeholders `{{ARRANGEMENT_NOTES_BAKE}}`, `{{ARR_NOTES_EVAL_STRUCT}}` are replaced per node instance.
 */
export const arrangementNotesNodeSpec: NodeSpec = {
  id: 'arrangement-notes',
  category: 'Patterns',
  displayName: 'Arrangement Notes',
  description:
    'Draws MIDI notes by pitch and time (always follows the wired timeline). Requires an imported arrangement snapshot on the playlist primary.',
  icon: 'music-note-simple',
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
    {
      name: 'mask',
      type: 'float',
      label: 'Mask',
    },
  ],
  parameters: {
    windowSeconds: {
      type: 'float',
      default: 32.0,
      min: 1.0,
      max: 600.0,
      step: 0.5,
      label: 'Window',
    },
    timelineAnchor: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Anchor',
    },
    trackLayout: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Layout',
    },
    layoutOrientation: {
      type: 'int',
      default: 0,
      min: 0,
      max: 1,
      step: 1,
      label: 'Orient',
    },
    pitchPadding: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 0.49,
      step: 0.005,
      label: 'Pitch pad',
    },
    rowGap: {
      type: 'float',
      default: 0.0,
      min: 0.0,
      max: 0.25,
      step: 0.001,
      label: 'Row gap',
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
    noteSize: {
      type: 'float',
      default: 0.04,
      min: 0.005,
      max: 0.25,
      step: 0.001,
      label: 'Note size',
    },
    velocityScale: {
      type: 'float',
      default: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: 'Velocity',
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
    playheadShow: {
      type: 'int',
      default: 1,
      min: 0,
      max: 1,
      step: 1,
      label: 'Playhead',
    },
    playheadL: {
      type: 'float',
      default: 0.9212694441951411,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: 'Head L',
    },
    playheadC: {
      type: 'float',
      default: 0.07333640227297007,
      min: 0.0,
      max: 0.4,
      step: 0.001,
      label: 'Head C',
    },
    playheadH: {
      type: 'float',
      default: 92.75176335649348,
      min: 0.0,
      max: 360.0,
      step: 0.001,
      label: 'Head H',
    },
    backgroundL: {
      type: 'float',
      default: 0.3427020622266527,
      min: 0.0,
      max: 1.0,
      step: 0.001,
      label: 'Bg L',
    },
    backgroundC: {
      type: 'float',
      default: 0.03431487471655648,
      min: 0.0,
      max: 0.4,
      step: 0.001,
      label: 'Bg C',
    },
    backgroundH: {
      type: 'float',
      default: 266.50628048763645,
      min: 0.0,
      max: 360.0,
      step: 0.001,
      label: 'Bg H',
    },
  },
  parameterGroups: [
    {
      id: 'arr-notes-view',
      label: 'View',
      parameters: [
        'windowSeconds',
        'timelineAnchor',
        'layoutOrientation',
        'trackLayout',
        'pitchPadding',
        'rowGap',
      ],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-notes-tracks',
      label: 'Tracks',
      parameters: [],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-notes-style',
      label: 'Style',
      parameters: ['noteSize', 'velocityScale', 'edgeFade', 'opacity'],
      collapsible: true,
      defaultCollapsed: false,
    },
    {
      id: 'arr-notes-playhead',
      label: 'Playhead',
      parameters: ['playheadShow', 'playheadL', 'playheadC', 'playheadH'],
      collapsible: true,
      defaultCollapsed: true,
    },
    {
      id: 'arr-notes-bg',
      label: 'Background',
      parameters: ['backgroundL', 'backgroundC', 'backgroundH'],
      collapsible: true,
      defaultCollapsed: true,
    },
  ],
  parameterLayout: {
    elements: [
      {
        type: 'grid',
        label: 'View',
        parameters: [
          'windowSeconds',
          'timelineAnchor',
          'layoutOrientation',
          'trackLayout',
          'pitchPadding',
          'rowGap',
        ],
        layout: { columns: 'auto' },
      },
      {
        type: 'arrangement-track-filter',
        label: 'Tracks',
        trackKinds: ['note'],
        hideEmpty: true,
        showNoteCounts: true,
      },
      {
        type: 'grid',
        label: 'Style',
        parameters: ['noteSize', 'velocityScale', 'edgeFade', 'opacity'],
        layout: { columns: 'auto' },
      },
      {
        type: 'grid',
        label: 'Playhead',
        parameters: ['playheadShow'],
        layout: { columns: 'auto' },
      },
      {
        type: 'color-picker-row',
        label: 'Colors',
        pickers: [
          ['playheadL', 'playheadC', 'playheadH'],
          ['backgroundL', 'backgroundC', 'backgroundH'],
        ],
      },
    ],
    parametersWithoutPorts: [
      'trackFilterMode',
      'trackFilterList',
      'backgroundL',
      'backgroundC',
      'backgroundH',
      'playheadL',
      'playheadC',
      'playheadH',
    ],
    minColumns: 3,
  },
  functions: `
struct {{ARR_NOTES_EVAL_STRUCT}} {
  vec4 color;
  float mask;
};

{{ARRANGEMENT_NOTES_BAKE}}

float arrangementNotesEdgeFade(vec2 uv, float fadeAmount) {
  if (fadeAmount <= 0.0001) return 1.0;
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  return smoothstep(0.0, fadeAmount, edge);
}

float arrangementNotesPlayheadLine1d(float timeCoord, float playheadT) {
  float dist = abs(timeCoord - playheadT);
  float lineWidth = max(fwidth(timeCoord), 0.001) * 1.25;
  return 1.0 - smoothstep(lineWidth * 0.5, lineWidth, dist);
}

vec3 arrangementNotesPaletteColor(float pitch) {
  float hue = fract(pitch * 0.024 + 0.12);
  return vec3(
    0.55 + 0.45 * cos(6.28318 * (hue + 0.0)),
    0.55 + 0.45 * cos(6.28318 * (hue + 0.33)),
    0.55 + 0.45 * cos(6.28318 * (hue + 0.66))
  );
}

vec3 arrangementNotesOklchToRgb(vec3 oklch) {
  float l = oklch.x;
  float c = oklch.y;
  float h = oklch.z * 3.14159265359 / 180.0;
  float a = c * cos(h);
  float b = c * sin(h);
  float l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  float l3 = l_ * l_ * l_;
  float m3 = m_ * m_ * m_;
  float s3 = s_ * s_ * s_;
  float r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  float g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  float bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return clamp(vec3(r, g, bl), 0.0, 1.0);
}

/**
 * **in** is **UV Coords** **p**: center 0, Y ∈ [−1, 1], X ∈ [−aspect, +aspect], aspect = resolution x/y.
 * Map both axes to [0, 1] for time/pitch and edge fade (same convention as **Arrangement Lanes** “UV Coords”).
 */
vec2 arrangementNotesUvFromP(vec2 p) {
  float aspect = uResolution.x / uResolution.y;
  return vec2(p.x / (2.0 * aspect) + 0.5, p.y * 0.5 + 0.5);
}

{{ARR_NOTES_EVAL_STRUCT}} evalArrangementNotes(
  vec2 uv,
  float timelineTime,
  float windowSeconds,
  int timelineAnchor,
  float noteSize,
  float velocityScale,
  float edgeFade,
  float opacity,
  vec3 backgroundRgb,
  int layoutOrientation,
  float pitchPadding,
  float rowGap,
  int playheadShow,
  vec3 playheadOklch
) {
  vec2 uvN = arrangementNotesUvFromP(uv);
  float timeCoord = layoutOrientation == 0 ? uvN.x : uvN.y;
  float pitchCoord = layoutOrientation == 0 ? uvN.y : uvN.x;

  float windowStart = timelineAnchor == 0
    ? timelineTime - windowSeconds * 0.5
    : timelineTime;
  float timeAtAxis = windowStart + clamp(timeCoord, 0.0, 1.0) * max(windowSeconds, 0.0001);

  float pp = clamp(pitchPadding, 0.0, 0.49);
  float pitchBand = max(1.0 - 2.0 * pp, 0.0001);

  float halfNote = noteSize * 0.5;
  vec3 color = backgroundRgb;
  float alpha = 0.0;

  for (int i = 0; i < ${MAX_ARRANGEMENT_NOTES_PACKED}; i++) {
    if (i >= ARR_NOTE_COUNT_{{NODE_SUFFIX}}) break;
    vec4 note = ARR_NOTES_{{NODE_SUFFIX}}[i];
    if (timeAtAxis < note.x || timeAtAxis > note.y) continue;
    float pitchPos = pp + pitchBand * ARR_NOTE_Y_NORM_{{NODE_SUFFIX}}[i];
    float rowDist = abs(pitchCoord - pitchPos);
    float hr = max(halfNote - rowGap, 0.0001);
    if (rowDist > hr) continue;
    float vel = clamp(note.w * velocityScale, 0.0, 1.0);
    float rowFade = (1.0 - smoothstep(hr * 0.55, hr, rowDist)) * vel;
    vec3 noteRgb = arrangementNotesPaletteColor(note.z);
    color = mix(color, noteRgb, rowFade);
    alpha = max(alpha, rowFade);
  }

  float playheadT = timelineAnchor == 0 ? 0.5 : 0.0;
  if (playheadShow != 0) {
    float playheadLine = arrangementNotesPlayheadLine1d(timeCoord, playheadT);
    if (playheadLine > 0.0) {
      vec3 playheadRgb = arrangementNotesOklchToRgb(playheadOklch);
      color = mix(color, playheadRgb, playheadLine);
      alpha = max(alpha, playheadLine);
    }
  }

  float edge = arrangementNotesEdgeFade(uvN, edgeFade);
  float outWeight = alpha * opacity * edge;
  return {{ARR_NOTES_EVAL_STRUCT}}(vec4(color, outWeight), outWeight);
}
`,
  mainCode: `
  vec2 noteUv = $input.in;
  float timelineTime = $input.time;
  vec3 bgRgb = arrangementNotesOklchToRgb(vec3($param.backgroundL, $param.backgroundC, $param.backgroundH));
  vec3 playheadOklch = vec3($param.playheadL, $param.playheadC, $param.playheadH);
  $arrNotesEvalStruct notesEval = evalArrangementNotes(
    noteUv,
    timelineTime,
    $param.windowSeconds,
    int($param.timelineAnchor),
    $param.noteSize,
    $param.velocityScale,
    $param.edgeFade,
    $param.opacity,
    bgRgb,
    int($param.layoutOrientation),
    $param.pitchPadding,
    $param.rowGap,
    int($param.playheadShow),
    playheadOklch
  );
  $output.out = notesEval.color;
  $output.mask = notesEval.mask;
`,
};
