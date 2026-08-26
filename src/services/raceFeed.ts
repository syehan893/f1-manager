import { createRaceEngine } from '@/engine/raceEngine';
import type {
  CarState,
  Circuit,
  Driver,
  FeedSource,
  FeedStatus,
  OvertakeEvent,
  RaceCommand,
  RaceState,
  TyreCompound,
} from '@/types';

/* =====================================================================
 * Race feed — the seam between the UI and the data producer.
 *
 * The whole app talks to this interface and nothing else. Swapping the
 * local simulation for a Node/Express WebSocket service means changing
 * which factory `createRaceFeed()` returns; no component changes.
 *
 * Two subscription channels, deliberately:
 *   • onFrame    — ~60Hz, drives MotionValues for the cars on the map.
 *                  The payload is a LIVE object: read it, never store it.
 *   • onSnapshot — throttled immutable copies for React state. Tables,
 *                  charts and panels render from these.
 * ===================================================================== */

export interface RaceFeed {
  readonly source: FeedSource;
  getStatus(): FeedStatus;
  getSnapshot(): RaceState;
  onFrame(listener: (state: RaceState) => void): () => void;
  onSnapshot(listener: (snapshot: RaceState) => void): () => void;
  onOvertake(listener: (event: OvertakeEvent) => void): () => void;
  onStatus(listener: (status: FeedStatus) => void): () => void;
  send(command: RaceCommand): void;
  start(): void;
  stop(): void;
}

/** React state must never alias engine-owned objects. */
export function cloneRaceState(state: RaceState): RaceState {
  const telemetry: RaceState['telemetry'] = {};
  for (const key of Object.keys(state.telemetry)) {
    telemetry[key] = state.telemetry[key]!.slice();
  }

  return {
    ...state,
    weather: { ...state.weather },
    cars: state.cars.map(
      (car): CarState => ({ ...car, tyre: { ...car.tyre } }),
    ),
    overtakes: state.overtakes.slice(),
    incidents: state.incidents.slice(),
    telemetry,
  };
}

function createEmitter<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    add(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value: T) {
      for (const listener of listeners) listener(value);
    },
    get size() {
      return listeners.size;
    },
  };
}

/* ------------------------- local simulation feed ---------------------- */

export interface LocalFeedOptions {
  circuit: Circuit;
  drivers: Driver[];
  seed?: number;
  startLap?: number;
  /** Overrides the circuit's championship distance. */
  totalLaps?: number;
  scriptedPass?: { overtakerId: string; overtakenId: string };
  /** Compound each car starts on, chosen on the strategy screen. */
  startingTyres?: Record<string, TyreCompound>;
  /** Per-car reliability rating, driving power-unit wear and failures. */
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
  /** How often an immutable snapshot is published to React (ms). */
  snapshotIntervalMs?: number;
}

export function createLocalSimulationFeed(options: LocalFeedOptions): RaceFeed {
  const engine = createRaceEngine(options);
  const snapshotInterval = options.snapshotIntervalMs ?? 200;

  const frames = createEmitter<RaceState>();
  const snapshots = createEmitter<RaceState>();
  const overtakes = createEmitter<OvertakeEvent>();
  const statuses = createEmitter<FeedStatus>();

  let rafId: number | null = null;
  let lastFrameTime = 0;
  let sinceSnapshot = 0;
  let status: FeedStatus = 'IDLE';
  let snapshot = cloneRaceState(engine.getState());

  const setStatus = (next: FeedStatus) => {
    if (status === next) return;
    status = next;
    statuses.emit(next);
  };

  const tick = (now: number) => {
    rafId = requestAnimationFrame(tick);

    const live = engine.getState();
    const rawDelta = lastFrameTime === 0 ? 16.7 : now - lastFrameTime;
    lastFrameTime = now;

    // Real elapsed time scaled by the session speed control.
    const simDelta = Math.min(rawDelta, 100) * live.speedMultiplier;
    if (simDelta > 0) engine.step(simDelta);

    frames.emit(live);

    for (const event of engine.drainEvents()) overtakes.emit(event);

    sinceSnapshot += rawDelta;
    if (sinceSnapshot >= snapshotInterval) {
      sinceSnapshot = 0;
      snapshot = cloneRaceState(live);
      snapshots.emit(snapshot);
    }
  };

  return {
    source: 'local-sim',
    getStatus: () => status,
    getSnapshot: () => snapshot,
    onFrame: frames.add,
    onSnapshot: snapshots.add,
    onOvertake: overtakes.add,
    onStatus: statuses.add,
    send: (command) => {
      engine.applyCommand(command);
      // Reflect control changes immediately rather than waiting a tick.
      snapshot = cloneRaceState(engine.getState());
      snapshots.emit(snapshot);
    },
    start() {
      if (rafId != null) return;
      setStatus('LIVE');
      lastFrameTime = 0;
      rafId = requestAnimationFrame(tick);
    },
    stop() {
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      setStatus('IDLE');
    },
  };
}

/* --------------------------- websocket feed --------------------------- */

interface ServerMessage {
  type: 'snapshot' | 'frame' | 'overtake';
  payload: unknown;
}

/**
 * Drop-in replacement backed by a Node/Express + ws service.
 *
 * Expected protocol (server -> client), newline-free JSON frames:
 *   { "type": "snapshot", "payload": RaceState }
 *   { "type": "frame",    "payload": RaceState }
 *   { "type": "overtake", "payload": OvertakeEvent }
 *
 * Client -> server is simply `RaceCommand` serialised as JSON.
 */
export function createWebSocketFeed(url: string, fallback: RaceState): RaceFeed {
  const frames = createEmitter<RaceState>();
  const snapshots = createEmitter<RaceState>();
  const overtakes = createEmitter<OvertakeEvent>();
  const statuses = createEmitter<FeedStatus>();

  let socket: WebSocket | null = null;
  let status: FeedStatus = 'IDLE';
  let snapshot = fallback;
  let retryDelay = 1_000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closedByUser = false;

  const setStatus = (next: FeedStatus) => {
    if (status === next) return;
    status = next;
    statuses.emit(next);
  };

  function connect() {
    setStatus(retryDelay === 1_000 ? 'CONNECTING' : 'RECONNECTING');
    socket = new WebSocket(url);

    socket.onopen = () => {
      retryDelay = 1_000;
      setStatus('LIVE');
    };

    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case 'frame':
          frames.emit(message.payload as RaceState);
          break;
        case 'snapshot':
          snapshot = message.payload as RaceState;
          frames.emit(snapshot);
          snapshots.emit(snapshot);
          break;
        case 'overtake':
          overtakes.emit(message.payload as OvertakeEvent);
          break;
        default:
          break;
      }
    };

    socket.onerror = () => setStatus('ERROR');

    socket.onclose = () => {
      socket = null;
      if (closedByUser) return;
      setStatus('RECONNECTING');
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    };
  }

  return {
    source: 'websocket',
    getStatus: () => status,
    getSnapshot: () => snapshot,
    onFrame: frames.add,
    onSnapshot: snapshots.add,
    onOvertake: overtakes.add,
    onStatus: statuses.add,
    send: (command) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(command));
    },
    start() {
      closedByUser = false;
      if (!socket) connect();
    },
    stop() {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      socket = null;
      setStatus('IDLE');
    },
  };
}

/* ------------------------------ factory ------------------------------- */

/**
 * Selects the transport. Set `VITE_RACE_WS_URL` in `.env` to point the
 * dashboard at a real backend; without it the local simulation runs.
 */
export function createRaceFeed(options: LocalFeedOptions): RaceFeed {
  const url = import.meta.env.VITE_RACE_WS_URL as string | undefined;
  if (url) {
    const seedFeed = createLocalSimulationFeed(options);
    return createWebSocketFeed(url, seedFeed.getSnapshot());
  }
  return createLocalSimulationFeed(options);
}
