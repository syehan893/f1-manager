import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motionValue } from 'framer-motion';
import { SUZUKA } from '@/data/circuits';
import { DRIVERS } from '@/data/drivers';
import { createRaceFeed } from '@/services/raceFeed';
import { createRadioBrain } from '@/game/driverRadio';
import type { RadioMessage } from '@/game/driverRadio';
import type {
  Circuit,
  Driver,
  FeedStatus,
  OvertakeEvent,
  RaceCommand,
  RaceState,
  TyreCompound,
} from '@/types';
import { RaceContext } from './raceContext';
import type { CarMotion, RaceContextValue } from './raceContext';

/** The radio log is a scrollback, not a transcript of the whole race. */
const RADIO_LOG_CAP = 60;

/** How long an overtake stays highlighted on the map and in the timing tower. */
const OVERTAKE_HIGHLIGHT_MS = 5_200;

/** The race is joined in progress, matching a mid-race pit-wall handover. */
const START_LAP = 17;

const SCRIPTED_PASS = { overtakerId: 'garcia', overtakenId: 'perez' };

export interface RaceProviderProps {
  children: ReactNode;
  /** Grid roster. Array order is the starting order. */
  drivers?: Driver[];
  circuit?: Circuit;
  /** 0 for a standing start; >0 joins a race already running. */
  startLap?: number;
  /** Overrides the championship distance, e.g. a 25% race. */
  totalLaps?: number;
  seed?: number;
  /** Pass null to disable the demonstration pass. */
  scriptedPass?: { overtakerId: string; overtakenId: string } | null;
  /** Session speed applied on mount. 0 holds the field for a countdown. */
  initialSpeed?: number;
  /** Driver the HUD focuses on before the user picks one. */
  focusDriverId?: string;
  /** Drivers whose radio the pit wall hears. Defaults to the focus car. */
  radioDriverIds?: string[];
  /** Compound each car starts the race on, from the strategy screen. */
  startingTyres?: Record<string, TyreCompound>;
  /** Per-car reliability rating, so a fragile car actually breaks. */
  reliability?: Record<string, number>;
  /** Cars the strategy AI leaves alone — the pit wall calls their stops. */
  manualPitDriverIds?: string[];
  /** Per-car package rating, so R&D shows up in race pace. */
  carPace?: Record<string, number>;
  /** 0-1 difficulty applied to every car the player does not run. */
  aiSkill?: number;
  /** Per-car pit-crew rating, which decides the stationary time. */
  pitCrew?: Record<string, number>;
  /** Per-car multiplier on tyre wear, from setup and strategy work. */
  tyreCare?: Record<string, number>;
  /** 0-1 how far rival teams diverge from the nominal race plan. */
  aiStrategyVariance?: number;
  /** 0-1 how well the AI manages tyres, energy and its moments to attack. */
  aiRacecraft?: number;
  /** Fires once when the leader takes the chequered flag. */
  onFinished?: (snapshot: RaceState) => void;
}

export function RaceProvider({
  children,
  drivers = DRIVERS,
  circuit = SUZUKA,
  startLap = START_LAP,
  totalLaps,
  seed = 20260419,
  scriptedPass = SCRIPTED_PASS,
  initialSpeed = 1,
  focusDriverId,
  radioDriverIds,
  startingTyres,
  reliability,
  manualPitDriverIds,
  carPace,
  aiSkill,
  pitCrew,
  tyreCare,
  aiStrategyVariance,
  aiRacecraft,
  onFinished,
}: RaceProviderProps) {
  // The feed and the motion channels are created once per session config.
  const feed = useMemo(
    () =>
      createRaceFeed({
        circuit,
        drivers,
        seed,
        startLap,
        totalLaps,
        scriptedPass: scriptedPass ?? undefined,
        startingTyres,
        reliability,
        manualPitDriverIds,
        carPace,
        aiSkill,
        pitCrew,
        tyreCare,
        aiStrategyVariance,
        aiRacecraft,
      }),
    [
      circuit,
      drivers,
      seed,
      startLap,
      totalLaps,
      scriptedPass,
      startingTyres,
      reliability,
      manualPitDriverIds,
      carPace,
      aiSkill,
      pitCrew,
      tyreCare,
      aiStrategyVariance,
      aiRacecraft,
    ],
  );

  const motion = useMemo(() => {
    const map = new Map<string, CarMotion>();
    for (const driver of drivers) {
      map.set(driver.id, {
        progress: motionValue(0),
        pitProgress: motionValue(0),
        inPit: motionValue(0),
      });
    }
    return map;
  }, [drivers]);

  const [snapshot, setSnapshot] = useState<RaceState>(() => feed.getSnapshot());
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(() => feed.getStatus());
  const [activeOvertakes, setActiveOvertakes] = useState<OvertakeEvent[]>([]);
  const [focusedDriverId, setFocusedDriverId] = useState<string>(
    () => focusDriverId ?? drivers[0]?.id ?? SCRIPTED_PASS.overtakerId,
  );

  const [radio, setRadio] = useState<RadioMessage[]>([]);
  /** Requests the pit wall has already ruled on. */
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());

  /* The radio brain listens to the same snapshots React renders from. It
   * is per-session state, not per-render, so it lives in a ref keyed to
   * the feed it is listening to. */
  const brain = useMemo(
    () =>
      createRadioBrain({
        drivers,
        focusDriverIds: radioDriverIds ?? (focusDriverId ? [focusDriverId] : []),
        seed,
      }),
    [drivers, radioDriverIds, focusDriverId, seed],
  );

  /** The latest snapshot, for commands that need to read it synchronously. */
  const snapshotRef = useRef<RaceState | null>(null);

  const expiryTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const finishedRef = useRef(false);

  // The chequered flag is reported once, to whoever owns the session.
  useEffect(() => {
    if (finishedRef.current) return;
    if (snapshot.sessionState !== 'FINISHED') return;
    finishedRef.current = true;
    onFinished?.(snapshot);
  }, [snapshot, onFinished]);

  useEffect(() => {
    // 60fps channel: positions only, straight into MotionValues.
    const unsubscribeFrame = feed.onFrame((live) => {
      for (const car of live.cars) {
        const channel = motion.get(car.driverId);
        if (!channel) continue;
        channel.progress.set(car.lapProgress);
        channel.pitProgress.set(car.pitProgress);
        channel.inPit.set(
          car.status === 'IN_PIT' ||
            car.status === 'PIT_ENTRY' ||
            car.status === 'PIT_EXIT'
            ? 1
            : 0,
        );
      }
    });

    // Throttled channel: everything React renders from. The radio is
    // evaluated here rather than in an effect so each snapshot is seen
    // exactly once, however often React re-renders.
    const unsubscribeSnapshot = feed.onSnapshot((next) => {
      snapshotRef.current = next;
      setSnapshot(next);
      const spoken = brain.evaluate(next);
      if (spoken.length > 0) {
        setRadio((current) => [...spoken.reverse(), ...current].slice(0, RADIO_LOG_CAP));
      }
    });
    const unsubscribeStatus = feed.onStatus(setFeedStatus);

    const unsubscribeOvertake = feed.onOvertake((event) => {
      setActiveOvertakes((current) => [...current, event]);
      const timer = setTimeout(() => {
        setActiveOvertakes((current) => current.filter((e) => e.id !== event.id));
      }, OVERTAKE_HIGHLIGHT_MS);
      expiryTimers.current.push(timer);
    });

    feed.start();
    // A countdown holds the field on the grid until the flag drops.
    if (initialSpeed !== 1) feed.send({ type: 'SET_SPEED', multiplier: initialSpeed });

    return () => {
      unsubscribeFrame();
      unsubscribeSnapshot();
      unsubscribeStatus();
      unsubscribeOvertake();
      feed.stop();
      for (const timer of expiryTimers.current) clearTimeout(timer);
      expiryTimers.current = [];
    };
  }, [feed, motion, initialSpeed, brain]);

  /* A new session starts with a clear radio log. Adjusted during render
   * rather than in an effect, so the first paint of a new race never
   * shows the previous one's traffic. */
  const [radioSession, setRadioSession] = useState(brain);
  if (radioSession !== brain) {
    setRadioSession(brain);
    setRadio([]);
    setAnswered(new Set());
  }

  const send = useCallback((command: RaceCommand) => feed.send(command), [feed]);

  /**
   * Outstanding requests. One stops being outstanding as soon as it is
   * answered, or as soon as it has been overtaken by events — a driver
   * who has already boxed is not still asking to box, and a car already
   * pushing does not need permission to.
   */
  const radioRequests = useMemo(
    () =>
      radio.filter((message) => {
        if (!message.decision || answered.has(message.id)) return false;
        const car = snapshot.cars.find((c) => c.driverId === message.driverId);
        if (!car || car.status === 'RETIRED') return false;

        switch (message.decision.kind) {
          case 'PIT':
            return (
              car.status !== 'IN_PIT' &&
              car.status !== 'PIT_ENTRY' &&
              car.status !== 'PIT_EXIT'
            );
          case 'PUSH':
            return !car.attacking && car.status === 'LAPPING';
          case 'BOOST':
            return !car.boosting && car.status === 'LAPPING';
          default:
            return false;
        }
      }),
    [radio, answered, snapshot],
  );

  const answerRadio = useCallback(
    (messageId: string, accepted: boolean) => {
      const message = radio.find((m) => m.id === messageId);
      if (!message?.decision) return;

      setAnswered((current) => new Set(current).add(messageId));

      /* Each kind of request maps onto the command that grants it. A
       * refused attack call needs no command at all — the car was never
       * going to arm the mode by itself. */
      const { driverId, decision } = { driverId: message.driverId, decision: message.decision };

      if (decision.kind === 'PIT') {
        if (accepted) {
          // Honour the compound the driver actually asked for, then box.
          feed.send({ type: 'SET_TYRE', driverId, compound: decision.compound });
          feed.send({ type: 'PIT_CALL', driverId });
        } else {
          feed.send({ type: 'CANCEL_PIT', driverId });
        }
      } else if (decision.kind === 'PUSH') {
        if (accepted) feed.send({ type: 'PUSH_MODE', driverId, enabled: true });
      } else if (decision.kind === 'BOOST') {
        if (accepted) feed.send({ type: 'ERS_BOOST', driverId, enabled: true });
      }

      const current = snapshotRef.current ?? snapshot;
      const reply = brain.answer(message.driverId, accepted, current);
      if (reply) setRadio((log) => [reply, ...log].slice(0, RADIO_LOG_CAP));
    },
    [radio, feed, brain, snapshot],
  );

  const carOf = useCallback(
    (driverId: string) => snapshot.cars.find((car) => car.driverId === driverId),
    [snapshot],
  );

  const value = useMemo<RaceContextValue>(
    () => ({
      snapshot,
      circuit,
      feedSource: feed.source,
      feedStatus,
      motion,
      activeOvertakes,
      send,
      focusedDriverId,
      setFocusedDriverId,
      carOf,
      radio,
      radioRequests,
      answerRadio,
    }),
    [
      snapshot,
      circuit,
      feed.source,
      feedStatus,
      motion,
      activeOvertakes,
      send,
      focusedDriverId,
      carOf,
      radio,
      radioRequests,
      answerRadio,
    ],
  );

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>;
}
