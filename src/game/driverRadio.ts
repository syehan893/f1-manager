import { TYRE_MODEL } from '@/engine/raceEngine';
import type { CarState, Driver, RaceState, TyreCompound } from '@/types';

/* ===================================================================== *
 * Driver radio
 *
 * The pit wall's job is to make calls on incomplete information, and that
 * only works if the information arrives the way it does in a real race:
 * from the driver, in their own words, before the timing screen makes it
 * obvious.
 *
 * This module is the driver side of that conversation. It is a pure
 * observer of race snapshots — it never mutates the session. Everything
 * it says is derived from state the engine actually simulates (wear, lap
 * delta, engine life, energy, traffic, fuel), filtered through a model of
 * the individual driver's temperament, and rate-limited so a stint sounds
 * like a stint rather than a feed.
 *
 * Two things make it feel deliberate rather than random:
 *
 *   1. Every message is caused. A driver asks to box because a scored
 *      pit desire crossed *their* threshold, not because a timer fired.
 *   2. The driver remembers. Refusing a box request raises the pressure
 *      on the next one and changes the tone of what comes back.
 * ===================================================================== */

export type RadioKind =
  | 'BOX_REQUEST'
  /** Unprompted: how they are feeling, which is information in itself. */
  | 'MORALE'
  | 'PUSH_REQUEST'
  | 'BOOST_REQUEST'
  | 'ENGINE'
  | 'TYRES'
  | 'TRAFFIC'
  | 'FUEL'
  | 'ENERGY'
  | 'POSITION'
  | 'ACK';

/** The three kinds of request that need a call from the pit wall. */
export type DecisionKind = 'PIT' | 'PUSH' | 'BOOST';

export type RadioSeverity = 'INFO' | 'CONCERN' | 'URGENT';

/** A message the pit wall has to answer before it goes away. */
export interface RadioDecision {
  kind: DecisionKind;
  /** The compound the driver is asking for. Only meaningful for a stop. */
  compound: TyreCompound;
  /** Why they are asking, in one line, for the decision card. */
  rationale: string;
  /** Label for the affirmative reply on the decision card. */
  affirm: string;
}

export interface RadioMessage {
  id: string;
  driverId: string;
  kind: RadioKind;
  severity: RadioSeverity;
  text: string;
  lap: number;
  atMs: number;
  decision?: RadioDecision;
}

/* ------------------------------ tuning ------------------------------- */

/** No driver says two things closer together than this (race ms). */
const DRIVER_COOLDOWN_MS = 26_000;
/** Per-topic silence, so one worry does not dominate a stint. */
const TOPIC_COOLDOWN_MS: Record<RadioKind, number> = {
  // Just over a lap, so a driver who is waved off does keep asking, but
  // the pit wall is not answering a card every thirty seconds.
  BOX_REQUEST: 120_000,
  MORALE: 85_000,
  PUSH_REQUEST: 95_000,
  BOOST_REQUEST: 70_000,
  ENGINE: 70_000,
  TYRES: 60_000,
  TRAFFIC: 75_000,
  FUEL: 90_000,
  ENERGY: 65_000,
  POSITION: 40_000,
  ACK: 0,
};

/** Pit desire at which the driver actually asks. */
const ASK_THRESHOLD = 0.6;
/** Pit desire at which it stops being a request. */
const DESPERATE_THRESHOLD = 0.88;
/** Below this many laps left, nobody wants a stop. */
const MIN_LAPS_FOR_STOP = 4;
/** Sustained race-time within a second of the car ahead before complaining. */
const TRAFFIC_PATIENCE_MS = 30_000;
/** How much worse things must get before a refused request is repeated. */
const REFUSAL_MARGIN = 0.14;
/**
 * Laps before anyone asks for an attack mode. At lights-out the whole
 * field is nose-to-tail by definition, so without this every car raises
 * a card on lap one and the pit wall opens on a queue of noise.
 */
const SETTLING_LAPS = 1;
/** Sustained time in range before an attack call is worth making. */
const ATTACK_PATIENCE_MS = 9_000;
/** Tyre wear above which a driver will not ask to push at all. */
const PUSH_ASK_TYRE_LIMIT = 72;
/** Energy below which the override is not worth asking for. */
const BOOST_ASK_ERS_FLOOR = 45;

/* --------------------------- personality ----------------------------- */

/**
 * A driver's temperament, derived once from their attributes. These are
 * the knobs that make two cars in identical trouble sound different.
 */
interface Temperament {
  /** 0..1 — how far past the ideal window they will run before asking. */
  patience: number;
  /** 0..1 — appetite for a softer tyre and for attacking calls. */
  aggression: number;
  /** 0..1 — how much they narrate. Low = only the important things. */
  vocal: number;
  /** 0..1 — how much a refused call rattles them. */
  temper: number;
}

function temperamentOf(driver: Driver): Temperament {
  const a = driver.attributes;
  return {
    patience: clamp01(a.consistency / 100),
    aggression: clamp01(a.attack / 100),
    // Steady, experienced drivers keep the radio quiet.
    vocal: clamp01(0.85 - a.consistency / 160 + a.attack / 260),
    temper: clamp01(0.75 - a.consistency / 150),
  };
}

/* --------------------------- driver memory --------------------------- */

interface DriverMemory {
  temperament: Temperament;
  /** Fixed per driver, so their phrasing does not collide with a team-mate. */
  voice: number;
  lastSpokeAtMs: number;
  topicAtMs: Partial<Record<RadioKind, number>>;
  lastPosition: number;
  lastPitStops: number;
  /** Accumulated race-time spent stuck behind the car ahead. */
  trafficMs: number;
  /** Box requests the pit wall has waved off this stint. */
  refusals: number;
  /** Wear band last reported, so a band is reported once. */
  tyreBand: number;
  engineBand: number;
  /**
   * The one outstanding request, if any. A driver holds one question at a
   * time — asking for tyres and for push in the same breath is how a
   * radio feed turns into a queue of cards nobody reads.
   */
  awaiting: DecisionKind | null;
  /**
   * The pit desire at which a stop was last waved off. Until things get
   * meaningfully worse than that, the driver does not raise it again —
   * they have already been told no, and repeating it is nagging rather
   * than information.
   */
  refusedAtDesire: number | null;
  /** Push and override that have been turned down, for the same reason. */
  pushRefusals: number;
  boostRefusals: number;
  /** Reference lap time from the opening clean laps. */
  referenceLapMs: number | null;
  lastLapSeen: number;
}

/* ------------------------------ helpers ------------------------------ */

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Laps a compound has left at the current wear rate. The scale comes off
 * the session, so a shortened race is judged on its own tyre model
 * rather than the full-distance one.
 */
export function lapsOfLifeLeft(car: CarState, wearScale = 1): number {
  const model = TYRE_MODEL[car.tyre.compound];
  const rate = model.wearPerLap * wearScale * (car.attacking ? 1.45 : 1);
  return Math.max(0, (100 - car.tyre.wearPct) / rate);
}

/**
 * The compound the driver would ask for, given how much race is left and
 * how they like to drive. Aggressive drivers take the softer option and
 * back themselves to make it last; steady ones take the tyre that gets to
 * the end without a second thought.
 */
function preferredCompound(lapsRemaining: number, temperament: Temperament): TyreCompound {
  const bias = temperament.aggression * 6 - temperament.patience * 5;
  const effective = lapsRemaining - bias;
  if (effective <= 14) return 'SOFT';
  if (effective <= 28) return 'MEDIUM';
  return 'HARD';
}

/* --------------------------- phrase pools ---------------------------- */
/* Split by temperament so the same event reads differently depending on
 * who is in the car. `pick` is seeded, so a replayed race says the same
 * things in the same order. */

/**
 * A phrase from the pool, rotated by the driver. Two cars in identical
 * trouble would otherwise draw consecutive values from one shared
 * generator and come back with the same sentence in the same breath,
 * which reads as a bug even though it is only chance.
 */
function pickFor<T>(rng: () => number, list: readonly T[], voice: number): T {
  const index = (Math.floor(rng() * list.length) + voice) % list.length;
  return list[index] ?? list[0]!;
}

const PUSH_ASK = [
  'I have the pace to go after him — can I push?',
  'I can close this gap if you let me lean on it.',
  'Give me the green light, I want to attack.',
] as const;

const PUSH_DEFEND = [
  'He is all over me. I need something to hold this position.',
  'I cannot defend at this pace — let me push.',
] as const;

const BOOST_ASK = [
  'I am close enough — give me the overtake on the next straight.',
  'Full deployment down the straight and he is mine.',
  'Battery is good, let me use it now.',
] as const;

/* ---------------------------------------------------------------------
 * How a driver sounds depends on how they feel.
 *
 * The same event — a tyre going away, a car in the mirrors — produces a
 * different sentence from a confident driver than from a rattled one.
 * This is most of what makes a grid sound like twenty-two people, and it
 * is also information: a pit wall that listens can hear a driver coming
 * apart before the lap times show it.
 * ------------------------------------------------------------------- */

/** Unprompted reports of state, keyed on how they are actually feeling. */
const EMOTION_LINES: Record<string, readonly string[]> = {
  CONFIDENT: [
    'Car feels great. I can do this all day.',
    'Really happy with the balance — keep it exactly like this.',
    'I have got more in hand if you need it.',
  ],
  FOCUSED: [
    'All good here. Just getting on with it.',
    'Nothing to report, car is where I want it.',
  ],
  FIRED_UP: [
    'I want this. Give me the car and I will get it done.',
    'I am right on the limit and it feels brilliant.',
    'Do not tell me to back off, not now.',
  ],
  FRUSTRATED: [
    'This is not working. Something has to change.',
    'I am doing everything I can out here and it is not enough.',
    'Talk to me — I need something from you.',
  ],
  RATTLED: [
    'I nearly lost it there. I need a moment.',
    'Too much, this is too much. Give me something to hold on to.',
    'I cannot keep this up, I am going to make a mistake.',
  ],
  DEJECTED: [
    'What is the point. We are nowhere.',
    'Whatever you want. It does not matter.',
    'I have got nothing today.',
  ],
};

/** What the pit wall gets back when it tries to settle a driver down. */
const REASSURE_REPLY: Record<string, readonly string[]> = {
  RATTLED: [
    'Okay... okay. Thank you. Give me a lap.',
    'Yeah. Yeah, I hear you. Resetting.',
  ],
  FRUSTRATED: ['Understood. I will get my head back in it.', 'Copy. Sorry, I know.'],
  DEJECTED: ['...copy.', 'If you say so.'],
  DEFAULT: ['Appreciated. I am fine.', 'All good, thank you.'],
};

/** And when it demands more. */
const DEMAND_REPLY: Record<string, readonly string[]> = {
  CONFIDENT: ['Understood — pushing now.', 'About time. Watch this.'],
  FIRED_UP: ['Yes! Now we are talking.', 'Finally. Leave it with me.'],
  RATTLED: [
    'I... I will try. I am already on the edge.',
    'You are asking a lot right now.',
  ],
  DEJECTED: ['I will try.', 'Fine.'],
  DEFAULT: ['Copy, upping the pace.', 'Understood, going for it.'],
};

/** And when it praises them. */
const PRAISE_REPLY: readonly string[] = [
  'Thanks, that means a lot. Head down.',
  'Appreciate that. Let us finish the job.',
  'Cheers. Feeling good about this one.',
];

const HOLD_STATION = [
  'Copy, holding station.',
  'Understood, I will manage it from here.',
  'Fine. Staying where I am.',
] as const;

const BOX_CALM = [
  'Tyres are past their best, I think the window is now.',
  'We are losing a couple of tenths a lap on these. Ready when you are.',
  'I can hold this pace for another lap, but the stop is coming.',
] as const;

const BOX_URGENT = [
  'These tyres are gone, I need to box, box now!',
  'I have nothing left, I am a passenger out here — box!',
  'Guys, I cannot defend on these. Bring me in.',
] as const;

/* A neutralisation is the cheapest stop the race will offer, and it is
 * over in two laps. The driver flags it because the timing screen will
 * not — by the time the gap looks wrong the window has shut. */
const BOX_UNDER_VSC = [
  'Safety car delta — this is the cheap stop, do we take it?',
  'VSC is out. If we are boxing, it has to be now.',
  'Free stop right here if you want it.',
] as const;

const BOX_DESPERATE = [
  'I am going to lose places every lap. Box me!',
  'This is falling apart, the tyres are finished — box, box!',
] as const;

const TYRE_WARN = [
  'Starting to feel the rears go away through the quick stuff.',
  'Front left is graining a little, keep an eye on it.',
  'Deg is coming on now, I am having to manage the exits.',
] as const;

const ENGINE_WARN = [
  'Getting a bit of a vibration from the back of the car.',
  'Temperatures are creeping up on the power unit.',
  'The engine does not sound happy on the straights.',
] as const;

const ENGINE_SERIOUS = [
  'Something is wrong back there, I am losing power on the straight.',
  'That vibration is much worse now — is the unit going to last?',
] as const;

const ENGINE_CRITICAL = [
  'It is about to let go, I can feel it. Do we save it?',
  'The unit is on its last legs, I am nursing it every lap.',
] as const;

const TRAFFIC_PATIENT = [
  'I am quicker than him but I cannot get close through the last sector.',
  'Stuck in the dirty air here, losing the front end.',
] as const;

const TRAFFIC_ANGRY = [
  'He is holding me up! Give me something, I can pass him.',
  'This is costing us the race — I need the tools to get by.',
] as const;

const FUEL_LOW = [
  'Fuel is looking marginal, do I need to save?',
  'We are going to be short at this rate.',
] as const;

const ENERGY_LOW = [
  'No battery, I am a sitting duck on the straight.',
  'The store is empty, I have nothing to deploy.',
] as const;

const GAINED = ['Yes! That is another one.', 'Got him. Keep it coming.'] as const;

const LOST = [
  'He got me on the straight, I had no answer.',
  'Lost one there, I could not hold the position.',
] as const;

const STAY_OUT_CALM = [
  'Copy, staying out. I will look after them.',
  'Understood, I will manage the tyres.',
] as const;

const STAY_OUT_TENSE = [
  'Staying out... I hope you know what you are doing.',
  'Okay, but do not leave me out here too long.',
] as const;

const STAY_OUT_ANGRY = [
  'No, no, no — these tyres are finished! We are throwing this away.',
  'That is the wrong call and you know it.',
] as const;

/* ============================== the brain ============================= */

/** Things the pit wall can say unprompted, rather than only answering. */
export type PitWallCall = 'REASSURE' | 'DEMAND' | 'PRAISE' | 'CALM_DOWN';

export const PIT_WALL_CALLS: Array<{
  id: PitWallCall;
  label: string;
  hint: string;
  /** What it does to the driver, for the button's tooltip. */
  effect: string;
}> = [
  {
    id: 'REASSURE',
    label: 'Reassure',
    hint: 'Talk them down.',
    effect: 'Cuts stress sharply and lifts mood a little. The main tool for a rattled driver.',
  },
  {
    id: 'DEMAND',
    label: 'Demand more',
    hint: 'Tell them to race.',
    effect:
      'Lifts aggression and mood, but adds real stress. Superb on a confident driver, dangerous on a rattled one.',
  },
  {
    id: 'PRAISE',
    label: 'Praise',
    hint: 'Tell them they are doing well.',
    effect: 'A solid mood lift and a little morale. Works on anyone, but not twice in a row.',
  },
  {
    id: 'CALM_DOWN',
    label: 'Settle',
    hint: 'Ask them to bring it home.',
    effect: 'Cuts stress and takes the edge off — safer, and slower.',
  },
];

export interface RadioBrainOptions {
  drivers: Driver[];
  /** Only these drivers talk — the player runs two cars, not twenty. */
  focusDriverIds: string[];
  seed?: number;
  /**
   * How each driver is feeling right now, and a way to move it. The brain
   * never owns condition — it reads it to decide what a driver says, and
   * reports back what should change so the save stays the single source.
   */
  emotionOf?: (driverId: string) => string;
  onConditionEvent?: (driverId: string, event: string) => void;
}

export interface RadioBrain {
  /** Called on every snapshot. Returns only what is newly said. */
  evaluate(state: RaceState): RadioMessage[];
  /** The pit wall answered a box request: produces the driver's reply. */
  answer(driverId: string, accepted: boolean, state: RaceState): RadioMessage | null;
  /** The pit wall said something unprompted. Returns the driver's reply. */
  call(driverId: string, call: PitWallCall, state: RaceState): RadioMessage | null;
  /**
   * Point the brain at fresher hooks without rebuilding it. The brain
   * holds a whole race of memory — what has been said, what was refused,
   * how long a driver has been stuck — so it has to outlive the callbacks
   * its host derives from a save that changes on every action.
   */
  setHooks(hooks: {
    emotionOf?: (driverId: string) => string;
    onConditionEvent?: (driverId: string, event: string) => void;
  }): void;
}

export function createRadioBrain(options: RadioBrainOptions): RadioBrain {
  const rng = mulberry32(options.seed ?? 7);
  /* Held mutably so the host can refresh them; see `setHooks`. */
  let emotionHook = options.emotionOf;
  let conditionHook = options.onConditionEvent;

  const emotionFor = (driverId: string) => emotionHook?.(driverId) ?? 'FOCUSED';
  const report = (driverId: string, event: string) => conditionHook?.(driverId, event);

  function setHooks(next: {
    emotionOf?: (driverId: string) => string;
    onConditionEvent?: (driverId: string, event: string) => void;
  }) {
    emotionHook = next.emotionOf ?? emotionHook;
    conditionHook = next.onConditionEvent ?? conditionHook;
  }
  const byId = new Map(options.drivers.map((d) => [d.id, d]));
  const focus = new Set(options.focusDriverIds);
  const memory = new Map<string, DriverMemory>();
  let seq = 0;

  function memoryFor(driverId: string): DriverMemory | null {
    const existing = memory.get(driverId);
    if (existing) return existing;
    const driver = byId.get(driverId);
    if (!driver) return null;
    const fresh: DriverMemory = {
      temperament: temperamentOf(driver),
      voice: memory.size,
      lastSpokeAtMs: -Infinity,
      topicAtMs: {},
      lastPosition: 0,
      lastPitStops: 0,
      trafficMs: 0,
      refusals: 0,
      tyreBand: 0,
      engineBand: 0,
      awaiting: null,
      refusedAtDesire: null,
      pushRefusals: 0,
      boostRefusals: 0,
      referenceLapMs: null,
      lastLapSeen: -1,
    };
    memory.set(driverId, fresh);
    return fresh;
  }

  function make(
    car: CarState,
    state: RaceState,
    kind: RadioKind,
    severity: RadioSeverity,
    text: string,
    decision?: RadioDecision,
  ): RadioMessage {
    return {
      id: `radio-${seq++}`,
      driverId: car.driverId,
      kind,
      severity,
      text,
      lap: car.lap + 1,
      atMs: state.elapsedMs,
      decision,
    };
  }

  /* ------------------------- the pit desire model -------------------- *
   * One number, built from every reason a driver has to want a stop, and
   * compared against a threshold that is personal to them. This is what
   * keeps the box request feeling earned: a patient driver on a hard tyre
   * in clean air simply never crosses it, and a rattled one on shot softs
   * crosses it a lap after the graining starts.
   * ------------------------------------------------------------------ */

  function pitDesire(car: CarState, state: RaceState, mem: DriverMemory): number {
    const lapsRemaining = state.totalLaps - car.lap;
    if (lapsRemaining < MIN_LAPS_FOR_STOP) return 0;

    const t = mem.temperament;

    /* 1. Wear past the driver's own comfort window. The window sits well
     *    below the 72% cliff, and the pressure is measured against 92%
     *    rather than 100% — by the time a tyre is at 92 the driver is not
     *    asking, they are shouting. Patience moves the window by about a
     *    dozen points, which is the difference between a driver who calls
     *    it early and one who will sit on dead rubber for three laps. */
    const window = 52 + t.patience * 12 - t.aggression * 6;
    const wearPressure = clamp01((car.tyre.wearPct - window) / Math.max(1, 92 - window));

    // 2. Lap time actually lost, measured against their own reference.
    let paceLoss = 0;
    if (mem.referenceLapMs != null && car.lastLapMs != null && car.lastLapMs > 0) {
      paceLoss = clamp01((car.lastLapMs / mem.referenceLapMs - 1) / 0.035);
    }

    // 3. The tyre running out before the stint can reasonably end.
    const lifeLeft = lapsOfLifeLeft(car, state.tyreWearScale);
    const lifeShortfall = clamp01((8 - lifeLeft) / 8);

    // 4. Fuel, which is a stop of a different kind but feels the same.
    const fuelNeeded = lapsRemaining * 1.92;
    const fuelPressure = car.fuelKg < fuelNeeded * 0.9 ? 0.35 : 0;

    // 5. Being passed while defending on dead rubber is the loudest
    //    signal of all, and it is what turns a request into a demand.
    const slipping = clamp01((car.position - mem.lastPosition) / 3) * 0.3;

    // 6. Being waved off does not change the tyres, so the case only
    //    gets stronger each time.
    const refusalWeight = Math.min(0.25, mem.refusals * 0.12);

    /* Wear and remaining life are two readings of the same thing, so
     * they are combined by taking whichever is worse rather than added —
     * summing them double-counts a dead tyre and lets two mild signals
     * masquerade as one serious one. */
    const core = Math.max(wearPressure, lifeShortfall);

    const raw = core * 0.72 + paceLoss * 0.18 + fuelPressure + slipping + refusalWeight;

    /* Right at the end of the race nobody stops for anything but a
     * puncture — but "the end" is a share of the distance, not a fixed
     * number of laps, or a short race is damped almost start to finish. */
    const endgameLaps = Math.max(3, Math.round(state.totalLaps * 0.12));
    const endgame = lapsRemaining < endgameLaps ? 0.45 : 1;

    /* Under a neutralisation the stop costs roughly half as much, so a
     * tyre that was not quite worth stopping for suddenly is. This is the
     * single biggest strategic lever in a race and the driver knows it. */
    const neutralised = state.neutralisedLapsRemaining > 0 ? 1.85 : 1;

    return clamp01(raw * endgame * neutralised);
  }

  /* ---------------------------- evaluation --------------------------- */

  function evaluate(state: RaceState): RadioMessage[] {
    const out: RadioMessage[] = [];

    for (const car of state.cars) {
      if (!focus.has(car.driverId)) continue;
      const mem = memoryFor(car.driverId);
      if (!mem) continue;

      const newLap = car.lap !== mem.lastLapSeen;
      mem.lastLapSeen = car.lap;

      /* A clean early lap becomes the reference every later lap is judged
       * against, so "we are losing time" means something specific. */
      if (
        car.lastLapMs != null &&
        car.lastLapMs > 0 &&
        car.status === 'LAPPING' &&
        car.tyre.wearPct < 35 &&
        (mem.referenceLapMs == null || car.lastLapMs < mem.referenceLapMs)
      ) {
        mem.referenceLapMs = car.lastLapMs;
      }

      // A completed stop resets the stint and everything about it.
      if (car.pitStops !== mem.lastPitStops) {
        mem.lastPitStops = car.pitStops;
        mem.refusals = 0;
        mem.refusedAtDesire = null;
        mem.tyreBand = 0;
        mem.awaiting = null;
        mem.trafficMs = 0;
      }

      if (mem.lastPosition === 0) mem.lastPosition = car.position;

      // Traffic is measured in sustained time, not a single tick.
      const boxedIn =
        car.status === 'LAPPING' && car.position > 1 && car.gapToAheadMs < 1200;
      mem.trafficMs = boxedIn ? mem.trafficMs + 200 : Math.max(0, mem.trafficMs - 400);

      if (car.status === 'RETIRED') {
        mem.lastPosition = car.position;
        continue;
      }

      const quiet = state.elapsedMs - mem.lastSpokeAtMs < DRIVER_COOLDOWN_MS;
      const topicReady = (kind: RadioKind) =>
        state.elapsedMs - (mem.topicAtMs[kind] ?? -Infinity) >= TOPIC_COOLDOWN_MS[kind];

      const emit = (message: RadioMessage) => {
        mem.lastSpokeAtMs = state.elapsedMs;
        mem.topicAtMs[message.kind] = state.elapsedMs;
        out.push(message);
      };

      /* --- 1. the box request, highest priority ---------------------- */
      const inPit =
        car.status === 'IN_PIT' ||
        car.status === 'PIT_ENTRY' ||
        car.status === 'PIT_EXIT';
      /* A neutralisation lasts two laps, so the usual cooldown would
       * routinely talk the driver out of mentioning the only free stop
       * in the race. It is allowed to interrupt. */
      const vscWindow = state.neutralisedLapsRemaining > 0 && car.pitStops === mem.lastPitStops;
      if (!inPit && mem.awaiting === null && (topicReady('BOX_REQUEST') || vscWindow)) {
        const desire = pitDesire(car, state, mem);

        /* Having been waved off once, the bar to raise it again is not
         * the original threshold but a visibly worse car. */
        const bar =
          mem.refusedAtDesire == null || state.neutralisedLapsRemaining > 0
            ? ASK_THRESHOLD
            : Math.max(ASK_THRESHOLD, mem.refusedAtDesire + REFUSAL_MARGIN);

        if (desire >= bar) {
          const lapsRemaining = state.totalLaps - car.lap;
          const compound = preferredCompound(lapsRemaining, mem.temperament);
          const desperate = desire >= DESPERATE_THRESHOLD;
          const urgent = desire >= 0.74 || mem.refusals > 0;

          const underVsc = state.neutralisedLapsRemaining > 0;
          const pool = underVsc
            ? BOX_UNDER_VSC
            : desperate
              ? BOX_DESPERATE
              : urgent
                ? BOX_URGENT
                : BOX_CALM;
          const compoundName = compound.toLowerCase();
          const ask =
            mem.temperament.aggression > 0.62 || urgent
              ? ` Put me on the ${compoundName}.`
              : ` I would go ${compoundName} for this stint.`;

          mem.awaiting = 'PIT';
          emit(
            make(
              car,
              state,
              'BOX_REQUEST',
              desperate || urgent ? 'URGENT' : 'CONCERN',
              pickFor(rng, pool, mem.voice) + ask,
              {
                kind: 'PIT',
                affirm: `Box — ${compoundName}`,
                compound,
                rationale: `${Math.round(car.tyre.wearPct)}% wear · ${lapsOfLifeLeft(
                  car,
                  state.tyreWearScale,
                ).toFixed(0)} laps of life · ${lapsRemaining} to go`,
              },
            ),
          );
          mem.lastPosition = car.position;
          continue;
        }
      }

      /* --- 2. attack modes, which are the pit wall's call ------------ *
       * The car never arms push or the override by itself. The driver
       * says when it is worth spending the tyres or the battery, and the
       * pit wall decides whether it is. Both are only worth asking for
       * when there is something in front to catch or behind to hold off,
       * and when the resource is actually there to spend. */
      if (
        !inPit &&
        mem.awaiting === null &&
        car.status === 'LAPPING' &&
        car.lap >= SETTLING_LAPS &&
        // The gap has to have held for a while, not just flickered shut.
        mem.trafficMs > ATTACK_PATIENCE_MS
      ) {
        const chasing = car.position > 1 && car.gapToAheadMs > 0 && car.gapToAheadMs < 2600;
        /* The car behind carries the gap to us, so that is where a
         * "someone is closing on me" reading has to come from. */
        const behind = state.cars.find((c) => c.position === car.position + 1);
        const gapToBehindMs = behind?.gapToAheadMs ?? Infinity;
        const defending = gapToBehindMs > 0 && gapToBehindMs < 1400;
        const lapsRemainingNow = state.totalLaps - car.lap;

        /* Override first: it is the smaller, cheaper ask, and it only
         * makes sense when the car is genuinely within striking range. */
        if (
          !car.boosting &&
          chasing &&
          car.gapToAheadMs < 1200 &&
          car.ersPct >= BOOST_ASK_ERS_FLOOR &&
          mem.boostRefusals < 2 &&
          topicReady('BOOST_REQUEST') &&
          lapsRemainingNow > 1
        ) {
          mem.awaiting = 'BOOST';
          emit(
            make(car, state, 'BOOST_REQUEST', 'CONCERN', pickFor(rng, BOOST_ASK, mem.voice), {
              kind: 'BOOST',
              compound: car.tyre.compound,
              affirm: 'Deploy override',
              rationale: `${(car.gapToAheadMs / 1000).toFixed(1)}s behind P${
                car.position - 1
              } · ${Math.round(car.ersPct)}% energy`,
            }),
          );
          mem.lastPosition = car.position;
          continue;
        }

        /* Push is the bigger commitment — it spends tyre life, fuel and
         * engine for the rest of the stint, so the driver only asks when
         * the tyres can still take it. */
        if (
          !car.attacking &&
          (chasing || defending) &&
          car.tyre.wearPct < PUSH_ASK_TYRE_LIMIT &&
          car.fuelKg > 8 &&
          mem.pushRefusals < 2 &&
          topicReady('PUSH_REQUEST') &&
          lapsRemainingNow > 2
        ) {
          const pool = defending && !chasing ? PUSH_DEFEND : PUSH_ASK;
          mem.awaiting = 'PUSH';
          emit(
            make(car, state, 'PUSH_REQUEST', 'INFO', pickFor(rng, pool, mem.voice), {
              kind: 'PUSH',
              compound: car.tyre.compound,
              affirm: 'Push mode on',
              rationale: defending && !chasing
                ? `Defending P${car.position} · ${(gapToBehindMs / 1000).toFixed(1)}s cover · ${Math.round(car.tyre.wearPct)}% wear`
                : `${(car.gapToAheadMs / 1000).toFixed(1)}s to P${car.position - 1} · ${Math.round(car.tyre.wearPct)}% wear`,
            }),
          );
          mem.lastPosition = car.position;
          continue;
        }
      }

      if (quiet) {
        mem.lastPosition = car.position;
        continue;
      }

      /* --- 3. engine condition, reported in bands -------------------- */
      const engineBand =
        car.engineWearPct >= 88
          ? 3
          : car.engineWearPct >= 72
            ? 2
            : car.engineWearPct >= 54
              ? 1
              : 0;
      if (engineBand > mem.engineBand && topicReady('ENGINE')) {
        mem.engineBand = engineBand;
        const pool =
          engineBand === 3 ? ENGINE_CRITICAL : engineBand === 2 ? ENGINE_SERIOUS : ENGINE_WARN;
        emit(
          make(
            car,
            state,
            'ENGINE',
            engineBand === 3 ? 'URGENT' : engineBand === 2 ? 'CONCERN' : 'INFO',
            pickFor(rng, pool, mem.voice),
          ),
        );
        mem.lastPosition = car.position;
        continue;
      }

      /* --- 4. tyre condition, also banded ---------------------------- */
      const tyreBand = car.tyre.wearPct >= 78 ? 2 : car.tyre.wearPct >= 52 ? 1 : 0;
      if (tyreBand > mem.tyreBand && topicReady('TYRES') && newLap) {
        mem.tyreBand = tyreBand;
        if (tyreBand === 1 && mem.temperament.vocal > 0.45) {
          emit(make(car, state, 'TYRES', 'INFO', pickFor(rng, TYRE_WARN, mem.voice)));
          mem.lastPosition = car.position;
          continue;
        }
      }

      /* --- 5. energy and fuel ---------------------------------------- */
      if (car.ersPct < 8 && topicReady('ENERGY') && car.position > 1) {
        emit(make(car, state, 'ENERGY', 'CONCERN', pickFor(rng, ENERGY_LOW, mem.voice)));
        mem.lastPosition = car.position;
        continue;
      }

      const lapsRemaining = state.totalLaps - car.lap;
      if (lapsRemaining > 3 && car.fuelKg < lapsRemaining * 1.92 * 0.88 && topicReady('FUEL')) {
        emit(make(car, state, 'FUEL', 'CONCERN', pickFor(rng, FUEL_LOW, mem.voice)));
        mem.lastPosition = car.position;
        continue;
      }

      /* --- 6. traffic ------------------------------------------------ */
      if (mem.trafficMs > TRAFFIC_PATIENCE_MS && topicReady('TRAFFIC')) {
        mem.trafficMs = 0;
        report(car.driverId, 'STUCK_IN_TRAFFIC');
        const angry = mem.temperament.aggression > 0.6;
        emit(
          make(
            car,
            state,
            'TRAFFIC',
            angry ? 'CONCERN' : 'INFO',
            pickFor(rng, angry ? TRAFFIC_ANGRY : TRAFFIC_PATIENT, mem.voice),
          ),
        );
        mem.lastPosition = car.position;
        continue;
      }

      /* --- 7. how they are feeling -----------------------------------
       * A driver coming apart says so before the lap times show it, and
       * a driver who is flying says that too. This is the pit wall's
       * early warning, and its cue to pick up the microphone. */
      const emotion = emotionFor(car.driverId);
      if (emotion !== 'FOCUSED' && topicReady('MORALE')) {
        const pool = EMOTION_LINES[emotion];
        if (pool) {
          const urgent = emotion === 'RATTLED' || emotion === 'DEJECTED';
          emit(
            make(
              car,
              state,
              'MORALE',
              urgent ? 'URGENT' : emotion === 'FIRED_UP' ? 'CONCERN' : 'INFO',
              pickFor(rng, pool, mem.voice),
            ),
          );
          mem.lastPosition = car.position;
          continue;
        }
      }

      /* --- 8. positions, only worth a word from a talkative driver --- */
      if (car.position !== mem.lastPosition && topicReady('POSITION')) {
        const gained = car.position < mem.lastPosition;
        const worthSaying = gained ? mem.temperament.vocal > 0.4 : mem.temperament.vocal > 0.55;
        report(car.driverId, gained ? 'OVERTAKE_MADE' : 'OVERTAKEN');
        if (worthSaying && !inPit) {
          emit(make(car, state, 'POSITION', 'INFO', pickFor(rng, gained ? GAINED : LOST, mem.voice)));
        }
      }

      mem.lastPosition = car.position;
    }

    return out;
  }

  /* ------------------------- answering a request --------------------- */

  function answer(driverId: string, accepted: boolean, state: RaceState): RadioMessage | null {
    const mem = memory.get(driverId);
    const car = state.cars.find((c) => c.driverId === driverId);
    if (!mem || !car) return null;

    const kind = mem.awaiting;
    mem.awaiting = null;
    mem.lastSpokeAtMs = state.elapsedMs;

    report(driverId, accepted ? 'REQUEST_GRANTED' : 'REQUEST_REFUSED');

    if (accepted) {
      if (kind === 'PUSH') {
        mem.pushRefusals = 0;
        return make(car, state, 'ACK', 'INFO', 'Copy, pushing now.');
      }
      if (kind === 'BOOST') {
        mem.boostRefusals = 0;
        return make(car, state, 'ACK', 'INFO', 'Deploying — here we go.');
      }
      return make(car, state, 'ACK', 'INFO', 'Copy, box this lap. Thank you.');
    }

    /* A refused attack call is simply accepted — it is the pit wall's
     * decision to make, and the driver drops it rather than nagging. Two
     * refusals and they stop asking for that mode altogether. */
    if (kind === 'PUSH' || kind === 'BOOST') {
      if (kind === 'PUSH') mem.pushRefusals += 1;
      else mem.boostRefusals += 1;
      return make(car, state, 'ACK', 'INFO', pickFor(rng, HOLD_STATION, mem.voice));
    }

    /* A refused stop is different: the tyres are still going away, so the
     * driver will come back — but only once things are meaningfully worse
     * than they were when they were told no. */
    mem.refusals += 1;
    mem.refusedAtDesire = pitDesire(car, state, mem);

    const rattled = mem.temperament.temper * 0.6 + mem.refusals * 0.25;
    const pool =
      rattled > 0.75 ? STAY_OUT_ANGRY : rattled > 0.4 ? STAY_OUT_TENSE : STAY_OUT_CALM;

    return make(car, state, 'ACK', rattled > 0.75 ? 'URGENT' : 'INFO', pickFor(rng, pool, mem.voice));
  }

  /**
   * The pit wall speaking first. This is the other half of a radio: a
   * manager who can only answer questions is not running anything, and a
   * driver who can be talked round — or wound up — is a driver the player
   * has to actually read.
   */
  function call(driverId: string, pitCall: PitWallCall, state: RaceState): RadioMessage | null {
    // Lazily created: the pit wall can speak before the driver has.
    const mem = memoryFor(driverId);
    const car = state.cars.find((c) => c.driverId === driverId);
    if (!mem || !car) return null;

    mem.lastSpokeAtMs = state.elapsedMs;
    const emotion = emotionFor(driverId);

    switch (pitCall) {
      case 'REASSURE': {
        report(driverId, 'REASSURED');
        const pool = REASSURE_REPLY[emotion] ?? REASSURE_REPLY.DEFAULT!;
        return make(car, state, 'ACK', 'INFO', pickFor(rng, pool, mem.voice));
      }
      case 'DEMAND': {
        report(driverId, 'ORDERED_TO_PUSH');
        const pool = DEMAND_REPLY[emotion] ?? DEMAND_REPLY.DEFAULT!;
        return make(
          car,
          state,
          'ACK',
          emotion === 'RATTLED' ? 'URGENT' : 'INFO',
          pickFor(rng, pool, mem.voice),
        );
      }
      case 'PRAISE': {
        report(driverId, 'PRAISED');
        return make(car, state, 'ACK', 'INFO', pickFor(rng, PRAISE_REPLY, mem.voice));
      }
      case 'CALM_DOWN':
      default: {
        report(driverId, 'TOLD_TO_HOLD');
        return make(car, state, 'ACK', 'INFO', pickFor(rng, HOLD_STATION, mem.voice));
      }
    }
  }

  return { evaluate, answer, call, setHooks };
}
