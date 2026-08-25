import { PRIZE_MONEY } from './finance';
import type { ArchivedStanding, GameState, SeasonRecord } from './types';

/* =====================================================================
 * The season archive.
 *
 * A career that only remembers the current year is a series of unrelated
 * weekends. This is the record that turns it into a career: every
 * finished championship, kept in full, so the player can look back at
 * the year they got it wrong and the year they finally did not.
 *
 * Written once, at the moment the final round's books close and before
 * anything is reset. Nothing ever edits an archived season.
 * ===================================================================== */

function toArchived(
  rows: Array<{ position: number; points: number; wins: number }>,
  idOf: (row: unknown) => string,
  teamOf: (row: unknown) => string,
): ArchivedStanding[] {
  return rows.map((row) => ({
    position: row.position,
    id: idOf(row),
    teamId: teamOf(row),
    points: row.points,
    wins: row.wins,
  }));
}

/**
 * Freeze the season that has just finished. Called with the state as it
 * stands at the end of the final round — standings intact, prize money
 * already posted — and returns a record that is never mutated again.
 */
export function archiveSeason(state: GameState): SeasonRecord {
  const constructors = toArchived(
    state.standings.constructors,
    (row) => (row as { teamId: string }).teamId,
    (row) => (row as { teamId: string }).teamId,
  );

  const drivers = toArchived(
    state.standings.drivers,
    (row) => (row as { driverId: string }).driverId,
    (row) => (row as { teamId: string }).teamId,
  );

  const playerRow = state.standings.constructors.find(
    (row) => row.teamId === state.playerTeamId,
  );

  /* Prize money was posted moments ago by the settlement, so it can be
   * read straight off the ledger rather than recomputed and risk
   * disagreeing with what the player was actually paid. */
  const prizeMoney =
    state.finance.ledger.find(
      (entry) => entry.kind === 'PRIZE' && entry.season === state.season,
    )?.amount ?? PRIZE_MONEY[PRIZE_MONEY.length - 1]!;

  return {
    season: state.season,
    playerTeamId: state.playerTeamId,
    playerPosition: playerRow?.position ?? state.teams.length,
    playerPoints: playerRow?.points ?? 0,
    championDriverId: state.standings.drivers[0]?.driverId ?? null,
    championTeamId: state.standings.constructors[0]?.teamId ?? null,
    drivers,
    constructors,
    prizeMoney,
    rounds: state.history
      .filter((round) => round.season === state.season)
      .map((round) => ({ ...round })),
    managerScore: Math.round(state.managerPerformanceScore),
  };
}

/**
 * The season currently being run, shaped like an archived one so the
 * history screen can render past and present through the same component.
 */
export function currentSeasonRecord(state: GameState): SeasonRecord {
  return {
    ...archiveSeason(state),
    // Nothing has been paid out yet on a season still in progress.
    prizeMoney: 0,
  };
}
