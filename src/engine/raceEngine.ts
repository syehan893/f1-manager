import type {
  CarState,
  Circuit,
  Driver,
  DriverStatus,
  OvertakeEvent,
  RaceCommand,
  RaceIncident,
  RaceState,
  TelemetrySample,
  TyreCompound,
} from '@/types';

/* =====================================================================
 * Deterministic race simulation.
 *
 * Pure TypeScript: no DOM, no React, no timers of its own. The host
 * decides when to `step()`. That makes it equally runnable in the
 * browser (today) or inside a Node/Express worker pushing snapshots
 * over a WebSocket (later) — the output shape is identical either way.
 * ===================================================================== */

/* ----------------------------- tuning ------------------------------- */

export const TYRE_MODEL: Record<
  TyreCompound,
  { paceFactor: number; wearPerLap: number; warmupLaps: number }
> = {
  SOFT: { paceFactor: 0.9855, wearPerLap: 4.4, warmupLaps: 1 },
  MEDIUM: { paceFactor: 1.0, wearPerLap: 2.9, warmupLaps: 2 },
  HARD: { paceFactor: 1.0125, wearPerLap: 2.0, warmupLaps: 3 },
  INTER: { paceFactor: 1.055, wearPerLap: 3.4, warmupLaps: 1 },
  WET: { paceFactor: 1.12, wearPerLap: 2.6, warmupLaps: 1 },
};

/* --- the pit stop ---------------------------------------------------- *
 * A stop is three distinct things, and modelling it as one linear crawl
 * made it far too cheap: the car covered a tenth of a lap of distance in
 * the time it took, so the net loss came out around twelve seconds when
 * a real stop costs a driver north of twenty.
 *
 * Now it is split the way the real thing is:
 *
 *   APPROACH   entry line to the box, decelerating onto the limiter
 *   STATIONARY the car is *stopped* — this is the only part the pit crew
 *              rating can change, and it is where the tyres go on
 *   EXIT       box to the exit line, back up to speed
 *
 * The distance covered is deliberately small relative to the time taken,
 * which is what makes the stop expensive. Net loss works out at roughly
 * twenty-one seconds for a good crew on a ninety-second lap.
 * -------------------------------------------------------------------- */
/** Fraction of a lap between the pit entry and pit exit lines. */
const PIT_LAP_SPAN = 0.08;
/** Where the box sits along the pit lane, as a fraction of it. */
const PIT_BOX_POSITION = 0.55;
/** Entry line to the box: braking, the limiter, and the lollipop. */
const PIT_APPROACH_MS = 15_500;
/** Box to the exit line: release, limiter, and back up to speed. */
const PIT_EXIT_MS = 11_000;
/** Stationary time for a perfect crew, and for a poor one. */
const PIT_STOP_BEST_MS = 1_950;
const PIT_STOP_WORST_MS = 4_600;
/** A slow wheel gun costs this much on top, when it happens. */
const PIT_FUMBLE_MS = 2_600;

/* --- virtual safety car ----------------------------------------------- *
 * A car stopping on track neutralises the race. Under VSC every driver
 * has to run to a delta, so the whole field slows by the same proportion
 * and the gaps between them barely move.
 *
 * The strategic consequence is the entire point, and it falls out of the
 * model rather than being special-cased: a pit stop costs the same number
 * of seconds whatever the flag, but those seconds are worth far less when
 * the cars you are racing are also crawling. Boxing under VSC is close to
 * free, and spotting that window is a real call for the pit wall.
 * -------------------------------------------------------------------- */
/** Lap-time multiplier while the race is neutralised. */
const VSC_PACE_FACTOR = 1.4;
/** Chance a car stopping on track brings out the VSC. */
const VSC_TRIGGER_CHANCE = 0.55;
/** How long a neutralisation runs, in laps. */
const VSC_MIN_LAPS = 2;
const VSC_MAX_LAPS = 3;
/** No VSC inside the last few laps — the race is left to finish. */
const VSC_ENDGAME_GUARD_LAPS = 2;
const FUEL_BURN_PER_LAP = 1.92;
const DRS_GAIN = 0.0062;
const PUSH_GAIN = 0.0115;
/**
 * The two attack modes cost different resources, which is what separates
 * them on the pit wall:
 *
 *   PUSH  — a driving style. Moderate gain, paid for in rubber, fuel and
 *           engine life. Runs until the pit wall lifts it or the tyres
 *           give up, so it is the tool for a long stint-length offensive.
 *   BOOST — a deployment mode. Much bigger gain, paid for out of the
 *           energy store alone. It empties the battery in well under a
 *           lap and switches itself off, so it is the tool for one move.
 */
const BOOST_GAIN = 0.021;
/** Store drain per lap while the override is held open. */
const BOOST_ERS_DRAIN = 210;
/** Below this the store cannot deliver and the override drops out. */
const BOOST_CUTOFF_PCT = 4;
/**
 * Arming needs more charge than holding does. Without the gap a store
 * that has just emptied can be re-armed the instant it recovers a
 * fraction of a percent, which is neither useful nor believable.
 */
const BOOST_ARM_MIN_PCT = 12;
const PUSH_ERS_DRAIN = 55;
const PUSH_WEAR_MULTIPLIER = 1.45;

/* --- wheel to wheel ---------------------------------------------------- *
 * Overtaking used to be arithmetic: the quicker car arrived, the slower
 * car moved over. There was no contest in it, so a great defensive driver
 * was worth exactly nothing and a race was decided entirely by the car.
 *
 * Now a car within striking distance is in a *duel*. The defender's line
 * costs the attacker time, and how much depends on defence against attack.
 * A strong defender can hold a quicker car for laps; a weak one is passed
 * on sight. And a defender under sustained pressure eventually makes a
 * mistake, which is what breaks the stalemate rather than a coin flip.
 * -------------------------------------------------------------------- */
/**
 * Worst-case lap time a perfect defender costs a hopeless attacker, as a
 * fraction of a lap. Roughly half a second on a ninety-second lap — which
 * is about what dirty air plus a defensive line is worth in reality, and
 * small enough that a genuinely quicker car still gets the job done.
 */
const DEFENCE_MAX_PENALTY = 0.006;
/** Range at which a duel is on at all. */
const DUEL_RANGE_MS = 1_400;
/** Per-lap chance a defender under pressure gives the position away. */
const DEFENDER_ERROR_PER_LAP = 0.13;
/** Defending costs the defender time too — it is not a free action. */
const DEFENCE_SELF_COST = 0.0016;

/** How much tyre management moves the wear rate, either way. */
const TYRE_SKILL_SWING = 0.26;
/** Lap-time spread a maximally inconsistent driver adds. */
const CONSISTENCY_NOISE = 0.011;
/** Pace lost in the closing third by a driver with no stamina. */
const STAMINA_FADE = 0.009;
/** Lap-time swing between the best and worst launch off the line. */
const LAUNCH_SWING = 0.021;
const PUSH_FUEL_MULTIPLIER = 1.14;
/** Push is refused above this wear — the driver simply has nothing left. */
const PUSH_TYRE_LIMIT_PCT = 96;

/* --- engine life ----------------------------------------------------- *
 * The principle: a power unit driven sensibly should finish the race, and
 * a power unit thrashed should not be relied on to.
 *
 * Cruising is deliberately gentle — a clean race consumes a modest slice
 * of the unit and never approaches the danger band. What consumes an
 * engine is aggression, so push and override carry the large multipliers,
 * and the failure roll is weighted again by the share of the race the car
 * has actually spent attacking. Two cars at the same 85% wear are not in
 * the same danger: the one that got there by being driven hard all
 * afternoon is markedly more likely to let go.
 *
 * Reliability pays twice — a better unit wears more slowly, so it reaches
 * the band later, and it rolls better once it is there.
 * -------------------------------------------------------------------- */
/** Per-lap consumption at full race distance, cruising, average unit. */
const ENGINE_WEAR_PER_LAP = 0.46;
const ENGINE_WEAR_PUSH_MULTIPLIER = 3.6;
const ENGINE_WEAR_BOOST_MULTIPLIER = 5.5;
/**
 * No failure roll happens below this. Set low enough that a car racing
 * hard for a whole afternoon crosses it — including the AI cars at the
 * top difficulties, which attack enough to consume an engine and have to
 * live with the same consequence the player does.
 */
const ENGINE_DANGER_PCT = 42;
/** Failure probability per lap at 100% wear, before the other weights. */
const ENGINE_FAILURE_PER_LAP = 0.065;
/** How much a race spent attacking multiplies the failure roll. */
const ENGINE_ABUSE_WEIGHT = 1.8;
/** Extra pace given to the scripted demo pass so it lands within ~10s. */
const SCRIPTED_PASS_GAIN = 0.028;
/** Smaller edge held briefly afterwards so the new order settles. */
const SCRIPTED_HOLD_GAIN = 0.012;
const SCRIPTED_HOLD_MS = 40_000;
const OVERTAKE_DEBOUNCE_MS = 6_000;
/** Two cars swapping repeatedly should report one move, not a stream. */
const OVERTAKE_PAIR_COOLDOWN_MS = 20_000;
/** A move is reported once the overtaker is clear by this margin. */
const OVERTAKE_CLEAR_MS = 25;
/** Side-by-side battles that never resolve are dropped after this long. */
const OVERTAKE_STALEMATE_MS = 15_000;
const TELEMETRY_INTERVAL_MS = 1_000;
const TELEMETRY_CAP = 90;
const MAX_EVENTS = 40;

/* --------------------------- deterministic RNG ----------------------- */

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------- private per-car data ---------------------- */

interface CarInternal {
  driverId: string;
  /** Multiplier on the base lap time — car + driver combined. */
  paceFactor: number;
  aggression: number;
  plannedPitLaps: number[];
  nextCompound: TyreCompound;
  pushMs: number;
  pushCooldownMs: number;
  /**
   * Set by the pit wall rather than by a timer. A latched mode stays on
   * until it is lifted or its resource runs out, which is what makes the
   * button on the pit wall a state rather than a nudge.
   */
  pushLatched: boolean;
  boostLatched: boolean;
  /** 0..1 — how quickly this car's power unit consumes itself. */
  engineStress: number;
  /** Rolled once per lap once wear enters the danger band. */
  engineChecked: number;
  outLapMs: number;
  pitTimerMs: number;
  /** Stationary time rolled for the stop currently being served. */
  pitStationaryMs: number;
  /** 0-1 how good this car's crew is, from the team's pit-crew rating. */
  crewQuality: number;
  /** Multiplier on this car's tyre wear, from setup and strategy work. */
  tyreCare: number;
  /**
   * This team's race plan, when the difficulty is high enough for teams
   * to have one of their own. -1 is a committed undercut, +1 is a long
   * first stint and an overcut.
   */
  stopBias: number;
  /** Softer (-1) or harder (+1) than the nominal next compound. */
  compoundBias: number;
  /** 0-1 how well this car manages what it has. */
  racecraft: number;
  /* --- the driver, as the race actually feels them ------------------ */
  /** 0-1 executing a pass. */
  attack: number;
  /** 0-1 holding a position. */
  defence: number;
  /** 0-1 judgement in traffic. */
  judgement: number;
  /** Multiplier on tyre wear from the driver's own hands. */
  tyreSkill: number;
  /** 0-1 lap-to-lap repeatability. */
  consistency: number;
  /** 0-1 holding pace to the flag. */
  stamina: number;
  /** 0-1 reflexes off the line. */
  reaction: number;
  /** Race-time this car has spent stuck behind the same driver. */
  duelMs: number;
  /** Who they are duelling, so pressure does not reset every tick. */
  duelTargetId: string | null;
  /** Guards the once-per-lap defender error roll. */
  errorCheckedLap: number;
  /** Pace advantage carried off the line, spent over the opening lap. */
  launchGain: number;
  /** Signed lap-time factor from how the driver is feeling. */
  moodPace: number;
  /** Multiplier on lap-to-lap scatter from stress and fatigue. */
  moodError: number;
  /** Multiplier on tyre wear from stress and how hard they are pushing. */
  moodTyre: number;
  /* The push-level terms, kept so a live condition update can recombine
   * them without needing to know what the strategy screen chose. */
  pushPace: number;
  pushTyre: number;
  pushEdge: number;
  /** Aggression from the driver alone, before mood and push. */
  baseAggression: number;
  lapNoise: number;
  lastOvertakeAtMs: number;
  /** Guards the single lap rollover that happens inside the pit lane. */
  pitLapCounted: boolean;
  /**
   * -1 while a car is still behind the start/finish line on the grid.
   * Without it, `lap + lapProgress` would rank a car sitting at progress
   * 0.99 a whole lap ahead of the pole-sitter at 0.00, and its first
   * crossing would award a lap it never ran.
   */
  gridOffset: number;
  /** Residual pace edge after the scripted pass, so the move sticks. */
  scriptedHoldMs: number;
  /** Drives the scripted demonstration pass (Garcia on Perez). */
  scriptedTargetId: string | null;
}

export interface RaceEngineOptions {
  circuit: Circuit;
  drivers: Driver[];
  seed?: number;
  /** Start the session part-way through, like a race already underway. */
  startLap?: number;
  /** Overtaker/overtaken pair guaranteed to happen shortly after start. */
  scriptedPass?: { overtakerId: string; overtakenId: string };
  /** Overrides the circuit's championship distance, e.g. a 25% race. */
  totalLaps?: number;
  /**
   * Compound each driver starts on. Anything not listed falls back to the
   * engine's own choice, so a strategy only has to cover the cars the
   * player actually runs.
   */
  startingTyres?: Record<string, TyreCompound>;
  /**
   * Per-car reliability rating (0-100). Drives how fast the power unit
   * consumes itself and how likely it is to let go — the payoff for
   * reliability spending on the R&D screen.
   */
  reliability?: Record<string, number>;
  /**
   * Cars the strategy AI will not pit on its own. These stop only when
   * the pit wall calls them in, which is what makes a driver's request to
   * box — and the decision to wave it off — mean anything at all.
   */
  manualPitDriverIds?: string[];
  /**
   * Overrides the automatic wear scaling derived from the race length.
   * Mostly useful for tests that want the unscaled tyre model.
   */
  tyreWearScale?: number;
  /**
   * Per-car package rating (0-100). Without this the race is decided by
   * driver skill alone and everything the player builds in R&D is
   * invisible on a Sunday.
   */
  carPace?: Record<string, number>;
  /**
   * 0-1. How hard the cars the player does *not* control race: their pace
   * edge, how readily they attack, and how well they time a stop. This is
   * the difficulty setting, and it deliberately touches only the AI.
   */
  aiSkill?: number;
  /**
   * Per-car pit-crew rating (0-100). This is the only thing that changes
   * how long a car is stationary, which is what makes the pit bay and the
   * pit-crew R&D line worth spending on.
   */
  pitCrew?: Record<string, number>;
  /**
   * Per-car multiplier on tyre wear. Below 1 the car looks after its
   * rubber better than the raw compound model says — what a strong
   * strategist and a good setup actually buy.
   */
  tyreCare?: Record<string, number>;
  /**
   * 0-1. How far rival teams diverge from the nominal race plan. At zero
   * every AI car runs the same stop window and the race is one-dimensional;
   * turned up, a slow car gambles on an undercut while a quick one covers.
   */
  aiStrategyVariance?: number;
  /**
   * 0-1. How well the AI looks after its tyres, spends its energy and
   * picks its moment to attack — the equivalent of a player answering
   * their driver's radio well.
   */
  aiRacecraft?: number;
  /**
   * Per-car condition effects, computed from mood, stress, morale and
   * fitness. This is what makes the same driver in the same car a
   * different proposition on two different Sundays.
   */
  condition?: Record<
    string,
    {
      paceFactor: number;
      errorMultiplier: number;
      tyreMultiplier: number;
      aggression: number;
    }
  >;
  /**
   * Per-car push level, 1-5, from the strategy screen. The pit wall's
   * standing instruction on how hard to race: it buys pace and attacking
   * intent, and it is paid for in tyres.
   */
  pushLevel?: Record<string, number>;
}

export interface RaceEngine {
  getState(): RaceState;
  step(dtMs: number): RaceState;
  applyCommand(cmd: RaceCommand): void;
  /** Events produced by the most recent `step` — consumed by the feed. */
  drainEvents(): OvertakeEvent[];
}

/* ------------------------------ helpers ------------------------------ */

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function nearestCornerLabel(circuit: Circuit, progress: number): string {
  let best = circuit.corners[0];
  let bestDist = Infinity;
  for (const c of circuit.corners) {
    let d = Math.abs(c.progress - progress);
    if (d > 0.5) d = 1 - d; // wrap
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best?.label ?? 'TRACK';
}

function inZone(progress: number, start: number, end: number): boolean {
  return start <= end
    ? progress >= start && progress <= end
    : progress >= start || progress <= end;
}

/* ------------------------------- engine ------------------------------ */

export function createRaceEngine(options: RaceEngineOptions): RaceEngine {
  const { circuit, drivers } = options;
  const rng = mulberry32(options.seed ?? 20260419);
  const startLap = options.startLap ?? 0;

  /* A standing start puts the field on the line; a mid-race join drops it
   * a third of the way round so the cars are visible on the map. */
  const START_PROGRESS = startLap === 0 ? 0 : 0.32;
  const raceLaps = options.totalLaps ?? circuit.laps;
  const manualPit = new Set(options.manualPitDriverIds ?? []);

  /* A 25%-distance race run on the full-distance tyre model never wears a
   * set out, which removes the pit stop — and with it the strategy — from
   * the shortest races. Compressing wear in proportion to the shortening
   * keeps one stop the normal answer at every race length. The cap stops
   * a very short sprint from turning into a three-stop. */
  const wearScale =
    options.tyreWearScale ?? clamp(circuit.laps / Math.max(1, raceLaps), 1, 3);

  const internals = new Map<string, CarInternal>();

  const pendingEvents: OvertakeEvent[] = [];
  /** Keyed by the unordered pair, to suppress A/B ping-pong. */
  const pairCooldown = new Map<string, number>();
  /** Swaps awaiting confirmation that the move actually stuck. */
  const provisional = new Map<
    string,
    {
      overtakerId: string;
      overtakenId: string;
      openedAtMs: number;
      positionGained: number;
      atProgress: number;
      cornerLabel: string;
      lap: number;
    }
  >();
  let telemetryClock = 0;
  let eventSeq = 0;

  /* --- initial grid ------------------------------------------------- */

  const aiSkill = clamp(options.aiSkill ?? 0.5, 0, 1);
  const strategyVariance = clamp(options.aiStrategyVariance ?? 0, 0, 1);
  const aiRacecraft = clamp(options.aiRacecraft ?? 0.5, 0, 1);

  /* ---- how a rival team decides to race ---------------------------- *
   * A grid where every car stops on the same lap is a procession, so at
   * the harder settings each team is given a plan of its own, and the
   * plan follows from its situation rather than from a die roll:
   *
   *   a slower car has nothing to lose and gambles on the undercut,
   *   a quicker car protects track position and covers,
   *   and a per-team seed keeps two similar cars from being identical.
   *
   * At Rookie and Pro the variance is near zero and the field converges
   * on one nominal window, which is the simpler race to read.
   * ------------------------------------------------------------------ */
  function strategyFor(packageRating: number) {
    if (strategyVariance <= 0) return { stopBias: 0, compoundBias: 0 };

    // Where this car sits against the field decides its appetite for risk.
    const relative = clamp((packageRating - 70) / 25, -1, 1);
    const seeded = rng() - 0.5;

    return {
      // Slow cars stop early and attack; quick cars extend and cover.
      stopBias: clamp((-relative * 0.7 + seeded * 0.9) * strategyVariance, -1, 1),
      // A car gambling on an undercut wants the softer tyre to do it on.
      compoundBias: clamp((relative * 0.6 + seeded * 0.8) * strategyVariance, -1, 1),
    };
  }
  /* The AI's pace edge, applied to every car the player does not run.
   * At Rookie the field is handed a small penalty; at Legend it is
   * genuinely quicker than the paper form suggests. */
  const aiPaceEdge = (aiSkill - 0.5) * 0.016;

  const cars: CarState[] = drivers.map((driver, index) => {
    const attrs = driver.attributes;
    // Blend of raw driver ability and a little car-dependent randomness.
    const skill =
      (attrs.pace * 0.42 +
        attrs.cornering * 0.26 +
        attrs.braking * 0.16 +
        attrs.consistency * 0.16) /
      100;

    /* The car is worth more than the driver over a race distance, which
     * is what makes development the point of the management game. 70 is
     * the neutral package; better than that is time, worse is time lost. */
    const packageRating = options.carPace?.[driver.id] ?? 70;
    const carDelta = (70 - packageRating) * 0.0016;

    const isAi = !manualPit.has(driver.id);

    /* How the driver is feeling, and how hard the pit wall has told them
     * to race. Both land on the same three levers — pace, mistakes and
     * tyres — because that is all a driver can actually change. */
    const condition = options.condition?.[driver.id] ?? {
      paceFactor: 0,
      errorMultiplier: 1,
      tyreMultiplier: 1,
      aggression: 0,
    };

    /* Push level 1-5, neutral at 3. Turning it up finds lap time and
     * eats the tyre for it; turning it down does the reverse. */
    const push = clamp(options.pushLevel?.[driver.id] ?? 3, 1, 5);
    const pushEdge = (push - 3) / 2;
    const pushPace = -pushEdge * 0.0032;
    const pushTyre = 1 + pushEdge * 0.22;
    const plan = isAi ? strategyFor(packageRating) : { stopBias: 0, compoundBias: 0 };
    const paceFactor =
      1 +
      (1 - skill) * 0.085 +
      carDelta +
      (isAi ? -aiPaceEdge : 0) +
      (rng() - 0.5) * 0.004;

    const compound: TyreCompound =
      options.startingTyres?.[driver.id] ??
      (index % 3 === 0 && index < 6 ? 'SOFT' : 'MEDIUM');

    // 50 reliability is the neutral car; 99 roughly halves the rate of
    // consumption, 20 roughly doubles it.
    const reliabilityRating = options.reliability?.[driver.id] ?? 62;
    const engineStress = clamp(1.6 - reliabilityRating / 100, 0.55, 1.5);
    const stintLap = 20 + Math.floor(rng() * 9);

    internals.set(driver.id, {
      driverId: driver.id,
      paceFactor,
      /* A harder AI commits to moves it would otherwise let go — and so
       * does a driver who is fired up, or who has been told to race. */
      aggression: clamp(
        (attrs.attack / 100) * (isAi ? 0.7 + aiSkill * 0.8 : 1) +
          condition.aggression * 0.35 +
          pushEdge * 0.3,
        0.05,
        1.6,
      ),
      // From lights out the stop is planned around 40% distance; joining a
      // race in progress keeps the original "box within a few laps" window.
      /* A stronger AI plans its stop closer to the real optimum and with
       * less scatter; a weak one guesses and loses time to it. On top of
       * that the team's own plan shifts the window either side of the
       * nominal one, which is what puts the field on different races. */
      plannedPitLaps: (options.manualPitDriverIds ?? []).includes(driver.id)
        ? []
        : startLap === 0
          ? [
              clamp(
                Math.round(raceLaps * (0.46 + plan.stopBias * 0.16)) +
                  Math.round((rng() - 0.5) * 2 * (1 + (1 - aiSkill) * 6)),
                3,
                Math.max(4, raceLaps - 3),
              ),
            ]
          : [startLap + 4 + Math.floor(rng() * 10), stintLap + 20],
      nextCompound:
        plan.compoundBias < -0.35
          ? 'SOFT'
          : plan.compoundBias > 0.35
            ? 'HARD'
            : rng() > 0.45
              ? 'HARD'
              : 'MEDIUM',
      pushMs: 0,
      pushCooldownMs: 0,
      pushLatched: false,
      boostLatched: false,
      engineStress,
      engineChecked: -1,
      outLapMs: 0,
      pitTimerMs: 0,
      pitStationaryMs: 0,
      crewQuality: clamp(((options.pitCrew?.[driver.id] ?? 70) - 40) / 59, 0, 1),
      tyreCare: clamp(options.tyreCare?.[driver.id] ?? 1, 0.7, 1.3),
      stopBias: plan.stopBias,
      compoundBias: plan.compoundBias,
      // A car the player runs has no AI racecraft: that is the player's job.
      racecraft: isAi ? aiRacecraft : 0,
      attack: attrs.attack / 100,
      defence: attrs.defence / 100,
      judgement: attrs.racecraft / 100,
      // A good tyre driver gets meaningfully more out of a set.
      tyreSkill: 1 + TYRE_SKILL_SWING * (0.5 - attrs.tyreManagement / 100) * 2,
      consistency: attrs.consistency / 100,
      stamina: attrs.stamina / 100,
      reaction: attrs.reaction / 100,
      duelMs: 0,
      duelTargetId: null,
      errorCheckedLap: -1,
      launchGain: 0,
      moodPace: condition.paceFactor + pushPace,
      moodError: condition.errorMultiplier,
      moodTyre: condition.tyreMultiplier * pushTyre,
      pushPace,
      pushTyre,
      pushEdge,
      baseAggression: (attrs.attack / 100) * (isAi ? 0.7 + aiSkill * 0.8 : 1),
      lapNoise: 0,
      lastOvertakeAtMs: -Infinity,
      pitLapCounted: false,
      gridOffset: 0,
      scriptedHoldMs: 0,
      scriptedTargetId: null,
    });

    // A standing start bunches the field on the grid; joining a race in
    // progress spreads it out into a running order.
    const fromGrid = startLap === 0;
    const gapSeconds = index === 0 ? 0 : fromGrid
      ? index * 0.22 + rng() * 0.06
      : 0.9 + index * 0.98 + rng() * 0.55;
    const lapFraction = (gapSeconds * 1000) / circuit.baseLapTimeMs;

    // A car whose grid slot wraps back past the line owes one lap.
    const behindLine = fromGrid && lapFraction > 0;
    if (behindLine) internals.get(driver.id)!.gridOffset = -1;

    return {
      driverId: driver.id,
      position: index + 1,
      lapProgress: (START_PROGRESS - lapFraction + 1) % 1,
      lap: startLap,
      raceDistance: startLap + START_PROGRESS - lapFraction,
      // (raceDistance is recomputed each tick as lap + progress + gridOffset)
      gapToLeaderMs: gapSeconds * 1000,
      gapToAheadMs: index === 0 ? 0 : 700 + rng() * 900,
      lastLapMs: circuit.baseLapTimeMs * paceFactor,
      bestLapMs: circuit.baseLapTimeMs * paceFactor * 0.996,
      currentLapMs: START_PROGRESS * circuit.baseLapTimeMs,
      tyre: {
        compound,
        ageLaps: fromGrid ? 0 : 6 + Math.floor(rng() * 6),
        wearPct: fromGrid ? 0 : 22 + rng() * 26,
        temperatureC: fromGrid ? 88 + rng() * 6 : 92 + rng() * 12,
      },
      fuelKg: Math.max(12, 110 - startLap * FUEL_BURN_PER_LAP + rng() * 3),
      status: 'LAPPING' as DriverStatus,
      pitStops: startLap > 12 ? 1 : 0,
      pitProgress: 0,
      attacking: false,
      boosting: false,
      ersPct: 55 + rng() * 40,
      // A mid-race join has already used part of the power unit.
      engineWearPct: fromGrid ? rng() * 4 : 18 + rng() * 22,
      pushLaps: 0,
    };
  });

  /* --- the start ----------------------------------------------------- *
   * Reaction has existed as an attribute since the first version and has
   * never done anything. A standing start is the one moment it decides
   * something.
   *
   * It is modelled as a pace advantage over the opening lap rather than
   * as an instant jump up the road: shifting a car's lap progress on the
   * grid can wrap it across the start/finish line, and the lap-counting
   * bookkeeping is anchored to which side of that line a car started on.
   */
  if (startLap === 0) {
    for (const driver of drivers) {
      const internal = internals.get(driver.id);
      if (!internal) continue;
      // −0.5 (asleep) .. +0.5 (away perfectly), with a little scatter.
      const launch = internal.reaction - 0.5 + (rng() - 0.5) * 0.35;
      // Worth up to about half a second over the first lap, either way.
      internal.launchGain = launch * LAUNCH_SWING;
    }
  }

  /* --- scripted demonstration pass ---------------------------------- */

  if (options.scriptedPass) {
    const { overtakerId, overtakenId } = options.scriptedPass;
    const chaser = cars.find((c) => c.driverId === overtakerId);
    const target = cars.find((c) => c.driverId === overtakenId);
    const chaserInternal = internals.get(overtakerId);

    if (chaser && target && chaserInternal) {
      // Line the chaser up ~0.65s behind, in DRS range, and arm the script.
      chaserInternal.scriptedTargetId = overtakenId;
      chaser.lapProgress = (target.lapProgress - 0.005 + 1) % 1;
      chaser.raceDistance = target.raceDistance - 0.005;
      chaser.attacking = true;
      chaserInternal.pushMs = 30_000;
    }
  }

  /* Backfill a short telemetry history so the trace panels are populated
   * the moment the dashboard mounts, exactly as they would be if we had
   * joined a live feed mid-session. */
  const telemetry: Record<string, TelemetrySample[]> = {};
  const SEED_SAMPLES = 45;
  const startElapsedMs = startLap * circuit.baseLapTimeMs;

  for (const car of cars) {
    const samples: TelemetrySample[] = [];
    const wearPerLap = TYRE_MODEL[car.tyre.compound].wearPerLap * wearScale;
    const lapsPerSecond = 1000 / circuit.baseLapTimeMs;

    for (let k = SEED_SAMPLES; k > 0; k--) {
      const lapsAgo = k * lapsPerSecond;
      const phase = Math.sin((car.lapProgress - lapsAgo) * Math.PI * 14);
      samples.push({
        t: startElapsedMs - k * 1000,
        lap: car.lap,
        tyreWearPct: clamp(car.tyre.wearPct - lapsAgo * wearPerLap, 0, 100),
        fuelKg: Math.min(110, car.fuelKg + lapsAgo * FUEL_BURN_PER_LAP),
        speedKph: 232 + phase * 74,
        throttlePct: clamp(58 + phase * 42, 0, 100),
        brakePct: clamp(100 - (58 + phase * 42) - 18, 0, 100),
      });
    }
    telemetry[car.driverId] = samples;
  }

  const state: RaceState = {
    sessionId: `race-${circuit.id}-${options.seed ?? 1}`,
    circuitId: circuit.id,
    // `lap` is the lap currently being run, i.e. completed laps + 1.
    lap: Math.min(startLap + 1, raceLaps),
    totalLaps: raceLaps,
    tyreWearScale: wearScale,
    sessionState: 'RUNNING',
    flag: 'GREEN',
    neutralisedLapsRemaining: 0,
    speedMultiplier: 1,
    elapsedMs: startLap * circuit.baseLapTimeMs,
    weather: {
      kind: 'DRY',
      airTempC: 24,
      trackTempC: 41,
      humidityPct: 48,
      rainChancePct: 12,
      windKph: 9,
    },
    cars,
    overtakes: [],
    incidents: [],
    telemetry,
  };

  sortAndRank(state);

  /* --- per-car physics ---------------------------------------------- */

  function currentLapTimeMs(car: CarState, internal: CarInternal, ahead?: CarState): number {
    const tyre = TYRE_MODEL[car.tyre.compound];

    // Degradation is mild until the cliff, then it bites.
    const wear = car.tyre.wearPct / 100;
    const wearPenalty = wear * 0.042 + Math.pow(Math.max(0, wear - 0.72), 2) * 0.55;

    // Cold tyres on an out lap.
    const warmup = car.tyre.ageLaps < tyre.warmupLaps ? 0.012 : 0;

    // Fuel weight: ~0.032s per kg over a 92s lap.
    const fuelPenalty = car.fuelKg * 0.00035;

    let factor =
      internal.paceFactor * tyre.paceFactor * (1 + wearPenalty + fuelPenalty + warmup);

    // DRS: needs a zone and a car within a second.
    if (ahead && car.gapToAheadMs > 0 && car.gapToAheadMs < 1000) {
      const zoneHit = circuit.drsZones.some((z) => inZone(car.lapProgress, z.start, z.end));
      if (zoneHit) factor -= DRS_GAIN;
      factor -= 0.0022; // slipstream
    }

    /* The duel. A car in range is not simply following — it is being
     * actively held up, and by how much depends on the two drivers rather
     * than on the two cars. This is what a defensive driver is worth. */
    if (ahead && car.gapToAheadMs > 0 && car.gapToAheadMs < DUEL_RANGE_MS) {
      const defender = internals.get(ahead.driverId);
      if (defender) {
        /* Attack against defence, softened by how close they actually are:
         * a car half a second back is under far more threat than one at
         * one-point-three. */
        const proximity = 1 - car.gapToAheadMs / DUEL_RANGE_MS;
        const contest = clamp(defender.defence - internal.attack + 0.5, 0, 1);
        factor += DEFENCE_MAX_PENALTY * contest * proximity;
      }
    }

    /* Defending is not free. A driver covering the inside line is off the
     * racing line and losing time doing it, which is why a long defence
     * drags both cars back towards the pack. */
    const chaser = state.cars.find((c) => c.position === car.position + 1);
    if (chaser && chaser.gapToAheadMs > 0 && chaser.gapToAheadMs < DUEL_RANGE_MS * 0.7) {
      factor += DEFENCE_SELF_COST * internal.defence;
    }

    // How the driver is feeling, and how hard they have been told to go.
    factor += internal.moodPace;

    /* The start: a good launch is worth real time through the opening
     * corners, and it is gone by the end of lap one. */
    if (internal.launchGain !== 0 && car.lap <= startLap) {
      factor -= internal.launchGain;
    }

    /* Stamina: a driver who cannot hold the pace fades in the last third
     * of the race, which is where a long stint is actually decided. */
    const raceProgress = state.totalLaps > 0 ? car.lap / state.totalLaps : 0;
    if (raceProgress > 0.66) {
      factor += STAMINA_FADE * (1 - internal.stamina) * ((raceProgress - 0.66) / 0.34);
    }

    /* Under a neutralisation nobody races: every car runs to the same
     * delta, so the whole field is scaled by one factor and the gaps
     * between them stay roughly where they were. */
    if (state.neutralisedLapsRemaining > 0) {
      return circuit.baseLapTimeMs * internal.paceFactor * VSC_PACE_FACTOR;
    }

    if (car.attacking) factor -= PUSH_GAIN;
    // Override only delivers while there is energy left to deploy.
    if (car.boosting) factor -= BOOST_GAIN;
    // A tired power unit simply does not make the same number.
    factor += Math.max(0, car.engineWearPct - 60) * 0.00016;

    // Scripted demonstration pass: a decisive pace advantage that switches
    // itself off the moment the move is completed.
    if (internal.scriptedTargetId) factor -= SCRIPTED_PASS_GAIN;
    else if (internal.scriptedHoldMs > 0) factor -= SCRIPTED_HOLD_GAIN;

    factor += internal.lapNoise;

    return circuit.baseLapTimeMs * Math.max(0.9, factor);
  }

  function beginPitStop(car: CarState, internal: CarInternal) {
    car.status = 'PIT_ENTRY';
    car.pitProgress = 0;
    internal.pitTimerMs = 0;
    internal.pitLapCounted = false;

    /* Roll the stationary time now rather than when the car arrives, so
     * a botched stop is decided by the crew, not by when the tick lands. */
    const clean =
      PIT_STOP_WORST_MS - (PIT_STOP_WORST_MS - PIT_STOP_BEST_MS) * internal.crewQuality;
    const fumbled = rng() < (1 - internal.crewQuality) * 0.14;
    internal.pitStationaryMs = clean + (fumbled ? PIT_FUMBLE_MS * (0.5 + rng() * 0.8) : 0);

    pushIncident(state, {
      id: `inc-${eventSeq++}`,
      lap: car.lap,
      atMs: state.elapsedMs,
      kind: 'PIT_STOP',
      driverId: car.driverId,
      message: `${car.driverId} boxes for ${internal.nextCompound.toLowerCase()} tyres`,
    });
  }

  /** The wheels are on. Fired at the end of the stationary phase. */
  function fitNewTyres(car: CarState, internal: CarInternal) {
    car.pitStops += 1;
    car.tyre = {
      compound: internal.nextCompound,
      ageLaps: 0,
      wearPct: 0,
      temperatureC: 78,
    };
    car.fuelKg = Math.min(110, car.fuelKg + 6);

    pushIncident(state, {
      id: `inc-${eventSeq++}`,
      lap: car.lap + 1,
      atMs: state.elapsedMs,
      kind: 'PIT_STOP',
      driverId: car.driverId,
      message: `Stationary ${(internal.pitStationaryMs / 1000).toFixed(1)}s — ${car.tyre.compound.toLowerCase()} fitted`,
    });

    internal.nextCompound = internal.nextCompound === 'SOFT' ? 'MEDIUM' : 'HARD';
  }

  /** The car crosses the pit exit line and rejoins the circuit. */
  function completePitStop(car: CarState, internal: CarInternal) {
    car.status = 'OUT_LAP';
    car.pitProgress = 1;
    internal.outLapMs = 14_000;
  }

  /**
   * Bring out the virtual safety car. Refused inside the closing laps and
   * while one is already running, so a late failure does not decide the
   * race by freezing it.
   */
  function deployVsc(reason: string) {
    if (state.neutralisedLapsRemaining > 0) return;
    if (state.totalLaps - state.lap <= VSC_ENDGAME_GUARD_LAPS) return;

    const laps = VSC_MIN_LAPS + Math.floor(rng() * (VSC_MAX_LAPS - VSC_MIN_LAPS + 1));
    state.neutralisedLapsRemaining = laps;
    state.flag = 'VSC';

    /* Attack modes are meaningless behind a delta, and leaving them armed
     * would silently burn tyres and battery for nothing. */
    for (const car of state.cars) {
      const internal = internals.get(car.driverId);
      if (!internal) continue;
      internal.pushLatched = false;
      internal.boostLatched = false;
      internal.pushMs = 0;
      car.attacking = false;
      car.boosting = false;
    }

    pushIncident(state, {
      id: `inc-${eventSeq++}`,
      lap: state.lap,
      atMs: state.elapsedMs,
      kind: 'FLAG',
      message: `Virtual safety car — ${reason}. ${laps} lap${laps === 1 ? '' : 's'} neutralised.`,
    });
  }

  function endVsc() {
    state.neutralisedLapsRemaining = 0;
    if (state.flag === 'VSC') state.flag = 'GREEN';
    pushIncident(state, {
      id: `inc-${eventSeq++}`,
      lap: state.lap,
      atMs: state.elapsedMs,
      kind: 'FLAG',
      message: 'Green flag — the race is back on.',
    });
  }

  /* --- main tick ----------------------------------------------------- */

  function step(dtMs: number): RaceState {
    if (state.sessionState !== 'RUNNING' || dtMs <= 0) return state;

    const dt = Math.min(dtMs, 250); // guard against tab-switch jumps
    state.elapsedMs += dt;

    const previousOrder = state.cars.map((c) => c.driverId);
    const previousPositions = new Map(state.cars.map((c) => [c.driverId, c.position]));

    for (const car of state.cars) {
      if (car.status === 'RETIRED') continue;
      const internal = internals.get(car.driverId)!;
      const ahead = state.cars.find((c) => c.position === car.position - 1);

      /* --- attack modes ---------------------------------------------
       * A latched mode set from the pit wall outranks the AI's own
       * timers: it holds until it is lifted or its resource is gone.
       * Everything not latched still runs the opportunistic AI attack. */
      if (internal.pushLatched) {
        // The driver will not push on tyres that have nothing left.
        if (car.tyre.wearPct >= PUSH_TYRE_LIMIT_PCT || car.fuelKg < 2.5) {
          internal.pushLatched = false;
          car.attacking = false;
          pushIncident(state, {
            id: `inc-${eventSeq++}`,
            lap: car.lap + 1,
            atMs: state.elapsedMs,
            kind: 'RADIO',
            driverId: car.driverId,
            message:
              car.fuelKg < 2.5
                ? 'I have to lift and coast, there is no fuel for this'
                : 'These tyres are done — I cannot keep pushing',
          });
        } else {
          car.attacking = true;
        }
      } else if (internal.pushMs > 0) {
        internal.pushMs -= dt;
        car.attacking = true;
        if (internal.pushMs <= 0) {
          car.attacking = false;
          internal.pushCooldownMs = 25_000;
        }
      } else if (internal.pushCooldownMs > 0) {
        internal.pushCooldownMs -= dt;
        car.attacking = false;
      } else if (
        !manualPit.has(car.driverId) &&
        ahead &&
        // A sharper AI recognises a chance from further back, and only
        // takes it when the tyres and the battery can actually pay for it.
        car.gapToAheadMs < 900 + internal.racecraft * 900 &&
        car.status === 'LAPPING' &&
        (internal.racecraft < 0.5 ||
          (car.tyre.wearPct < 78 && car.ersPct > 25 && car.fuelKg > 6)) &&
        rng() < internal.aggression * 0.004 * (0.6 + internal.racecraft)
      ) {
        /* Opportunistic attack when running in dirty air. A car the pit
         * wall controls never does this on its own — the driver asks over
         * the radio and waits to be told, which is the whole point of
         * having a pit wall. */
        internal.pushMs = 8_000 + rng() * 6_000;
      }

      /* A capable AI deploys its energy for a move instead of hoarding
       * it, and lifts off again once the moment has gone. Below half
       * racecraft it never bothers, which is what the easy settings feel
       * like to race against. */
      if (!manualPit.has(car.driverId) && internal.racecraft >= 0.5) {
        const worthDeploying =
          car.status === 'LAPPING' &&
          ahead != null &&
          car.gapToAheadMs > 0 &&
          car.gapToAheadMs < 1100 &&
          car.ersPct > 45;
        if (worthDeploying && !internal.boostLatched) {
          if (rng() < 0.02 * internal.racecraft) internal.boostLatched = true;
        } else if (internal.boostLatched && (!worthDeploying || car.ersPct < 15)) {
          internal.boostLatched = false;
        }
      }

      /* --- pressure --------------------------------------------------
       * A duel that goes nowhere for lap after lap is the least
       * interesting thing a race can do. Pressure accumulates on the
       * defender, and sooner or later a driver short on composure runs
       * wide and the position goes. A great defender can hold almost
       * indefinitely; an ordinary one cannot. */
      if (
        ahead &&
        car.status === 'LAPPING' &&
        ahead.status === 'LAPPING' &&
        car.gapToAheadMs > 0 &&
        car.gapToAheadMs < DUEL_RANGE_MS
      ) {
        if (internal.duelTargetId !== ahead.driverId) {
          internal.duelTargetId = ahead.driverId;
          internal.duelMs = 0;
        }
        internal.duelMs += dt;
      } else {
        internal.duelTargetId = null;
        internal.duelMs = Math.max(0, internal.duelMs - dt * 2);
      }

      /* One roll per lap, and only once the pressure has genuinely been
       * on for a while. Composure is the defender's consistency and
       * judgement; the attacker's own judgement decides whether they are
       * in a position to take the opening when it appears. */
      const defender = ahead ? internals.get(ahead.driverId) : undefined;
      if (
        defender &&
        internal.duelMs > 45_000 &&
        internal.errorCheckedLap !== car.lap &&
        state.neutralisedLapsRemaining === 0
      ) {
        internal.errorCheckedLap = car.lap;

        const composure = defender.defence * 0.55 + defender.consistency * 0.45;
        const opportunism = internal.attack * 0.6 + internal.judgement * 0.4;
        const risk = DEFENDER_ERROR_PER_LAP * (1 - composure) * (0.4 + opportunism);

        if (rng() < risk) {
          /* The door opens: the attacker gets a decisive burst rather
           * than a teleport, so the pass still has to be completed on
           * track and still shows up as a move on the map. */
          internal.pushMs = Math.max(internal.pushMs, 7_000);
          internal.scriptedHoldMs = 9_000;
          internal.duelMs = 0;

          pushIncident(state, {
            id: `inc-${eventSeq++}`,
            lap: car.lap + 1,
            atMs: state.elapsedMs,
            kind: 'RADIO',
            driverId: car.driverId,
            message: `${ahead?.driverId ?? 'The car ahead'} ran wide under pressure — the door is open`,
          });
        }
      }

      if (internal.scriptedHoldMs > 0) internal.scriptedHoldMs -= dt;

      /* Override drops out the moment the store cannot deliver, and it
       * stays dropped out — recharging does not silently re-arm it. */
      if (internal.boostLatched && car.ersPct <= BOOST_CUTOFF_PCT) {
        internal.boostLatched = false;
        pushIncident(state, {
          id: `inc-${eventSeq++}`,
          lap: car.lap + 1,
          atMs: state.elapsedMs,
          kind: 'RADIO',
          driverId: car.driverId,
          message: 'Battery is flat, override is gone',
        });
      }
      car.boosting = internal.boostLatched && car.status === 'LAPPING';

      if (internal.outLapMs > 0) {
        internal.outLapMs -= dt;
        if (internal.outLapMs <= 0 && car.status === 'OUT_LAP') car.status = 'LAPPING';
      }

      /* ---- serving a pit stop ---------------------------------------
       * Three phases, and the middle one is the point: the car genuinely
       * stops. `pitProgress` freezes at the box so the marker on the map
       * sits still while the wheels come off, and the tyres change when
       * the crew finishes rather than at the pit exit line. */
      if (
        car.status === 'PIT_ENTRY' ||
        car.status === 'IN_PIT' ||
        car.status === 'PIT_EXIT'
      ) {
        internal.pitTimerMs += dt;
        const elapsed = internal.pitTimerMs;
        const stationaryEnd = PIT_APPROACH_MS + internal.pitStationaryMs;
        const totalMs = stationaryEnd + PIT_EXIT_MS;

        let lanePosition: number;
        if (elapsed < PIT_APPROACH_MS) {
          // Rolling down to the box, slowing as the box approaches.
          const t = elapsed / PIT_APPROACH_MS;
          lanePosition = PIT_BOX_POSITION * (1 - Math.pow(1 - t, 1.7));
          car.status = 'PIT_ENTRY';
        } else if (elapsed < stationaryEnd) {
          // Stopped. Nothing moves, which is exactly the point.
          lanePosition = PIT_BOX_POSITION;
          if (car.status !== 'IN_PIT') car.status = 'IN_PIT';
        } else {
          const t = clamp((elapsed - stationaryEnd) / PIT_EXIT_MS, 0, 1);
          // Released and accelerating away towards the exit line.
          lanePosition = PIT_BOX_POSITION + (1 - PIT_BOX_POSITION) * Math.pow(t, 0.75);
          if (car.status === 'IN_PIT') {
            // Crossing out of the box is when the new set is actually on.
            fitNewTyres(car, internal);
          }
          car.status = 'PIT_EXIT';
        }

        car.pitProgress = clamp(lanePosition, 0, 1);

        const from = circuit.pitEntryProgress;
        const nextProgress = from + car.pitProgress * PIT_LAP_SPAN;
        // The start/finish line is crossed exactly once per stop.
        if (nextProgress >= 1 && !internal.pitLapCounted) {
          internal.pitLapCounted = true;
          car.lap += 1;
          car.lastLapMs = car.currentLapMs;
          car.currentLapMs = 0;
          car.tyre.ageLaps += 1;
        }
        car.lapProgress = nextProgress % 1;
        car.raceDistance = car.lap + car.lapProgress + internal.gridOffset;
        car.currentLapMs += dt;

        // The energy store still recovers while the car is in the lane.
        car.ersPct = clamp(car.ersPct + 6 * (dt / 1000), 0, 100);

        if (elapsed >= totalMs) completePitStop(car, internal);
        continue;
      }

      /* ---- normal running ------------------------------------------ */
      const lapMs = currentLapTimeMs(car, internal, ahead);
      const delta = dt / lapMs; // fraction of a lap covered this tick

      car.currentLapMs += dt;
      car.lapProgress += delta;

      const tyreModel = TYRE_MODEL[car.tyre.compound];
      /* Team-level tyre care (the strategist) and the driver's own hands
       * both apply. Two cars on the same compound genuinely do not wear it
       * at the same rate. */
      const wearRate =
        tyreModel.wearPerLap *
        wearScale *
        internal.tyreCare *
        internal.tyreSkill *
        internal.moodTyre *
        (car.attacking ? PUSH_WEAR_MULTIPLIER : 1);
      car.tyre.wearPct = clamp(car.tyre.wearPct + delta * wearRate, 0, 100);
      car.tyre.temperatureC = clamp(
        car.tyre.temperatureC + (car.attacking ? 6 : -2) * delta,
        70,
        128,
      );
      car.fuelKg = Math.max(
        0.4,
        car.fuelKg - delta * FUEL_BURN_PER_LAP * (car.attacking ? PUSH_FUEL_MULTIPLIER : 1),
      );

      // Push spends the store slowly; the override empties it.
      const ersRate = car.boosting
        ? -BOOST_ERS_DRAIN
        : car.attacking
          ? -PUSH_ERS_DRAIN
          : 34;
      car.ersPct = clamp(car.ersPct + ersRate * delta, 0, 100);

      const engineRate =
        ENGINE_WEAR_PER_LAP *
        wearScale *
        internal.engineStress *
        (car.boosting
          ? ENGINE_WEAR_BOOST_MULTIPLIER
          : car.attacking
            ? ENGINE_WEAR_PUSH_MULTIPLIER
            : 1);
      car.engineWearPct = clamp(car.engineWearPct + delta * engineRate, 0, 100);
      if (car.attacking) car.pushLaps += delta;

      /* ---- lap completion ------------------------------------------ */
      if (car.lapProgress >= 1) {
        car.lapProgress -= 1;

        if (internal.gridOffset < 0) {
          // Crossing the line for the first time from a grid slot behind
          // it: settle the debt, do not credit a lap or a lap time.
          internal.gridOffset = 0;
          car.currentLapMs = 0;
          car.raceDistance = car.lap + car.lapProgress;
          continue;
        }

        car.lap += 1;
        car.lastLapMs = car.currentLapMs;
        car.bestLapMs =
          car.bestLapMs == null ? car.currentLapMs : Math.min(car.bestLapMs, car.currentLapMs);
        car.currentLapMs = 0;
        car.tyre.ageLaps += 1;
        /* Lap-to-lap scatter is the driver, not the car. A metronomic
         * driver repeats the lap; a ragged one gives some of it back. */
        /* Lap-to-lap scatter is the driver, not the car — and a driver
         * under pressure is a messier driver than the same one settled. */
        internal.lapNoise =
          (rng() - 0.5) * CONSISTENCY_NOISE * (1.15 - internal.consistency) * internal.moodError;

        /* Power-unit failure: one roll per lap, and only once the unit is
         * genuinely worn. Abusing push and override all race is what puts
         * a car into this band in the first place. */
        if (car.engineWearPct >= ENGINE_DANGER_PCT && internal.engineChecked !== car.lap) {
          internal.engineChecked = car.lap;
          const overrun =
            (car.engineWearPct - ENGINE_DANGER_PCT) / (100 - ENGINE_DANGER_PCT);

          /* How much of this race the car has spent attacking. A unit worn
           * down by a long clean race is a much safer bet than one worn
           * down in half the time by push and override. */
          const lapsRun = Math.max(1, car.lap - startLap);
          const abuse = clamp(car.pushLaps / lapsRun, 0, 1);

          const risk =
            ENGINE_FAILURE_PER_LAP *
            overrun *
            internal.engineStress *
            (1 + abuse * ENGINE_ABUSE_WEIGHT);

          if (rng() < risk) {
            car.status = 'RETIRED';
            car.attacking = false;
            car.boosting = false;
            internal.pushLatched = false;
            internal.boostLatched = false;
            pushIncident(state, {
              id: `inc-${eventSeq++}`,
              lap: car.lap,
              atMs: state.elapsedMs,
              kind: 'MECHANICAL',
              driverId: car.driverId,
              message: 'Power unit failure — the car is stopping on track',
            });

            // A car abandoned on the circuit is what brings out the VSC.
            if (rng() < VSC_TRIGGER_CHANCE) {
              deployVsc(`${car.driverId} stopped on track`);
            }
            continue;
          }
        }

        if (car.position === 1) {
          state.lap = Math.min(car.lap + 1, state.totalLaps);

          // The neutralisation is measured in leader laps, as it is in
          // the regulations.
          if (state.neutralisedLapsRemaining > 0) {
            state.neutralisedLapsRemaining -= 1;
            if (state.neutralisedLapsRemaining <= 0) endVsc();
          }

          if (car.lap >= state.totalLaps) {
            state.sessionState = 'FINISHED';
            state.flag = 'CHEQUERED';
          }
        }
      }

      /* ---- pit decision -------------------------------------------- *
       * A car under manual control has no strategy of its own. It runs
       * until the pit wall says otherwise, however bad the tyres get. */
      /* A sharper AI reacts to the tyre in front of it rather than only
       * to the number it wrote down before the race. */
      const wearTrigger = 92 - internal.racecraft * 14;
      const wantsPit = manualPit.has(car.driverId)
        ? internal.plannedPitLaps.includes(car.lap)
        : internal.plannedPitLaps.includes(car.lap) ||
          car.tyre.wearPct > wearTrigger ||
          car.fuelKg < 3;
      if (
        wantsPit &&
        car.status === 'LAPPING' &&
        car.lapProgress >= circuit.pitEntryProgress &&
        car.lapProgress < circuit.pitEntryProgress + 0.03
      ) {
        internal.plannedPitLaps = internal.plannedPitLaps.filter((l) => l !== car.lap);
        beginPitStop(car, internal);
        continue;
      }

      car.raceDistance = car.lap + car.lapProgress + internal.gridOffset;
    }

    sortAndRank(state);
    /* Position changes under a neutralisation are an artefact of pit
     * stops and rounding, not racing, so no move is reported. */
    if (state.neutralisedLapsRemaining === 0) {
      detectOvertakes(previousOrder, previousPositions);
      confirmOvertakes();
    } else {
      provisional.clear();
    }
    sampleTelemetry(dt);

    return state;
  }

  /* --- ordering & gaps ----------------------------------------------- */

  function sortAndRank(s: RaceState) {
    s.cars.sort((a, b) => {
      if (a.status === 'RETIRED' && b.status !== 'RETIRED') return 1;
      if (b.status === 'RETIRED' && a.status !== 'RETIRED') return -1;
      return b.raceDistance - a.raceDistance;
    });

    const leader = s.cars[0];
    // Timing screens express every gap at a single reference pace — the
    // leader's — so the column stays monotonic down the order.
    const leaderInternal = leader ? internals.get(leader.driverId) : undefined;
    const refLap = leaderInternal
      ? circuit.baseLapTimeMs * leaderInternal.paceFactor
      : circuit.baseLapTimeMs;

    for (let i = 0; i < s.cars.length; i++) {
      const car = s.cars[i]!;
      car.position = i + 1;

      if (!leader || i === 0) {
        car.gapToLeaderMs = 0;
      } else {
        car.gapToLeaderMs = (leader.raceDistance - car.raceDistance) * refLap;
      }

      const ahead = i === 0 ? null : s.cars[i - 1]!;
      car.gapToAheadMs = ahead ? (ahead.raceDistance - car.raceDistance) * refLap : 0;
    }
  }

  /* --- overtake detection -------------------------------------------- *
   * A position swap alone is not a pass: two cars nose-to-tail trade
   * places constantly. A swap opens a *provisional* move, which is only
   * reported once the overtaker is still ahead, and clear, a moment
   * later. Moves that get immediately reversed never surface.
   * ------------------------------------------------------------------- */

  function detectOvertakes(previousOrder: string[], previousPositions: Map<string, number>) {
    for (const car of state.cars) {
      const before = previousPositions.get(car.driverId);
      if (before == null || car.position >= before) continue;

      // Whoever occupied this slot a tick ago is the driver we just passed.
      const overtakenId = previousOrder[car.position - 1];
      if (!overtakenId || overtakenId === car.driverId) continue;

      const overtaken = state.cars.find((c) => c.driverId === overtakenId);
      if (!overtaken) continue;

      // Ignore position swaps that are just pit-stop bookkeeping.
      const bothRacing =
        car.status !== 'IN_PIT' &&
        car.status !== 'PIT_ENTRY' &&
        overtaken.status !== 'IN_PIT' &&
        overtaken.status !== 'PIT_ENTRY';
      if (!bothRacing) continue;

      const pairKey = [car.driverId, overtakenId].sort().join('|');
      if (provisional.has(pairKey)) continue;
      if (state.elapsedMs - (pairCooldown.get(pairKey) ?? -Infinity) < OVERTAKE_PAIR_COOLDOWN_MS) {
        continue;
      }

      const internal = internals.get(car.driverId)!;
      if (state.elapsedMs - internal.lastOvertakeAtMs < OVERTAKE_DEBOUNCE_MS) continue;

      provisional.set(pairKey, {
        overtakerId: car.driverId,
        overtakenId,
        openedAtMs: state.elapsedMs,
        positionGained: before - car.position,
        atProgress: car.lapProgress,
        cornerLabel: nearestCornerLabel(circuit, car.lapProgress),
        lap: car.lap + 1,
      });
    }
  }

  /** Promote provisional moves once they stick; drop the ones that do not. */
  function confirmOvertakes() {
    for (const [pairKey, move] of provisional) {
      const overtaker = state.cars.find((c) => c.driverId === move.overtakerId);
      const overtaken = state.cars.find((c) => c.driverId === move.overtakenId);

      if (!overtaker || !overtaken) {
        provisional.delete(pairKey);
        continue;
      }

      // Re-passed straight back — the move never happened.
      if (overtaker.position > overtaken.position) {
        provisional.delete(pairKey);
        continue;
      }

      // Still wheel to wheel: wait, but do not wait forever.
      const clearMs = (overtaker.raceDistance - overtaken.raceDistance) * circuit.baseLapTimeMs;
      if (clearMs < OVERTAKE_CLEAR_MS) {
        if (state.elapsedMs - move.openedAtMs > OVERTAKE_STALEMATE_MS) {
          provisional.delete(pairKey);
        }
        continue;
      }

      provisional.delete(pairKey);
      pairCooldown.set(pairKey, state.elapsedMs);
      const internal = internals.get(move.overtakerId)!;
      internal.lastOvertakeAtMs = state.elapsedMs;

      const event: OvertakeEvent = {
        id: `ovt-${eventSeq++}`,
        lap: move.lap,
        atMs: move.openedAtMs,
        overtakerId: move.overtakerId,
        overtakenId: move.overtakenId,
        positionGained: move.positionGained,
        cornerLabel: move.cornerLabel,
        atProgress: move.atProgress,
      };

      pendingEvents.push(event);
      state.overtakes = [event, ...state.overtakes].slice(0, MAX_EVENTS);
      pushIncident(state, {
        id: `inc-${eventSeq++}`,
        lap: event.lap,
        atMs: state.elapsedMs,
        kind: 'OVERTAKE',
        driverId: move.overtakerId,
        message: `P${overtaker.position} — pass completed at ${event.cornerLabel}`,
      });

      // The scripted demo pass only needs to fire once.
      if (internal.scriptedTargetId === move.overtakenId) {
        internal.scriptedTargetId = null;
        internal.scriptedHoldMs = SCRIPTED_HOLD_MS;
        internal.pushMs = 6_000;
      }
    }
  }

  /* --- telemetry ------------------------------------------------------ */

  function sampleTelemetry(dt: number) {
    telemetryClock += dt;
    if (telemetryClock < TELEMETRY_INTERVAL_MS) return;
    telemetryClock = 0;

    for (const car of state.cars) {
      const buffer = state.telemetry[car.driverId];
      if (!buffer) continue;

      // Speed traces the corner density around the lap.
      const cornerPhase = Math.sin(car.lapProgress * Math.PI * 14);
      const stationary = car.status === 'IN_PIT';
      const inLane = car.status === 'PIT_ENTRY' || car.status === 'PIT_EXIT';

      const speed = stationary
        ? 0
        : inLane
          ? 78
          : 232 + cornerPhase * 74 + (car.attacking ? 6 : 0);
      const throttle = stationary ? 0 : inLane ? 20 : clamp(58 + cornerPhase * 42, 0, 100);

      buffer.push({
        t: state.elapsedMs,
        lap: car.lap,
        tyreWearPct: car.tyre.wearPct,
        fuelKg: car.fuelKg,
        speedKph: stationary ? 0 : Math.max(60, speed),
        throttlePct: throttle,
        brakePct: clamp(100 - throttle - 18, 0, 100),
      });

      if (buffer.length > TELEMETRY_CAP) buffer.splice(0, buffer.length - TELEMETRY_CAP);
    }
  }

  /* --- commands ------------------------------------------------------- */

  function applyCommand(cmd: RaceCommand) {
    switch (cmd.type) {
      case 'PAUSE':
        state.sessionState = 'PAUSED';
        state.speedMultiplier = 0;
        break;
      case 'RESUME':
        if (state.sessionState !== 'FINISHED') state.sessionState = 'RUNNING';
        if (state.speedMultiplier === 0) state.speedMultiplier = 1;
        break;
      case 'SET_SPEED':
        state.speedMultiplier = cmd.multiplier;
        state.sessionState =
          cmd.multiplier === 0
            ? 'PAUSED'
            : state.sessionState === 'FINISHED'
              ? 'FINISHED'
              : 'RUNNING';
        break;
      case 'PIT_CALL': {
        const car = state.cars.find((c) => c.driverId === cmd.driverId);
        const internal = internals.get(cmd.driverId);
        if (car && internal && car.status === 'LAPPING') {
          internal.plannedPitLaps = [car.lap, ...internal.plannedPitLaps];
        }
        break;
      }
      case 'SET_TYRE': {
        const internal = internals.get(cmd.driverId);
        if (internal) internal.nextCompound = cmd.compound;
        break;
      }
      case 'PUSH_MODE': {
        const car = state.cars.find((c) => c.driverId === cmd.driverId);
        const internal = internals.get(cmd.driverId);
        if (!car || !internal || car.status === 'RETIRED') break;

        // Refuse to arm a mode the car cannot sustain, rather than
        // lighting the button and dropping it a tick later.
        if (cmd.enabled && car.tyre.wearPct >= PUSH_TYRE_LIMIT_PCT) {
          pushIncident(state, {
            id: `inc-${eventSeq++}`,
            lap: car.lap + 1,
            atMs: state.elapsedMs,
            kind: 'RADIO',
            driverId: car.driverId,
            message: 'Negative — there is nothing left in these tyres',
          });
          break;
        }

        internal.pushLatched = cmd.enabled;
        internal.pushMs = 0;
        internal.pushCooldownMs = 0;
        car.attacking = cmd.enabled;
        pushIncident(state, {
          id: `inc-${eventSeq++}`,
          lap: car.lap + 1,
          atMs: state.elapsedMs,
          kind: 'RADIO',
          driverId: car.driverId,
          message: cmd.enabled
            ? 'Copy, push mode — I will manage the tyres myself'
            : 'Understood, backing off and looking after the car',
        });
        break;
      }
      case 'ERS_BOOST': {
        const car = state.cars.find((c) => c.driverId === cmd.driverId);
        const internal = internals.get(cmd.driverId);
        if (!car || !internal || car.status === 'RETIRED') break;

        if (cmd.enabled && car.ersPct < BOOST_ARM_MIN_PCT) {
          pushIncident(state, {
            id: `inc-${eventSeq++}`,
            lap: car.lap + 1,
            atMs: state.elapsedMs,
            kind: 'RADIO',
            driverId: car.driverId,
            message: `Not enough in the store for that — ${Math.round(car.ersPct)}%`,
          });
          break;
        }

        internal.boostLatched = cmd.enabled;
        car.boosting = cmd.enabled;
        pushIncident(state, {
          id: `inc-${eventSeq++}`,
          lap: car.lap + 1,
          atMs: state.elapsedMs,
          kind: 'RADIO',
          driverId: car.driverId,
          message: cmd.enabled
            ? 'Override armed — deploying everything I have'
            : 'Override off, saving the battery',
        });
        break;
      }
      case 'SET_CONDITION': {
        const internal = internals.get(cmd.driverId);
        if (!internal) break;
        /* Condition moves during a race — a driver is talked down, or
         * wound up. It has to reach the running engine as a command,
         * because rebuilding the engine would restart the race. */
        internal.moodPace = cmd.paceFactor + internal.pushPace;
        internal.moodError = cmd.errorMultiplier;
        internal.moodTyre = cmd.tyreMultiplier * internal.pushTyre;
        internal.aggression = clamp(
          internal.baseAggression + cmd.aggression * 0.35 + internal.pushEdge * 0.3,
          0.05,
          1.6,
        );
        break;
      }
      case 'CANCEL_PIT': {
        const car = state.cars.find((c) => c.driverId === cmd.driverId);
        const internal = internals.get(cmd.driverId);
        if (!car || !internal) break;
        // Only a stop that has not been committed to can be waved off.
        if (car.status === 'PIT_ENTRY' || car.status === 'IN_PIT') break;
        internal.plannedPitLaps = internal.plannedPitLaps.filter((l) => l > car.lap + 1);
        pushIncident(state, {
          id: `inc-${eventSeq++}`,
          lap: car.lap + 1,
          atMs: state.elapsedMs,
          kind: 'RADIO',
          driverId: car.driverId,
          message: 'Stay out, stay out — we are extending this stint',
        });
        break;
      }
      case 'RETIRE_CAR': {
        const car = state.cars.find((c) => c.driverId === cmd.driverId);
        if (car && car.status !== 'RETIRED') {
          car.status = 'RETIRED';
          car.attacking = false;
          car.boosting = false;
          pushIncident(state, {
            id: `inc-${eventSeq++}`,
            lap: car.lap + 1,
            atMs: state.elapsedMs,
            kind: 'RETIREMENT',
            driverId: car.driverId,
            message: 'Car retired from the session by the pit wall',
          });
          // Race control does not care who parked it, only that it is
          // parked. The pit wall never deploys the VSC itself.
          if (rng() < VSC_TRIGGER_CHANCE * 0.6) {
            deployVsc(`${car.driverId} stopped on track`);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  function drainEvents(): OvertakeEvent[] {
    if (pendingEvents.length === 0) return [];
    return pendingEvents.splice(0, pendingEvents.length);
  }

  return {
    getState: () => state,
    step,
    applyCommand,
    drainEvents,
  };
}

function pushIncident(state: RaceState, incident: RaceIncident) {
  state.incidents = [incident, ...state.incidents].slice(0, MAX_EVENTS);
}
