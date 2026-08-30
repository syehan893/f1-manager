import { PART_BY_ID, fittedPart, partHealthFactor } from './carModel';
import { conditionOf, emotionOf } from './driverCondition';
import { effectiveDriver } from './driverDevelopment';
import { partLevel } from './partDevelopment';
import { carIndexOf, driverWearFactor, raceDriversOf } from './roster';
import { postMail } from './mail';
import type { BuiltPart, GameState, TeamSeasonState } from './types';

/* =====================================================================
 * What the drivers say about their cars.
 *
 * A worn part used to produce one line from the chief mechanic, listing
 * everything at once. That is a maintenance log, not a person — and it
 * threw away the fact that each car belongs to somebody who has just
 * spent two hours driving it.
 *
 * So the drivers write instead. Two things get them writing: a part on
 * *their* car that is finished, and a part on their car that is a long
 * way behind what the drawing office has since produced. What they say
 * depends on who they are and how the weekend went, because a driver who
 * has just been on the podium and a driver who has just been lapped do
 * not report the same brake pedal in the same words.
 *
 * Everything is deterministic on (season, round, driver, part), so the
 * same weekend always produces the same post and a reload cannot fish
 * for a politer one.
 * ===================================================================== */

function seeded(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function pick<T>(options: T[], key: string): T {
  return options[Math.floor(seeded(key) * options.length)] ?? options[0]!;
}

/** How a driver is feeling, compressed to the three tones they write in. */
type Tone = 'PATIENT' | 'DIRECT' | 'ANGRY';

function toneFor(state: GameState, driverId: string): Tone {
  const condition = conditionOf(state, driverId);
  const emotion = emotionOf(condition);

  if (emotion === 'DEJECTED' || condition.morale < 35) return 'ANGRY';
  if (condition.stress > 68 || condition.morale < 55) return 'DIRECT';
  return 'PATIENT';
}

/* --------------------------- what they notice -------------------------- */

/**
 * How a worn part actually feels from the cockpit.
 *
 * This is the bit that makes the mail worth reading: a driver does not
 * say "the floor is at zero percent", they say the car will not turn.
 * Each part gets its own symptom, because each one fails differently.
 */
const SYMPTOM: Partial<Record<string, string[]>> = {
  CHASSIS: [
    'the whole car feels like it is flexing under load',
    'nothing is where I put it — the platform is moving around underneath me',
  ],
  SUSPENSION: [
    'every kerb is unloading the car and I am losing the rear',
    'it will not settle over the bumps any more',
  ],
  BRAKES: [
    'the pedal is going long and I am having to brake ten metres early',
    'I have no confidence on the pedal at all — it is not stopping the same twice',
  ],
  GEARBOX: [
    'the shifts are slurring and I am losing drive out of the slow corners',
    'downshifts are locking the rear on me',
  ],
  FRONT_WING: [
    'I have no front end at all in the high-speed stuff',
    'it will not turn — I am waiting for the nose to bite and it never does',
  ],
  REAR_WING: [
    'the rear is nervous every time I get on the throttle',
    'I am giving away the straights and I still have no rear grip',
  ],
  FLOOR: [
    'the floor is gone — the car has no platform and I can feel it',
    'we are losing enormous load through the quick corners',
  ],
  ACTIVE_AERO: [
    'the aero is not switching cleanly and I am guessing at the braking points',
    'I am not getting the low-drag mode when I need it',
  ],
  COOLING: [
    'they are asking me to lift and coast to keep temperatures down',
    'we are running out of cooling before we run out of race',
  ],
};

function symptomFor(category: string, key: string): string {
  const options = SYMPTOM[category] ?? ['it is not working the way it did'];
  return pick(options, key);
}

/* ------------------------------ the letters ---------------------------- */

function finishedPartMail(
  state: GameState,
  driverId: string,
  part: BuiltPart,
  tone: Tone,
): void {
  const driver = effectiveDriver(state, driverId);
  if (!driver) return;

  const label = PART_BY_ID.get(part.category)?.label ?? part.category;
  const key = `${state.season}:${state.round}:${driverId}:${part.category}:done`;
  const symptom = symptomFor(part.category, key);
  const laps = Math.round(part.mileageLaps);

  const openings: Record<Tone, string[]> = {
    PATIENT: [
      `Quick one on the ${label.toLowerCase()}.`,
      `Not a complaint, just so you have it from me:`,
      `Flagging this while it is fresh.`,
    ],
    DIRECT: [
      `We need to do something about the ${label.toLowerCase()}.`,
      `This is the third time I have mentioned the ${label.toLowerCase()}.`,
      `I am going to be blunt about the ${label.toLowerCase()}.`,
    ],
    ANGRY: [
      `I am not driving that ${label.toLowerCase()} again.`,
      `Enough. The ${label.toLowerCase()} is finished and everybody in the garage knows it.`,
      `I have run out of patience with the ${label.toLowerCase()}.`,
    ],
  };

  const closings: Record<Tone, string[]> = {
    PATIENT: [
      `No panic — but if there is a new one to be had before the next round, I will take it.`,
      `Whenever the factory can get one to us. I will work around it until then.`,
    ],
    DIRECT: [
      `I would like a new one for the next round. I do not think that is unreasonable.`,
      `Please get one built. I am leaving lap time out there every single run.`,
    ],
    ANGRY: [
      `Build me a new one. I am not going to keep apologising for a result the car is handing me.`,
      `If it is still on the car next weekend, do not ask me why the lap time is not there.`,
    ],
  };

  postMail(state, {
    category: 'DRIVER',
    from: `${driver.firstName} ${driver.lastName}`,
    subject:
      tone === 'ANGRY'
        ? `The ${label.toLowerCase()} is done`
        : `${label} — ${laps} laps and it is gone`,
    importance: tone === 'ANGRY' ? 'HIGH' : 'NORMAL',
    driverId,
    body:
      `${pick(openings[tone], key + ':open')}\n\n` +
      `${laps} laps on it and ${symptom}. The data will show it better than I can, but it is finished.\n\n` +
      `${pick(closings[tone], key + ':close')}`,
  });
}

function behindTheDrawingMail(
  state: GameState,
  driverId: string,
  part: BuiltPart,
  drawing: number,
  tone: Tone,
): void {
  const driver = effectiveDriver(state, driverId);
  if (!driver) return;

  const label = PART_BY_ID.get(part.category)?.label ?? part.category;
  const key = `${state.season}:${state.round}:${driverId}:${part.category}:behind`;
  const gap = drawing - part.spec;

  /* A driver knows perfectly well what the other side of the garage is
   * running, and will say so. This is the specific request the player
   * asked for: not a complaint, a build order. */
  const mateId = raceDriversOf(state, state.driverTeams[driverId] ?? '').find(
    (id) => id !== driverId,
  );
  const mateIndex = mateId ? carIndexOf(state, mateId) : -1;
  const team = state.teams.find((entry) => entry.teamId === state.driverTeams[driverId]);
  const matePart =
    team && mateIndex >= 0 ? fittedPart(team, part.category, mateIndex) : null;
  const mate = mateId ? effectiveDriver(state, mateId) : null;
  const mateAhead = matePart && mate ? matePart.spec > part.spec + 0.4 : false;

  const asks: Record<Tone, string[]> = {
    PATIENT: [
      `I know there is a queue for it. Put me down for one when it makes sense.`,
      `Not urgent, but I would take the new one whenever a slot opens up.`,
    ],
    DIRECT: [
      `I would like the new spec on my car. I think it is worth real lap time.`,
      `Can we get the current drawing built for me? I am racing an old part.`,
    ],
    ANGRY: [
      `I want the new one. I am being asked to deliver in a car we have already improved on paper.`,
      `Build it. I am not going to keep driving last month's part and answering for the gap.`,
    ],
  };

  postMail(state, {
    category: 'DRIVER',
    from: `${driver.firstName} ${driver.lastName}`,
    subject: `Can we build the new ${label.toLowerCase()}?`,
    importance: tone === 'ANGRY' ? 'HIGH' : 'LOW',
    driverId,
    body:
      `I hear the drawing office has moved the ${label.toLowerCase()} on — ${drawing.toFixed(1)} against the ${part.spec.toFixed(1)} I am running. That is ${gap.toFixed(1)} I am giving away before I turn a wheel.\n\n` +
      (mateAhead
        ? `${mate!.lastName} already has the newer one on the other car. I am not going to pretend I have not noticed.\n\n`
        : '') +
      pick(asks[tone], key + ':ask'),
  });
}

/* ------------------------------- the pass ------------------------------ */

/**
 * Called once a weekend, after the parts have been worn.
 *
 * Deliberately quiet: at most one letter per driver per round, and only
 * when there is something worth saying. A driver who writes every week
 * about everything is one the player stops reading.
 */
export function driverGarageMail(
  state: GameState,
  team: TeamSeasonState,
  worn: BuiltPart[],
): void {
  if (team.teamId !== state.playerTeamId) return;

  const drivers = raceDriversOf(state, team.teamId);

  for (const [carIndex, driverId] of drivers.entries()) {
    const tone = toneFor(state, driverId);

    /* Something finished on this driver's car is the loudest thing that
     * can happen to them, so it wins. */
    const finished = worn.filter((part) => part.carIndex === carIndex);
    if (finished.length > 0) {
      /* The one that hurts most, not the first in the list: a floor is a
       * worse afternoon than a brake set, and a driver leads with the
       * thing that actually cost them. */
      const worst = [...finished].sort(
        (a, b) =>
          (PART_BY_ID.get(b.category)?.buildCostFactor ?? 1) -
          (PART_BY_ID.get(a.category)?.buildCostFactor ?? 1),
      )[0]!;
      finishedPartMail(state, driverId, worst, tone);
      continue;
    }

    /* Otherwise: is anything on their car well behind what the factory
     * could build today? Drivers ask for upgrades, and it is the second
     * half of what makes the garage a conversation rather than a store. */
    let biggest: { part: BuiltPart; drawing: number; gap: number } | null = null;
    for (const category of Object.keys(SYMPTOM)) {
      const part = fittedPart(team, category as BuiltPart['category'], carIndex);
      if (!part) continue;
      const drawing = partLevel(team, part.category);
      const gap = drawing - part.spec;
      if (gap < 1.2) continue;
      if (!biggest || gap > biggest.gap) biggest = { part, drawing, gap };
    }

    /* And not every round, or it becomes wallpaper — a driver raises it
     * when they have had a weekend that made them think about it. */
    if (!biggest) continue;
    const nag = seeded(`${state.season}:${state.round}:${driverId}:nag`);
    if (nag > (tone === 'PATIENT' ? 0.3 : 0.62)) continue;

    behindTheDrawingMail(state, driverId, biggest.part, biggest.drawing, tone);
  }
}

/**
 * A short engineering note for anything worn that no driver led with, so
 * the player still has a complete picture without reading two letters
 * saying the same thing.
 */
export function mechanicSummary(
  state: GameState,
  team: TeamSeasonState,
  worn: BuiltPart[],
): void {
  if (team.teamId !== state.playerTeamId || worn.length === 0) return;

  const drivers = raceDriversOf(state, team.teamId);

  postMail(state, {
    category: 'RND',
    from: 'Chief Mechanic',
    subject: `Parts log — ${worn.length} at the end of life`,
    body:
      worn
        .map((part) => {
          const driver = effectiveDriver(state, drivers[part.carIndex] ?? '');
          return `• Car ${part.carIndex + 1}${driver ? ` (${driver.lastName})` : ''} — ${
            PART_BY_ID.get(part.category)?.label ?? part.category
          }, ${Math.round(part.mileageLaps)} laps.`;
        })
        .join('\n') +
      `\n\nThey will keep running at about ${Math.round(partHealthFactor(0) * 100)}% of their spec, which is the least they will ever give back. Replacements are built to whatever the drawings say now, so anything R&D has landed since goes onto the car with them.` +
      `\n\n` +
      drivers
        .map((driverId, carIndex) => {
          const driver = effectiveDriver(state, driverId);
          const factor = driverWearFactor(state, driverId);
          return `Car ${carIndex + 1}${driver ? ` — ${driver.lastName}` : ''} is running at ${factor.toFixed(2)}x on parts${
            factor > 1.08 ? ', which is hard on them' : factor < 0.94 ? ', which is kind to them' : ''
          }.`;
        })
        .join('\n'),
  });
}
