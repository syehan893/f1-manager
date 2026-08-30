import type { DriverCondition, DriverEmotion, GameState } from './types';
import type { Driver } from '@/types';

/* =====================================================================
 * Driver condition.
 *
 * A driver used to be a fixed set of attributes: the same person on the
 * Sunday after a pole as on the Sunday after being crashed out. That is
 * the single biggest reason a race could be predicted from the timing
 * screen before it started.
 *
 * Condition is the part of a driver that moves. Four numbers, and they
 * do genuinely different jobs:
 *
 *   morale   the slow one. Where they stand with the team over a season.
 *   mood     the fast one. Swings hard on a single qualifying lap.
 *   stress   accumulated pressure. This is what produces mistakes.
 *   fitness  physical readiness. Drains across a weekend, recovers between.
 *
 * `emotion` is *derived* from those rather than stored, so it can never
 * disagree with them. It is what the radio reads to decide how a driver
 * speaks, and what the engine reads to decide how they drive.
 *
 * The design rule throughout: every effect is two-sided. A fired-up
 * driver is quicker *and* more likely to throw it away. Reassuring a
 * rattled driver calms them *and* takes the edge off. Nothing here is a
 * free upgrade.
 * ===================================================================== */

export const NEUTRAL_MOOD = 60;
export const NEUTRAL_STRESS = 30;

export function blankCondition(driverId: string, morale = 75): DriverCondition {
  return {
    driverId,
    morale,
    fitness: 96,
    mood: NEUTRAL_MOOD,
    stress: NEUTRAL_STRESS,
  };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

/* ------------------------------ emotion -------------------------------- */

/**
 * The dominant feeling, read off mood and stress. The order matters: the
 * extremes are checked first, because a driver who is coming apart is not
 * "focused with reservations".
 */
export function emotionOf(condition: DriverCondition): DriverEmotion {
  const { mood, stress } = condition;

  if (stress >= 78) return mood >= 62 ? 'FIRED_UP' : 'RATTLED';
  if (mood <= 26) return 'DEJECTED';
  if (mood >= 78 && stress <= 42) return 'CONFIDENT';
  if (mood <= 42 || stress >= 60) return 'FRUSTRATED';
  return 'FOCUSED';
}

export const EMOTION_LABEL: Record<DriverEmotion, string> = {
  CONFIDENT: 'Confident',
  FOCUSED: 'Focused',
  FIRED_UP: 'Fired up',
  FRUSTRATED: 'Frustrated',
  RATTLED: 'Rattled',
  DEJECTED: 'Dejected',
};

export const EMOTION_BLURB: Record<DriverEmotion, string> = {
  CONFIDENT: 'Quick, settled and taking the right risks. The best place to be.',
  FOCUSED: 'Nothing to report. Doing the job.',
  FIRED_UP: 'Fast and on the edge. They will try something — it may not come off.',
  FRUSTRATED: 'Losing a little time and asking a lot of questions on the radio.',
  RATTLED: 'Under real pressure. Expect a mistake before you expect a lap time.',
  DEJECTED: 'Head down. Slow, quiet, and not fighting for anything.',
};

export const EMOTION_TONE: Record<DriverEmotion, string> = {
  CONFIDENT: 'var(--color-neon-lime)',
  FOCUSED: 'var(--color-neon-cyan)',
  FIRED_UP: 'var(--color-neon-amber)',
  FRUSTRATED: 'var(--color-neon-amber)',
  RATTLED: 'var(--color-neon-red)',
  DEJECTED: 'var(--color-chrome-500)',
};

/* ------------------------- what it does on track ----------------------- */

export interface ConditionEffects {
  /** Signed lap-time factor. Negative is quicker. */
  paceFactor: number;
  /** Multiplier on lap-to-lap scatter. Above 1 is messier. */
  errorMultiplier: number;
  /** Multiplier on tyre wear. Above 1 is harder on the rubber. */
  tyreMultiplier: number;
  /** Added to the driver's willingness to attack, −1..+1. */
  aggression: number;
}

/**
 * How a driver's state translates into what the car does. The two-sided
 * rule shows up here: the emotions that buy pace also buy mistakes.
 */
export function conditionEffects(condition: DriverCondition): ConditionEffects {
  const emotion = emotionOf(condition);

  // Around the neutral point, so an untouched driver is exactly neutral.
  const moodEdge = (condition.mood - NEUTRAL_MOOD) / 40;
  const stressEdge = (condition.stress - NEUTRAL_STRESS) / 50;
  const tired = (96 - condition.fitness) / 96;

  const base: ConditionEffects = {
    // A settled driver finds a little; a flat one gives some back.
    paceFactor: -moodEdge * 0.0022 + tired * 0.004,
    errorMultiplier: 1 + Math.max(0, stressEdge) * 0.75 + tired * 0.3,
    tyreMultiplier: 1 + Math.max(0, stressEdge) * 0.14,
    aggression: moodEdge * 0.3 + Math.max(0, stressEdge) * 0.15,
  };

  switch (emotion) {
    case 'FIRED_UP':
      /* The dangerous one. Genuinely quick and genuinely likely to bin it,
       * which is what makes a race with one in it hard to call. */
      return {
        paceFactor: base.paceFactor - 0.0026,
        errorMultiplier: base.errorMultiplier * 1.35,
        tyreMultiplier: base.tyreMultiplier * 1.12,
        aggression: Math.min(1, base.aggression + 0.45),
      };
    case 'RATTLED':
      return {
        paceFactor: base.paceFactor + 0.0032,
        errorMultiplier: base.errorMultiplier * 1.45,
        tyreMultiplier: base.tyreMultiplier * 1.1,
        aggression: base.aggression - 0.2,
      };
    case 'DEJECTED':
      return {
        paceFactor: base.paceFactor + 0.0042,
        errorMultiplier: base.errorMultiplier * 1.1,
        tyreMultiplier: base.tyreMultiplier,
        aggression: Math.max(-1, base.aggression - 0.5),
      };
    case 'CONFIDENT':
      return {
        paceFactor: base.paceFactor - 0.0018,
        errorMultiplier: base.errorMultiplier * 0.86,
        tyreMultiplier: base.tyreMultiplier * 0.95,
        aggression: base.aggression + 0.18,
      };
    case 'FRUSTRATED':
      return {
        paceFactor: base.paceFactor + 0.0014,
        errorMultiplier: base.errorMultiplier * 1.15,
        tyreMultiplier: base.tyreMultiplier * 1.06,
        aggression: base.aggression + 0.1,
      };
    default:
      return base;
  }
}

/* ------------------------------- events -------------------------------- */

/**
 * Everything that can move a driver's state, and by how much. Keeping
 * them in one table is what stops the numbers drifting apart as they get
 * applied from five different places.
 */
export const CONDITION_EVENTS = {
  /* --- Saturday ---------------------------------------------------- */
  OUT_QUALIFIED_MATE: { mood: +9, stress: -6, morale: +2 },
  BEATEN_BY_MATE: { mood: -8, stress: +7, morale: -2 },
  QUALIFIED_WELL: { mood: +7, stress: -5, morale: +1 },
  QUALIFIED_POORLY: { mood: -9, stress: +9, morale: -2 },

  /* --- Sunday ------------------------------------------------------ */
  OVERTAKE_MADE: { mood: +4, stress: -3 },
  OVERTAKEN: { mood: -4, stress: +5 },
  STUCK_IN_TRAFFIC: { mood: -2, stress: +4 },
  TYRES_GONE: { mood: -3, stress: +6 },
  REQUEST_GRANTED: { mood: +4, stress: -5 },
  REQUEST_REFUSED: { mood: -5, stress: +7 },
  REASSURED: { mood: +3, stress: -12 },
  ORDERED_TO_PUSH: { mood: +2, stress: +8 },
  TOLD_TO_HOLD: { mood: -2, stress: -7 },
  PRAISED: { mood: +8, stress: -4, morale: +1 },
  MECHANICAL_FAILURE: { mood: -14, stress: +10, morale: -4 },

  /* --- after the flag ---------------------------------------------- */
  RESULT_EXCELLENT: { mood: +14, stress: -18, morale: +6 },
  RESULT_GOOD: { mood: +7, stress: -12, morale: +3 },
  RESULT_POOR: { mood: -9, stress: +4, morale: -3 },
  RESULT_TERRIBLE: { mood: -15, stress: +8, morale: -6 },
} as const;

export type ConditionEvent = keyof typeof CONDITION_EVENTS;

/* ---------------------------- temperament ------------------------------ */

/**
 * How one particular driver takes things.
 *
 * The same result does not land the same way on two people, and until
 * now it did: every driver moved by the same number, which is what made
 * mood and stress read as sliders rather than as anybody's actual state.
 *
 *   volatility  how far they swing. A volatile driver is euphoric and
 *               inconsolable in the same afternoon.
 *   resilience  how much of a bad day they shrug off. High resilience
 *               takes the edge off everything negative.
 *   ego         how much being beaten by the team-mate specifically
 *               stings, over and above the result itself.
 */
export interface Temperament {
  volatility: number;
  resilience: number;
  ego: number;
}

function seeded(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/**
 * Two thirds from who they are, one third fixed to them for life.
 *
 * Consistency and stamina are the closest the attribute set has to
 * composure, so they carry most of it — a driver who can repeat a lap
 * under pressure is the same driver who does not fall apart after a bad
 * Saturday. The rest is temperament proper: some people are simply more
 * dramatic than their lap times suggest, and it never changes.
 */
export function temperamentOf(driver: Driver | undefined): Temperament {
  if (!driver) return { volatility: 1, resilience: 1, ego: 1 };

  const { consistency, stamina, attack } = driver.attributes;
  const composure = (consistency + stamina) / 2;
  const streak = seeded(driver.id);

  /* All three are centred on 1 at a composure of 70, so an average
   * driver is the neutral case and the spread runs both ways. Centring
   * resilience on the 0-100 scale instead left every driver above 1 —
   * everybody shrugged everything off a bit, and nobody was fragile. */
  return {
    volatility: clampFactor(1 + (70 - composure) / 90 + (streak - 0.5) * 0.5),
    resilience: clampFactor(1 + (composure - 70) / 110 + (streak - 0.5) * 0.3),
    ego: clampFactor(1 + (attack - 70) / 110 + (seeded(driver.id + ':ego') - 0.5) * 0.4),
  };
}

const clampFactor = (value: number) => Math.max(0.55, Math.min(1.6, Math.round(value * 100) / 100));

/** Events a resilient driver is allowed to shrug off. */
const NEGATIVE_EVENTS = new Set<ConditionEvent>([
  'BEATEN_BY_MATE',
  'QUALIFIED_POORLY',
  'OVERTAKEN',
  'STUCK_IN_TRAFFIC',
  'TYRES_GONE',
  'REQUEST_REFUSED',
  'MECHANICAL_FAILURE',
  'RESULT_POOR',
  'RESULT_TERRIBLE',
]);

/** Context that makes an event land as one person's rather than anyone's. */
export interface ConditionContext {
  temperament?: Temperament;
  /** What happened, in the driver's own terms, for the reason trail. */
  label?: string;
  season?: number;
  round?: number;
}

/**
 * What each event was, in the words the driver would use.
 *
 * The reason trail is only worth keeping if it reads like an afternoon
 * rather than like an enum, so every event that can reach a driver has a
 * sentence here. Results and qualifying supply their own, because those
 * carry positions the table cannot know.
 */
export const CONDITION_LABEL: Record<ConditionEvent, string> = {
  OUT_QUALIFIED_MATE: 'Beat his team-mate in qualifying',
  BEATEN_BY_MATE: 'Out-qualified by his team-mate',
  QUALIFIED_WELL: 'A strong qualifying',
  QUALIFIED_POORLY: 'A poor qualifying',
  OVERTAKE_MADE: 'Made a move stick',
  OVERTAKEN: 'Lost a place on track',
  STUCK_IN_TRAFFIC: 'Stuck behind a slower car',
  TYRES_GONE: 'Ran out of tyre',
  REQUEST_GRANTED: 'The pit wall backed his call',
  REQUEST_REFUSED: 'The pit wall turned him down',
  REASSURED: 'Talked down over the radio',
  ORDERED_TO_PUSH: 'Told to push',
  TOLD_TO_HOLD: 'Told to hold station',
  PRAISED: 'Praised over the radio',
  MECHANICAL_FAILURE: 'The car let him down',
  RESULT_EXCELLENT: 'A big result',
  RESULT_GOOD: 'A good afternoon',
  RESULT_POOR: 'A disappointing result',
  RESULT_TERRIBLE: 'A bad day',
};

/** Newest first, and this is the cap — a memory, not a diary. */
export const CONDITION_MEMORY = 6;

/**
 * Apply one event. Returns a new condition; never mutates.
 *
 * Two things make this more than arithmetic. The driver's temperament
 * decides how far it moves them, so the same podium lifts one driver
 * twice as much as their team-mate. And the reason is written down, so
 * the number on the screen can be traced back to the afternoon that
 * produced it instead of drifting silently.
 */
export function applyConditionEvent(
  condition: DriverCondition,
  event: ConditionEvent,
  scale = 1,
  context: ConditionContext = {},
): DriverCondition {
  const delta = CONDITION_EVENTS[event] as {
    mood?: number;
    stress?: number;
    morale?: number;
  };

  const { volatility = 1, resilience = 1, ego = 1 } = context.temperament ?? {};

  /* Everything is amplified by how dramatic they are; the bad things are
   * then taken back down by how much they let slide. Being beaten by the
   * team-mate is the one that scales with ego rather than with either. */
  let factor = scale * volatility;
  if (NEGATIVE_EVENTS.has(event)) factor /= resilience;
  if (event === 'BEATEN_BY_MATE' || event === 'OUT_QUALIFIED_MATE') factor *= ego;

  const mood = (delta.mood ?? 0) * factor;
  const stress = (delta.stress ?? 0) * factor;
  const morale = (delta.morale ?? 0) * factor;

  const recent = context.label
    ? [
        {
          season: context.season ?? 0,
          round: context.round ?? 0,
          label: context.label,
          mood: Math.round(mood * 10) / 10,
          stress: Math.round(stress * 10) / 10,
          morale: Math.round(morale * 10) / 10,
        },
        ...(condition.recent ?? []),
      ].slice(0, CONDITION_MEMORY)
    : condition.recent;

  return {
    ...condition,
    mood: clamp(condition.mood + mood),
    stress: clamp(condition.stress + stress),
    morale: clamp(condition.morale + morale),
    ...(recent ? { recent } : {}),
  };
}

/**
 * Between race weekends everything drifts back towards the middle. A
 * driver does not stay furious for a month, and does not stay euphoric
 * either — which is what stops one good Sunday carrying a whole season.
 */
export function recoverBetweenRounds(condition: DriverCondition): DriverCondition {
  const towards = (value: number, target: number, rate: number) =>
    value + (target - value) * rate;

  return {
    ...condition,
    mood: clamp(towards(condition.mood, NEUTRAL_MOOD, 0.45)),
    stress: clamp(towards(condition.stress, NEUTRAL_STRESS, 0.55)),
    // Morale is the slow one on purpose: it is the season, not the day.
    morale: clamp(towards(condition.morale, 70, 0.1)),
    fitness: clamp(Math.min(100, condition.fitness + 14)),
  };
}

/** A race weekend takes something out of a driver physically. */
export function applyRaceFatigue(condition: DriverCondition, laps: number): DriverCondition {
  return { ...condition, fitness: clamp(condition.fitness - 6 - laps * 0.14) };
}

/* ------------------------------ helpers -------------------------------- */

export function conditionOf(state: GameState | null, driverId: string): DriverCondition {
  return state?.driverConditions[driverId] ?? blankCondition(driverId);
}

/** One-line summary for a panel, in the driver's own terms. */
export function conditionSummary(condition: DriverCondition): string {
  const emotion = emotionOf(condition);
  if (emotion === 'RATTLED') return 'Under real pressure — a mistake is coming.';
  if (emotion === 'FIRED_UP') return 'On the edge and quick with it.';
  if (emotion === 'DEJECTED') return 'Gone quiet. Not fighting for anything.';
  if (emotion === 'CONFIDENT') return 'Settled, quick, and taking the right risks.';
  if (emotion === 'FRUSTRATED') return 'Unhappy, and it is costing a little time.';
  return 'Doing the job with nothing to report.';
}
