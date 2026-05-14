/** Context for portaling `TimelineHeaderControls` into the floating panel header mount. */
export const TIMELINE_FLOATING_HEADER_HOST = Symbol('timelineFloatingHeaderHost');

export type TimelineFloatingHeaderHostGetter = () => HTMLDivElement | null;
