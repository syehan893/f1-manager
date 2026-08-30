import { GRID_2026_TEAMS } from '@/data/grid2026';
import { profileFor } from './difficulty';
import {
  ASSEMBLY_PARTS,
  CARS_PER_TEAM,
  ENGINE_ALLOCATION,
  buildPart,
  buildPowerUnit,
  fittedPart,
  fittedUnit,
  partBuildCost,
  powerUnitCost,
  refreshCar,
  sparePartsOf,
  syncPartsToDrawings,
} from './carModel';
import {
  DEVELOPMENT_INTENSITY,
  advanceDevelopment,
  developmentCost,
  developmentWeeks,
  partLevel,
} from './partDevelopment';
import type {
  DevelopmentPhilosophy,
  GameState,
  PartCategory,
  TeamSeasonState,
} from './types';

/* =====================================================================
 * Rival development.
 *
 * The old version handed every AI team a free trickle of car statistics
 * once a round. It had no budget, no lead time and no opinion, which
 * meant the opposition improved on rails and the player's own careful
 * spending was competing against a scripted number.
 *
 * This one plays the same game the player does:
 *
 *   - it spends real money out of the team's own budget
 *   - it commissions the same part programmes, with the same lead times,
 *     and waits for them the same way
 *   - it builds and fits power units against the same allocation
 *   - and what it chooses to spend on follows a *philosophy* that comes
 *     from the team's technical strength and its situation, so a team
 *     with good engineers and a bad car behaves differently from a team
 *     with the reverse
 *
 * Everything is deterministic on (season, round, team) so reloading a
 * round cannot reroll the opposition into a worse plan.
 * ===================================================================== */

/* --------------------------- what each team is ------------------------- */

/** Parts a philosophy prioritises, in order. */
const PRIORITIES: Record<DevelopmentPhilosophy, PartCategory[]> = {
  AERO_LED: ['FLOOR', 'FRONT_WING', 'REAR_WING', 'ACTIVE_AERO', 'CHASSIS', 'SUSPENSION'],
  POWER_LED: ['ICE', 'TURBO', 'MGU_K', 'MGU_H', 'ENERGY_STORE', 'GEARBOX'],
  RELIABILITY_FIRST: ['GEARBOX', 'COOLING', 'ICE', 'CHASSIS', 'BRAKES', 'SUSPENSION'],
  IN_SEASON_PUSH: ['FRONT_WING', 'REAR_WING', 'FLOOR', 'BRAKES', 'SUSPENSION', 'ACTIVE_AERO'],
  BALANCED: ['CHASSIS', 'FLOOR', 'ICE', 'SUSPENSION', 'MGU_K', 'FRONT_WING'],
};

export const PHILOSOPHY_LABEL: Record<DevelopmentPhilosophy, string> = {
  BALANCED: 'Balanced programme',
  AERO_LED: 'Aero-led',
  POWER_LED: 'Power-unit led',
  RELIABILITY_FIRST: 'Reliability first',
  IN_SEASON_PUSH: 'In-season push',
};

export const PHILOSOPHY_BLURB: Record<DevelopmentPhilosophy, string> = {
  BALANCED: 'Spreads the budget across the whole car and rarely gets it badly wrong.',
  AERO_LED: 'Pours everything into the floor and the wings. The biggest gains, and the biggest way to miss.',
  POWER_LED: 'Builds the season around the power unit. Slow to arrive, hard to answer once it does.',
  RELIABILITY_FIRST: 'Fixes what breaks before chasing what is quick. Finishes races other teams do not.',
  IN_SEASON_PUSH: 'Short, cheap, frequent updates. Little lead time, so the car improves every few rounds.',
};

function seeded(season: number, round: number, teamId: string, salt = ''): number {
  let hash = (season * 7919 + round * 104729) >>> 0;
  const key = teamId + salt;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

/**
 * A rival team's technical strength, standing in for the staff the
 * player hires by name. Prestige and budget are what a team's engineering
 * department is actually made of, and a seeded wobble stops two similar
 * teams from being identical.
 */
export function technicalStrength(state: GameState, teamId: string): number {
  const grid = GRID_2026_TEAMS.find((entry) => entry.id === teamId);
  const prestige = grid?.prestige ?? 70;
  const wealth = Math.min(100, ((grid?.budget ?? 100_000_000) / 145_000_000) * 100);
  const wobble = (seeded(state.season, 0, teamId, 'staff') - 0.5) * 14;
  return Math.max(35, Math.min(97, prestige * 0.55 + wealth * 0.35 + 10 + wobble));
}

/**
 * Which philosophy a team commits to for the season. It follows from what
 * they have and what is wrong with them, which is what makes the grid
 * develop in different directions rather than all chasing the same thing.
 */
export function philosophyFor(state: GameState, team: TeamSeasonState): DevelopmentPhilosophy {
  const strength = technicalStrength(state, team.teamId);
  const car = team.car;

  // A team that keeps breaking fixes that first, whatever else is wrong.
  if (car.reliability < 78) return 'RELIABILITY_FIRST';

  /* Otherwise they attack their own biggest weakness — but only a strong
   * technical group can carry a power-unit programme, because it is slow
   * and expensive and there is no way to abandon it halfway. */
  const aeroGap = 92 - car.aero;
  const powerGap = 92 - (car.powerUnit + car.electrical) / 2;

  if (powerGap > aeroGap + 4 && strength >= 72) return 'POWER_LED';
  if (aeroGap > powerGap + 2) return 'AERO_LED';

  // A weak department cannot run long programmes well, so it runs short ones.
  if (strength < 62) return 'IN_SEASON_PUSH';
  return 'BALANCED';
}

/* ---------------------------- the spending ----------------------------- */

/**
 * What a rival team is willing to spend on development this round. Teams
 * behind in the championship spend harder, and nobody spends money they
 * do not have.
 */
function developmentBudget(state: GameState, team: TeamSeasonState): number {
  const profile = profileFor(state.settings.difficulty);
  if (profile.aiDevelopmentPerRound <= 0) return 0;

  const leaderPoints = state.standings.constructors[0]?.points ?? 0;
  const points =
    state.standings.constructors.find((row) => row.teamId === team.teamId)?.points ?? 0;
  const deficit = leaderPoints > 0 ? 1 - points / leaderPoints : 0.5;

  /* Scaled by difficulty, so Rookie leaves the grid alone entirely and
   * Legend has the field spending like it means it. */
  const appetite = profile.aiDevelopmentPerRound / 0.62;
  const urgency = 0.7 + Math.min(0.6, deficit * 0.6);

  // Never more than a slice of what they hold — a rival can go broke too.
  return Math.min(team.budget * 0.35, team.budget * 0.14 * appetite * urgency);
}

/**
 * Health at which a rival replaces a part. Below the trigger a careful
 * player would use, because the AI acts once a round and has to leave
 * itself room rather than reacting the moment something dips.
 */
const AI_REBUILD_THRESHOLD = 30;

export interface AiDevelopmentNote {
  teamId: string;
  category: PartCategory;
  weeks: number;
  cost: number;
  philosophy: DevelopmentPhilosophy;
}

/**
 * One round of rival development: finish what has landed, then commission
 * what the team can afford. Mutates `state`, which is always a clone by
 * the time the machine calls this.
 */
export function developAiCars(state: GameState, weeksElapsed = 2): AiDevelopmentNote[] {
  const profile = profileFor(state.settings.difficulty);
  const notes: AiDevelopmentNote[] = [];

  for (const team of state.teams) {
    if (team.teamId === state.playerTeamId) continue;

    /* Whatever finished during the week goes onto the car. For a rival
     * that means the new drawing is on the car too: they are modelled as
     * always rebuilding at the first opportunity, so development reaches
     * their car the way it reaches the player's once they have been to
     * the garage. */
    const landed = advanceDevelopment(team, weeksElapsed);
    const synced = syncPartsToDrawings(team);
    if (landed.length > 0 || synced) refreshCar(team);

    /* Maintenance, which is not development: a rival replaces a part
     * that has gone, out of its own budget and to its own current
     * drawings — the same three steps the player takes, run
     * automatically because the AI is abstracted above the garage rather
     * than exempt from it. This happens at every difficulty, including
     * the ones where rivals do no development at all, because a team
     * that never bolts a new wing on is not an easy opponent, it is a
     * broken one.
     *
     * A team that cannot afford the replacement races the worn part,
     * which is how a well-run budget turns into lap time. */
    let replaced = false;
    for (let carIndex = 0; carIndex < CARS_PER_TEAM; carIndex++) {
      for (const category of ASSEMBLY_PARTS) {
        const fitted = fittedPart(team, category, carIndex);
        if (!fitted || fitted.healthPct > AI_REBUILD_THRESHOLD) continue;

        const spare = sparePartsOf(team, category)[0];
        if (spare && spare.healthPct > fitted.healthPct + 20) {
          fitted.status = fitted.healthPct <= 0 ? 'RETIRED' : 'POOL';
          spare.status = 'FITTED';
          spare.carIndex = carIndex;
          replaced = true;
          continue;
        }

        const cost = partBuildCost(team, category, state.season);
        if (team.budget < cost * 2) continue;

        const fresh = buildPart(
          team,
          category,
          state.season,
          team.builtParts.length,
          carIndex,
        );
        team.budget -= cost;
        fitted.status = fitted.healthPct <= 0 ? 'RETIRED' : 'POOL';
        fresh.status = 'FITTED';
        team.builtParts = [...team.builtParts, fresh];
        replaced = true;
      }
    }
    if (replaced) refreshCar(team);

    if (profile.aiDevelopmentPerRound <= 0) continue;

    // Their plan for the season, revisited as the car changes.
    team.philosophy = philosophyFor(state, team);

    /* A weak department cannot run many programmes at once, which is a
     * large part of why a big team out-develops a small one. */
    const strength = technicalStrength(state, team.teamId);
    const concurrent = strength >= 80 ? 3 : strength >= 62 ? 2 : 1;
    if (team.development.length >= concurrent) continue;

    const spend = developmentBudget(state, team);
    if (spend <= 0) continue;

    /* Work down the philosophy's priorities to the first part that is
     * not already being worked on and that they can actually afford. */
    const priorities = PRIORITIES[team.philosophy];
    const inProgress = new Set(team.development.map((project) => project.category));

    for (const category of priorities) {
      if (inProgress.has(category)) continue;

      const level = partLevel(team, category);
      if (level >= 99) continue;

      /* Intensity follows the money: a rich team pushes a programme hard
       * and gets it sooner, which is the compounding advantage. */
      const roll = seeded(state.season, state.round, team.teamId, category);
      const intensity: 1 | 2 | 3 =
        spend > developmentCost(category, level, 3) && roll > 0.45
          ? 3
          : spend > developmentCost(category, level, 2)
            ? 2
            : 1;

      const cost = developmentCost(category, level, intensity);
      if (cost > spend || cost > team.budget) continue;

      /* Rival efficiency comes from their technical strength rather than
       * from named staff, on the same neutral-60 scale the player's
       * appointments use. */
      const efficiency = 0.7 + (strength / 100) * 0.6;
      const gain =
        Math.round(
          ((2.6 * (DEVELOPMENT_INTENSITY[intensity] ?? DEVELOPMENT_INTENSITY[2]).gainFactor * efficiency) /
            (1 + Math.pow(Math.max(0, level - 55) / 45, 2.1) * 4.5)) *
            10,
        ) / 10;

      const weeks = developmentWeeks(category, intensity, strength >= 85 ? 1 : 0);

      team.budget -= cost;
      team.development = [
        ...team.development,
        {
          id: `dev-ai-${state.season}-${state.round}-${team.teamId}-${category}`,
          teamId: team.teamId,
          category,
          gain,
          weeksRemaining: weeks,
          totalWeeks: weeks,
          cost,
          startedInWeek: state.week,
        },
      ];

      notes.push({ teamId: team.teamId, category, weeks, cost, philosophy: team.philosophy });
      break;
    }

    /* Engines wear out for everybody. A rival that has run its unit into
     * the ground builds a fresh one, taking the grid penalty if it must. */
    const unit = fittedUnit(team);
    if (unit && unit.healthPct < 22) {
      const spare = team.powerUnits
        .filter((entry) => entry.status === 'POOL' && entry.healthPct > 45)
        .sort((a, b) => b.healthPct - a.healthPct)[0];

      if (spare) {
        unit.status = 'POOL';
        spare.status = 'FITTED';
        team.fittedPowerUnitId = spare.id;
        refreshCar(team);
      } else if (team.budget > powerUnitCost(team) * 1.5) {
        const fresh = buildPowerUnit(team.parts, state.season, team.powerUnits.length);
        team.budget -= powerUnitCost(team);
        unit.status = 'POOL';
        fresh.status = 'FITTED';
        team.powerUnits = [...team.powerUnits, fresh];
        team.fittedPowerUnitId = fresh.id;
        refreshCar(team);
      }
    }
  }

  return notes;
}

/**
 * The winter programme. Between seasons a rival team spends far more than
 * it does in any single round, which is why the grid can reshuffle over an
 * off-season rather than only drifting.
 */
export function developAiPreSeason(state: GameState): AiDevelopmentNote[] {
  const profile = profileFor(state.settings.difficulty);
  if (profile.aiDevelopmentPerRound <= 0) return [];

  const notes: AiDevelopmentNote[] = [];

  for (const team of state.teams) {
    if (team.teamId === state.playerTeamId) continue;

    team.philosophy = philosophyFor(state, team);
    const strength = technicalStrength(state, team.teamId);
    const priorities = PRIORITIES[team.philosophy];

    /* A winter is worth several rounds of work, and it lands before the
     * first race rather than trickling in — which is what makes the grid
     * look different in round one than it did at the flag. */
    const winterBudget = team.budget * 0.3 * (profile.aiDevelopmentPerRound / 0.62);
    let remaining = winterBudget;

    for (const category of priorities) {
      const level = partLevel(team, category);
      if (level >= 99) continue;

      const cost = developmentCost(category, level, 2);
      if (cost > remaining || cost > team.budget) continue;

      const efficiency = 0.7 + (strength / 100) * 0.6;
      const gain =
        Math.round(
          ((2.6 * 1.25 * efficiency) /
            (1 + Math.pow(Math.max(0, level - 55) / 45, 2.1) * 4.5)) *
            10,
        ) / 10;

      const part = team.parts.find((entry) => entry.category === category);
      if (part) part.level = Math.min(99, Math.round((part.level + gain) * 10) / 10);

      team.budget -= cost;
      remaining -= cost;
      notes.push({ teamId: team.teamId, category, weeks: 0, cost, philosophy: team.philosophy });
    }

    /* Everyone starts the year on a fresh unit built to the new spec. */
    const fresh = buildPowerUnit(team.parts, state.season, team.powerUnits.length);
    fresh.status = 'FITTED';
    for (const entry of team.powerUnits) {
      if (entry.status === 'FITTED') entry.status = 'POOL';
    }
    team.powerUnits = [
      ...team.powerUnits.filter((entry) => entry.builtInSeason >= state.season - 1),
      fresh,
    ].slice(-ENGINE_ALLOCATION * 2);
    team.fittedPowerUnitId = fresh.id;

    /* The winter's work has to be on the car, not merely on the drawing.
     * The machine already rolls every team out on a fresh full set at
     * the new year; this catches development that lands after it. */
    syncPartsToDrawings(team);
    refreshCar(team);
  }

  return notes;
}
