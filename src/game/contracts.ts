import { GRID_2026_TEAMS, driverRating, gridTeamOf } from '@/data/grid2026';
import { effectiveDriver } from './driverDevelopment';
import { GRID_SEATS_PER_TEAM, openSeatsAt, raceDriversOf, squadOf } from './roster';
import { driverValuation } from './finance';
import type {
  ContractOffer,
  DriverDeal,
  DriverNegotiation,
  DriverRole,
  GameState,
  TransferOffer,
} from './types';

/* =====================================================================
 * Signing drivers.
 *
 * Until now a driver changed teams by being swapped for another one, at
 * a price the game calculated and the player could only accept or not.
 * Nobody negotiated anything, nobody had a contract that ran out, and no
 * rival team ever wanted anything.
 *
 * A move now has four parties and three prices:
 *
 *   the driver     wants a salary, a length of deal, and a race seat —
 *                  or will take reserve if the team is good enough
 *   their team     wants a fee, and will not sell at all if the driver
 *                  is one of the two they are counting on
 *   the player     has a budget, a wage bill and two race seats
 *   rival teams    make their own offers for the player's drivers
 *
 * Everything here is deterministic on (season, round, driverId) so a
 * reload cannot be used to fish for a better answer out of the same
 * conversation. The one thing that does move is the number of times an
 * offer has been turned down, which is stored on the negotiation — a
 * driver who has said no three times is not going to say yes to a fourth
 * offer of the same money.
 * ===================================================================== */

/** Interest below this and the driver will not even take the meeting. */
export const MINIMUM_INTEREST = 22;
/** Offers one driver will consider before talks collapse. */
export const MAX_REJECTIONS = 3;
/** Longest deal anybody will sign. */
export const MAX_CONTRACT_SEASONS = 4;

function seeded(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

/* ------------------------------ the deal ------------------------------ */

/** The contract a driver is on, falling back to the one they arrived with. */
export function dealFor(state: GameState, driverId: string): DriverDeal | null {
  const stored = state.deals?.[driverId];
  if (stored) return stored;

  const teamId = state.driverTeams[driverId];
  const driver = effectiveDriver(state, driverId);
  if (!teamId || !driver) return null;

  /* A save from before contracts existed still has to answer the
   * question, so the data file's own terms stand in until the driver
   * signs something real. */
  return {
    driverId,
    teamId,
    salary: driver.contract.salaryPerSeason,
    seasonsRemaining: Math.max(1, driver.contract.expiresAfterSeason - state.season + 1),
    signedInSeason: state.season,
    signingBonus: 0,
    buyoutClause: driver.contract.buyoutClause,
    role: raceDriversOf(state, teamId).includes(driverId) ? 'RACE' : 'RESERVE',
  };
}

/** Salary the player's team is actually committed to, per season. */
export function squadWageBill(state: GameState): number {
  return squadOf(state, state.playerTeamId).reduce(
    (sum, driverId) => sum + (dealFor(state, driverId)?.salary ?? 0),
    0,
  );
}

/** Contracts running out at the end of this season, on the player's books. */
export function expiringDeals(state: GameState): DriverDeal[] {
  return squadOf(state, state.playerTeamId)
    .map((driverId) => dealFor(state, driverId))
    .filter((deal): deal is DriverDeal => Boolean(deal) && deal!.seasonsRemaining <= 1);
}

/* --------------------------- what they want --------------------------- */

/**
 * How badly a driver wants the move, 0-100.
 *
 * Three things move it and they pull against each other: how much better
 * the car is than the one they are in, whether there is a race seat at
 * the end of it, and how they are being treated where they are. A driver
 * winning races for a top team has no interest in a midfield reserve
 * role at any price; a driver rotting on a bad team will talk to anybody.
 */
export function interestIn(state: GameState, driverId: string, role: DriverRole): number {
  const fromTeamId = state.driverTeams[driverId] ?? '';
  const toTeamId = state.playerTeamId;
  if (!toTeamId) return 0;

  const standing = (teamId: string) =>
    state.standings.constructors.find((row) => row.teamId === teamId)?.position ??
    state.teams.length;

  /* Moving up the constructors' table is the single biggest draw. Ten
   * places better is a move anybody takes; ten places worse is one
   * nobody takes without being paid for it. */
  const climb = fromTeamId ? standing(fromTeamId) - standing(toTeamId) : 4;
  let interest = 50 + climb * 4.2;

  // A reserve role is a step down unless the team is a genuine step up.
  if (role === 'RESERVE') interest -= 26 - Math.max(0, climb) * 1.4;

  // How they are being treated now. An unhappy driver is a willing one.
  const condition = state.driverConditions[driverId];
  if (condition) interest += (60 - condition.morale) * 0.28;

  /* A driver near the end of their deal is looking around anyway; one
   * who has just signed is not. */
  const deal = dealFor(state, driverId);
  if (deal) interest += deal.seasonsRemaining <= 1 ? 12 : -deal.seasonsRemaining * 3.5;

  // A free agent wants a drive more than anybody.
  if (!fromTeamId) interest += 22;

  /* And the manager's own standing counts: drivers sign for people who
   * look like they are going somewhere. */
  interest += (state.managerPerformanceScore - 45) * 0.22;

  // A little variation per driver, fixed for the season.
  interest += (seeded(`${state.season}:${driverId}:interest`) - 0.5) * 14;

  return Math.max(0, Math.min(100, Math.round(interest)));
}

/**
 * The terms a driver would sign for today.
 *
 * The asking salary is their market value adjusted for how much they
 * want the move: a driver desperate to join takes a discount, a driver
 * being talked out of a good seat charges for it.
 */
export function askingTerms(
  state: GameState,
  driverId: string,
  role: DriverRole,
): ContractOffer {
  const driver = effectiveDriver(state, driverId);
  const base = driver?.contract.salaryPerSeason ?? 4_000_000;
  const rating = driver ? driverRating(driver) : 60;
  const interest = interestIn(state, driverId, role);

  /* Keen drivers come cheaper, reluctant ones dearer — 20% either side.
   * This is the only lever the player has that is not money. */
  const eagerness = 1.2 - (interest / 100) * 0.4;
  // A reserve is paid less for the same ability. Everybody knows it.
  const roleFactor = role === 'RACE' ? 1 : 0.55;
  const salary = Math.round((base * eagerness * roleFactor) / 100_000) * 100_000;

  /* Older drivers want short deals because that is all anybody offers
   * them; a quick 23-year-old wants to be tied down and paid for it. */
  const age = driver?.age ?? 27;
  const seasons = age >= 34 ? 1 : age <= 24 && rating >= 78 ? 3 : 2;

  const fromTeamId = state.driverTeams[driverId] ?? '';
  const transferFee = fromTeamId ? transferAsk(state, driverId) : 0;

  return {
    salary: Math.max(500_000, salary),
    seasons,
    signingBonus: Math.round(salary * 0.18),
    transferFee,
    role,
  };
}

/**
 * What the selling team wants for the contract.
 *
 * A driver in one of a team's two race seats costs a premium over their
 * valuation — the seller has to find a replacement — while a reserve
 * they are paying to sit still can be had close to the buyout clause.
 */
export function transferAsk(state: GameState, driverId: string): number {
  const fromTeamId = state.driverTeams[driverId];
  if (!fromTeamId) return 0;

  const valuation = driverValuation(driverId, state);
  const isRacing = raceDriversOf(state, fromTeamId).includes(driverId);
  const deal = dealFor(state, driverId);

  /* Time left on the deal is leverage. A driver with three years to run
   * is expensive; one who walks for nothing in six months is not. */
  const remaining = deal?.seasonsRemaining ?? 1;
  const leverage = 0.62 + remaining * 0.24;

  return Math.round((valuation * leverage * (isRacing ? 1.35 : 0.85)) / 100_000) * 100_000;
}

/** Whether the driver's current team will sell at all. */
export function sellability(
  state: GameState,
  driverId: string,
): { willing: boolean; reason?: string } {
  const fromTeamId = state.driverTeams[driverId];
  if (!fromTeamId) return { willing: true };
  if (fromTeamId === state.playerTeamId) {
    return { willing: false, reason: 'That driver already races for you.' };
  }

  /* Nobody sells down to one car. A team with exactly two drivers will
   * still deal, but only for a driver they are not counting on, or for
   * a fee that lets them replace them. */
  const squad = squadOf(state, fromTeamId);
  if (squad.length <= GRID_SEATS_PER_TEAM) {
    const standing =
      state.standings.constructors.find((row) => row.teamId === fromTeamId)?.position ??
      state.teams.length;
    /* A team at the front of the championship is not selling either of
     * its drivers mid-season at any price. */
    if (standing <= 3) {
      return {
        willing: false,
        reason: `${gridTeamOf(fromTeamId).name} will not discuss either of their race drivers.`,
      };
    }
  }

  return { willing: true };
}

/* ---------------------------- negotiations ---------------------------- */

/** Opens talks. Returns the negotiation, or why it cannot be opened. */
export function openNegotiation(
  state: GameState,
  driverId: string,
  role: DriverRole,
): { ok: false; reason: string } | { ok: true; negotiation: DriverNegotiation } {
  const teamId = state.playerTeamId;
  if (!teamId) return { ok: false, reason: 'No team selected.' };

  const driver = effectiveDriver(state, driverId);
  if (!driver) return { ok: false, reason: 'No such driver.' };

  const sale = sellability(state, driverId);
  if (!sale.willing) return { ok: false, reason: sale.reason ?? 'That driver is not available.' };

  const interest = interestIn(state, driverId, role);
  const asking = askingTerms(state, driverId, role);
  const fromTeamId = state.driverTeams[driverId] ?? '';

  const negotiation: DriverNegotiation = {
    id: `talks-${state.season}-${state.round}-${driverId}`,
    driverId,
    teamId,
    fromTeamId,
    season: state.season,
    round: state.round,
    stage: interest < MINIMUM_INTEREST ? 'REJECTED' : 'TALKING',
    interest,
    asking,
    offer: null,
    rejections: 0,
    note:
      interest < MINIMUM_INTEREST
        ? `${driver.lastName} is not interested in a move at the moment.`
        : role === 'RESERVE'
          ? `${driver.lastName} will listen, but wants to know what the route to a race seat looks like.`
          : `${driver.lastName} is open to it. His people have named their terms.`,
  };

  return { ok: true, negotiation };
}

export interface OfferVerdict {
  accepted: boolean;
  /** Fresh terms the driver would sign, when they have counter-offered. */
  counter: ContractOffer | null;
  note: string;
  /** True once talks are dead and reopening them is the only way back. */
  collapsed: boolean;
}

/**
 * Puts an offer to a driver and their team.
 *
 * Both have to be satisfied. The driver is judging the salary against
 * what they asked for, weighted by how much they want the move; the
 * selling team is judging the fee against what they asked for, and does
 * not care how keen the driver is.
 */
export function judgeOffer(
  state: GameState,
  negotiation: DriverNegotiation,
  offer: ContractOffer,
): OfferVerdict {
  const driver = effectiveDriver(state, negotiation.driverId);
  const name = driver?.lastName ?? negotiation.driverId;
  const asking = negotiation.asking;

  /* Keenness is worth real money: a driver at 80 interest will sign for
   * about 12% under their asking price, one at 30 wants a premium. */
  const tolerance = 1 - (negotiation.interest - 50) / 320;
  const salaryFloor = Math.round(asking.salary * tolerance);
  const feeFloor = negotiation.fromTeamId ? asking.transferFee : 0;

  const salaryShort = salaryFloor - offer.salary;
  const feeShort = feeFloor - offer.transferFee;

  /* A shorter deal than they asked for is a real objection for a young
   * driver and no objection at all for a veteran on a one-year rolling
   * arrangement — the asking length already carries that. */
  const seasonsShort = Math.max(0, asking.seasons - offer.seasons);

  if (salaryShort <= 0 && feeShort <= 0 && seasonsShort === 0) {
    return {
      accepted: true,
      counter: null,
      collapsed: false,
      note:
        offer.role === 'RACE'
          ? `Agreed. ${name} signs to race for you.`
          : `Agreed. ${name} joins as a reserve, on the understanding that a seat is the goal.`,
    };
  }

  const rejections = negotiation.rejections + 1;
  if (rejections >= MAX_REJECTIONS) {
    return {
      accepted: false,
      counter: null,
      collapsed: true,
      note: `${name}'s people have ended the discussion. That door is closed for now.`,
    };
  }

  /* A counter-offer, and it moves: each rejection shaves a little off
   * what they will hold out for, so a negotiation that is going
   * somewhere converges instead of repeating itself. */
  const softening = 1 - rejections * 0.045;
  const counter: ContractOffer = {
    salary: Math.max(offer.salary, Math.round(salaryFloor * softening)),
    seasons: Math.max(offer.seasons, asking.seasons),
    signingBonus: Math.round(asking.signingBonus * softening),
    transferFee: Math.max(offer.transferFee, Math.round(feeFloor * softening)),
    role: offer.role,
  };

  const complaints: string[] = [];
  if (salaryShort > 0) complaints.push('the money is short');
  if (feeShort > 0) {
    complaints.push(
      `${gridTeamOf(negotiation.fromTeamId).shortName} want more for the contract`,
    );
  }
  if (seasonsShort > 0) complaints.push('he wants a longer deal');

  return {
    accepted: false,
    counter,
    collapsed: false,
    note: `Turned down — ${complaints.join(', ')}. They have come back with a number.`,
  };
}

/** The total cash a signing costs the moment it goes through. */
export function signingCost(offer: ContractOffer): number {
  return offer.transferFee + offer.signingBonus;
}

/** Builds the contract a completed negotiation produces. */
export function dealFromOffer(
  state: GameState,
  driverId: string,
  offer: ContractOffer,
): DriverDeal {
  return {
    driverId,
    teamId: state.playerTeamId!,
    salary: offer.salary,
    seasonsRemaining: offer.seasons,
    signedInSeason: state.season,
    signingBonus: offer.signingBonus,
    /* The clause scales with the deal: a long contract is what makes a
     * driver expensive to prise away later. */
    buyoutClause: Math.round(offer.salary * (1.4 + offer.seasons * 0.35)),
    role: offer.role,
  };
}

/** What it costs to tear up a deal early: the balance of it, halved. */
export function releaseCost(state: GameState, driverId: string): number {
  const deal = dealFor(state, driverId);
  if (!deal) return 0;
  return Math.round(deal.salary * Math.max(0, deal.seasonsRemaining) * 0.5);
}

/* ------------------------- rivals coming to you ------------------------ */

/**
 * Bids rival teams make for the player's drivers between rounds.
 *
 * Two things bring one in: the player putting a driver on the list, and
 * a team simply wanting somebody. The second is what makes the market
 * feel like it exists independently of the player — a driver having a
 * strong season attracts interest whether or not they were offered
 * around, and turning it down has to be a decision.
 *
 * Deterministic on the round, so the same weekend always produces the
 * same approaches.
 */
export function rivalBids(state: GameState): TransferOffer[] {
  const playerTeamId = state.playerTeamId;
  if (!playerTeamId) return [];

  const bids: TransferOffer[] = [];
  const squad = squadOf(state, playerTeamId);

  for (const driverId of squad) {
    const listing = state.transferList.find((entry) => entry.driverId === driverId);
    const driver = effectiveDriver(state, driverId);
    if (!driver) continue;

    const rating = driverRating(driver);
    const roll = seeded(`${state.season}:${state.round}:${driverId}:bid`);

    /* A listed driver draws interest readily; an unlisted one only when
     * they are genuinely good, and even then not often. */
    const chance = listing ? 0.55 : Math.max(0, (rating - 74) / 100);
    if (roll > chance) continue;

    /* Whoever bids is a team that has room and is below the player in
     * the championship, or a strong team shopping for a star. */
    const suitors = GRID_2026_TEAMS.filter(
      (team) => team.id !== playerTeamId && openSeatsAt(state, team.id) >= 0,
    );
    if (suitors.length === 0) continue;

    const suitor =
      suitors[Math.floor(seeded(`${state.season}:${state.round}:${driverId}:who`) * suitors.length)]!;

    const ask = listing?.askingFee ?? transferAsk(state, driverId);
    /* Bids come in under the asking price more often than over it —
     * accepting the first offer should usually be leaving money on the
     * table. */
    const factor = 0.72 + seeded(`${state.season}:${state.round}:${driverId}:fee`) * 0.5;
    const fee = Math.round((ask * factor) / 100_000) * 100_000;

    bids.push({
      id: `bid-${state.season}-${state.round}-${driverId}`,
      driverId,
      fromTeamId: suitor.id,
      fee,
      salaryRelieved: dealFor(state, driverId)?.salary ?? 0,
      season: state.season,
      round: state.round,
      status: 'OPEN',
      note: listing
        ? `${suitor.name} have responded to ${driver.lastName} being made available.`
        : `${suitor.name} have come in for ${driver.lastName} unprompted.`,
    });
  }

  return bids;
}

/**
 * Drivers rival teams offer *to* the player, unprompted.
 *
 * The other half of a working market: teams shopping a driver around,
 * and free agents putting themselves forward. Returned as the terms they
 * would come on, so the player is answering a real proposition.
 */
export interface InboundProposal {
  driverId: string;
  fromTeamId: string;
  offer: ContractOffer;
  note: string;
}

export function inboundProposals(state: GameState): InboundProposal[] {
  const playerTeamId = state.playerTeamId;
  if (!playerTeamId) return [];

  const proposals: InboundProposal[] = [];
  const ours = new Set(squadOf(state, playerTeamId));

  for (const [driverId, teamId] of Object.entries(state.driverTeams)) {
    if (ours.has(driverId) || teamId === playerTeamId) continue;

    const roll = seeded(`${state.season}:${state.round}:${driverId}:shopped`);
    /* A team only shops a driver they have stopped counting on: a
     * reserve, or somebody they are not entering on Sunday. */
    const benched = !raceDriversOf(state, teamId).includes(driverId);
    if (!benched || roll > 0.22) continue;

    const driver = effectiveDriver(state, driverId);
    if (!driver) continue;

    const asking = askingTerms(state, driverId, 'RESERVE');
    proposals.push({
      driverId,
      fromTeamId: teamId,
      /* A team shopping somebody discounts the fee to move them on. */
      offer: { ...asking, transferFee: Math.round(asking.transferFee * 0.7) },
      note: `${gridTeamOf(teamId).name} are willing to let ${driver.lastName} go — he is not in their race line-up.`,
    });
  }

  return proposals.slice(0, 2);
}
