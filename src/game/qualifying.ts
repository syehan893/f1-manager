import { carRating, driverRating } from '@/data/grid2026';
import { profileFor } from './difficulty';
import type { Driver } from '@/types';
import type { Track } from '@/types/career';
import type {
  Difficulty,
  QualifyingEntry,
  QualifyingLap,
  QualifyingResult,
  TeamSeasonState,
} from './types';

/* =====================================================================
 * Qualifying: five timed laps per driver, best one counts.
 *
 * Deterministic for a given (season, round) so reloading a save cannot
 * be used to reroll the session.
 * ===================================================================== */

export const QUALIFYING_LAPS = 5;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* Difficulty lives in one table shared with the race engine, so Legend
 * means the same thing on Saturday as it does on Sunday. */

export interface QualifyingInput {
  season: number;
  round: number;
  track: Track;
  drivers: Driver[];
  /** driverId -> teamId, so mid-season transfers are respected. */
  driverTeams: Record<string, string>;
  /** Live car stats, which R&D investment mutates. */
  teams: TeamSeasonState[];
  difficulty: Difficulty;
  /**
   * The player's constructor. Difficulty is applied to the rest of the
   * grid only — raising it has to make the opposition better, never make
   * the player's own cars worse.
   */
  playerTeamId?: string | null;
  /** Simulator level lifts the player's single-lap pace a fraction. */
  playerQualifyingEdge?: number;
}

/**
 * Single-lap pace, in ms. Car is weighted more heavily than the driver —
 * the same balance the sport has.
 */
function baseLapTimeMs(
  track: Track,
  driver: Driver,
  car: TeamSeasonState | undefined,
  difficulty: Difficulty,
  isPlayerCar: boolean,
  playerEdge: number,
): number {
  const reference = track.lapRecordMs * 1.015;
  const profile = profileFor(difficulty);

  const carScore = car ? carRating(car.car) : 70;
  const driverScore = driverRating(driver);

  // A 100-rated package sits on the reference; everything else is slower.
  const carPenalty = ((100 - carScore) / 100) * 0.055;
  const driverPenalty = ((100 - driverScore) / 100) * 0.028;

  /* The spread narrows with difficulty — a tighter field means a lucky
   * lap stops being enough and the car has to actually be quick. */
  const penalty = (carPenalty + driverPenalty) * profile.qualifyingSpread;

  /* The AI's edge is applied to everyone else, and the simulator's edge
   * to the player. Neither ever touches the other. */
  const edge = isPlayerCar ? -playerEdge : -profile.aiLapEdge;

  return reference * (1 + penalty + edge);
}

export function simulateQualifying(input: QualifyingInput): QualifyingResult {
  const { season, round, track, drivers, driverTeams, teams, difficulty } = input;
  const profile = profileFor(difficulty);
  const playerEdge = input.playerQualifyingEdge ?? 0;
  const rng = mulberry32((season * 1_000 + round) * 7919 + track.id.length);
  const teamById = new Map(teams.map((team) => [team.teamId, team]));

  const entries: QualifyingEntry[] = drivers.map((driver) => {
    const teamId = driverTeams[driver.id] ?? driver.teamId;
    const car = teamById.get(teamId);
    const isPlayerCar = Boolean(input.playerTeamId) && teamId === input.playerTeamId;
    const base = baseLapTimeMs(track, driver, car, difficulty, isPlayerCar, playerEdge);

    // Consistency decides how tightly the five laps cluster. A stronger
    // AI also makes fewer scruffy laps, which is most of what separates
    // a competitive field from a lucky one.
    const consistency = driver.attributes.consistency / 100;
    const composure = isPlayerCar ? 1 : 1 - profile.aiSkill * 0.45;
    const jitter = (1.4 - consistency) * 0.011 * (isPlayerCar ? 1 : composure + 0.25);

    const laps: QualifyingLap[] = [];
    for (let lap = 1; lap <= QUALIFYING_LAPS; lap++) {
      // Track rubbers in across the session: later laps trend quicker.
      const evolution = 1 - (lap - 1) * 0.0016;
      // Occasional scruffy lap, more likely from inconsistent drivers.
      const mistake =
        rng() < (1 - consistency) * 0.22 * composure ? 0.012 + rng() * 0.02 : 0;
      const noise = (rng() - 0.5) * jitter;

      laps.push({
        lap,
        timeMs: Math.round(base * evolution * (1 + noise + mistake)),
        isBest: false,
      });
    }

    // Only the best lap counts — that is the whole format.
    let best = laps[0]!;
    for (const lap of laps) if (lap.timeMs < best.timeMs) best = lap;
    best.isBest = true;

    return {
      position: 0,
      driverId: driver.id,
      teamId,
      laps,
      bestLapMs: best.timeMs,
      gapToPoleMs: 0,
    };
  });

  entries.sort((a, b) => a.bestLapMs - b.bestLapMs);

  const poleTime = entries[0]?.bestLapMs ?? 0;
  entries.forEach((entry, index) => {
    entry.position = index + 1;
    entry.gapToPoleMs = entry.bestLapMs - poleTime;
  });

  return {
    season,
    round,
    trackId: track.id,
    entries,
    completedAt: new Date().toISOString(),
  };
}

/** Grid order as driver ids, pole first. */
export function gridOrder(result: QualifyingResult): string[] {
  return result.entries.map((entry) => entry.driverId);
}
