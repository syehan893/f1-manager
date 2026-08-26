import { createContext, useContext } from 'react';
import type { MotionValue } from 'framer-motion';
import type { PitWallCall, RadioMessage } from '@/game/driverRadio';
import type {
  CarState,
  Circuit,
  FeedSource,
  FeedStatus,
  OvertakeEvent,
  RaceCommand,
  RaceState,
} from '@/types';

/**
 * Per-car animation channel. These are written from the feed's frame
 * callback at ~60fps and read by `CarMarker` via `useTransform`, so car
 * movement never triggers a React render.
 */
export interface CarMotion {
  /** 0-1 around the racing line. */
  progress: MotionValue<number>;
  /** 0-1 through the pit lane. */
  pitProgress: MotionValue<number>;
  /** 1 while the car should be drawn on the pit-lane path. */
  inPit: MotionValue<number>;
}

export interface RaceContextValue {
  snapshot: RaceState;
  circuit: Circuit;
  feedSource: FeedSource;
  feedStatus: FeedStatus;
  motion: Map<string, CarMotion>;
  /** Overtakes still inside their on-screen highlight window. */
  activeOvertakes: OvertakeEvent[];
  send: (command: RaceCommand) => void;
  focusedDriverId: string;
  setFocusedDriverId: (driverId: string) => void;
  carOf: (driverId: string) => CarState | undefined;
  /** Everything the drivers have said this session, newest first. */
  radio: RadioMessage[];
  /** Box requests still waiting on a call from the pit wall. */
  radioRequests: RadioMessage[];
  /**
   * Answer an outstanding box request. Accepting sends the car to the
   * pit lane on the compound they asked for; refusing is the "stay out"
   * call, and the driver will have something to say about it.
   */
  answerRadio: (messageId: string, accepted: boolean) => void;
  /**
   * Say something to a driver unprompted. This is the half of a radio a
   * pit wall actually owns: reassuring a rattled driver, demanding more
   * from a confident one, and living with the consequences either way.
   */
  callDriver: (driverId: string, call: PitWallCall) => void;
}

export const RaceContext = createContext<RaceContextValue | null>(null);

export function useRace(): RaceContextValue {
  const value = useContext(RaceContext);
  if (!value) throw new Error('useRace must be used inside <RaceProvider>');
  return value;
}
