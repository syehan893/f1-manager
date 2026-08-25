/* =====================================================================
 * Sponsor catalogue.
 *
 * Sponsorship is the game's income side, and the point of it is that
 * money should be a decision rather than a number that only goes down.
 * Every deal here trades one thing against another:
 *
 *   - a big retainer against a demanding championship target
 *   - a small retainer against fat per-point bonuses
 *   - a long contract against being locked out of a better one
 *
 * A backmarker cannot sign the deals that would fix its car, which is
 * exactly the squeeze a small team is supposed to feel.
 *
 * All names, industries and figures are invented for this project.
 * ===================================================================== */

export type SponsorTier = 'TITLE' | 'PRIMARY' | 'SECONDARY';

export interface Sponsor {
  id: string;
  name: string;
  industry: string;
  tier: SponsorTier;
  /** Reputation the sponsor wants to see before it will talk. 0-100. */
  requiredScore: number;
  /** Constructors' position the deal is written around. */
  targetPosition: number;
  /** Paid once, on signing. */
  signingBonus: number;
  /** Paid every round. */
  perRaceFee: number;
  /** Paid per championship point the team scores. */
  pointsBonus: number;
  /** Paid per podium finish, per car. */
  podiumBonus: number;
  /** Paid per race win, per car. */
  winBonus: number;
  /** Charged at season end if the target position is missed. */
  penalty: number;
  /** Contract length in seasons. */
  seasons: number;
  blurb: string;
}

/** How many deals of each tier a team may hold at once. */
export const TIER_SLOTS: Record<SponsorTier, number> = {
  TITLE: 1,
  PRIMARY: 2,
  SECONDARY: 3,
};

export const TIER_LABEL: Record<SponsorTier, string> = {
  TITLE: 'Title Partner',
  PRIMARY: 'Primary Partner',
  SECONDARY: 'Associate Partner',
};

export const SPONSORS: Sponsor[] = [
  /* ------------------------------ title ------------------------------ */
  {
    id: 'meridian-energy',
    name: 'Meridian Energy',
    industry: 'Energy',
    tier: 'TITLE',
    requiredScore: 72,
    targetPosition: 2,
    signingBonus: 18_000_000,
    perRaceFee: 4_600_000,
    pointsBonus: 240_000,
    podiumBonus: 1_400_000,
    winBonus: 3_200_000,
    penalty: 22_000_000,
    seasons: 2,
    blurb:
      'The biggest cheque on the grid, written on the assumption that you finish second at worst. Miss it and they take a good deal of it back.',
  },
  {
    id: 'kestrel-aviation',
    name: 'Kestrel Aviation',
    industry: 'Aerospace',
    tier: 'TITLE',
    requiredScore: 58,
    targetPosition: 5,
    signingBonus: 11_000_000,
    perRaceFee: 3_400_000,
    pointsBonus: 180_000,
    podiumBonus: 900_000,
    winBonus: 2_000_000,
    penalty: 9_000_000,
    seasons: 2,
    blurb:
      'A serious partner with realistic expectations. The safe title deal for a team on the way up.',
  },
  {
    id: 'novaterra',
    name: 'Novaterra Bank',
    industry: 'Finance',
    tier: 'TITLE',
    requiredScore: 44,
    targetPosition: 8,
    signingBonus: 6_500_000,
    perRaceFee: 2_100_000,
    pointsBonus: 320_000,
    podiumBonus: 1_800_000,
    winBonus: 4_500_000,
    penalty: 3_000_000,
    seasons: 1,
    blurb:
      'A modest retainer with unusually generous results bonuses. Pays badly for a quiet season and superbly for a surprising one.',
  },
  {
    id: 'halcyon-motors',
    name: 'Halcyon Motors',
    industry: 'Automotive',
    tier: 'TITLE',
    requiredScore: 30,
    targetPosition: 10,
    signingBonus: 3_000_000,
    perRaceFee: 1_600_000,
    pointsBonus: 120_000,
    podiumBonus: 700_000,
    winBonus: 1_500_000,
    penalty: 800_000,
    seasons: 3,
    blurb:
      'Nobody signs Halcyon because they want to. Three seasons of guaranteed, unremarkable money, and no title slot for anyone better.',
  },

  /* ----------------------------- primary ----------------------------- */
  {
    id: 'apexline-tools',
    name: 'Apexline Tools',
    industry: 'Industrial',
    tier: 'PRIMARY',
    requiredScore: 62,
    targetPosition: 4,
    signingBonus: 5_000_000,
    perRaceFee: 2_200_000,
    pointsBonus: 130_000,
    podiumBonus: 600_000,
    winBonus: 1_300_000,
    penalty: 6_000_000,
    seasons: 2,
    blurb: 'Precision engineering money. They expect to be seen at the front.',
  },
  {
    id: 'vantage-tech',
    name: 'Vantage Semiconductors',
    industry: 'Technology',
    tier: 'PRIMARY',
    requiredScore: 50,
    targetPosition: 6,
    signingBonus: 3_800_000,
    perRaceFee: 1_750_000,
    pointsBonus: 160_000,
    podiumBonus: 750_000,
    winBonus: 1_600_000,
    penalty: 2_400_000,
    seasons: 2,
    blurb: 'Mid-grid money with a genuine upside if the car comes good.',
  },
  {
    id: 'orbit-telecom',
    name: 'Orbit Telecom',
    industry: 'Telecoms',
    tier: 'PRIMARY',
    requiredScore: 38,
    targetPosition: 8,
    signingBonus: 2_400_000,
    perRaceFee: 1_400_000,
    pointsBonus: 95_000,
    podiumBonus: 500_000,
    winBonus: 1_100_000,
    penalty: 1_200_000,
    seasons: 1,
    blurb: 'One season, no drama, and they renew if you keep your nose clean.',
  },
  {
    id: 'saltgate-logistics',
    name: 'Saltgate Logistics',
    industry: 'Logistics',
    tier: 'PRIMARY',
    requiredScore: 24,
    targetPosition: 11,
    signingBonus: 1_500_000,
    perRaceFee: 1_050_000,
    pointsBonus: 70_000,
    podiumBonus: 400_000,
    winBonus: 900_000,
    penalty: 0,
    seasons: 1,
    blurb:
      'They ask nothing of you and pay accordingly. There is no penalty clause, which tells you what they expect.',
  },
  {
    id: 'crestwave-media',
    name: 'Crestwave Media',
    industry: 'Broadcast',
    tier: 'PRIMARY',
    requiredScore: 46,
    targetPosition: 7,
    signingBonus: 1_000_000,
    perRaceFee: 700_000,
    pointsBonus: 300_000,
    podiumBonus: 1_100_000,
    winBonus: 2_400_000,
    penalty: 0,
    seasons: 1,
    blurb:
      'Almost no retainer, the best per-point rate on the grid. A bet on your own car.',
  },

  /* ---------------------------- secondary ---------------------------- */
  {
    id: 'ferro-lubricants',
    name: 'Ferro Lubricants',
    industry: 'Chemicals',
    tier: 'SECONDARY',
    requiredScore: 40,
    targetPosition: 8,
    signingBonus: 1_200_000,
    perRaceFee: 780_000,
    pointsBonus: 60_000,
    podiumBonus: 300_000,
    winBonus: 650_000,
    penalty: 900_000,
    seasons: 2,
    blurb: 'Technical partner money, paid quietly and reliably.',
  },
  {
    id: 'northstar-watches',
    name: 'Northstar Chronometers',
    industry: 'Luxury',
    tier: 'SECONDARY',
    requiredScore: 55,
    targetPosition: 5,
    signingBonus: 2_000_000,
    perRaceFee: 620_000,
    pointsBonus: 110_000,
    podiumBonus: 700_000,
    winBonus: 1_500_000,
    penalty: 2_000_000,
    seasons: 1,
    blurb: 'They want the podium shot, and they pay for it when they get it.',
  },
  {
    id: 'pilgrim-outfitters',
    name: 'Pilgrim Outfitters',
    industry: 'Apparel',
    tier: 'SECONDARY',
    requiredScore: 18,
    targetPosition: 11,
    signingBonus: 600_000,
    perRaceFee: 460_000,
    pointsBonus: 40_000,
    podiumBonus: 220_000,
    winBonus: 480_000,
    penalty: 0,
    seasons: 1,
    blurb: 'Small, dependable, and available to absolutely anybody.',
  },
  {
    id: 'quill-software',
    name: 'Quill Software',
    industry: 'Software',
    tier: 'SECONDARY',
    requiredScore: 34,
    targetPosition: 9,
    signingBonus: 900_000,
    perRaceFee: 540_000,
    pointsBonus: 85_000,
    podiumBonus: 380_000,
    winBonus: 820_000,
    penalty: 400_000,
    seasons: 2,
    blurb: 'A long-term associate deal that grows quietly with your results.',
  },
  {
    id: 'lumen-health',
    name: 'Lumen Health',
    industry: 'Healthcare',
    tier: 'SECONDARY',
    requiredScore: 28,
    targetPosition: 10,
    signingBonus: 750_000,
    perRaceFee: 500_000,
    pointsBonus: 55_000,
    podiumBonus: 260_000,
    winBonus: 560_000,
    penalty: 200_000,
    seasons: 1,
    blurb: 'Fills a slot without asking questions. Renewable every season.',
  },
];

export const SPONSOR_BY_ID = new Map(SPONSORS.map((sponsor) => [sponsor.id, sponsor]));

export function sponsorById(id: string): Sponsor | undefined {
  return SPONSOR_BY_ID.get(id);
}
