import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { GRID_2026_DRIVERS, gridTeamOf } from '@/data/grid2026';
import { buildTracks } from '@/lib/careerGen';
import { COMPONENT_CATALOG, transition } from '@/game/machine';
import { clearSave, loadSave, readLocal, saveState, summarise } from '@/game/persistence';
import type { SaveOrigin, SaveSummary } from '@/game/persistence';
import type { GameEvent, GameState } from '@/game/types';
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
    // Apply live transfers so every screen sees the same team assignments.
    return GRID_2026_DRIVERS.map((driver) => {
      const teamId = state.driverTeams[driver.id];
      return teamId && teamId !== driver.teamId ? { ...driver, teamId } : driver;
    });
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

  const playerDrivers = useMemo(
    () => (state?.playerTeamId ? roster.filter((d) => d.teamId === state.playerTeamId) : []),
    [roster, state],
  );

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
      currentTrack,
      calendar,
      allTracks: TRACK_CATALOG,
      components: COMPONENT_CATALOG,
      roster,
    }),
    [
      state, save, origin, booting, notice, dispatch, continueSave,
      playerTeam, playerDrivers, currentTrack, calendar, roster,
    ],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export { TRACK_CATALOG };
