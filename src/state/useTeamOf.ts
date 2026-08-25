import { useCallback } from 'react';
import { teamOf } from '@/data/teams';
import { driverOf } from '@/data/drivers';
import { useGame } from './gameContext';
import type { Team } from '@/types';

/* =====================================================================
 * Live team resolution.
 *
 * A driver's `teamId` is where they started the game, not where they are
 * now. Once a transfer happens the save's `driverTeams` map is the only
 * truthful answer, so anything that paints a car — the circuit map, the
 * timing tower, the radio panel — has to go through here rather than
 * reading the static roster.
 *
 * It also fixes up `isUserTeam`, which on the static roster points at the
 * fictional demo team rather than whichever constructor the player is
 * actually running.
 * ===================================================================== */

export type TeamResolver = (driverId: string) => Team;

export function useTeamOf(): TeamResolver {
  const { state } = useGame();
  const driverTeams = state?.driverTeams;
  const playerTeamId = state?.playerTeamId;

  return useCallback(
    (driverId: string) => {
      // The save wins; the driver's original team is only the fallback
      // for the standalone race demo, which has no save at all.
      const teamId = driverTeams?.[driverId] ?? driverOf(driverId).teamId;
      const team = teamOf(teamId);

      // `isUserTeam` drives the highlight treatment, so it has to mean
      // "the team this player runs", not "the demo team".
      const isUserTeam = playerTeamId ? teamId === playerTeamId : team.isUserTeam;

      return isUserTeam === team.isUserTeam ? team : { ...team, isUserTeam };
    },
    [driverTeams, playerTeamId],
  );
}
