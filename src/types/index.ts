/* =====================================================================
 * Domain model for the Motorsport Manager simulation.
 *
 * These interfaces are the contract between the UI and whatever is
 * producing race data. Today that producer is a local deterministic
 * simulation (`src/engine/raceEngine.ts`); tomorrow it can be a
 * Node/Express + WebSocket service emitting the exact same shapes.
 * No component reads the engine directly — everything goes through
 * `RaceFeed` (see `src/services/raceFeed.ts`).
 * ===================================================================== */

export type TyreCompound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTER' | 'WET';

export type DriverStatus =
  | 'LAPPING'
  /** Down the pit lane on the limiter, heading for the box. */
  | 'PIT_ENTRY'
  /** Stationary in the box with the wheel guns on it. */
  | 'IN_PIT'
  /** Released, running the rest of the pit lane back to the track. */
  | 'PIT_EXIT'
  | 'OUT_LAP'
  | 'RETIRED';

export type SessionState = 'GRID' | 'RUNNING' | 'PAUSED' | 'FINISHED';

export type WeatherKind = 'DRY' | 'CLOUDY' | 'LIGHT_RAIN' | 'HEAVY_RAIN';

export type FlagState =
  | 'GREEN'
  | 'YELLOW'
  /** Virtual safety car: the field is neutralised without a physical car. */
  | 'VSC'
  | 'SAFETY_CAR'
  | 'RED'
  | 'CHEQUERED';

/* ------------------------------- People ------------------------------ */

/**
 * What a driver is made of. Split deliberately into three groups, because
 * they age in different directions and that is most of what makes a grid
 * of twenty-two people feel like people rather than like one number each.
 *
 *   raw speed   arrives young, and is the first thing to go
 *   wheel-to-wheel and race management  are learned, and hold up far longer
 *   the rest    sit somewhere between the two
 *
 * A nineteen-year-old is quick and hopeless at defending; a forty-year-old
 * has lost half a second a lap and will still not let you past.
 */
export interface DriverAttributes {
  /* --- raw speed: peaks in the mid-twenties, declines first --------- */
  pace: number; // 0-100 raw single-lap speed
  cornering: number;
  braking: number;
  /** Reflexes off the line. The first thing age takes. */
  reaction: number;

  /* --- wheel to wheel: learned, and slow to fade -------------------- */
  /** Executing a pass: commitment, placement, making it stick. */
  attack: number;
  /** Holding a position under pressure without losing time doing it. */
  defence: number;
  /** Judgement in traffic — when to commit, when to let it go. */
  racecraft: number;

  /* --- managing a race --------------------------------------------- */
  consistency: number;
  /** Making a set of tyres last without giving up the lap time. */
  tyreManagement: number;
  /** Holding the pace to the flag rather than fading in the last third. */
  stamina: number;

  /* --- conditions and the team -------------------------------------- */
  wetWeather: number;
  /** Getting up to speed on an unfamiliar car or circuit. Youth helps. */
  adaptability: number;
  /** Quality of technical feedback — what the engineers can act on. */
  feedback: number;
}

export interface Contract {
  salaryPerSeason: number;
  expiresAfterSeason: number;
  buyoutClause: number;
  bonusPerWin: number;
}

export interface Driver {
  id: string;
  code: string; // 3-letter TV code, e.g. "GAR"
  firstName: string;
  lastName: string;
  teamId: string;
  countryCode: string; // ISO-3166-1 alpha-2, drives the flag swatch
  country: string;
  carNumber: number;
  age: number;
  attributes: DriverAttributes;
  morale: number; // 0-100
  fitness: number; // 0-100
  contract: Contract;
}

/* Staff live in `@/data/staff` and `@/game/staffing`: the roles, the
 * market they are hired from, and what each appointment actually does. */

export interface Team {
  id: string;
  name: string;
  shortName: string;
  color: string; // primary livery colour (hex)
  isUserTeam: boolean;
}

/* ------------------------------- Circuit ----------------------------- */

export interface Point {
  x: number;
  y: number;
}

export interface CornerMarker {
  /** 0-1 position along the racing line. */
  progress: number;
  label: string;
  /** Pixel nudge so labels do not collide with the track ribbon. */
  offset?: Point;
}

export interface TrackZone {
  /** 0-1 start/end along the racing line. */
  start: number;
  end: number;
  label: string;
}

export interface Circuit {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  /** Anchor points converted to a smooth closed Catmull-Rom spline. */
  anchors: Point[];
  /** Pit lane anchors (open spline: entry -> box -> exit). */
  pitAnchors: Point[];
  /** Where the pit lane detaches from / rejoins the racing line (0-1). */
  pitEntryProgress: number;
  pitExitProgress: number;
  /** Tightly framed around the layout, including corner labels. */
  viewBox: { x: number; y: number; width: number; height: number };
  lengthKm: number;
  laps: number;
  baseLapTimeMs: number;
  lapRecordMs: number;
  lapRecordHolder: string;
  corners: CornerMarker[];
  drsZones: TrackZone[];
  /** Sector boundaries as 0-1 progress, ascending. */
  sectorSplits: [number, number];
  startFinishProgress: number;
}

/* ------------------------------ Race state --------------------------- */

export interface TyreState {
  compound: TyreCompound;
  ageLaps: number;
  /** 0 = new, 100 = fully worn. */
  wearPct: number;
  temperatureC: number;
}

export interface CarState {
  driverId: string;
  position: number;
  /** 0-1 around the racing line — this is what drives the SVG dot. */
  lapProgress: number;
  lap: number;
  /** Laps completed + lapProgress; the canonical race-order value. */
  raceDistance: number;
  gapToLeaderMs: number;
  gapToAheadMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  currentLapMs: number;
  tyre: TyreState;
  /**
   * The compound the crew will bolt on at this car's next stop. The pit
   * wall's selector reads this rather than keeping a copy of its own, so
   * what the screen says and what the crew is holding cannot drift apart
   * — which they used to, every time a car came in.
   */
  nextCompound: TyreCompound;
  /** True while a stop is called for but not yet being served. */
  pitRequested: boolean;
  fuelKg: number;
  status: DriverStatus;
  pitStops: number;
  /** 0-1 through the pit lane while serving a stop. */
  pitProgress: number;
  /** True while the driver is in push/attack mode (tyre and engine cost). */
  attacking: boolean;
  /** True while the manual override is deployed (energy cost). */
  boosting: boolean;
  ersPct: number;
  /** 0 = fresh, 100 = failure imminent. Grows with laps, push and boost. */
  engineWearPct: number;
  /** Cumulative laps the driver has spent in push mode. */
  pushLaps: number;
}

export interface OvertakeEvent {
  id: string;
  lap: number;
  /** Session clock in ms when it happened. */
  atMs: number;
  overtakerId: string;
  overtakenId: string;
  positionGained: number;
  cornerLabel: string;
  /** Racing-line progress (0-1) where the pass happened, so the UI can
   *  place the marker without the engine knowing anything about pixels. */
  atProgress: number;
}

export interface RaceIncident {
  id: string;
  lap: number;
  atMs: number;
  kind:
    | 'PIT_STOP'
    | 'FASTEST_LAP'
    | 'FLAG'
    | 'RETIREMENT'
    | 'RADIO'
    | 'OVERTAKE'
    | 'MECHANICAL';
  driverId?: string;
  message: string;
}

export interface TelemetrySample {
  /** Session clock in ms. */
  t: number;
  lap: number;
  tyreWearPct: number;
  fuelKg: number;
  speedKph: number;
  throttlePct: number;
  brakePct: number;
}

export interface Telemetry {
  driverId: string;
  samples: TelemetrySample[];
}

export interface Weather {
  kind: WeatherKind;
  /**
   * How much water is on the track, 0 (bone dry) to 1 (standing water).
   * This is the number the tyre model actually reads — `kind` is what the
   * player is told, `wetness` is what the car feels.
   */
  wetness: number;
  airTempC: number;
  trackTempC: number;
  humidityPct: number;
  rainChancePct: number;
  windKph: number;
}

export interface RaceState {
  sessionId: string;
  circuitId: string;
  lap: number;
  totalLaps: number;
  /**
   * Multiplier on tyre wear per lap. A shortened race compresses the
   * same stint story into fewer laps, so a 25% distance still has a
   * pit-stop decision in it rather than running start to finish on one
   * set. 1 is a full-distance race.
   */
  tyreWearScale: number;
  sessionState: SessionState;
  flag: FlagState;
  /**
   * Laps of neutralisation still to run under VSC or safety car. 0 under
   * a green flag. The pit wall reads this to decide whether a cheap stop
   * is still available.
   */
  neutralisedLapsRemaining: number;
  /** 0 = paused, 1 = real time, 3 = 3x. */
  speedMultiplier: number;
  /** Simulated session clock in ms. */
  elapsedMs: number;
  weather: Weather;
  cars: CarState[];
  /** Newest first, capped. */
  overtakes: OvertakeEvent[];
  incidents: RaceIncident[];
  telemetry: Record<string, TelemetrySample[]>;
}

/* --------------------------- Feed transport -------------------------- */

/** Commands the UI can push back to the simulation / backend. */
export type RaceCommand =
  | { type: 'SET_SPEED'; multiplier: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'PIT_CALL'; driverId: string }
  | { type: 'SET_TYRE'; driverId: string; compound: TyreCompound }
  | { type: 'PUSH_MODE'; driverId: string; enabled: boolean }
  /** Cancel a queued pit stop — the "stay out" call. */
  | { type: 'CANCEL_PIT'; driverId: string }
  /** Live condition update, so a driver's state can change mid-race. */
  | {
      type: 'SET_CONDITION';
      driverId: string;
      paceFactor: number;
      errorMultiplier: number;
      tyreMultiplier: number;
      aggression: number;
    }
  /** Retire the car from the session — a pit-wall decision, not a failure. */
  | { type: 'RETIRE_CAR'; driverId: string }
  /** Manual override boost: dumps stored energy for a short burst. */
  | { type: 'ERS_BOOST'; driverId: string; enabled: boolean };

export type FeedSource = 'local-sim' | 'websocket';

export type FeedStatus = 'IDLE' | 'CONNECTING' | 'LIVE' | 'RECONNECTING' | 'ERROR';

/* ------------------------------ Meta / R&D --------------------------- */

export type PartCategory =
  | 'CHASSIS'
  | 'FRONT_WING'
  | 'REAR_WING'
  | 'ENGINE'
  | 'SUSPENSION'
  | 'BRAKES';

export interface CarPart {
  id: string;
  name: string;
  category: PartCategory;
  /** 0-100 design completion. */
  progressPct: number;
  /** Expected lap-time delta in seconds (negative = faster). */
  expectedDeltaS: number;
  costTotal: number;
  costSpent: number;
  etaRaces: number;
  reliabilityPct: number;
  status: 'CONCEPT' | 'DESIGNING' | 'MANUFACTURING' | 'FITTED';
  assignedStaffIds: string[];
}

export interface ConstructorStanding {
  teamId: string;
  position: number;
  points: number;
  wins: number;
  delta: number; // position change vs last round
}

export interface DriverStanding {
  driverId: string;
  position: number;
  points: number;
  wins: number;
  podiums: number;
  delta: number;
}

export interface InboxMessage {
  id: string;
  from: string;
  subject: string;
  preview: string;
  receivedAt: string;
  unread: boolean;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  category: 'BOARD' | 'ENGINEERING' | 'MEDIA' | 'DRIVER' | 'SPONSOR';
}

export interface StintPlan {
  compound: TyreCompound;
  plannedLaps: number;
}

export interface StrategyPlan {
  driverId: string;
  stints: StintPlan[];
  pushLevel: number; // 1-5
}

export type ViewId =
  /* Race weekend */
  | 'team'
  | 'drivers'
  | 'car-dev'
  | 'race-strategy'
  | 'sponsors'
  | 'staff'
  | 'history'
  | 'pitwall'
  /* Career game */
  | 'game-season'
  /* Career mode */
  | 'career-season'
  | 'career-market'
  | 'career-youth'
  | 'career-rnd'
  | 'career-calendar'
  | 'career-mail'
  | 'career-social'
  /* Account */
  | 'settings'
  | 'profile';
