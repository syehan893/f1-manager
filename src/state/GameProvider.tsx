import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { prospectToDriver } from '@/game/driverDevelopment';
import { GRID_2026_DRIVERS, gridTeamOf } from '@/data/grid2026';
import { buildTracks } from '@/lib/careerGen';
import { COMPONENT_CATALOG, transition } from '@/game/machine';
import { gridDriverIds, squadOf } from '@/game/roster';
import { clearSave, loadSave, readLocal, saveState, summarise } from '@/game/persistence';
import type { SaveOrigin, SaveSummary } from '@/game/persistence';
import type { GameEvent, GameState } from '@/game/types';
import type { Driver } from '@/types';
import { GameContext } from './gameContext';
import type { GameContextValue, GameNotice } from './gameContext';

/** Circuit catalog is deterministic, so it is built once per session. */
const TRACK_CATALOG = buildTracks();

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState | null>(null);
  const [save, setSave] = useState<SaveSummary | null>(null);
  const [origin, setOrigin] = useState<SaveOrigin>('none');
  const [booting, setBooting] = useState(true);
  const [notice, setNotice] = useState<GameNotice | null>(null);

  const noticeSeq = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushNotice = useCallback((kind: GameNotice['kind'], text: string) => {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, kind, text });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), kind === 'error' ? 5_500 : 3_500);
  }, []);

  /* Boot from the database, falling back to the local mirror. */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await loadSave();
      if (cancelled) return;

      if (result.state) setSave(summarise(result.state, result.origin));
      setOrigin(result.origin);
      setBooting(false);

      if (result.offline) {
        pushNotice(
          'error',
          'Save database unreachable — running on the local copy. Progress will sync when it returns.',
        );
      }
    })();

    return () => {
      cancelled = true;
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [pushNotice]);

  const dispatch = useCallback(
    (event: GameEvent): boolean => {
      // `transition` is pure; the provider owns the side effects.
      const result = transition(state, event);

      if (!result.ok) {
        pushNotice('error', result.message ?? 'That action is not available right now.');
        return false;
      }

      if (event.type === 'RESET') {
        void clearSave();
        setState(null);
        setSave(null);
        setOrigin('none');
        pushNotice('info', 'Save deleted. The slot is now empty.');
        return true;
      }

      if (result.state) {
        const next = result.state;
        setState(next);
        setSave(summarise(next, origin === 'none' ? 'database' : origin));

        // Autosave on every accepted transition — one slot, always current.
        void saveState(next).then((ok) => {
          setOrigin(ok ? 'database' : 'local');
        });
      }

      return true;
    },
    [state, pushNotice, origin],
  );

  /** Resume the stored save into the live session. */
  const continueSave = useCallback((): boolean => {
    const stored = readLocal();
    if (!stored) {
      pushNotice('error', 'No save found in this slot.');
      return false;
    }
    return dispatch({ type: 'CONTINUE', save: stored });
  }, [dispatch, pushNotice]);

  /* ------------------------------ derived ------------------------------ */

  const roster = useMemo(() => {
    if (!state) return GRID_2026_DRIVERS;
    /* Apply live transfers so every screen sees the same team assignments.
     * A driver with no entry in `driverTeams` has lost their seat — they
     * must not keep the team the data file gave them, or a driver the
     * player released goes on showing up in their own line-up. */
    const established = GRID_2026_DRIVERS.map((driver) => {
      const teamId = state.driverTeams[driver.id] ?? '';
      return teamId === driver.teamId ? driver : { ...driver, teamId };
    });

    /* Juniors who have been promoted are not in the 2026 data file, so
     * without this they hold a seat that names nobody: they disappear
     * from the driver list, from the line-up, and from the grid on a
     * Sunday. They get a free car number so the timing tower and the
     * track markers can tell them apart from everyone else. */
    const taken = new Set(established.map((driver) => driver.carNumber));
    const graduates = (state.academyDrivers ?? [])
      .filter((prospect) => Boolean(state.driverTeams[prospect.id]))
      .map((prospect) => {
        let carNumber = 2;
        while (taken.has(carNumber) && carNumber < 100) carNumber++;
        taken.add(carNumber);
        return prospectToDriver(prospect, {
          teamId: state.driverTeams[prospect.id]!,
          carNumber,
        });
      });

    return graduates.length > 0 ? [...established, ...graduates] : established;
  }, [state]);

  const calendar = useMemo(
    () =>
      (state?.calendarTrackIds ?? [])
        .map((trackId) => TRACK_CATALOG.find((track) => track.id === trackId))
        .filter((track): track is (typeof TRACK_CATALOG)[number] => Boolean(track)),
    [state],
  );

  const currentTrack = useMemo(() => {
    if (!state) return null;
    return calendar[state.round - 1] ?? calendar[0] ?? null;
  }, [state, calendar]);

  const playerTeam = useMemo(
    () => (state?.playerTeamId ? gridTeamOf(state.playerTeamId) : null),
    [state],
  );

  /* The entry list. A squad may be four deep; two cars start the race,
   * and everything from qualifying to the timing tower reads this. */
  const gridRoster = useMemo(() => {
    if (!state) return roster;
    const entered = new Set(gridDriverIds(state));
    return roster.filter((driver) => entered.has(driver.id));
  }, [roster, state]);

  /* Ordered by the line-up rather than by the data file, so "the first
   * car" means the driver the player put first. */
  const orderedSquad = useMemo(() => {
    if (!state?.playerTeamId) return [];
    const byId = new Map(roster.map((driver) => [driver.id, driver]));
    return squadOf(state, state.playerTeamId)
      .map((driverId) => byId.get(driverId))
      .filter((driver): driver is Driver => Boolean(driver));
  }, [roster, state]);

  const playerDrivers = useMemo(() => {
    if (!state?.playerTeamId) return [];
    const entered = new Set(gridDriverIds(state));
    return orderedSquad.filter((driver) => entered.has(driver.id));
  }, [orderedSquad, state]);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      phase: state?.phase ?? 'MAIN_MENU',
      save,
      origin,
      booting,
      notice,
      dismissNotice: () => setNotice(null),
      dispatch,
      continueSave,
      playerTeam,
      playerDrivers,
      playerSquad: orderedSquad,
      currentTrack,
      calendar,
      allTracks: TRACK_CATALOG,
      components: COMPONENT_CATALOG,
      roster,
      gridRoster,
    }),
    [
      state, save, origin, booting, notice, dispatch, continueSave,
      playerTeam, playerDrivers, orderedSquad, currentTrack, calendar, roster, gridRoster,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export { TRACK_CATALOG };
