import type { Circuit, CornerMarker, Point, TrackZone } from '@/types';
import type { Track } from '@/types/career';

/* =====================================================================
 * Career `Track` -> race-engine `Circuit`.
 *
 * The career catalog stores a layout and headline numbers; the live race
 * map additionally needs a pit lane, corner markers, DRS zones and sector
 * splits. Those are derived here rather than hand-authored, so any of the
 * twelve circuits can host a race weekend.
 * ===================================================================== */

function centroid(points: Point[]): Point {
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/**
 * Build a pit lane by pushing the anchors around the start/finish line
 * outward from the centre of the layout.
 */
function derivePitLane(anchors: Point[], offset = 46): Point[] {
  const middle = centroid(anchors);
  const count = anchors.length;
  // Wrap so the lane straddles the start/finish line, as it does in reality.
  const indices = [-2, -1, 0, 1, 2, 3].map((i) => (i + count) % count);

  return indices.map((index) => {
    const point = anchors[index]!;
    const dx = point.x - middle.x;
    const dy = point.y - middle.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: Math.round(point.x + (dx / length) * offset),
      y: Math.round(point.y + (dy / length) * offset),
    };
  });
}

function deriveCorners(count: number): CornerMarker[] {
  const markers: CornerMarker[] = [];
  // Cap the labels so a 20-corner circuit does not become unreadable.
  const labelled = Math.min(count, 8);

  for (let i = 0; i < labelled; i++) {
    const progress = (i + 0.5) / labelled;
    const angle = progress * Math.PI * 2;
    markers.push({
      progress,
      label: `T${Math.round((i * count) / labelled) + 1}`,
      offset: {
        x: Math.round(Math.cos(angle) * 26),
        y: Math.round(Math.sin(angle) * 26),
      },
    });
  }

  return markers;
}

function deriveDrsZones(count: number): TrackZone[] {
  const zones: TrackZone[] = [];
  for (let i = 0; i < Math.max(1, Math.min(count, 3)); i++) {
    const start = (i / Math.max(1, count)) + 0.02;
    zones.push({ start, end: Math.min(0.999, start + 0.09), label: `DRS ${i + 1}` });
  }
  return zones;
}

export function trackToCircuit(track: Track): Circuit {
  const anchors = track.layout.anchors;

  return {
    id: track.id,
    name: track.name,
    country: track.country,
    countryCode: track.countryCode,
    anchors,
    pitAnchors: derivePitLane(anchors),
    pitEntryProgress: 0.965,
    pitExitProgress: 0.06,
    viewBox: track.layout.viewBox,
    lengthKm: track.lengthKm,
    laps: track.laps,
    // A representative race lap sits a little off the outright record.
    baseLapTimeMs: Math.round(track.lapRecordMs * 1.02),
    lapRecordMs: track.lapRecordMs,
    lapRecordHolder: '—',
    corners: deriveCorners(track.cornerCount),
    drsZones: deriveDrsZones(track.drsZones),
    sectorSplits: [1 / 3, 2 / 3],
    startFinishProgress: 0,
  };
}

/** Laps actually run, given the season's race-length setting. */
export function scaledLaps(track: Track, raceLengthPct: number): number {
  return Math.max(3, Math.round((track.laps * raceLengthPct) / 100));
}
