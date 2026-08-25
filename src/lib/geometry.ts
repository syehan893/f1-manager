import type { Point } from '@/types';

/* =====================================================================
 * SVG path helpers.
 *
 * Circuits are authored as a handful of anchor points (easy to tweak)
 * and converted here into a smooth Catmull-Rom spline expressed as
 * cubic beziers. The resulting `d` string is then sampled into a lookup
 * table so cars can be placed at any 0-1 progress in O(1) at 60fps
 * without touching the DOM.
 * ===================================================================== */

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Convert anchor points into a smooth cubic-bezier path.
 *
 * @param points  Anchor points in view-box space.
 * @param closed  When true the spline wraps around, producing a circuit.
 * @param tension 0 = straight polyline, 0.5 = classic Catmull-Rom.
 */
export function splinePath(points: Point[], closed = true, tension = 0.5): string {
  if (points.length < 2) return '';

  const n = points.length;
  const at = (i: number): Point => {
    if (closed) return points[(i + n) % n]!;
    return points[Math.min(n - 1, Math.max(0, i))]!;
  };

  const k = tension / 3;
  const segments = closed ? n : n - 1;
  let d = `M ${round(points[0]!.x)} ${round(points[0]!.y)}`;

  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);

    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;

    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
  }

  return closed ? `${d} Z` : d;
}

export interface SampledPoint extends Point {
  /** Tangent heading in degrees, useful for rotating car markers. */
  angle: number;
}

export interface PathSampler {
  readonly length: number;
  /** Sample the path at 0-1 progress. Values outside the range wrap. */
  at(progress: number): SampledPoint;
}

/**
 * A single detached <svg> host kept alive for measurement. Browsers
 * require a path to be in a document for getPointAtLength to be
 * reliable, but it never needs to be visible.
 */
let measureHost: SVGSVGElement | null = null;

function getMeasureHost(): SVGSVGElement {
  if (measureHost) return measureHost;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  svg.style.opacity = '0';
  svg.style.left = '-9999px';
  document.body.appendChild(svg);
  measureHost = svg;
  return svg;
}

const EMPTY_SAMPLE: SampledPoint = { x: 0, y: 0, angle: 0 };

/**
 * Pre-compute `resolution` evenly spaced points along the path so the
 * animation loop only does a lerp between two neighbours per car.
 */
export function createPathSampler(d: string, resolution = 900): PathSampler {
  if (typeof document === 'undefined' || !d) {
    return { length: 0, at: () => EMPTY_SAMPLE };
  }

  const host = getMeasureHost();
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  host.appendChild(path);

  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    total = 0;
  }

  const xs = new Float32Array(resolution + 1);
  const ys = new Float32Array(resolution + 1);
  const angles = new Float32Array(resolution + 1);

  if (total > 0) {
    for (let i = 0; i <= resolution; i++) {
      const p = path.getPointAtLength((i / resolution) * total);
      xs[i] = p.x;
      ys[i] = p.y;
    }
    // Central-difference tangents, wrapping at the seam.
    for (let i = 0; i <= resolution; i++) {
      const prev = (i - 1 + resolution) % resolution;
      const next = (i + 1) % resolution;
      angles[i] = (Math.atan2(ys[next]! - ys[prev]!, xs[next]! - xs[prev]!) * 180) / Math.PI;
    }
  }

  host.removeChild(path);

  return {
    length: total,
    at(progress: number): SampledPoint {
      if (total === 0) return EMPTY_SAMPLE;
      // Wrap into [0,1) so lap rollover is seamless.
      const t = progress - Math.floor(progress);
      const raw = t * resolution;
      const i = Math.floor(raw);
      const frac = raw - i;
      const j = i + 1 > resolution ? 0 : i + 1;

      return {
        x: xs[i]! + (xs[j]! - xs[i]!) * frac,
        y: ys[i]! + (ys[j]! - ys[i]!) * frac,
        angle: angles[i]!,
      };
    },
  };
}

/** Sampler for an open path (pit lane) — progress clamps instead of wrapping. */
export function createClampedSampler(d: string, resolution = 300): PathSampler {
  const inner = createPathSampler(d, resolution);
  return {
    length: inner.length,
    at: (progress: number) => inner.at(Math.min(0.9999, Math.max(0, progress))),
  };
}

export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Shortest signed distance between two 0-1 progress values on a loop. */
export function loopDelta(from: number, to: number): number {
  let delta = to - from;
  while (delta > 0.5) delta -= 1;
  while (delta < -0.5) delta += 1;
  return delta;
}
