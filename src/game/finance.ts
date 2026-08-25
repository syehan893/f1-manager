import { DRIVER_BY_ID } from '@/data/drivers';
import { driverRating } from '@/data/grid2026';
import { SPONSORS, TIER_SLOTS, sponsorById } from '@/data/sponsors';
import type { Sponsor, SponsorTier } from '@/data/sponsors';
import type { GameState, LedgerEntry, LedgerKind, RaceResult, SponsorContract } from './types';

/* =====================================================================
 * Team finance.
 *
 * The rule this module exists to enforce: nothing in the game is free,
 * and money has to come from somewhere. Every figure the player spends
 * is debited here, every figure they earn is credited here, and both
 * leave a ledger line explaining themselves.
 *
 * Income  — sponsor retainers and result bonuses each round, prize money
 *           at the end of the season.
 * Outgoing — driver salaries and operating costs each round, plus every
 *           discretionary purchase: R&D, component upgrades, facilities
 *           and transfer fees.
 *
 * Everything here is pure. `charge` and `credit` return a new balance and
 * a ledger line; the machine is what actually commits them.
 * ===================================================================== */

/* ------------------------------ constants ----------------------------- */

/** Fixed cost of turning up: freight, staff, tyres, entry fees. */
export const BASE_ROUND_COST = 900_000;
/** Every facility level costs something to keep running. */
export const FACILITY_UPKEEP_PER_LEVEL = 150_000;
/** Cash cost of one development token, on top of the token itself. */
export const CASH_PER_DEV_TOKEN = 1_100_000;
/** Selling a driver recovers this share of their valuation. */
export const TRANSFER_SELL_ON_RATE = 0.7;
/** Floor on any transfer, so a swap is never free. */
export const MIN_TRANSFER_FEE = 750_000;

/**
 * Constructors' prize money, paid at the end of the season. Position 1
 * is index 0; anything past the table earns the last figure.
 */
export const PRIZE_MONEY = [
  92_000_000, 74_000_000, 62_000_000, 52_000_000, 44_000_000, 37_000_000, 31_000_000,
  26_000_000, 22_000_000, 18_000_000, 15_000_000,
];

export const LEDGER_LABEL: Record<LedgerKind, string> = {
  SPONSOR: 'Sponsorship',
  PRIZE: 'Prize money',
  SIGNING_BONUS: 'Signing bonus',
  SALARY: 'Driver salaries',
  OPERATIONS: 'Race operations',
  RND: 'R&D investment',
  UPGRADE: 'Component build',
  FACILITY: 'Facility works',
  TRANSFER: 'Transfer fee',
  STAFF: 'Staff',
  PENALTY: 'Sponsor penalty',
};

/** Kinds that represent money coming in. */
const INCOME_KINDS = new Set<LedgerKind>(['SPONSOR', 'PRIZE', 'SIGNING_BONUS']);

export function isIncome(kind: LedgerKind): boolean {
  return INCOME_KINDS.has(kind);
}

/* ------------------------------- ledger ------------------------------- */

/** Keeps the ledger to a readable length without losing the season. */
const LEDGER_CAP = 200;

export function ledgerEntry(
  state: GameState,
  kind: LedgerKind,
  label: string,
  amount: number,
): LedgerEntry {
  return {
    id: `led-${state.season}-${state.round}-${kind}-${state.finance.ledger.length}-${Math.abs(
      Math.round(amount),
    )}`,
    season: state.season,
    round: state.round,
    kind,
    label,
    amount: Math.round(amount),
  };
}

/**
 * Post a transaction against the player's team. Positive amounts are
 * income, negative are expenditure. Mutates `state`, which is always a
 * clone by the time the machine calls this.
 */
export function post(
  state: GameState,
  kind: LedgerKind,
  label: string,
  amount: number,
): void {
  const team = state.teams.find((entry) => entry.teamId === state.playerTeamId);
  if (!team) return;

  team.budget += Math.round(amount);
  if (amount >= 0) state.finance.seasonIncome += Math.round(amount);
  else state.finance.seasonExpenditure += Math.round(-amount);

  state.finance.ledger = [
    ledgerEntry(state, kind, label, amount),
    ...state.finance.ledger,
  ].slice(0, LEDGER_CAP);
}

/** The player's current balance, or 0 before a team is chosen. */
export function balanceOf(state: GameState): number {
  return state.teams.find((entry) => entry.teamId === state.playerTeamId)?.budget ?? 0;
}

/** Shared affordability gate, so the UI and the reducer agree. */
export function canAfford(state: GameState, amount: number): boolean {
  return balanceOf(state) >= amount;
}

/* ---------------------------- running costs --------------------------- */

/** Combined driver salary bill for the season, for the player's team. */
export function seasonWageBill(state: GameState): number {
  return Object.entries(state.driverTeams)
    .filter(([, teamId]) => teamId === state.playerTeamId)
    .reduce((sum, [driverId]) => {
      const driver = DRIVER_BY_ID[driverId];
      return sum + (driver?.contract.salaryPerSeason ?? 0);
    }, 0);
}

/** Salary charged per round — the season bill spread over the calendar. */
export function roundWageBill(state: GameState): number {
  return Math.round(seasonWageBill(state) / Math.max(1, state.settings.seasonLength));
}

/** Fixed and facility-driven cost of running a race weekend. */
export function roundOperatingCost(state: GameState): number {
  const levels = state.facilities.reduce((sum, facility) => sum + facility.level, 0);
  return BASE_ROUND_COST + levels * FACILITY_UPKEEP_PER_LEVEL;
}

/* ------------------------------ sponsors ------------------------------ */

/** Contracts still running, newest first. */
export function activeContracts(state: GameState): SponsorContract[] {
  return state.finance.contracts.filter((contract) => contract.seasonsRemaining > 0);
}

export function slotsUsed(state: GameState, tier: SponsorTier): number {
  return activeContracts(state).filter((contract) => contract.tier === tier).length;
}

export function slotsFree(state: GameState, tier: SponsorTier): number {
  return Math.max(0, TIER_SLOTS[tier] - slotsUsed(state, tier));
}

export interface SponsorEligibility {
  ok: boolean;
  reason?: string;
}

/**
 * Whether the team can sign this deal right now. Reputation is the gate
 * that keeps the best contracts out of a backmarker's reach.
 */
export function canSignSponsor(state: GameState, sponsor: Sponsor): SponsorEligibility {
  if (activeContracts(state).some((contract) => contract.sponsorId === sponsor.id)) {
    return { ok: false, reason: 'Already under contract with this partner.' };
  }
  if (slotsFree(state, sponsor.tier) <= 0) {
    return {
      ok: false,
      reason: `No ${sponsor.tier.toLowerCase()} slot free — ${TIER_SLOTS[sponsor.tier]} in use.`,
    };
  }
  if (state.managerPerformanceScore < sponsor.requiredScore) {
    return {
      ok: false,
      reason: `Wants a reputation of ${sponsor.requiredScore}; yours is ${Math.round(
        state.managerPerformanceScore,
      )}.`,
    };
  }
  return { ok: true };
}

/** Every deal on the market, with its eligibility resolved. */
export function sponsorMarket(
  state: GameState,
): Array<{ sponsor: Sponsor; eligibility: SponsorEligibility }> {
  return SPONSORS.map((sponsor) => ({ sponsor, eligibility: canSignSponsor(state, sponsor) }));
}

export function contractFromSponsor(sponsor: Sponsor, season: number): SponsorContract {
  return {
    sponsorId: sponsor.id,
    tier: sponsor.tier,
    signedInSeason: season,
    seasonsRemaining: sponsor.seasons,
    perRaceFee: sponsor.perRaceFee,
    pointsBonus: sponsor.pointsBonus,
    podiumBonus: sponsor.podiumBonus,
    winBonus: sponsor.winBonus,
    targetPosition: sponsor.targetPosition,
    penalty: sponsor.penalty,
  };
}

/** Guaranteed retainer income per round, before any bonuses. */
export function roundRetainer(state: GameState): number {
  return activeContracts(state).reduce((sum, contract) => sum + contract.perRaceFee, 0);
}

export interface RoundPayout {
  retainer: number;
  results: number;
  total: number;
  /** Points and rostrums the bonuses were computed from. */
  points: number;
  podiums: number;
  wins: number;
}

/**
 * What the sponsors owe for one race weekend: the retainer plus whatever
 * the two cars actually earned on track. This is the line that makes a
 * good Sunday worth money rather than just worth points.
 */
export function racePayout(state: GameState, result: RaceResult): RoundPayout {
  const ours = result.finishers.filter((finish) => finish.teamId === state.playerTeamId);
  const points = ours.reduce((sum, finish) => sum + finish.points, 0);
  const podiums = ours.filter(
    (finish) => finish.position <= 3 && finish.status === 'FINISHED',
  ).length;
  const wins = ours.filter(
    (finish) => finish.position === 1 && finish.status === 'FINISHED',
  ).length;

  const contracts = activeContracts(state);
  const retainer = contracts.reduce((sum, contract) => sum + contract.perRaceFee, 0);
  const results = contracts.reduce(
    (sum, contract) =>
      sum +
      contract.pointsBonus * points +
      contract.podiumBonus * podiums +
      contract.winBonus * wins,
    0,
  );

  return { retainer, results, total: retainer + results, points, podiums, wins };
}

export interface SeasonSettlement {
  /** Constructors' position the player finished in. */
  position: number;
  prize: number;
  /** Contracts whose target was missed, and what each one costs. */
  penalties: Array<{ sponsorId: string; name: string; target: number; penalty: number }>;
  penaltyTotal: number;
  net: number;
}

/**
 * End-of-season reckoning: prize money in, sponsor penalties out. A deal
 * signed on optimism is settled here, which is what stops the biggest
 * contract from being a free win.
 */
export function settleSeason(state: GameState): SeasonSettlement {
  const table = state.standings.constructors;
  const row = table.find((entry) => entry.teamId === state.playerTeamId);
  const position = row?.position ?? table.length;
  const prize = PRIZE_MONEY[position - 1] ?? PRIZE_MONEY[PRIZE_MONEY.length - 1]!;

  const penalties = activeContracts(state)
    .filter((contract) => contract.penalty > 0 && position > contract.targetPosition)
    .map((contract) => ({
      sponsorId: contract.sponsorId,
      name: sponsorById(contract.sponsorId)?.name ?? contract.sponsorId,
      target: contract.targetPosition,
      penalty: contract.penalty,
    }));

  const penaltyTotal = penalties.reduce((sum, entry) => sum + entry.penalty, 0);

  return { position, prize, penalties, penaltyTotal, net: prize - penaltyTotal };
}

/* ------------------------------ transfers ------------------------------ */

export interface TransferQuote {
  incomingFee: number;
  outgoingFee: number;
  /** What actually leaves the bank: the fee in, less the fee recovered. */
  net: number;
  /** Wage bill difference across the season. */
  wageDelta: number;
}

/**
 * A driver's market valuation. Ability dominates, but a 20-year-old with
 * the same rating as a 36-year-old is worth considerably more, because a
 * buyer is paying for the seasons ahead as well as the one in hand.
 */
export function driverValuation(driverId: string): number {
  const driver = DRIVER_BY_ID[driverId];
  if (!driver) return MIN_TRANSFER_FEE;

  const rating = driverRating(driver);
  // Only the top of the range costs real money: 55 is a free agent, 99 is
  // a nine-figure asset, and the curve between them is steep.
  const ability = Math.max(0, (rating - 55) / 44);
  const base = Math.pow(ability, 2.4) * 96_000_000;

  // Peak value sits in the late twenties and falls away either side.
  const age = driver.age;
  const ageFactor =
    age <= 22 ? 1.25 : age <= 28 ? 1.1 : age <= 32 ? 0.9 : age <= 36 ? 0.6 : 0.35;

  // The buyout clause is a floor: nobody sells below it.
  const clause = driver.contract.buyoutClause * 0.35;

  return Math.max(MIN_TRANSFER_FEE, Math.round(Math.max(base * ageFactor, clause)));
}

/** The full cost of a straight swap, both directions accounted for. */
export function quoteTransfer(
  incomingDriverId: string,
  outgoingDriverId: string,
): TransferQuote {
  const incomingFee = driverValuation(incomingDriverId);
  const outgoingFee = Math.round(driverValuation(outgoingDriverId) * TRANSFER_SELL_ON_RATE);

  const incoming = DRIVER_BY_ID[incomingDriverId];
  const outgoing = DRIVER_BY_ID[outgoingDriverId];
  const wageDelta =
    (incoming?.contract.salaryPerSeason ?? 0) - (outgoing?.contract.salaryPerSeason ?? 0);

  return {
    incomingFee,
    outgoingFee,
    net: Math.max(MIN_TRANSFER_FEE, incomingFee - outgoingFee),
    wageDelta,
  };
}

/* ---------------------------- cost helpers ----------------------------- */

/** Cash a component build costs on top of its development tokens. */
export function upgradeCashCost(tokenCost: number): number {
  return tokenCost * CASH_PER_DEV_TOKEN;
}

/** A season-at-a-glance projection for the finance panel. */
export interface FinanceProjection {
  balance: number;
  roundsRemaining: number;
  perRoundIncome: number;
  perRoundCost: number;
  perRoundNet: number;
  /** Balance at the end of the season if nothing else is spent. */
  projectedBalance: number;
}

export function projectSeason(state: GameState): FinanceProjection {
  const roundsRemaining = Math.max(0, state.settings.seasonLength - state.round + 1);
  const perRoundIncome = roundRetainer(state);
  const perRoundCost = roundWageBill(state) + roundOperatingCost(state);
  const perRoundNet = perRoundIncome - perRoundCost;

  return {
    balance: balanceOf(state),
    roundsRemaining,
    perRoundIncome,
    perRoundCost,
    perRoundNet,
    projectedBalance: balanceOf(state) + perRoundNet * roundsRemaining,
  };
}
