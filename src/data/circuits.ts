import type { Circuit, CornerMarker, Point, TrackZone } from '@/types';

/* =====================================================================
 * Circuit authoring.
 *
 * A circuit is defined by anchor points; `splinePath` turns them into a
 * smooth closed curve. Corner labels, DRS zones and sector splits are
 * authored against *anchor indices* (readable, easy to nudge) and then
 * converted to the 0-1 progress values the `Circuit` contract exposes.
 * ===================================================================== */

/** Cumulative chord length of the closed polyline, normalised to 0-1. */
function progressAtAnchor(anchors: Point[], index: number): number {
  const n = anchors.length;
  const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

  let total = 0;
  for (let i = 0; i < n; i++) total += dist(anchors[i]!, anchors[(i + 1) % n]!);

  let run = 0;
  const target = ((index % n) + n) % n;
  for (let i = 0; i < target; i++) run += dist(anchors[i]!, anchors[(i + 1) % n]!);

  return total === 0 ? 0 : run / total;
}

function corner(
  anchors: Point[],
  index: number,
  label: string,
  offset?: Point,
): CornerMarker {
  return { progress: progressAtAnchor(anchors, index), label, offset };
}

function zone(anchors: Point[], from: number, to: number, label: string): TrackZone {
  return {
    start: progressAtAnchor(anchors, from),
    end: progressAtAnchor(anchors, to),
    label,
  };
}

/* ------------------------------------------------------------------ *
 * Suzuka-style figure-of-eight. The Degner -> hairpin link genuinely
 * crosses over the Spoon -> 130R back straight, which is what gives the
 * layout its signature knot.
 * ------------------------------------------------------------------ */
const SUZUKA_ANCHORS: Point[] = [
  /*  0 */ { x: 872, y: 470 }, // start / finish line
  /*  1 */ { x: 876, y: 360 }, // main straight
  /*  2 */ { x: 872, y: 250 },
  /*  3 */ { x: 855, y: 185 }, // Turn 1
  /*  4 */ { x: 812, y: 140 }, // Turn 2
  /*  5 */ { x: 752, y: 128 },
  /*  6 */ { x: 706, y: 152 }, // Esses begin
  /*  7 */ { x: 668, y: 122 },
  /*  8 */ { x: 622, y: 152 },
  /*  9 */ { x: 578, y: 124 },
  /* 10 */ { x: 536, y: 156 },
  /* 11 */ { x: 500, y: 200 }, // Dunlop
  /* 12 */ { x: 486, y: 250 },
  /* 13 */ { x: 462, y: 288 }, // Degner 1
  /* 14 */ { x: 430, y: 306 }, // Degner 2
  /* 15 */ { x: 356, y: 356 }, // crossover bridge
  /* 16 */ { x: 286, y: 412 },
  /* 17 */ { x: 238, y: 458 }, // hairpin entry
  /* 18 */ { x: 206, y: 490 }, // hairpin apex
  /* 19 */ { x: 172, y: 474 },
  /* 20 */ { x: 166, y: 436 }, // hairpin exit
  /* 21 */ { x: 150, y: 380 }, // 200R
  /* 22 */ { x: 120, y: 330 },
  /* 23 */ { x: 108, y: 286 }, // Spoon entry
  /* 24 */ { x: 132, y: 250 },
  /* 25 */ { x: 180, y: 246 }, // Spoon apex
  /* 26 */ { x: 206, y: 276 },
  /* 27 */ { x: 300, y: 320 }, // back straight
  /* 28 */ { x: 420, y: 372 },
  /* 29 */ { x: 540, y: 420 },
  /* 30 */ { x: 652, y: 458 },
  /* 31 */ { x: 726, y: 486 }, // 130R
  /* 32 */ { x: 784, y: 500 },
  /* 33 */ { x: 818, y: 524 }, // Casio Triangle
  /* 34 */ { x: 846, y: 540 },
  /* 35 */ { x: 866, y: 522 },
  /* 36 */ { x: 880, y: 496 }, // final curve
];

/** Pit lane sits outside the main straight and runs in the same direction. */
const SUZUKA_PIT_ANCHORS: Point[] = [
  { x: 884, y: 516 },
  { x: 916, y: 492 },
  { x: 926, y: 434 },
  { x: 928, y: 362 },
  { x: 924, y: 292 },
  { x: 908, y: 240 },
  { x: 884, y: 212 },
];

export const SUZUKA: Circuit = {
  id: 'suzuka',
  name: 'Suzuka International',
  country: 'Japan',
  countryCode: 'JP',
  anchors: SUZUKA_ANCHORS,
  pitAnchors: SUZUKA_PIT_ANCHORS,
  pitEntryProgress: 0.965,
  pitExitProgress: 0.06,
  viewBox: { x: 62, y: 88, width: 920, height: 500 },
  lengthKm: 5.807,
  laps: 55,
  baseLapTimeMs: 92_400,
  lapRecordMs: 90_983,
  lapRecordHolder: 'M. Rossi',
  startFinishProgress: 0,
  corners: [
    corner(SUZUKA_ANCHORS, 3, 'T1', { x: 34, y: -6 }),
    corner(SUZUKA_ANCHORS, 5, 'T2', { x: 4, y: -20 }),
    corner(SUZUKA_ANCHORS, 8, 'ESSES', { x: 0, y: -22 }),
    corner(SUZUKA_ANCHORS, 11, 'DUNLOP', { x: -34, y: -8 }),
    corner(SUZUKA_ANCHORS, 14, 'DEGNER', { x: 6, y: -20 }),
    corner(SUZUKA_ANCHORS, 15, 'CROSSOVER', { x: -46, y: 20 }),
    corner(SUZUKA_ANCHORS, 18, 'HAIRPIN', { x: 0, y: 26 }),
    corner(SUZUKA_ANCHORS, 22, '200R', { x: -30, y: 4 }),
    corner(SUZUKA_ANCHORS, 25, 'SPOON', { x: 6, y: -20 }),
    corner(SUZUKA_ANCHORS, 31, '130R', { x: -6, y: 26 }),
    corner(SUZUKA_ANCHORS, 34, 'CASIO', { x: 4, y: 26 }),
  ],
  drsZones: [
    zone(SUZUKA_ANCHORS, 36, 2, 'DRS 1'),
    zone(SUZUKA_ANCHORS, 27, 30, 'DRS 2'),
  ],
  sectorSplits: [
    progressAtAnchor(SUZUKA_ANCHORS, 14),
    progressAtAnchor(SUZUKA_ANCHORS, 30),
  ],
};

export const CIRCUITS: Record<string, Circuit> = {
  suzuka: SUZUKA,
};

export function getCircuit(id: string): Circuit {
  return CIRCUITS[id] ?? SUZUKA;
}
