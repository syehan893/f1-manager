import { seedAttributes } from '@/data/attributeSeed';
import type { DriverAttributes } from '@/types';
import type { DriverArchetype, ProspectDriver, TalentTier } from './types';

/* =====================================================================
 * Where new drivers come from.
 *
 * The intake used to be six names drawn from sixteen first names and
 * sixteen surnames, every one of them built the same way: a potential,
 * a raw number ten-to-twenty below it, and the seeding helper to fill in
 * the rest. Three seasons in, the player had seen every junior the game
 * could make, and none of them was interesting enough to remember.
 *
 * Two things fix that, and they are different problems.
 *
 * VARIETY is breadth. Names are drawn per nationality rather than from
 * one pool, so a Japanese driver gets a Japanese name; and every junior
 * has an archetype that genuinely reshapes their attributes rather than
 * shifting them all up or down together. A tyre whisperer and a
 * qualifier with the same potential are not the same signing.
 *
 * TIERS are scarcity. Most juniors are ordinary. Exactly one standout
 * arrives each year, one generational talent every five, and one
 * once-in-a-decade prodigy every ten — so the player who has been
 * watching the feeder series knows what they are looking at when one
 * turns up, and knows what it means to be beaten to them.
 *
 * All of it is deterministic on (season, index): reloading a save cannot
 * fish for a better class.
 * ===================================================================== */

/** The season a career begins, which the tier calendar is measured from. */
export const FIRST_SEASON = 2026;

/* ------------------------------- names -------------------------------- */

/**
 * Names by nationality, because a name drawn from one global pool is the
 * single most obvious tell that a driver was generated. Each entry is
 * [country code, first names, surnames].
 */
const NAME_POOLS: Array<[string, string[], string[]]> = [
  ['NL', ['Sander', 'Bram', 'Joost', 'Ruben', 'Thijs', 'Daan', 'Sven', 'Mees'],
        ['Van Dijk', 'Verhoeven', 'De Wit', 'Bakker', 'Van Rijn', 'Meijer', 'Koning', 'Visser']],
  ['BR', ['Diogo', 'Rafael', 'Caio', 'Bruno', 'Vinícius', 'Théo', 'Enzo', 'Murilo'],
        ['Brandão', 'Barros', 'Fonseca', 'Ribeiro', 'Nogueira', 'Cardoso', 'Peixoto', 'Almeida']],
  ['DE', ['Emil', 'Jonas', 'Lennart', 'Til', 'Moritz', 'Felix', 'Kilian', 'Anton'],
        ['Kaufmann', 'Brenner', 'Hoffmann', 'Reinhardt', 'Vogel', 'Stellwag', 'Winkler', 'Ehrlich']],
  ['FI', ['Aatu', 'Eino', 'Veeti', 'Onni', 'Niilo', 'Rasmus', 'Elias', 'Toivo'],
        ['Lindholm', 'Aaltonen', 'Nyström', 'Rautio', 'Salminen', 'Koskela', 'Härkönen', 'Virtanen']],
  ['ES', ['Rafa', 'Álvaro', 'Iker', 'Nico', 'Pau', 'Marc', 'Adrián', 'Unai'],
        ['Serrano', 'Ibáñez', 'Cabrera', 'Villalba', 'Quintana', 'Escudero', 'Ferrer', 'Bautista']],
  ['FR', ['Milan', 'Aurélien', 'Baptiste', 'Corentin', 'Enzo', 'Léo', 'Nathan', 'Rémi'],
        ['Mercier', 'Ferrand', 'Delacroix', 'Chevalier', 'Rousseau', 'Lambert', 'Marchand', 'Bonnet']],
  ['JP', ['Kenji', 'Riku', 'Haruto', 'Sota', 'Yuma', 'Ren', 'Takumi', 'Kaito'],
        ['Yamada', 'Kurosawa', 'Shinohara', 'Tachibana', 'Nakagawa', 'Fujimoto', 'Onishi', 'Sakamoto']],
  ['IT', ['Luca', 'Matteo', 'Riccardo', 'Gian', 'Tommaso', 'Andrea', 'Pietro', 'Elia'],
        ['Grimaldi', 'Ferraris', 'Bellucci', 'Marchetti', 'Lombardi', 'Salvatore', 'Rizzo', 'Ventura']],
  ['GB', ['Aaron', 'Callum', 'Reuben', 'Freddie', 'Josh', 'Elliot', 'Harvey', 'Toby'],
        ['Ashworth', 'Whitfield', 'Carrington', 'Hollis', 'Radcliffe', 'Merton', 'Ainsley', 'Beckford']],
  ['PL', ['Kacper', 'Igor', 'Szymon', 'Antoni', 'Filip', 'Borys', 'Wiktor', 'Marcel'],
        ['Ostrowski', 'Zieliński', 'Wróbel', 'Kamiński', 'Jabłoński', 'Sikora', 'Dudek', 'Baran']],
  ['AR', ['Mateo', 'Santino', 'Thiago', 'Lautaro', 'Benicio', 'Ciro', 'Valentín', 'Bruno'],
        ['Sosa', 'Gutiérrez', 'Ferreyra', 'Bianchi', 'Ocampo', 'Miranda', 'Aguirre', 'Peralta']],
  ['AU', ['Cody', 'Jasper', 'Flynn', 'Hudson', 'Beau', 'Lachlan', 'Archer', 'Kai'],
        ['Kirkland', 'Hollandsworth', 'Brennan', 'Callaghan', 'Whitlock', 'Doyle', 'Sanderson', 'Mercer']],
  ['IN', ['Ravi', 'Arjun', 'Vihaan', 'Kabir', 'Aryan', 'Ishaan', 'Dhruv', 'Neel'],
        ['Chandrasekar', 'Mehta', 'Bhatia', 'Raghunathan', 'Sundaram', 'Kapoor', 'Iyer', 'Malhotra']],
  ['SE', ['Ari', 'Melker', 'Vidar', 'Ludvig', 'Sixten', 'Alvar', 'Nils', 'Elton'],
        ['Wahlström', 'Lindqvist', 'Sjöberg', 'Hedlund', 'Gunnarsson', 'Åkerlund', 'Falk', 'Ryberg']],
  ['MX', ['Emiliano', 'Rodrigo', 'Sebastián', 'Diego', 'Leonardo', 'Ángel', 'Iván', 'Bruno'],
        ['Cervantes', 'Quintero', 'Delgadillo', 'Ontiveros', 'Zambrano', 'Alcaraz', 'Ruvalcaba', 'Estrada']],
  ['ZA', ['Ruan', 'Dewald', 'Jaco', 'Stefan', 'Pieter', 'Wian', 'Marnus', 'Tiaan'],
        ['Van Niekerk', 'Bezuidenhout', 'Steenkamp', 'Du Preez', 'Oosthuizen', 'Kruger', 'Venter', 'Naudé']],
];

/* ----------------------------- archetypes ------------------------------ */

/**
 * What kind of driver this is, before anybody knows how good they are.
 *
 * Each one bends the authored eight in a different direction and leaves
 * the rest alone, so two juniors with identical potential can still be
 * completely different propositions: one is half a second up on Saturday
 * and eats his tyres, the other is nowhere in qualifying and comes past
 * you on lap forty.
 */
interface ArchetypeSpec {
  label: string;
  /** Signed shifts on the authored attributes, in rating points. */
  shift: Partial<Record<keyof DriverAttributes, number>>;
  /**
   * How the scouting report describes them — several ways.
   *
   * One line per archetype was one line too few. Twenty-two juniors
   * drawn from eight archetypes means the same sentence appears three
   * times on a screen the player is being asked to read carefully, and
   * two drivers described in identical words do not read as two people
   * however different their numbers are.
   */
  notes: string[];
}

export const ARCHETYPES: Record<DriverArchetype, ArchetypeSpec> = {
  RAW_SPEED: {
    label: 'Raw speed',
    shift: { pace: 6, cornering: 3, consistency: -6, tyreManagement: -4 },
    notes: [
      'Quickest thing in the paddock over one lap and no idea yet where the limit is.',
      'Devastating when it comes together. It does not come together every weekend.',
      'Has more natural speed than anyone in the series and loses it in handfuls.',
      'Four tenths quicker than the field and three spins a meeting. Both are real.',
    ],
  },
  QUALIFIER: {
    label: 'Qualifier',
    shift: { pace: 4, reaction: 5, braking: 3, stamina: -4, racecraft: -3 },
    notes: [
      'Puts it on pole and then spends Sunday learning what to do with it.',
      'One lap on new rubber and he is untouchable. Sixty laps is a different question.',
      'Saturday specialist. His race pace is somebody else you have not met.',
      'Finds a lap from nowhere when it counts and cannot repeat it an hour later.',
    ],
  },
  RACER: {
    label: 'Racer',
    shift: { attack: 7, racecraft: 5, pace: -2, reaction: 2 },
    notes: [
      'Ordinary on Saturday, ruthless on Sunday. Passes people who are quicker than him.',
      'Qualifies eighth and finishes third. Does it again the next weekend.',
      'Reads a race two corners ahead of everybody else on the grid.',
      'You will not enjoy defending against him and neither will anybody else.',
    ],
  },
  TYRE_WHISPERER: {
    label: 'Tyre whisperer',
    shift: { tyreManagement: 9, consistency: 5, pace: -3, attack: -3 },
    notes: [
      'Makes a set last laps nobody else can. Strategists love him; the crowd does not.',
      'Comes in ten laps after everybody else on rubber that still looks new.',
      'Never spectacular and always there at the end, on the tyres he started with.',
      'Gives the pit wall an option nobody else on the grid can offer them.',
    ],
  },
  RAIN_MASTER: {
    label: 'Rain master',
    shift: { wetWeather: 12, adaptability: 4, pace: -2 },
    notes: [
      'Unremarkable in the dry and completely unrecognisable the moment it rains.',
      'Watch him in the wet once and you will stop caring what he does in the dry.',
      'Finds grip on a wet track that the timing screen says is not there.',
      'Two of his three wins came in a downpour. So did the other one, nearly.',
    ],
  },
  IRON_NERVE: {
    label: 'Iron nerve',
    shift: { consistency: 8, defence: 6, stamina: 4, attack: -4 },
    notes: [
      'Never puts a wheel wrong and will not be moved. Bring a crowbar.',
      'Sixty laps within two tenths of himself. It is almost unsettling to watch.',
      'Defends like the car behind is not there. Usually it ends up not being there.',
      'Makes no mistakes, takes no risks, and is still ahead of you at the flag.',
    ],
  },
  ENGINEER: {
    label: 'Engineer',
    shift: { feedback: 11, adaptability: 5, consistency: 3, attack: -3 },
    notes: [
      'Debriefs like a technical director. The car gets quicker with him in it.',
      'Tells you exactly what the car is doing and exactly what would fix it.',
      'Not the quickest here. The team he joins will be quicker for having him.',
      'Reads a setup sheet better than most of the people who write them.',
    ],
  },
  STREET_FIGHTER: {
    label: 'Street fighter',
    shift: { braking: 7, attack: 5, cornering: 3, tyreManagement: -5 },
    notes: [
      'Lives on the brakes and inside the white line. Walls do not bother him.',
      'Brakes later than the data says is possible and has the results to argue with it.',
      'Give him a street circuit and a set of softs and get out of the way.',
      'Fearless between the barriers, and it costs him a front wing a season.',
    ],
  },
};

const ARCHETYPE_IDS = Object.keys(ARCHETYPES) as DriverArchetype[];

/* -------------------------------- tiers -------------------------------- */

interface TierSpec {
  label: string;
  /** Inclusive potential band. */
  potential: [number, number];
  /** How far below their ceiling they arrive — the gamble, in points. */
  gap: [number, number];
  /** Ages this tier arrives at. */
  age: [number, number];
  /** Multiplier on the wage a junior of this tier asks for. */
  wage: number;
}

export const TIERS: Record<TalentTier, TierSpec> = {
  STANDARD: { label: 'Junior', potential: [66, 86], gap: [10, 22], age: [17, 21], wage: 1 },
  STANDOUT: { label: 'Standout', potential: [86, 91], gap: [9, 17], age: [17, 20], wage: 1.9 },
  GENERATIONAL: { label: 'Generational', potential: [91, 95], gap: [8, 15], age: [17, 19], wage: 3.4 },
  PRODIGY: { label: 'Once in a decade', potential: [96, 99], gap: [7, 13], age: [16, 18], wage: 6 },
};

/**
 * The rarest tier due to arrive in a given season, if any.
 *
 * One standout every year, one generational every fifth, one prodigy
 * every tenth — counted from the season a career begins, and offset so
 * the two rare years never land together and neither lands in the first
 * intake. A player who signs a prodigy should have had to wait for one.
 */
export function tierDueIn(season: number): TalentTier {
  const elapsed = season - FIRST_SEASON;
  if (elapsed >= 0 && elapsed % 10 === 4) return 'PRODIGY';
  if (elapsed >= 0 && elapsed % 5 === 2) return 'GENERATIONAL';
  return 'STANDOUT';
}

/** How many seasons until the next one of these, for the intake screen. */
export function seasonsUntilTier(season: number, tier: TalentTier): number {
  for (let ahead = 0; ahead < 40; ahead++) {
    if (tierDueIn(season + ahead) === tier) return ahead;
  }
  return -1;
}

/* ----------------------------- generation ------------------------------ */

/**
 * A unit random from a string key.
 *
 * FNV-1a alone is not enough here. The keys are near-identical by
 * design — `youth-2026-0:name:0`, `youth-2026-1:name:0` — and FNV's
 * avalanche on a one-character change is poor in exactly the high bits
 * that `Math.floor(r * n)` reads. Drawing sixteen surnames that way gave
 * thirty-nine distinct names across a hundred and ten juniors: five
 * classes of near-identical people.
 *
 * The final mix is the standard xorshift-multiply finaliser, which is
 * what actually spreads a one-bit input change across the whole word.
 */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A deterministic stream of unit randoms from one key. */
function stream(key: string): () => number {
  let n = 0;
  return () => hash(`${key}:${n++}`);
}

const between = (r: number, [lo, hi]: [number, number]) => lo + r * (hi - lo);

export interface GenerateOptions {
  /** Forces the tier; otherwise everybody is STANDARD. */
  tier?: TalentTier;
  /** Distinguishes drivers generated in the same season. */
  index: number;
  season: number;
  /**
   * Extra salt on the name draw only.
   *
   * Two juniors in a twenty-two-car field can land on the same name — a
   * pool of sixteen nationalities does not make collisions impossible,
   * only uncommon. Bumping this redraws the name while leaving the id,
   * the tier and every attribute exactly where they were, so a field
   * stays deterministic and nobody has a twin.
   */
  nameSalt?: number;
}

/**
 * One junior, built from a season and an index. The id encodes both, so
 * a driver generated for a given slot is always the same person.
 */
export function generateProspect(options: GenerateOptions): ProspectDriver {
  const { season, index } = options;
  const tier = options.tier ?? 'STANDARD';
  const tierSpec = TIERS[tier];
  const id = `youth-${season}-${index}`;
  const next = stream(id);

  /* The name is drawn from its own stream so that resalting it to break
   * a collision cannot shift anything else about the driver. */
  const salt = options.nameSalt ?? 0;
  const named = stream(`${id}:name:${salt}`);
  const pool = NAME_POOLS[Math.floor(named() * NAME_POOLS.length)]!;
  const [countryCode, firstNames, lastNames] = pool;
  const firstName = firstNames[Math.floor(named() * firstNames.length)]!;
  const lastName = lastNames[Math.floor(named() * lastNames.length)]!;

  const archetype = ARCHETYPE_IDS[Math.floor(next() * ARCHETYPE_IDS.length)]!;
  const spec = ARCHETYPES[archetype];
  const shift = spec.shift;
  const note = spec.notes[Math.floor(next() * spec.notes.length)]!;

  const potential = Math.round(between(next(), tierSpec.potential));
  const age = Math.round(between(next(), tierSpec.age));
  /* What they are *today*. The gap between this and the ceiling is the
   * whole gamble, and it is wider on the young. */
  const raw = Math.round(potential - between(next(), tierSpec.gap));

  /* Spread around the raw number, then the archetype on top. A junior is
   * quick and fearless and short on everything laps teach; the seeding
   * helper handles the learned attributes from their age. */
  const vary = (base: number, spread: number) => Math.round(base + (next() - 0.5) * spread);
  const authored = {
    pace: vary(raw, 5) + (shift.pace ?? 0),
    cornering: vary(raw - 1, 6) + (shift.cornering ?? 0),
    braking: vary(raw - 2, 7) + (shift.braking ?? 0),
    attack: vary(raw + 2, 8) + (shift.attack ?? 0),
    consistency: vary(raw - 8, 7) + (shift.consistency ?? 0),
    reaction: vary(raw + 2, 5) + (shift.reaction ?? 0),
    stamina: vary(raw - 4, 8) + (shift.stamina ?? 0),
    wetWeather: vary(raw - 6, 10) + (shift.wetWeather ?? 0),
  };

  const attributes = seedAttributes(id, age, authored);
  /* The learned attributes come out of the seeding helper, so an
   * archetype that is *about* one of them has to be applied afterwards
   * or it would be overwritten by the age curve. */
  for (const key of ['defence', 'racecraft', 'tyreManagement', 'adaptability', 'feedback'] as const) {
    const move = shift[key];
    if (move) attributes[key] = Math.max(25, Math.min(99, attributes[key] + move));
  }

  return {
    id,
    code: (firstName.slice(0, 1) + lastName.replace(/[^A-Za-z]/g, '').slice(0, 2)).toUpperCase(),
    firstName,
    lastName,
    countryCode,
    age,
    potential,
    tier,
    archetype,
    note,
    attributes,
    seasonsInF2: 0,
    salary:
      Math.round((700_000 + potential * 21_000) * tierSpec.wage / 100_000) * 100_000,
    scoutedInSeason: season,
  };
}

/**
 * Redraws names until every driver in the batch has their own.
 *
 * Deterministic: the salt climbs in a fixed order, so the same field
 * always resolves the same collisions the same way. `taken` lets a
 * caller reserve the names already out there — a replacement generated
 * mid-winter should not be named after somebody still in the field.
 */
export function withDistinctNames(
  drivers: ProspectDriver[],
  taken: Iterable<string> = [],
): ProspectDriver[] {
  const used = new Set(taken);
  return drivers.map((driver) => {
    let current = driver;
    for (let salt = 1; used.has(`${current.firstName} ${current.lastName}`); salt++) {
      if (salt > 60) break;
      current = generateProspect({
        season: current.scoutedInSeason,
        index: Number(current.id.split('-')[2] ?? 0),
        tier: current.tier,
        nameSalt: salt,
      });
      // Regeneration rebuilds from the id, so restore anything since set.
      current = { ...current, age: driver.age, seasonsInF2: driver.seasonsInF2 };
    }
    used.add(`${current.firstName} ${current.lastName}`);
    return current;
  });
}

/**
 * A season's new intake: `count` drivers, of whom exactly one carries
 * the rare tier due that year. The rare one is placed at a seeded slot
 * rather than always first, so the class has to actually be read.
 */
export function buildIntake(season: number, count: number): ProspectDriver[] {
  const rare = tierDueIn(season);
  const slot = Math.floor(hash(`${season}:rare-slot`) * count);

  return withDistinctNames(
    Array.from({ length: count }, (_, index) =>
      generateProspect({ season, index, tier: index === slot ? rare : 'STANDARD' }),
    ),
  );
}
