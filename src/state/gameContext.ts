import { createContext, useContext } from 'react';
import type { Driver } from '@/types';
import type { EngineComponent, Track } from '@/types/career';
import type { GridTeam } from '@/data/grid2026';
import type { GameEvent, GamePhase, GameState } from '@/game/types';
import type { SaveOrigin, SaveSummary } from '@/game/persistence';

export interface GameNotice {
  id: number;
  kind: 'error' | 'success' | 'info';
  text: string;
}

export interface GameContextValue {
  /** null on the main menu, before a career exists. */
  state: GameState | null;
  phase: GamePhase;
  /** Summary of the single save slot, or null if the slot is empty. */
  save: SaveSummary | null;
  /** Where the live save is currently being persisted. */
  origin: SaveOrigin;
  booting: boolean;

  notice: GameNotice | null;
  dismissNotice: () => void;

  /** Runs the event through the machine. Returns whether it was accepted. */
  dispatch: (event: GameEvent) => boolean;
  /** Loads the stored save into the live session. */
  continueSave: () => boolean;

  /* derived helpers */
  playerTeam: GridTeam | null;
  playerDrivers: Driver[];
  currentTrack: Track | null;
  /** This season's calendar, in order. */
  calendar: Track[];
  /** Every circuit in the catalog, for the calendar builder. */
  allTracks: Track[];
  /** Component tech tree catalog. */
  components: EngineComponent[];
  /** Every driver with their live team assignment applied. */
  roster: Driver[];
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside <GameProvider>');
  return value;
}
