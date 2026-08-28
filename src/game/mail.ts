/* =====================================================================
 * The inbox.
 *
 * Everything the paddock says to the manager arrives here: a driver
 * unhappy with the car, a rival team bidding for one of them, the board
 * on the season's target, a sponsor on a bonus, a result summary on a
 * Sunday evening. The game already produced all of it and threw most of
 * it away — a refusal message, a toast that faded, a number that changed
 * somewhere. Mail is where it stays put and can be read back.
 *
 * A message is a record of something that happened. A few of them also
 * carry a decision the player still has to make, which is what `offerId`
 * and `negotiationId` are for: the inbox can action them directly rather
 * than sending the player hunting for the screen they belong to.
 * ===================================================================== */

export type MailCategory =
  /** Transfers, bids, contract talks. */
  | 'TRANSFER'
  /** A driver speaking for themselves. */
  | 'DRIVER'
  | 'STAFF'
  /** The people the manager answers to. */
  | 'BOARD'
  | 'SPONSOR'
  /** Press asking questions. */
  | 'MEDIA'
  | 'RESULT'
  | 'RND'
  | 'FINANCE';

export type MailImportance = 'LOW' | 'NORMAL' | 'HIGH';

export interface MailMessage {
  id: string;
  season: number;
  round: number;
  category: MailCategory;
  /** Who it is from, as a name rather than an id. */
  from: string;
  subject: string;
  /** Plain text; paragraphs separated by blank lines. */
  body: string;
  read: boolean;
  createdAt: string;
  importance: MailImportance;
  /** A bid for one of the player's drivers, answerable from the inbox. */
  offerId?: string;
  /** A contract negotiation this message belongs to. */
  negotiationId?: string;
  /** Who it is about, when that is somebody. */
  driverId?: string;
}

/** Newest first, and this is the cap — an inbox is not an archive. */
export const MAIL_CAP = 120;

export const MAIL_CATEGORY_LABEL: Record<MailCategory, string> = {
  TRANSFER: 'Transfers',
  DRIVER: 'Drivers',
  STAFF: 'Staff',
  BOARD: 'Board',
  SPONSOR: 'Partners',
  MEDIA: 'Media',
  RESULT: 'Results',
  RND: 'Engineering',
  FINANCE: 'Finance',
};

export interface MailDraft {
  category: MailCategory;
  from: string;
  subject: string;
  body: string;
  importance?: MailImportance;
  offerId?: string;
  negotiationId?: string;
  driverId?: string;
}

/** Minimal shape `postMail` needs, so it does not drag `GameState` in. */
interface MailHost {
  season: number;
  round: number;
  mail: MailMessage[];
}

/**
 * Files a message. Mutates, so pass a clone — the same contract every
 * other writer into the save follows.
 *
 * The id is built from the season, round and what is already filed
 * rather than from the clock: two messages posted in the same
 * transition would otherwise collide, and a save that reloads has to
 * come back with the same ids it went in with.
 */
export function postMail(state: MailHost, draft: MailDraft): MailMessage {
  const message: MailMessage = {
    id: `mail-${state.season}-${state.round}-${state.mail.length}-${draft.category.toLowerCase()}`,
    season: state.season,
    round: state.round,
    category: draft.category,
    from: draft.from,
    subject: draft.subject,
    body: draft.body,
    read: false,
    createdAt: new Date().toISOString(),
    importance: draft.importance ?? 'NORMAL',
    ...(draft.offerId ? { offerId: draft.offerId } : {}),
    ...(draft.negotiationId ? { negotiationId: draft.negotiationId } : {}),
    ...(draft.driverId ? { driverId: draft.driverId } : {}),
  };

  state.mail = [message, ...state.mail].slice(0, MAIL_CAP);
  return message;
}

export function unreadCount(mail: MailMessage[]): number {
  return mail.filter((message) => !message.read).length;
}

export function unreadIn(mail: MailMessage[], category: MailCategory): number {
  return mail.filter((message) => !message.read && message.category === category).length;
}

/** Messages still waiting on the player rather than merely informing them. */
export function actionableMail(mail: MailMessage[]): MailMessage[] {
  return mail.filter((message) => Boolean(message.offerId ?? message.negotiationId));
}
