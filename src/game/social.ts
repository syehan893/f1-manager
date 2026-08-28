/* =====================================================================
 * The feed.
 *
 * A championship that nobody talks about is a spreadsheet. This is the
 * paddock reacting out loud: a driver posting after qualifying, a rival
 * team announcing a signing, a pundit calling a strategy, fans who have
 * decided the manager is finished. It is generated from what actually
 * happened in the save — results, transfers, moods — so it can be read
 * as a second view of the season rather than as decoration.
 *
 * Every post is deterministic on the thing it describes. Reloading a
 * save cannot reroll the paddock's opinion of you, and a post that has
 * already been written never rewrites itself.
 * ===================================================================== */

export type SocialAuthorKind = 'DRIVER' | 'TEAM' | 'PUNDIT' | 'FAN' | 'MEDIA';

export type SocialTopic =
  | 'QUALIFYING'
  | 'RACE'
  | 'TRANSFER'
  | 'CONTRACT'
  | 'TEAM'
  /** How a driver is feeling — complaints and satisfaction alike. */
  | 'MOOD'
  | 'RUMOUR';

export interface SocialPost {
  id: string;
  season: number;
  round: number;
  authorKind: SocialAuthorKind;
  authorName: string;
  /** The @handle, without the @. */
  handle: string;
  /** Colours the post in the team's livery when it belongs to one. */
  teamId: string | null;
  topic: SocialTopic;
  text: string;
  likes: number;
  reposts: number;
  createdAt: string;
  /** Who it is about, when the feed should let you filter to them. */
  driverId?: string;
}

/** Newest first, and this is the cap. A feed is not a history. */
export const SOCIAL_CAP = 160;

export const SOCIAL_TOPIC_LABEL: Record<SocialTopic, string> = {
  QUALIFYING: 'Qualifying',
  RACE: 'Race',
  TRANSFER: 'Transfers',
  CONTRACT: 'Contracts',
  TEAM: 'Teams',
  MOOD: 'Drivers',
  RUMOUR: 'Rumours',
};

export const AUTHOR_KIND_LABEL: Record<SocialAuthorKind, string> = {
  DRIVER: 'Driver',
  TEAM: 'Team',
  PUNDIT: 'Pundit',
  FAN: 'Fan',
  MEDIA: 'Media',
};

/**
 * Engagement, from the post rather than from a die roll.
 *
 * A number that changes on every read would make the feed feel alive in
 * the worst way — nothing would ever stay where the player left it. This
 * is a hash of the post's own id, so a post's numbers are its own and
 * never move again.
 */
function engagement(seed: string, floor: number, ceiling: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 4294967296;
  return Math.round(floor + unit * (ceiling - floor));
}

export interface SocialDraft {
  authorKind: SocialAuthorKind;
  authorName: string;
  handle: string;
  teamId?: string | null;
  topic: SocialTopic;
  text: string;
  driverId?: string;
  /** Lifts engagement for something the whole paddock is watching. */
  reach?: 'LOW' | 'NORMAL' | 'HIGH';
}

/** Minimal shape `postSocial` needs, so it does not drag `GameState` in. */
interface SocialHost {
  season: number;
  round: number;
  social: SocialPost[];
}

const REACH_RANGE: Record<'LOW' | 'NORMAL' | 'HIGH', [number, number]> = {
  LOW: [40, 900],
  NORMAL: [300, 6_400],
  HIGH: [4_000, 92_000],
};

/** Files a post. Mutates, so pass a clone. */
export function postSocial(state: SocialHost, draft: SocialDraft): SocialPost {
  const id = `post-${state.season}-${state.round}-${state.social.length}-${draft.topic.toLowerCase()}`;
  const [floor, ceiling] = REACH_RANGE[draft.reach ?? 'NORMAL'];
  const likes = engagement(`${id}:likes`, floor, ceiling);

  const post: SocialPost = {
    id,
    season: state.season,
    round: state.round,
    authorKind: draft.authorKind,
    authorName: draft.authorName,
    handle: draft.handle,
    teamId: draft.teamId ?? null,
    topic: draft.topic,
    text: draft.text,
    likes,
    // Reposts trail likes by roughly an order of magnitude, as they do.
    reposts: Math.max(1, Math.round(likes * (engagement(`${id}:rp`, 6, 22) / 100))),
    createdAt: new Date().toISOString(),
    ...(draft.driverId ? { driverId: draft.driverId } : {}),
  };

  state.social = [post, ...state.social].slice(0, SOCIAL_CAP);
  return post;
}

/** A plausible @handle for somebody with a real name. */
export function handleFor(firstName: string, lastName: string, suffix = ''): string {
  const base = `${firstName}${lastName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
  return `${base}${suffix}`;
}

/** And for a team, which posts as itself rather than as a person. */
export function teamHandle(shortName: string): string {
  return `${shortName.toLowerCase().replace(/[^a-z0-9]/g, '')}f1`;
}

/**
 * The pundits and the fan accounts that recur across a career.
 *
 * Named voices rather than anonymous ones, because a feed where the same
 * three people keep turning up reads like a paddock and a feed of
 * strangers reads like filler.
 */
export const PUNDITS = [
  { name: 'Ilse Verhoeven', handle: 'ilseonf1', kind: 'PUNDIT' as const },
  { name: 'Marcus Bright', handle: 'brightlaps', kind: 'PUNDIT' as const },
  { name: 'Paddock Wire', handle: 'paddockwire', kind: 'MEDIA' as const },
  { name: 'Pitlane Weekly', handle: 'pitlaneweekly', kind: 'MEDIA' as const },
];

export const FAN_ACCOUNTS = [
  { name: 'Box Box Box', handle: 'boxboxbox', kind: 'FAN' as const },
  { name: 'Tyre Deg Truther', handle: 'degtruther', kind: 'FAN' as const },
  { name: 'Sector Three', handle: 'sectorthree', kind: 'FAN' as const },
];

/** Picks a recurring voice deterministically from a key. */
export function voiceFor<T>(pool: readonly T[], key: string): T {
  let hash = 5381;
  for (let i = 0; i < key.length; i++) hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length]!;
}
