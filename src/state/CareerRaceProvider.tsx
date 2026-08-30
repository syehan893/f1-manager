import { useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { RaceProvider } from './RaceProvider';
import { useGame } from './gameContext';
import { scoreRace } from '@/game/championship';
import { profileFor } from '@/game/difficulty';
import { conditionEffects, conditionOf, emotionOf } from '@/game/driverCondition';
import {
  staffPitCrewBonus,
  staffRacePaceEdge,
  staffReliabilityBonus,
  staffTyreWearMultiplier,
} from '@/game/staffing';
import { carRating } from '@/data/grid2026';
import { statsForDriver } from '@/game/roster';
import { driverAdaptationPenalty } from '@/game/driverDevelopment';
import { isRacePhase } from '@/game/phases';
import { scaledLaps, trackToCircuit } from '@/game/trackAdapter';
import { rollRaceWeather } from '@/game/weather';
import type { RaceState, TyreCompound } from '@/types';

/**
 * Owns the live race session for the career.
 *
 * Mounted above the view router, so the player can move between Pitwall,
 * R&D and the rest of the sidebar mid-race without tearing the session
 * down. Outside a race phase no engine runs at all — that is what makes
 * Pitwall Live's empty state honest rather than decorative.
 *
 * The starting grid is the qualifying order: the engine seeds positions
 * from the order of the drivers array, so it is sorted before being
 * handed over.
 */
export function CareerRaceProvider({ children }: { children: ReactNode }) {
  const { state, gridRoster, currentTrack, playerDrivers, dispatch, phase } = useGame();
  /** The round whose result has already been reported, so a finished
   *  race is folded into the championship exactly once. */
  const reportedRound = useRef<string | null>(null);

  const racing = isRacePhase(phase);
  const qualifyingEntries = state?.qualifying?.entries;

  const gridDrivers = useMemo(() => {
    if (!qualifyingEntries) return gridRoster;
    const byId = new Map(gridRoster.map((driver) => [driver.id, driver]));
    return qualifyingEntries
      .map((entry) => byId.get(entry.driverId))
      .filter((driver): driver is NonNullable<typeof driver> => Boolean(driver));
  }, [qualifyingEntries, gridRoster]);

  const circuit = useMemo(
    () => (currentTrack ? trackToCircuit(currentTrack) : null),
    [currentTrack],
  );

  const totalLaps = useMemo(
    () => (currentTrack && state ? scaledLaps(currentTrack, state.settings.raceLengthPct) : 10),
    [currentTrack, state],
  );

  const seed = useMemo(
    () => (state ? state.season * 1000 + state.round : 1),
    [state],
  );

  /* The sky for this round, rolled from the circuit's own forecast and
   * keyed on the weekend, so reloading a save cannot fish for a dry
   * afternoon — and so the strategy room and the race agree on it. */
  const weather = useMemo(
    () =>
      state && currentTrack
        ? rollRaceWeather(currentTrack, state.season, state.round, totalLaps)
        : undefined,
    [state, currentTrack, totalLaps],
  );

  /* The compounds signed off in the strategy room. Only the player's two
   * cars appear here; the engine picks for everyone else. */
  const startingTyres = useMemo(() => {
    if (!state) return undefined;
    const map: Record<string, TyreCompound> = {};
    for (const [driverId, plan] of Object.entries(state.strategies)) {
      if (state.driverTeams[driverId] !== state.playerTeamId) continue;
      if (plan.confirmedForRound !== state.round) continue;
      map[driverId] = plan.startingCompound;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [state]);

  /* Car performance per driver. Without this the race is decided by
   * driver skill alone and every pound spent in R&D is invisible on a
   * Sunday, which is the one place it is supposed to show. The race
   * engineering group adds a little on top for the player's own cars. */
  const carPace = useMemo(() => {
    if (!state) return undefined;
    const engineered = staffRacePaceEdge(state) * 1000;
    return Object.fromEntries(
      Object.entries(state.driverTeams).map(([driverId, teamId]) => [
        driverId,
        carRating(statsForDriver(state, driverId)) +
          (teamId === state.playerTeamId ? engineered : 0),
      ]),
    );
  }, [state]);

  /** A strong strategist gets more life out of every set — ours only. */
  const tyreCare = useMemo(() => {
    if (!state) return undefined;
    const care = staffTyreWearMultiplier(state);
    if (care === 1) return undefined;
    return Object.fromEntries(
      Object.entries(state.driverTeams)
        .filter(([, teamId]) => teamId === state.playerTeamId)
        .map(([driverId]) => [driverId, care]),
    );
  }, [state]);

  /* Pit-crew rating per car. This is what the pit bay and the pit-crew
   * R&D line actually buy: a shorter stationary time on a Sunday. */
  const pitCrew = useMemo(() => {
    if (!state) return undefined;
    const byTeam = new Map(state.teams.map((team) => [team.teamId, team.car.pitCrew]));
    // The chief mechanic's crew is the player's own; rivals get the
    // rating their car carries.
    const bonus = staffPitCrewBonus(state);
    return Object.fromEntries(
      Object.entries(state.driverTeams).map(([driverId, teamId]) => [
        driverId,
        (byTeam.get(teamId) ?? 70) + (teamId === state.playerTeamId ? bonus : 0),
      ]),
    );
  }, [state]);

  /** How hard the rest of the grid races — the difficulty setting. */
  const aiProfile = useMemo(
    () => profileFor(state?.settings.difficulty ?? 'PRO'),
    [state],
  );

  /* Reliability per car, so the power unit that R&D paid for is the one
   * that actually has to survive the afternoon. */
  const reliability = useMemo(() => {
    if (!state) return undefined;
    const bonus = staffReliabilityBonus(state);
    return Object.fromEntries(
      Object.entries(state.driverTeams).map(([driverId, teamId]) => [
        driverId,
        statsForDriver(state, driverId).reliability +
          (teamId === state.playerTeamId ? bonus : 0),
      ]),
    );
  }, [state]);

  /* The player's own cars: they talk on the radio, and they only pit
   * when the pit wall says so. The rest of the field runs its own race. */
  const radioDriverIds = useMemo(
    () => playerDrivers.map((driver) => driver.id),
    [playerDrivers],
  );

  /* How every driver on the grid is feeling, folded into the three levers
   * the engine understands. Rivals get theirs too, so an AI driver who
   * has had a torrid weekend races like it. */
  const condition = useMemo(() => {
    if (!state) return undefined;
    const trackId = currentTrack?.id ?? '';
    return Object.fromEntries(
      Object.keys(state.driverTeams).map((driverId) => {
        const effects = conditionEffects(conditionOf(state, driverId));
        /* A driver at a circuit they have never seen is not yet on the
         * pace. It rides on the same signed lap-time channel because that
         * is exactly what it is — how much slower they are today — and it
         * fades the moment the circuit is no longer new to them. */
        const adaptation = driverAdaptationPenalty(state, driverId, trackId);
        return [
          driverId,
          adaptation === 0
            ? effects
            : { ...effects, paceFactor: effects.paceFactor + adaptation },
        ];
      }),
    );
  }, [state, currentTrack]);

  /** The pit wall's standing instruction on how hard each car races. */
  const pushLevel = useMemo(() => {
    if (!state) return undefined;
    const map: Record<string, number> = {};
    for (const [driverId, plan] of Object.entries(state.strategies)) {
      if (state.driverTeams[driverId] !== state.playerTeamId) continue;
      map[driverId] = plan.pushLevel;
    }
    return Object.keys(map).length > 0 ? map : undefined;
  }, [state]);

  /** What the radio reads to decide how a driver speaks. */
  const emotionLookup = useCallback(
    (driverId: string) => emotionOf(conditionOf(state, driverId)),
    [state],
  );

  /* Anything the race does to a driver goes back through the machine, so
   * the save stays the only place condition actually lives. */
  const handleConditionEvent = useCallback(
    (driverId: string, conditionEvent: string) => {
      dispatch({ type: 'CONDITION_EVENT', driverId, event: conditionEvent });
    },
    [dispatch],
  );

  const handleFinished = useCallback(
    (finalSnapshot: RaceState) => {
      if (!state?.qualifying || !currentTrack) return;

      const roundKey = `${state.season}-${state.round}`;
      if (reportedRound.current === roundKey) return;
      reportedRound.current = roundKey;

      const ordered = [...finalSnapshot.cars].sort((a, b) => a.position - b.position);

      const result = scoreRace({
        season: state.season,
        round: state.round,
        trackId: currentTrack.id,
        totalLaps,
        order: ordered.map((car) => car.driverId),
        driverTeams: state.driverTeams,
        gridPositions: Object.fromEntries(
          state.qualifying.entries.map((entry) => [entry.driverId, entry.position]),
        ),
        bestLaps: Object.fromEntries(ordered.map((car) => [car.driverId, car.bestLapMs])),
        retired: new Set(
          ordered.filter((car) => car.status === 'RETIRED').map((car) => car.driverId),
        ),
        gaps: Object.fromEntries(
          ordered.map((car) => [car.driverId, Math.round(car.gapToLeaderMs)]),
        ),
        fastestLapPoint: state.settings.fastestLapPoint,
      });

      dispatch({ type: 'RACE_COMPLETE', result });
    },
    [state, currentTrack, totalLaps, dispatch],
  );

  // Between race weekends there is no session to run.
  if (!racing || !circuit || !state) return <>{children}</>;

  /* A session is immutable once it has started, so the only way to begin a
   * different race is to remount the provider. This key is what says so:
   * one race weekend, one engine, however many actions the player takes
   * during it. */
  const sessionKey = `${state.season}-${state.round}-${currentTrack?.id ?? 'x'}`;

  return (
    <RaceProvider
      key={sessionKey}
      drivers={gridDrivers}
      circuit={circuit}
      startLap={0}
      totalLaps={totalLaps}
      seed={seed}
      weather={weather}
      scriptedPass={null}
      initialSpeed={0}
      focusDriverId={playerDrivers[0]?.id}
      radioDriverIds={radioDriverIds}
      manualPitDriverIds={radioDriverIds}
      startingTyres={startingTyres}
      reliability={reliability}
      carPace={carPace}
      aiSkill={aiProfile.aiSkill}
      aiStrategyVariance={aiProfile.aiStrategyVariance}
      aiRacecraft={aiProfile.aiRacecraft}
      condition={condition}
      pushLevel={pushLevel}
      emotionOf={emotionLookup}
      onConditionEvent={handleConditionEvent}
      pitCrew={pitCrew}
      tyreCare={tyreCare}
      onFinished={handleFinished}
    >
      {children}
    </RaceProvider>
  );
}
