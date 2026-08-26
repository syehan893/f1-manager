import { PARTS, POWER_UNIT_PARTS, fittedUnit } from './carModel';
import { conditionOf, emotionOf } from './driverCondition';
import { activeContracts } from './finance';
import { effectiveRating } from './staffing';
import { ROLES } from '@/data/staff';
import type { StaffRole } from '@/data/staff';
import type { Driver, TyreCompound, ViewId } from '@/types';
import type { GameState, PartCategory, StrategyPlan } from './types';

/* =====================================================================
 * The briefing room, and the debrief after it.
 *
 * A career game can be played entirely off numbers, and that is exactly
 * what makes a season feel like a spreadsheet. The people in the team are
 * the ones who should be telling the player what those numbers mean —
 * before the grid forms, and again once the flag has fallen.
 *
 * Two rules keep this from becoming wallpaper:
 *
 *   1. Nobody speaks without something to say. Only three people are on
 *      every briefing — the strategist, who owns the plan; the team
 *      principal, who owns the commercial side; and whoever is running
 *      the car's biggest current problem. Everyone else appears when
 *      their department genuinely has news and stays quiet otherwise.
 *
 *   2. Every line is derived from live state. A driver complaining about
 *      the tyre is reading the plan the player actually signed off; the
 *      aerodynamicist only mentions the floor when the floor is the
 *      weakest thing on the car. Nothing here is decoration.
 *
 * All of it is deterministic on the season and round, so reloading a save
 * cannot fish for a different conversation.
 * ===================================================================== */

export type BriefingTopic =
  | 'STRATEGY'
  | 'TYRES'
  | 'AGGRESSION'
  | 'MOOD'
  | 'STRESS'
  | 'SPONSOR'
  | 'DEVELOPMENT'
  | 'RELIABILITY'
  | 'EXPECTATION'
  | 'RESULT';

export type BriefingTone = 'GOOD' | 'NEUTRAL' | 'WARN' | 'BAD';

export interface BriefingLine {
  id: string;
  /** Who is speaking, so the UI can show a driver differently to staff. */
  kind: 'DRIVER' | 'STAFF';
  /** Display name of the speaker. */
  name: string;
  /** Their job, or the car number for a driver. */
  subtitle: string;
  topic: BriefingTopic;
  tone: BriefingTone;
  text: string;
  /** Where the player would go to act on it, if anywhere. */
  action?: { label: string; view: ViewId };
}

/* --------------------------- deterministic pick ------------------------ */

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/** Picks one line from a pool, stable for a given key. */
function pick(pool: readonly string[], key: string): string {
  return pool[Math.floor(hash(key) * pool.length)] ?? pool[0]!;
}

/**
 * The same, but never repeating a line already used in this briefing.
 * Two team-mates drawing the same sentence out of a shared pool reads as
 * a bug, however correct each pick is on its own.
 */
function pickFresh(pool: readonly string[], key: string, used: Set<string>): string {
  const start = Math.floor(hash(key) * pool.length);
  for (let step = 0; step < pool.length; step++) {
    const candidate = pool[(start + step) % pool.length]!;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  return pool[start] ?? pool[0]!;
}

/* ------------------------------- helpers ------------------------------- */

function appointmentFor(state: GameState, role: StaffRole) {
  return state.staff.find((entry) => entry.role === role) ?? null;
}

function roleLabel(role: StaffRole): string {
  return ROLES.find((entry) => entry.id === role)?.label ?? role;
}

const COMPOUND_LABEL: Record<TyreCompound, string> = {
  SOFT: 'soft',
  MEDIUM: 'medium',
  HARD: 'hard',
  INTER: 'intermediate',
  WET: 'wet',
};

/** Which senior engineer owns a given part of the car. */
function ownerOf(category: PartCategory): StaffRole {
  if (POWER_UNIT_PARTS.includes(category)) return 'POWER_UNIT_ENGINEER';
  const group = PARTS.find((part) => part.id === category)?.group;
  if (group === 'AERODYNAMICS') return 'AERODYNAMICIST';
  return 'TECHNICAL_DIRECTOR';
}

function partLabel(category: PartCategory): string {
  return PARTS.find((part) => part.id === category)?.label ?? category;
}

function playerTeam(state: GameState) {
  return state.teams.find((team) => team.teamId === state.playerTeamId) ?? null;
}

function gridSlot(state: GameState, driverId: string): number | null {
  const entry = state.qualifying?.entries.find((row) => row.driverId === driverId);
  return entry?.position ?? null;
}

function planFor(state: GameState, driverId: string): StrategyPlan | null {
  const plan = state.strategies[driverId];
  return plan && plan.confirmedForRound === state.round ? plan : null;
}

/* ============================ driver voices ============================ */

const MOOD_HIGH = [
  'Car felt properly good out there. I would not change much.',
  'I am happy. Give me the same car and I will take it from here.',
  'Best I have felt in it all year. Let us not overthink today.',
] as const;

const MOOD_LOW = [
  'I am not enjoying it, and I am not going to pretend otherwise.',
  'Something is off and I cannot find it. I need help from your side.',
  'Confidence is not there. I am braking early and I know it.',
] as const;

const STRESS_HIGH = [
  'Keep the radio quiet today unless it matters. I am wound up enough.',
  'A lot riding on this one. I can feel it more than I would like.',
  'I need a clean start and a clean first stint or this gets away from me.',
] as const;

const TYRE_SOFT = [
  'Starting on the {c} — I will get the jump, but do not leave me out.',
  'The {c} will go off. I want the call early, not one lap late.',
  'Happy with the {c} for the start. Just be ready when it drops.',
] as const;

const TYRE_HARD = [
  'The {c} is the safe call. It will be a slow first ten laps, so be patient with me.',
  'On the {c} I will lose places early. Do not panic on the pit wall.',
  'I can run the {c} long. Let it come to us.',
] as const;

const PUSH_HIGH = [
  'Push five is fine by me, but I will be out of tyre before the end.',
  'You want me attacking — understood. Do not ask me to save later.',
  'I will race hard. Just know what it costs in rubber.',
] as const;

const PUSH_LOW = [
  'Holding station all race is going to hurt. I would rather race.',
  'If I am conserving I will lose places I cannot get back.',
  'I will manage it, but somebody will come past and stay past.',
] as const;

const GRID_GOOD = [
  'Starting P{p}. That is a real chance — do not waste it on the pit wall.',
  'P{p} is where we should be. Now we convert it.',
] as const;

const NO_PLAN = [
  'Nobody has told me what we are doing today. I need a plan.',
  'I have no idea what our race looks like. Somebody needs to tell me.',
  'I am going to the grid blind here. What are we doing?',
] as const;

const GRID_BAD = [
  'P{p} is not what I wanted. We need to be aggressive to fix it.',
  'Starting P{p} means the race is the only place to make it back.',
] as const;

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

/**
 * What one driver has to say before the race. At most three lines each —
 * a driver who says everything says nothing.
 */
function driverPreRace(state: GameState, driver: Driver, used: Set<string>): BriefingLine[] {
  const condition = conditionOf(state, driver.id);
  const emotion = emotionOf(condition);
  const plan = planFor(state, driver.id);
  const slot = gridSlot(state, driver.id);
  const seed = `${state.season}:${state.round}:${driver.id}`;
  const lines: BriefingLine[] = [];

  const say = (
    topic: BriefingTopic,
    tone: BriefingTone,
    text: string,
    action?: BriefingLine['action'],
  ) => {
    lines.push({
      id: `pre:${driver.id}:${topic}:${lines.length}`,
      kind: 'DRIVER',
      name: `${driver.firstName} ${driver.lastName}`,
      subtitle: `#${driver.carNumber}`,
      topic,
      tone,
      text,
      action,
    });
  };

  /* How they are, first — it colours everything else they say. */
  if (condition.stress >= 68) {
    say('STRESS', 'WARN', pickFresh(STRESS_HIGH, seed + 'stress', used));
  } else if (condition.mood >= 74) {
    say('MOOD', 'GOOD', pickFresh(MOOD_HIGH, seed + 'mood', used));
  } else if (condition.mood <= 40) {
    say('MOOD', 'BAD', pickFresh(MOOD_LOW, seed + 'mood', used), {
      label: 'Driver condition',
      view: 'drivers',
    });
  }

  /* The tyre they have been given. */
  if (plan) {
    const compound = COMPOUND_LABEL[plan.startingCompound];
    const pool = plan.startingCompound === 'HARD' ? TYRE_HARD : TYRE_SOFT;
    say(
      'TYRES',
      'NEUTRAL',
      fill(pickFresh(pool, seed + 'tyre', used), { c: compound }),
      { label: 'Race strategy', view: 'race-strategy' },
    );

    /* And what they have been told to do with it. A driver who is fired
     * up and told to conserve is the most likely to ignore the call. */
    if (plan.pushLevel >= 4) {
      say('AGGRESSION', emotion === 'RATTLED' ? 'WARN' : 'NEUTRAL', pickFresh(PUSH_HIGH, seed + 'push', used), {
        label: 'Race strategy',
        view: 'race-strategy',
      });
    } else if (plan.pushLevel <= 2) {
      say(
        'AGGRESSION',
        emotion === 'FIRED_UP' ? 'WARN' : 'NEUTRAL',
        pickFresh(PUSH_LOW, seed + 'push', used),
        { label: 'Race strategy', view: 'race-strategy' },
      );
    }
  } else {
    say('STRATEGY', 'WARN', pickFresh(NO_PLAN, seed + 'plan', used), {
      label: 'Race strategy',
      view: 'race-strategy',
    });
  }

  /* Where they are starting from, if it is worth remarking on. */
  if (slot !== null && lines.length < 3) {
    if (slot <= 5) {
      say('STRATEGY', 'GOOD', fill(pickFresh(GRID_GOOD, seed + 'grid', used), { p: String(slot) }));
    } else if (slot >= 15) {
      say('STRATEGY', 'WARN', fill(pickFresh(GRID_BAD, seed + 'grid', used), { p: String(slot) }));
    }
  }

  return lines.slice(0, 3);
}

/* ============================ staff voices ============================= */

/**
 * The strategist is on every briefing: they own the plan, so if the plan
 * is thin that is the first thing the player should hear.
 */
function strategistPreRace(state: GameState, drivers: Driver[]): BriefingLine | null {
  const appointment = appointmentFor(state, 'STRATEGIST');
  const base = {
    id: 'pre:staff:STRATEGIST',
    kind: 'STAFF' as const,
    name: appointment?.name ?? 'Strategy desk',
    subtitle: roleLabel('STRATEGIST'),
    topic: 'STRATEGY' as const,
  };

  if (!appointment) {
    return {
      ...base,
      tone: 'BAD',
      text: 'Nobody is running strategy. The stops are being called off the cuff, and it shows on a Sunday.',
      action: { label: 'Hire a strategist', view: 'staff' },
    };
  }

  const plans = drivers.map((driver) => planFor(state, driver.id)).filter(Boolean) as StrategyPlan[];
  if (plans.length < drivers.length) {
    return {
      ...base,
      tone: 'WARN',
      text: 'I am still short a signed-off plan. I cannot model the race until both cars have one.',
      action: { label: 'Race strategy', view: 'race-strategy' },
    };
  }

  const stops = plans.map((plan) => Math.max(0, plan.stints.length - 1));
  const rating = effectiveRating(state, 'STRATEGIST');
  const seed = `${state.season}:${state.round}:strategist`;

  /* A strong strategist says something specific; a weak one hedges. That
   * is the difference the player is paying for. */
  if (stops.every((count) => count === 0)) {
    return {
      ...base,
      tone: 'WARN',
      text: 'We are planning to run the whole thing without stopping. That only works if the tyre holds, and I would not bet the race on it.',
      action: { label: 'Race strategy', view: 'race-strategy' },
    };
  }

  if (stops[0] !== stops[1] && stops.length === 2) {
    return {
      ...base,
      tone: 'GOOD',
      text: `Split strategy today — ${stops[0]} stop against ${stops[1]}. If the first stint goes long we have both outcomes covered.`,
      action: { label: 'Race strategy', view: 'race-strategy' },
    };
  }

  const confident = rating >= 78;
  return {
    ...base,
    tone: 'NEUTRAL',
    text: confident
      ? `Both cars on a ${stops[0]}-stop. I have run it forty ways this morning and it is the quickest race on paper.`
      : pick(
          [
            `Both cars on a ${stops[0]}-stop. It is the obvious call, which means everyone else has it too.`,
            `${stops[0]} stop for both. I would like more data before I commit to anything cleverer.`,
          ],
          seed,
        ),
    action: { label: 'Race strategy', view: 'race-strategy' },
  };
}

/**
 * The team principal is the commercial voice: what the partners were
 * promised, and whether the season is delivering it.
 */
function principalPreRace(state: GameState): BriefingLine | null {
  const appointment = appointmentFor(state, 'TEAM_PRINCIPAL');
  const base = {
    id: 'pre:staff:TEAM_PRINCIPAL',
    kind: 'STAFF' as const,
    name: appointment?.name ?? 'The board',
    subtitle: appointment ? roleLabel('TEAM_PRINCIPAL') : 'Ownership',
    topic: 'SPONSOR' as const,
  };

  const contracts = activeContracts(state);
  const standing =
    state.standings.constructors.find((row) => row.teamId === state.playerTeamId)?.position ?? null;

  if (contracts.length === 0) {
    return {
      ...base,
      tone: 'WARN',
      text: 'We are racing without a title partner. That is money on the table every single Sunday.',
      action: { label: 'Sponsors', view: 'sponsors' },
    };
  }

  /* The tightest promise on the books is the one worth naming. */
  const tightest = [...contracts].sort((a, b) => a.targetPosition - b.targetPosition)[0]!;
  const missing = standing !== null && standing > tightest.targetPosition;

  return {
    ...base,
    tone: missing ? 'WARN' : 'GOOD',
    text: missing
      ? `We promised our partners a P${tightest.targetPosition} finish in the championship and we are sitting P${standing}. That penalty is real money if it stands.`
      : standing !== null
        ? `Partners are happy — P${standing} against a promised P${tightest.targetPosition}. Keep it there and the bonuses land in full.`
        : `Our commitment this year is P${tightest.targetPosition} in the championship. Everything else follows from that.`,
    action: { label: 'Sponsors', view: 'sponsors' },
  };
}

/**
 * Technical staff only speak when their department has news — a project
 * that has landed, or one the car plainly needs. This is what keeps the
 * briefing from turning into a standing meeting nobody reads.
 */
function technicalPreRace(state: GameState): BriefingLine[] {
  const team = playerTeam(state);
  if (!team) return [];

  const lines: BriefingLine[] = [];
  const seed = `${state.season}:${state.round}`;

  /* Work that lands this week is worth announcing. */
  const landing = team.development.filter((project) => project.weeksRemaining <= 0);
  for (const project of landing.slice(0, 2)) {
    const role = ownerOf(project.category);
    const appointment = appointmentFor(state, role);
    lines.push({
      id: `pre:dev:${project.id}`,
      kind: 'STAFF',
      name: appointment?.name ?? roleLabel(role),
      subtitle: roleLabel(role),
      topic: 'DEVELOPMENT',
      tone: 'GOOD',
      text: `The new ${partLabel(project.category).toLowerCase()} is signed off and on the car — ${project.gain} level${project.gain === 1 ? '' : 's'} up. You should feel it today.`,
      action: { label: 'Car development', view: 'car-dev' },
    });
  }

  /* The weakest part of the car, named by whoever owns it. Only when it
   * is genuinely a weak point and nothing is already being done. */
  const weakest = [...team.parts].sort((a, b) => a.level - b.level)[0];
  const alreadyOnIt = team.development.some((project) => project.category === weakest?.category);
  if (weakest && weakest.level < 70 && !alreadyOnIt && lines.length < 3) {
    const role = ownerOf(weakest.category);
    const appointment = appointmentFor(state, role);
    lines.push({
      id: `pre:weak:${weakest.category}`,
      kind: 'STAFF',
      name: appointment?.name ?? roleLabel(role),
      subtitle: roleLabel(role),
      topic: 'DEVELOPMENT',
      tone: 'WARN',
      text: pick(
        [
          `The ${partLabel(weakest.category).toLowerCase()} is the weakest thing on this car at ${weakest.level}. Every lap we run, it is costing us.`,
          `We are carrying a ${weakest.level}-level ${partLabel(weakest.category).toLowerCase()}. Until that moves, the rest of the car is working around it.`,
        ],
        seed + weakest.category,
      ),
      action: { label: 'Car development', view: 'car-dev' },
    });
  }

  /* The chief mechanic speaks when the power unit is the thing at risk. */
  const unit = fittedUnit(team);
  if (unit && unit.healthPct < 45 && lines.length < 4) {
    const appointment = appointmentFor(state, 'CHIEF_MECHANIC');
    lines.push({
      id: 'pre:pu-health',
      kind: 'STAFF',
      name: appointment?.name ?? roleLabel('CHIEF_MECHANIC'),
      subtitle: roleLabel('CHIEF_MECHANIC'),
      topic: 'RELIABILITY',
      tone: unit.healthPct < 25 ? 'BAD' : 'WARN',
      text: `The unit in the car is down to ${Math.round(unit.healthPct)}% and has ${Math.round(unit.mileageLaps)} laps on it. I would not ask it for a full race distance at full power.`,
      action: { label: 'Car development', view: 'car-dev' },
    });
  }

  return lines;
}

/* ============================== assembly =============================== */

/**
 * Everything the team has to say before the grid forms. The strategist
 * and the principal are always here; everyone else earned their place.
 */
export function preRaceBriefing(state: GameState, drivers: Driver[]): BriefingLine[] {
  const lines: BriefingLine[] = [];

  const strategist = strategistPreRace(state, drivers);
  if (strategist) lines.push(strategist);

  const principal = principalPreRace(state);
  if (principal) lines.push(principal);

  lines.push(...technicalPreRace(state));

  /* Shared so two team-mates never draw the same sentence. */
  const used = new Set<string>();
  for (const driver of drivers) lines.push(...driverPreRace(state, driver, used));

  return lines;
}

/* ------------------------------ debrief -------------------------------- */

const RESULT_GREAT = [
  'That is what this car can do. Thank you — genuinely.',
  'Everything worked today. The stops, the calls, all of it.',
  'I will take that every weekend. Great job on the wall.',
] as const;

const RESULT_OK = [
  'We got what was in the car. No complaints from me.',
  'Solid. Not spectacular, but we banked it.',
  'That is about where we deserved to be.',
] as const;

const RESULT_POOR = [
  'That was a long afternoon. We were nowhere.',
  'I could not do anything with it. We need to look at this properly.',
  'Not good enough, and I include myself in that.',
] as const;

const RESULT_DNF = [
  'Gutted. It let go and there was nothing I could do.',
  'That one hurts. I was in a decent position too.',
  'We cannot keep losing races to the car.',
] as const;

/**
 * What the room says once the flag has fallen. The driver reacts to what
 * they actually did against where they started; the staff turn it into
 * something to act on before the next round.
 */
export function postRaceBriefing(state: GameState, drivers: Driver[]): BriefingLine[] {
  const result = state.lastRace;
  if (!result) return [];

  const lines: BriefingLine[] = [];
  const seed = `${result.season}:${result.round}`;
  const used = new Set<string>();

  for (const driver of drivers) {
    const finish = result.finishers.find((row) => row.driverId === driver.id);
    if (!finish) continue;

    const retired = finish.status === 'DNF';
    const gained = finish.positionsGained;
    const pool = retired
      ? RESULT_DNF
      : finish.position <= 5 || gained >= 4
        ? RESULT_GREAT
        : gained <= -4 || finish.position >= 16
          ? RESULT_POOR
          : RESULT_OK;

    lines.push({
      id: `post:${driver.id}:RESULT`,
      kind: 'DRIVER',
      name: `${driver.firstName} ${driver.lastName}`,
      subtitle: retired ? 'DNF' : `P${finish.position}`,
      topic: 'RESULT',
      tone: retired ? 'BAD' : pool === RESULT_GREAT ? 'GOOD' : pool === RESULT_POOR ? 'WARN' : 'NEUTRAL',
      text: pickFresh(pool, seed + driver.id, used),
    });

    /* And how the afternoon left them, which is what carries into the
     * next round rather than staying on this screen. */
    const condition = conditionOf(state, driver.id);
    const emotion = emotionOf(condition);
    if (emotion === 'RATTLED' || emotion === 'DEJECTED') {
      lines.push({
        id: `post:${driver.id}:MOOD`,
        kind: 'DRIVER',
        name: `${driver.firstName} ${driver.lastName}`,
        subtitle: `#${driver.carNumber}`,
        topic: 'MOOD',
        tone: 'WARN',
        text:
          emotion === 'RATTLED'
            ? 'I need a couple of days away from it before the next one. That was a lot.'
            : 'I am struggling to see where the next good weekend comes from.',
        action: { label: 'Driver condition', view: 'drivers' },
      });
    }
  }

  /* The strategist owns the review of their own plan. */
  const strategist = appointmentFor(state, 'STRATEGIST');
  const ours = result.finishers.filter((row) => row.teamId === state.playerTeamId);
  const netGain = ours.reduce((total, row) => total + row.positionsGained, 0);
  if (ours.length > 0) {
    lines.push({
      id: 'post:staff:STRATEGIST',
      kind: 'STAFF',
      name: strategist?.name ?? 'Strategy desk',
      subtitle: roleLabel('STRATEGIST'),
      topic: 'STRATEGY',
      tone: netGain > 0 ? 'GOOD' : netGain < 0 ? 'WARN' : 'NEUTRAL',
      text:
        netGain > 0
          ? `We finished ${netGain} place${netGain === 1 ? '' : 's'} up on where we started. The plan did its job.`
          : netGain < 0
            ? `We lost ${Math.abs(netGain)} place${Math.abs(netGain) === 1 ? '' : 's'} against the grid. I want to look at the first stint again before the next one.`
            : 'We finished where we started. Nothing gained, nothing thrown away.',
      action: { label: 'Race strategy', view: 'race-strategy' },
    });
  }

  /* The technical side turns the result into the next project. */
  const team = playerTeam(state);
  if (team) {
    const weakest = [...team.parts].sort((a, b) => a.level - b.level)[0];
    const alreadyOnIt = team.development.some((project) => project.category === weakest?.category);
    if (weakest && !alreadyOnIt) {
      const role = ownerOf(weakest.category);
      const appointment = appointmentFor(state, role);
      lines.push({
        id: `post:dev:${weakest.category}`,
        kind: 'STAFF',
        name: appointment?.name ?? roleLabel(role),
        subtitle: roleLabel(role),
        topic: 'DEVELOPMENT',
        tone: 'NEUTRAL',
        text: `On that evidence the ${partLabel(weakest.category).toLowerCase()} is where the lap time is hiding. Give me the budget and I will start on it this week.`,
        action: { label: 'Car development', view: 'car-dev' },
      });
    }

    /* A retirement is the mechanic's problem, and worth saying out loud. */
    if (ours.some((row) => row.status === 'DNF')) {
      const appointment = appointmentFor(state, 'CHIEF_MECHANIC');
      lines.push({
        id: 'post:reliability',
        kind: 'STAFF',
        name: appointment?.name ?? roleLabel('CHIEF_MECHANIC'),
        subtitle: roleLabel('CHIEF_MECHANIC'),
        topic: 'RELIABILITY',
        tone: 'BAD',
        text: 'We lost a car today. Until reliability comes up, we are gambling points every race we enter.',
        action: { label: 'R&D centre', view: 'career-rnd' },
      });
    }
  }

  /* And the commercial consequence, which the player feels in the bank. */
  const principal = appointmentFor(state, 'TEAM_PRINCIPAL');
  const points = ours.reduce((total, row) => total + row.points, 0);
  lines.push({
    id: 'post:staff:TEAM_PRINCIPAL',
    kind: 'STAFF',
    name: principal?.name ?? 'The board',
    subtitle: principal ? roleLabel('TEAM_PRINCIPAL') : 'Ownership',
    topic: 'SPONSOR',
    tone: points > 0 ? 'GOOD' : 'WARN',
    text:
      points > 0
        ? `${points} point${points === 1 ? '' : 's'} on the board. The partners will have seen that, and the bonuses follow.`
        : 'No points, which means no bonus this round. The partners notice the blank weekends.',
    action: { label: 'Sponsors', view: 'sponsors' },
  });

  return lines;
}
