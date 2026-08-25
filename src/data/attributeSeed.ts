import type { DriverAttributes } from '@/types';

/* =====================================================================
 * Seeding a driver's full profile.
 *
 * The grid files author the eight numbers that describe how quick and how
 * tidy a driver is. The five learned attributes — defending, racecraft,
 * tyre management, adaptability and technical feedback — are derived from
 * those plus the driver's age rather than invented one by one.
 *
 * That is deliberate, and it is not laziness. Hand-authoring a hundred
 * and ten more numbers would mean a hundred and ten judgements with no
 * basis behind them. Deriving them encodes the thing the game is actually
 * claiming: these are the attributes that come from *doing it*, so a
 * twenty-year-old should start short of them and a thirty-eight-year-old
 * should start long, whatever their raw pace says.
 *
 * From here they develop independently — see `driverDevelopment.ts`.
 * ===================================================================== */

/** 0..1 — how much of a career this driver has behind them. */
function seasoning(age: number): number {
  return Math.max(0, Math.min(1, (age - 17) / 19));
}

/** A small deterministic wobble so two similar drivers are not identical. */
function wobble(key: string, salt: string): number {
  let hash = 2166136261;
  const seed = key + salt;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (((hash >>> 0) / 4294967296) - 0.5) * 5;
}

const clamp = (value: number) => Math.max(25, Math.min(99, Math.round(value)));

export interface AuthoredAttributes {
  pace: number;
  cornering: number;
  braking: number;
  attack: number;
  consistency: number;
  reaction: number;
  stamina: number;
  wetWeather: number;
}

/**
 * Expand the authored eight into the full profile. `id` only seeds the
 * wobble, so the same driver always comes out the same way.
 */
export function seedAttributes(
  id: string,
  age: number,
  authored: AuthoredAttributes,
): DriverAttributes {
  const years = seasoning(age);

  return {
    ...authored,

    /* Defending is mostly nerve and precision under braking, and it is
     * learned — a rookie with the same braking number defends far worse. */
    defence: clamp(
      authored.braking * 0.34 +
        authored.consistency * 0.28 +
        authored.attack * 0.14 +
        years * 26 +
        wobble(id, 'def'),
    ),

    /* Judgement in traffic: knowing which move is on. Almost entirely a
     * function of having been there before. */
    racecraft: clamp(
      authored.consistency * 0.3 +
        authored.attack * 0.24 +
        authored.cornering * 0.1 +
        years * 30 +
        wobble(id, 'race'),
    ),

    /* Looking after a set. Smooth, experienced drivers do it best, and
     * raw pace has almost nothing to do with it. */
    tyreManagement: clamp(
      authored.consistency * 0.42 +
        authored.cornering * 0.12 +
        years * 28 +
        wobble(id, 'tyre'),
    ),

    /* Getting up to speed on something unfamiliar. This one runs the
     * other way — the young are quicker to adapt. */
    adaptability: clamp(
      authored.reaction * 0.32 +
        authored.pace * 0.2 +
        (1 - years) * 32 +
        22 +
        wobble(id, 'adapt'),
    ),

    /* What the engineers can actually act on. Articulate, consistent and
     * experienced drivers develop a car; quick ones do not necessarily. */
    feedback: clamp(
      authored.consistency * 0.38 +
        authored.braking * 0.1 +
        years * 32 +
        wobble(id, 'fb'),
    ),
  };
}
