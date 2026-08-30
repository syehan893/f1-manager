import { useEffect, useRef } from 'react';
import { setEngineRevs, startEngine, stopEngine } from '@/lib/audio';
import { useSound, useSoundOnIncrease } from './useSound';
import type { RaceState } from '@/types';

/* =====================================================================
 * The race, out loud.
 *
 * One hook, mounted wherever the live session is on screen. It reads the
 * counts the snapshot already carries — pit stops, overtakes, incidents
 * — and plays a sound when one goes up. Nothing here reaches into the
 * engine, so the race sounds the same whether it is coming from the
 * local simulation or a socket.
 *
 * The engine note is the exception: it is held open for the length of
 * the session and driven from the leader's pace, so the screen sounds
 * like something running rather than like a series of beeps.
 * ===================================================================== */

export function useRaceSound(snapshot: RaceState): void {
  const play = useSound();

  const pitStops = snapshot.cars.reduce((sum, car) => sum + car.pitStops, 0);
  const retired = snapshot.cars.filter((car) => car.status === 'RETIRED').length;

  useSoundOnIncrease(pitStops, 'pitStop');
  useSoundOnIncrease(snapshot.overtakes.length, 'overtake');
  useSoundOnIncrease(retired, 'retirement');

  /* The flag, once. `sessionState` settles on FINISHED and stays there,
   * so this needs the edge rather than the value. */
  const wasFinished = useRef(false);
  useEffect(() => {
    const finished = snapshot.sessionState === 'FINISHED';
    if (finished && !wasFinished.current) play('chequered');
    wasFinished.current = finished;
  }, [snapshot.sessionState, play]);

  /* A fastest lap is a radio moment rather than a counter, so it is
   * caught off the incident feed by id — the newest one only. */
  const lastIncident = useRef<string | null>(null);
  useEffect(() => {
    const newest = snapshot.incidents[0];
    if (!newest || newest.id === lastIncident.current) return;
    const first = lastIncident.current === null;
    lastIncident.current = newest.id;
    // Nothing on mount: the feed is already full when the screen opens.
    if (first) return;
    if (newest.kind === 'FASTEST_LAP') play('fastestLap');
    else if (newest.kind === 'RADIO') play('radio');
  }, [snapshot.incidents, play]);

  /* The engine bed, for as long as the session is live. */
  const running = snapshot.sessionState === 'RUNNING';
  useEffect(() => {
    if (!running) {
      stopEngine();
      return;
    }
    startEngine();
    return stopEngine;
  }, [running]);

  /* Revs follow the leader: fast when the field is racing, down under a
   * neutralisation, and away altogether when everybody is in the pits. */
  const leader = snapshot.cars[0];
  const neutralised = snapshot.neutralisedLapsRemaining > 0;
  const lapProgress = leader?.lapProgress ?? 0;

  useEffect(() => {
    if (!running) return;
    /* A lap is not a constant note: the revs rise through a lap and drop
     * at the corners, and the racing line's progress is the cheapest
     * honest proxy for that shape. */
    const shaped = 0.45 + Math.abs(Math.sin(lapProgress * Math.PI * 3)) * 0.55;
    setEngineRevs(neutralised ? shaped * 0.45 : shaped);
  }, [running, lapProgress, neutralised]);
}
