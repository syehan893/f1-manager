import type {
  ConstructorStanding,
  DriverStanding,
  RaceResult,
  Standings,
} from './types';

/* =====================================================================
 * Championship scoring.
 * ===================================================================== */

/** Points for positions 1-10. Everything below scores nothing. */
export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;

/** Bonus for the fastest lap, only when finishing in the points. */
export const FASTEST_LAP_POINT = 1;

export function pointsForPosition(position: number): number {
  return POINTS_TABLE[position - 1] ?? 0;
}

export function emptyStandings(
  driverTeams: Record<string, string>,
  teamIds: string[],
): Standings {
  const drivers: DriverStanding[] = Object.entries(driverTeams).map(
    ([driverId, teamId], index) => ({
      position: index + 1,
      driverId,
      teamId,
      points: 0,
      wins: 0,
      podiums: 0,
    }),
  );

  const constructors: ConstructorStanding[] = teamIds.map((teamId, index) => ({
    position: index + 1,
    teamId,
    points: 0,
    wins: 0,
  }));

  return { drivers: rankDrivers(drivers), constructors: rankConstructors(constructors) };
}

/** Ties break on wins, then podiums — the same order the sport uses. */
function rankDrivers(rows: DriverStanding[]): DriverStanding[] {
  const sorted = [...rows].sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums,
  );
  sorted.forEach((row, index) => {
    row.position = index + 1;
  });
  return sorted;
}

function rankConstructors(rows: ConstructorStanding[]): ConstructorStanding[] {
  const sorted = [...rows].sort((a, b) => b.points - a.points || b.wins - a.wins);
  sorted.forEach((row, index) => {
    row.position = index + 1;
  });
  return sorted;
}

/** Fold a finished race into the championship tables. */
export function applyRaceResult(standings: Standings, result: RaceResult): Standings {
  const drivers = standings.drivers.map((row) => ({ ...row }));
  const constructors = standings.constructors.map((row) => ({ ...row }));

  const driverById = new Map(drivers.map((row) => [row.driverId, row]));
  const teamById = new Map(constructors.map((row) => [row.teamId, row]));

  for (const finish of result.finishers) {
    /* A driver the table has never seen still scored. Standings used to
     * be built once, at the start of a season, so anybody who arrived
     * after that — a mid-season signing, a reserve called up for one
     * weekend — dropped their points on the floor: no row, nothing added,
     * and the leaderboard quietly disagreed with the result sheet. */
    let driverRow = driverById.get(finish.driverId);
    if (!driverRow) {
      driverRow = {
        position: drivers.length + 1,
        driverId: finish.driverId,
        teamId: finish.teamId,
        points: 0,
        wins: 0,
        podiums: 0,
      };
      drivers.push(driverRow);
      driverById.set(finish.driverId, driverRow);
    }

    driverRow.points += finish.points;
    driverRow.teamId = finish.teamId;
    if (finish.status === 'FINISHED') {
      if (finish.position === 1) driverRow.wins += 1;
      if (finish.position <= 3) driverRow.podiums += 1;
    }

    const teamRow = teamById.get(finish.teamId);
    if (teamRow) {
      teamRow.points += finish.points;
      if (finish.status === 'FINISHED' && finish.position === 1) teamRow.wins += 1;
    }
  }

  return { drivers: rankDrivers(drivers), constructors: rankConstructors(constructors) };
}

/**
 * Score a finished race for every driver, awarding championship points.
 * `order` is the finishing order as driver ids.
 */
export function scoreRace(params: {
  season: number;
  round: number;
  trackId: string;
  totalLaps: number;
  /** Finishing order, winner first. */
  order: string[];
  driverTeams: Record<string, string>;
  /** driverId -> grid slot from qualifying. */
  gridPositions: Record<string, number>;
  /** driverId -> best lap in the race, for the fastest-lap bonus. */
  bestLaps: Record<string, number | null>;
  /** driverId set that failed to finish. */
  retired: Set<string>;
  /** driverId -> gap to the winner in ms. */
  gaps: Record<string, number>;
  fastestLapPoint: boolean;
}): RaceResult {
  const {
    season, round, trackId, totalLaps, order, driverTeams,
    gridPositions, bestLaps, retired, gaps, fastestLapPoint,
  } = params;

  // Fastest lap is only meaningful among classified finishers.
  let fastestDriverId: string | null = null;
  let fastestMs = Infinity;
  for (const driverId of order) {
    if (retired.has(driverId)) continue;
    const lap = bestLaps[driverId];
    if (lap != null && lap < fastestMs) {
      fastestMs = lap;
      fastestDriverId = driverId;
    }
  }

  const finishers = order.map((driverId, index) => {
    const position = index + 1;
    const isRetired = retired.has(driverId);
    const grid = gridPositions[driverId] ?? position;

    let points = isRetired ? 0 : pointsForPosition(position);
    const tookFastestLap = driverId === fastestDriverId && !isRetired;
    if (fastestLapPoint && tookFastestLap && position <= 10) {
      points += FASTEST_LAP_POINT;
    }

    return {
      position,
      driverId,
      teamId: driverTeams[driverId] ?? '',
      gridPosition: grid,
      points,
      positionsGained: grid - position,
      status: isRetired ? ('DNF' as const) : ('FINISHED' as const),
      fastestLap: tookFastestLap,
      bestLapMs: bestLaps[driverId] ?? null,
      gapToWinnerMs: gaps[driverId] ?? 0,
    };
  });

  return {
    season,
    round,
    trackId,
    totalLaps,
    finishers,
    completedAt: new Date().toISOString(),
  };
}
