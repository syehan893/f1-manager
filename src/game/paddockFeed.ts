import { GRID_2026_TEAMS, gridTeamOf } from '@/data/grid2026';
import { effectiveDriver } from './driverDevelopment';
import { conditionOf, emotionOf } from './driverCondition';
import { raceDriversOf, squadOf } from './roster';
import { postMail } from './mail';
import { PUNDITS, FAN_ACCOUNTS, handleFor, postSocial, teamHandle, voiceFor } from './social';
import type { SocialAuthorKind } from './social';
import type { GameState, QualifyingResult, RaceResult, TransferMove } from './types';

/* =====================================================================
 * Turning a season into things people say about it.
 *
 * The save already knew everything worth reporting — who took pole, who
 * threw away a podium, which driver has been miserable for three rounds,
 * who just changed teams — and none of it was ever said out loud. This
 * module is the one place that reads the state and writes the paddock's
 * reaction to it, into the two channels that keep it:
 *
 *   mail    addressed to the manager, and sometimes answerable
 *   social  said in public, about the manager as often as to them
 *
 * Every writer here is called from the reducer at the moment the thing
 * happens, so the feed cannot drift out of step with the save, and
 * nothing is generated twice for the same event.
 * ===================================================================== */

function nameOf(state: GameState, driverId: string): string {
  const driver = effectiveDriver(state, driverId);
  return driver ? `${driver.firstName} ${driver.lastName}` : driverId;
}

function lastNameOf(state: GameState, driverId: string): string {
  return effectiveDriver(state, driverId)?.lastName ?? driverId;
}

function driverHandle(state: GameState, driverId: string): string {
  const driver = effectiveDriver(state, driverId);
  if (!driver) return driverId;
  return handleFor(driver.firstName, driver.lastName, String(driver.carNumber));
}

/** Posts as the driver themselves. */
function asDriver(
  state: GameState,
  driverId: string,
  topic: Parameters<typeof postSocial>[1]['topic'],
  text: string,
  reach: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL',
): void {
  postSocial(state, {
    authorKind: 'DRIVER',
    authorName: nameOf(state, driverId),
    handle: driverHandle(state, driverId),
    teamId: state.driverTeams[driverId] ?? null,
    topic,
    text,
    driverId,
    reach,
  });
}

/** Posts as a team's own account. */
function asTeam(
  state: GameState,
  teamId: string,
  topic: Parameters<typeof postSocial>[1]['topic'],
  text: string,
  reach: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL',
): void {
  const team = gridTeamOf(teamId);
  postSocial(state, {
    authorKind: 'TEAM',
    authorName: team.name,
    handle: teamHandle(team.shortName),
    teamId,
    topic,
    text,
    reach,
  });
}

/** Posts as one of the recurring press or fan voices. */
type Voice = { name: string; handle: string; kind: SocialAuthorKind };

function asVoice(
  state: GameState,
  pool: readonly Voice[],
  key: string,
  topic: Parameters<typeof postSocial>[1]['topic'],
  text: string,
  reach: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL',
): void {
  const voice = voiceFor(pool, key);
  postSocial(state, {
    authorKind: voice.kind,
    authorName: voice.name,
    handle: voice.handle,
    topic,
    text,
    reach,
  });
}

/* ------------------------------ qualifying ----------------------------- */

/** Saturday, as the paddock saw it. */
export function announceQualifying(state: GameState, result: QualifyingResult): void {
  const pole = result.entries[0];
  if (!pole) return;

  const gapToSecond = result.entries[1]
    ? (result.entries[1].bestLapMs - pole.bestLapMs) / 1000
    : 0;

  asDriver(
    state,
    pole.driverId,
    'QUALIFYING',
    `POLE. The car has been underneath me all weekend and the lap was there when I needed it. ${
      gapToSecond >= 0.3 ? 'Did not expect that margin.' : 'It was close out there.'
    }`,
    'HIGH',
  );

  asTeam(
    state,
    pole.teamId,
    'QUALIFYING',
    `P1 in qualifying. ${lastNameOf(state, pole.driverId)} on pole for round ${result.round} by ${gapToSecond.toFixed(3)}s.`,
    'HIGH',
  );

  asVoice(
    state,
    PUNDITS,
    `${result.season}:${result.round}:quali`,
    'QUALIFYING',
    gapToSecond >= 0.4
      ? `That is not a lap, that is a statement. ${lastNameOf(state, pole.driverId)} by ${gapToSecond.toFixed(3)}s and nobody was close.`
      : `Three tenths covering the top four. ${lastNameOf(state, pole.driverId)} takes it, but that is a proper grid.`,
  );

  /* And how it went for the player, which is the part they care about.
   * Both cars, because being out-qualified by a team-mate is the story
   * as often as the grid slot is. */
  const ours = result.entries.filter((entry) => entry.teamId === state.playerTeamId);
  if (ours.length > 0 && state.playerTeamId) {
    const best = ours[0]!;
    postMail(state, {
      category: 'RESULT',
      from: 'Race Engineering',
      subject: `Qualifying, round ${result.round} — P${best.position} our best`,
      importance: best.position <= 3 ? 'HIGH' : 'NORMAL',
      body: ours
        .map(
          (entry) =>
            `${nameOf(state, entry.driverId)} — P${entry.position}, ${
              entry.gapToPoleMs === 0
                ? 'pole position'
                : `${(entry.gapToPoleMs / 1000).toFixed(3)}s off pole`
            }.`,
        )
        .join('\n')
        .concat(
          `\n\nGrid slots are locked. The starting compound needs signing off before we go to the grid.`,
        ),
    });

    if (best.position <= 3) {
      asTeam(
        state,
        state.playerTeamId,
        'QUALIFYING',
        `Front three for ${lastNameOf(state, best.driverId)}. Everything to play for tomorrow.`,
      );
    }
  }
}

/* -------------------------------- the race ----------------------------- */

/** Sunday: the result, and what it did to everybody. */
export function announceRace(state: GameState, result: RaceResult): void {
  const winner = result.finishers[0];
  if (!winner) return;

  asDriver(
    state,
    winner.driverId,
    'RACE',
    winner.gridPosition > 3
      ? `WIN. From P${winner.gridPosition} on the grid. That one is for every single person in the garage.`
      : `WIN! Controlled it from the front and the car was mega all afternoon. What a day.`,
    'HIGH',
  );

  asTeam(
    state,
    winner.teamId,
    'RACE',
    `VICTORY for ${lastNameOf(state, winner.driverId)} in round ${result.round}. ${
      result.finishers[1]?.teamId === winner.teamId ? 'A one-two.' : ''
    }`.trim(),
    'HIGH',
  );

  /* The drive of the day is more interesting than the win about half the
   * time, and it is the thing a feed is for. */
  const recovery = [...result.finishers]
    .filter((finish) => finish.status === 'FINISHED')
    .sort((a, b) => b.positionsGained - a.positionsGained)[0];
  if (recovery && recovery.positionsGained >= 5) {
    asVoice(
      state,
      PUNDITS,
      `${result.season}:${result.round}:recovery`,
      'RACE',
      `${lastNameOf(state, recovery.driverId)}: P${recovery.gridPosition} to P${recovery.position}. Drive of the day and it is not close.`,
    );
  }

  const retirements = result.finishers.filter((finish) => finish.status === 'DNF');
  if (retirements.length >= 3) {
    asVoice(
      state,
      FAN_ACCOUNTS,
      `${result.season}:${result.round}:dnf`,
      'RACE',
      `${retirements.length} cars did not see the flag. Reliability is going to decide this championship, mark it.`,
    );
  }

  /* The player's afternoon, in the post, with the numbers that matter. */
  const ours = result.finishers.filter((finish) => finish.teamId === state.playerTeamId);
  if (ours.length > 0 && state.playerTeamId) {
    const points = ours.reduce((sum, finish) => sum + finish.points, 0);
    const best = ours.reduce((a, b) => (a.position <= b.position ? a : b));

    postMail(state, {
      category: 'RESULT',
      from: 'Race Engineering',
      subject: `Round ${result.round} — ${points} point${points === 1 ? '' : 's'}`,
      importance: best.position <= 3 ? 'HIGH' : 'NORMAL',
      body:
        ours
          .map((finish) =>
            finish.status === 'DNF'
              ? `${nameOf(state, finish.driverId)} — retired.`
              : `${nameOf(state, finish.driverId)} — P${finish.position} from P${finish.gridPosition}, ${finish.points} pt${finish.points === 1 ? '' : 's'}${finish.fastestLap ? ', fastest lap' : ''}.`,
          )
          .join('\n') + `\n\n${points} points on the day.`,
    });

    /* The board only writes when there is something to say, and it is
     * the one voice in the inbox with consequences behind it. */
    if (best.position === 1) {
      postMail(state, {
        category: 'BOARD',
        from: 'The Board',
        subject: 'A win',
        importance: 'HIGH',
        body: `A first-class afternoon. The board wanted to record its satisfaction directly — this is what we hired you to deliver, and the paddock has noticed.`,
      });
    } else if (points === 0 && result.round >= 3) {
      postMail(state, {
        category: 'BOARD',
        from: 'The Board',
        subject: 'A blank weekend',
        importance: 'HIGH',
        body: `Nothing scored, again. We are not going to pretend that is acceptable at this stage of the season. We would like to see a clear plan before the next round — car, drivers, or strategy, but something has to change.`,
      });
    }

    if (best.position <= 3) {
      asTeam(
        state,
        state.playerTeamId,
        'RACE',
        `P${best.position} for ${lastNameOf(state, best.driverId)}. ${points} points in the bag and the whole garage earned that one.`,
      );
    }
  }

  /* Reserves who scored. A driver who was not supposed to be in the car
   * putting points on the board is exactly the story a feed should tell,
   * and it is the visible proof that a bench is worth keeping. */
  for (const finish of result.finishers) {
    if (finish.points <= 0) continue;
    const squad = squadOf(state, finish.teamId);
    if (squad.length <= 2) continue;
    if (raceDriversOf(state, finish.teamId).includes(finish.driverId)) continue;

    asVoice(
      state,
      PUNDITS,
      `${result.season}:${result.round}:${finish.driverId}:reserve`,
      'RACE',
      `Points for ${lastNameOf(state, finish.driverId)} — who is not even a regular starter at ${gridTeamOf(finish.teamId).shortName}. Somebody at that team is going to have an uncomfortable debrief.`,
    );
  }
}

/* ------------------------------- transfers ----------------------------- */

export interface TransferAnnouncement {
  driverId: string;
  /** Empty when the driver was a free agent. */
  fromTeamId: string;
  toTeamId: string;
  fee: number;
  salary: number;
  seasons: number;
  role: 'RACE' | 'RESERVE';
}

function money(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount}`;
}

/** A completed signing, told from every side of it. */
export function announceTransfer(state: GameState, move: TransferAnnouncement): void {
  const name = nameOf(state, move.driverId);
  const last = lastNameOf(state, move.driverId);
  const to = gridTeamOf(move.toTeamId);
  const from = move.fromTeamId ? gridTeamOf(move.fromTeamId) : null;

  postMail(state, {
    category: 'TRANSFER',
    from: 'Sporting Director',
    subject: `Signed: ${name}`,
    importance: 'HIGH',
    driverId: move.driverId,
    body:
      `${name} has signed for ${to.name}${from ? ` from ${from.name}` : ' as a free agent'}.\n\n` +
      `Fee: ${move.fee > 0 ? money(move.fee) : 'none'}\n` +
      `Salary: ${money(move.salary)} per season\n` +
      `Term: ${move.seasons} season${move.seasons === 1 ? '' : 's'}\n` +
      `Role: ${move.role === 'RACE' ? 'race seat' : 'reserve driver'}\n\n` +
      (move.role === 'RESERVE'
        ? 'He goes onto the bench for now. He will expect a route into the car.'
        : 'He is in the car from the next session.'),
  });

  asTeam(
    state,
    move.toTeamId,
    'TRANSFER',
    `✍️ ${name} has signed${from ? ` from ${from.name}` : ''}. ${
      move.role === 'RACE' ? 'Welcome to the race line-up.' : 'He joins as our reserve driver.'
    }`,
    'HIGH',
  );

  asDriver(
    state,
    move.driverId,
    'TRANSFER',
    move.role === 'RACE'
      ? `New chapter. Signed for ${to.name} and I cannot wait to get started. Thank you to everyone at ${from?.name ?? 'the last one'} — that meant a lot.`
      : `Signed for ${to.name}. Reserve for now, but I did not come here to watch. Time to earn it.`,
    'HIGH',
  );

  asVoice(
    state,
    PUNDITS,
    `${state.season}:${state.round}:${move.driverId}:transfer`,
    'TRANSFER',
    move.fee > 12_000_000
      ? `${money(move.fee)} for ${last}. That is a serious commitment from ${to.shortName} and it puts real pressure on the result.`
      : `${last} to ${to.shortName}${move.fee > 0 ? ` for ${money(move.fee)}` : ' on a free'}. Sensible bit of business, that.`,
  );
}

/** A contract signed with somebody already on the books. */
export function announceContract(
  state: GameState,
  driverId: string,
  salary: number,
  seasons: number,
): void {
  const teamId = state.driverTeams[driverId];
  if (!teamId) return;

  postMail(state, {
    category: 'TRANSFER',
    from: 'Sporting Director',
    subject: `Contract renewed: ${nameOf(state, driverId)}`,
    driverId,
    body: `${nameOf(state, driverId)} has signed a new deal — ${money(salary)} per season for ${seasons} season${seasons === 1 ? '' : 's'}.\n\nThat takes the immediate uncertainty off the table.`,
  });

  asTeam(
    state,
    teamId,
    'CONTRACT',
    `${nameOf(state, driverId)} has extended with us for ${seasons} more season${seasons === 1 ? '' : 's'}. Delighted.`,
  );
}

/** The off-season's moves, reported as one window. */
export function announceSillySeason(state: GameState, moves: TransferMove[]): void {
  if (moves.length === 0) {
    asVoice(
      state,
      PUNDITS,
      `${state.season}:silly:quiet`,
      'TRANSFER',
      'Quietest silly season in years. Every seat on the grid stays where it was.',
    );
    return;
  }

  postMail(state, {
    category: 'TRANSFER',
    from: 'Paddock Wire',
    subject: `Silly season — ${moves.length} seat${moves.length === 1 ? '' : 's'} changed hands`,
    importance: 'NORMAL',
    body: moves.map((move) => `• ${move.note}`).join('\n\n'),
  });

  for (const move of moves) {
    asTeam(state, move.toTeamId, 'TRANSFER', move.note, 'NORMAL');
  }

  asVoice(
    state,
    PUNDITS,
    `${state.season}:silly:${moves.length}`,
    'TRANSFER',
    `${moves.length} moves in this window. The grid that lines up next year is not the one that finished this one.`,
  );
}

/* ----------------------------- how they feel --------------------------- */

/**
 * Drivers speaking for themselves between rounds.
 *
 * Morale, mood and stress were all being tracked and none of them was
 * ever said out loud unless the player went looking at a bar chart. A
 * driver who is furious now says so — in the inbox where the manager has
 * to answer for it, and in public where it costs them something.
 *
 * Only the player's own squad, and only when there is genuinely
 * something to say: a feed of contented drivers saying nothing much is
 * worse than no feed.
 */
export function driverMoodPosts(state: GameState): void {
  const squad = squadOf(state, state.playerTeamId);
  if (squad.length === 0 || !state.playerTeamId) return;

  const racing = new Set(raceDriversOf(state, state.playerTeamId));

  for (const driverId of squad) {
    const condition = conditionOf(state, driverId);
    const emotion = emotionOf(condition);
    const name = nameOf(state, driverId);
    const last = lastNameOf(state, driverId);

    /* A reserve watching from the garage is a specific kind of unhappy,
     * and it is the one the player created by benching them. */
    if (!racing.has(driverId) && condition.morale < 55) {
      postMail(state, {
        category: 'DRIVER',
        from: name,
        subject: 'I need to be racing',
        importance: 'HIGH',
        driverId,
        body: `I have been patient, but I did not sign to watch from the garage. I want to know what the route into the car looks like, and I want to know it before the next round.\n\nIf that route does not exist, I would rather you told me straight.`,
      });
      asDriver(
        state,
        driverId,
        'MOOD',
        'Ready and waiting. Whenever they need me, I am there. Would rather be racing.',
        'LOW',
      );
      continue;
    }

    if (condition.morale < 38 || emotion === 'DEJECTED') {
      postMail(state, {
        category: 'DRIVER',
        from: name,
        subject: 'We need to talk about the car',
        importance: 'HIGH',
        driverId,
        body: `I am not going to pretend this is working. The car is not doing what I need it to do and I am losing time in places I should not be.\n\nI want a proper conversation about where this is going, because right now I cannot see it.`,
      });
      asDriver(
        state,
        driverId,
        'MOOD',
        'Difficult weekend. There is a lot of work to do and everyone here knows it.',
      );
      asVoice(
        state,
        FAN_ACCOUNTS,
        `${state.season}:${state.round}:${driverId}:unhappy`,
        'MOOD',
        `${last} does not look happy at all. Watch that seat.`,
        'LOW',
      );
    } else if (condition.stress > 74) {
      postMail(state, {
        category: 'DRIVER',
        from: name,
        subject: 'The run of races',
        driverId,
        body: `Nothing dramatic — I just want to flag that this run has been heavy and I am feeling it. If we can take some heat out of the next one, I will be sharper for the rest of the season.`,
      });
    } else if (condition.morale > 82 && emotion === 'CONFIDENT') {
      asDriver(
        state,
        driverId,
        'MOOD',
        `Genuinely enjoying the car at the moment. The whole team has stepped up and you can feel it. More of this.`,
      );
    }
  }
}

/* ------------------------------- rumours ------------------------------- */

/** Speculation, which is what a paddock produces when nothing is settled. */
export function rumourPosts(state: GameState): void {
  for (const listing of state.transferList) {
    asVoice(
      state,
      PUNDITS,
      `${state.season}:${state.round}:${listing.driverId}:listed`,
      'RUMOUR',
      `Hearing ${lastNameOf(state, listing.driverId)} is available. ${
        state.playerTeamId ? gridTeamOf(state.playerTeamId).shortName : 'The team'
      } will listen to offers, and there are teams who will make one.`,
    );
  }

  for (const negotiation of state.negotiations) {
    if (negotiation.stage !== 'TALKING' && negotiation.stage !== 'CONSIDERING') continue;
    const to = state.playerTeamId ? gridTeamOf(state.playerTeamId) : null;
    asVoice(
      state,
      PUNDITS,
      `${state.season}:${state.round}:${negotiation.driverId}:talks`,
      'RUMOUR',
      `${lastNameOf(state, negotiation.driverId)} and ${to?.shortName ?? 'a rival'} are talking. Nothing signed, but these things do not usually start for no reason.`,
    );
  }
}

/* ------------------------------ team news ------------------------------ */

/** Standings, form and the shape of the championship. */
export function championshipPosts(state: GameState): void {
  const leader = state.standings.constructors[0];
  if (!leader || state.round < 3) return;

  const team = GRID_2026_TEAMS.find((entry) => entry.id === leader.teamId);
  if (!team) return;

  asVoice(
    state,
    PUNDITS,
    `${state.season}:${state.round}:standings`,
    'TEAM',
    `${team.name} lead the constructors' after ${state.round - 1} rounds on ${leader.points}. ${
      (state.standings.constructors[1]?.points ?? 0) + 25 < leader.points
        ? 'This is turning into a procession.'
        : 'It is still very much on.'
    }`,
  );
}
