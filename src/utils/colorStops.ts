import type { ColorConfig, OKLCHColor, CubicBezier } from '../types';

// Evaluate cubic bezier curve at t
function cubicBezier(t: number, curve: CubicBezier): number {
  const u = 1.0 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  
  return uuu * 0.0 + 3.0 * uu * t * curve.y1 + 3.0 * u * tt * curve.y2 + ttt * 1.0;
}

// Interpolate hue with circular wrapping
function interpolateHue(startH: number, endH: number, t: number): number {
  // Handle circular hue interpolation - always go "up" (increasing direction)
  let adjustedEndH = endH;
  if (endH < startH) {
    adjustedEndH = endH + 360.0;
  }
  
  // Interpolate hue
  let h = startH + (adjustedEndH - startH) * t;
  
  // Normalize hue back to 0-360 range
  h = h % 360.0;
  if (h < 0) {
    h += 360.0;
  }
  
  return h;
}

// Generate color stops from config
export function generateColorStops(config: ColorConfig): OKLCHColor[] {
  const stops: OKLCHColor[] = [];
  const numStops = config.stops;
  
  for (let i = 0; i < numStops; i++) {
    const t = i / (numStops - 1); // 0 to 1
    
    // Evaluate bezier curves
    const lT = cubicBezier(t, config.lCurve);
    const cT = cubicBezier(t, config.cCurve);
    const hT = cubicBezier(t, config.hCurve);
    
    // Interpolate L and C
    const l = config.startColor.l + (config.endColor.l - config.startColor.l) * lT;
    const c = config.startColor.c + (config.endColor.c - config.startColor.c) * cT;
    
    // Interpolate hue with circular wrapping
    const h = interpolateHue(config.startColor.h, config.endColor.h, hT);
    
    stops.push({ l, c, h });
  }
  
  return stops;
}
