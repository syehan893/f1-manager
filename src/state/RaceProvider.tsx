import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motionValue } from 'framer-motion';
import { SUZUKA } from '@/data/circuits';
import { DRIVERS } from '@/data/drivers';
import { createRaceFeed } from '@/services/raceFeed';
import { createRadioBrain } from '@/game/driverRadio';
import type { RaceWeather } from '@/game/weather';
import type { PitWallCall, RadioMessage } from '@/game/driverRadio';
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
  /** Per-car condition effects, from mood, stress, morale and fitness. */
  condition?: Record<
    string,
    { paceFactor: number; errorMultiplier: number; tyreMultiplier: number; aggression: number }
  >;
  /** Per-car push level from the strategy screen. */
  pushLevel?: Record<string, number>;
  /** The sky for this race. Omitted means a dry session. */
  weather?: RaceWeather;
  /** How a driver is feeling, so the radio can speak in their voice. */
  emotionOf?: (driverId: string) => string;
  /** Fired when something in the race should move a driver's condition. */
  onConditionEvent?: (driverId: string, event: string) => void;
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
  condition,
  pushLevel,
  weather,
  emotionOf,
  onConditionEvent,
  onFinished,
}: RaceProviderProps) {
  /* ---- a session is immutable once it has started -------------------
   * Every input here is derived from the save, so a *new object identity*
   * appears on every single dispatch — the grid array, the circuit, the
   * per-car maps, all of them. If any of that reached the feed's or the
   * brain's dependency list, an action taken during a race would tear the
   * engine down and start the race again from lights out. A condition
   * event a couple of seconds after the lights is enough to do it.
   *
   * So the whole session is captured once, at construction, and nothing
   * can rebuild it. Starting a *different* race is a remount — the owner
   * passes a `key` — which is the only honest way to say "new session".
   * Anything that genuinely has to change mid-race goes in as a command:
   * see `SET_CONDITION` below.
   * ------------------------------------------------------------------ */
  const [session] = useState(() => ({
    circuit,
    drivers,
    seed,
    startLap,
    totalLaps,
    scriptedPass,
    aiSkill,
    aiStrategyVariance,
    aiRacecraft,
    startingTyres,
    reliability,
    manualPitDriverIds,
    carPace,
    pitCrew,
    tyreCare,
    condition,
    pushLevel,
    weather,
    focusDriverId,
    radioDriverIds,
  }));

  const feed = useMemo(
    () =>
      createRaceFeed({
        circuit: session.circuit,
        drivers: session.drivers,
        seed: session.seed,
        startLap: session.startLap,
        totalLaps: session.totalLaps,
        scriptedPass: session.scriptedPass ?? undefined,
        aiSkill: session.aiSkill,
        aiStrategyVariance: session.aiStrategyVariance,
        aiRacecraft: session.aiRacecraft,
        startingTyres: session.startingTyres,
        reliability: session.reliability,
        manualPitDriverIds: session.manualPitDriverIds,
        carPace: session.carPace,
        pitCrew: session.pitCrew,
        tyreCare: session.tyreCare,
        condition: session.condition,
        pushLevel: session.pushLevel,
        weather: session.weather,
      }),
    [session],
  );

  const motion = useMemo(() => {
    const map = new Map<string, CarMotion>();
    for (const driver of session.drivers) {
      map.set(driver.id, {
        progress: motionValue(0),
        pitProgress: motionValue(0),
        inPit: motionValue(0),
      });
    }
    return map;
  }, [session]);

  const [snapshot, setSnapshot] = useState<RaceState>(() => feed.getSnapshot());
  const [feedStatus, setFeedStatus] = useState<FeedStatus>(() => feed.getStatus());
  const [activeOvertakes, setActiveOvertakes] = useState<OvertakeEvent[]>([]);
  const [focusedDriverId, setFocusedDriverId] = useState<string>(
    () => session.focusDriverId ?? session.drivers[0]?.id ?? SCRIPTED_PASS.overtakerId,
  );

  const [radio, setRadio] = useState<RadioMessage[]>([]);
  /** Requests the pit wall has already ruled on. */
  const [answered, setAnswered] = useState<Set<string>>(() => new Set());

  /* The radio brain listens to the same snapshots React renders from. It
   * is per-session state, not per-render, so it lives in a ref keyed to
   * the feed it is listening to. */
  /* The brain holds a whole race worth of memory: what each driver has
   * already said, what has been refused, how long they have been stuck.
   * Rebuilding it throws all of that away and empties the radio log, so
   * it must not depend on callbacks whose identity changes.
   *
   * Callers derive `emotionOf` from the save, so it is a new function on
   * every dispatch. The latest one is held in a ref and reached through a
   * stable wrapper, which keeps the brain alive for the whole session. */
  const brain = useMemo(
    () =>
      createRadioBrain({
        drivers: session.drivers,
        focusDriverIds:
          session.radioDriverIds ?? (session.focusDriverId ? [session.focusDriverId] : []),
        seed: session.seed,
      }),
    [session],
  );

  /* The callers derive these from the save, so they are new functions on
   * every action. Handing them to the brain through a setter keeps the
   * brain — and with it the whole session's radio memory — alive. */
  useEffect(() => {
    brain.setHooks({ emotionOf, onConditionEvent });
  }, [brain, emotionOf, onConditionEvent]);

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

  /* Condition moves during a race — the pit wall talks a driver down, or
   * winds them up, and Sunday itself does the rest. Each change is sent
   * to the running engine as a command so it lands without a rebuild. */
  const lastCondition = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!condition) return;
    for (const [driverId, effects] of Object.entries(condition)) {
      const signature = JSON.stringify(effects);
      if (lastCondition.current[driverId] === signature) continue;
      lastCondition.current[driverId] = signature;
      feed.send({ type: 'SET_CONDITION', driverId, ...effects });
    }
  }, [condition, feed]);

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

  /** The pit wall speaking first, rather than only answering. */
  const callDriver = useCallback(
    (driverId: string, pitCall: PitWallCall) => {
      const current = snapshotRef.current ?? snapshot;
      const reply = brain.call(driverId, pitCall, current);
      if (reply) setRadio((log) => [reply, ...log].slice(0, RADIO_LOG_CAP));
    },
    [brain, snapshot],
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
      circuit: session.circuit,
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
      callDriver,
    }),
    [
      snapshot,
      session,
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
      callDriver,
    ],
  );

  return <RaceContext.Provider value={value}>{children}</RaceContext.Provider>;
}
