import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Heart, MessageCircle, Radio, Repeat2, TrendingUp } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { AUTHOR_KIND_LABEL, SOCIAL_TOPIC_LABEL } from '@/game/social';
import type { SocialPost, SocialTopic } from '@/game/social';
import { gridTeamOf } from '@/data/grid2026';
import { cx } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/* =====================================================================
 * The feed.
 *
 * One column, newest first, filterable by what people are talking about.
 * Deliberately not interactive: the player is reading the paddock, not
 * posting to it, and a like button that changed a number nobody else can
 * see would be the worst kind of decoration.
 *
 * What it is for is a second reading of the season. The standings say a
 * driver is seventh; the feed says he has spent three rounds telling
 * anyone who will listen that the car is undriveable, which is the part
 * that predicts what happens next.
 * ===================================================================== */

const TOPIC_TONE: Record<SocialTopic, 'neutral' | 'cyan' | 'red' | 'amber' | 'lime' | 'violet' | 'blue'> =
  {
    QUALIFYING: 'blue',
    RACE: 'amber',
    TRANSFER: 'violet',
    CONTRACT: 'lime',
    TEAM: 'cyan',
    MOOD: 'red',
    RUMOUR: 'neutral',
  };

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** The avatar: initials in the team's livery, or a neutral chip. */
function Avatar({ post }: { post: SocialPost }) {
  const colour = post.teamId ? gridTeamOf(post.teamId).color : 'var(--color-carbon-500)';
  const initials = post.authorName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <span
      className="grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold"
      style={{
        background: post.teamId ? `${colour}22` : 'var(--color-carbon-800)',
        color: post.teamId ? colour : 'var(--color-chrome-400)',
        border: `1px solid ${post.teamId ? `${colour}55` : 'var(--color-carbon-600)'}`,
      }}
    >
      {initials}
    </span>
  );
}

function PostCard({ post }: { post: SocialPost }) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b border-carbon-700/50 px-3 py-3 transition-colors hover:bg-carbon-800/30"
    >
      <div className="flex gap-3">
        <Avatar post={post} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="truncate text-[12px] font-bold text-chrome-100">
              {post.authorName}
            </span>
            <span className="truncate font-mono text-[10px] text-chrome-500">
              @{post.handle}
            </span>
            <span className="text-[10px] text-chrome-600">·</span>
            <span className="font-mono text-[10px] text-chrome-600">
              S{post.season} R{post.round}
            </span>
            <Badge tone={TOPIC_TONE[post.topic]} className="ml-auto">
              {SOCIAL_TOPIC_LABEL[post.topic]}
            </Badge>
          </div>

          <p className="mt-1.5 text-[12.5px] leading-relaxed text-chrome-200">{post.text}</p>

          <div className="mt-2 flex items-center gap-5 text-chrome-600">
            <span className="flex items-center gap-1.5 font-mono text-[10px]">
              <MessageCircle className="size-3.5" />
              {compactCount(Math.max(1, Math.round(post.reposts * 0.4)))}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px]">
              <Repeat2 className="size-3.5" />
              {compactCount(post.reposts)}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px]">
              <Heart className="size-3.5" />
              {compactCount(post.likes)}
            </span>
            <span className="ml-auto font-mono text-[9px] tracking-wider text-chrome-700 uppercase">
              {AUTHOR_KIND_LABEL[post.authorKind]}
            </span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

type Filter = 'ALL' | 'MINE' | SocialTopic;

export function SocialView() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('ALL');

  const posts = useMemo(() => state?.social ?? [], [state]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return posts;
    if (filter === 'MINE') {
      /* Anything about the player's own team — its account, its drivers,
       * and the press writing about either. */
      const ours = new Set(
        Object.entries(state?.driverTeams ?? {})
          .filter(([, teamId]) => teamId === state?.playerTeamId)
          .map(([driverId]) => driverId),
      );
      return posts.filter(
        (post) =>
          post.teamId === state?.playerTeamId ||
          (post.driverId != null && ours.has(post.driverId)),
      );
    }
    return posts.filter((post) => post.topic === filter);
  }, [posts, filter, state]);

  if (!state) return null;

  const topics = [...new Set(posts.map((post) => post.topic))];

  /* What the paddock is actually talking about — the loudest post of the
   * most recent round, which is nearly always the story of the weekend. */
  const trending = [...posts]
    .filter((post) => post.season === state.season)
    .sort((a, b) => b.likes - a.likes)[0];

  return (
    <div className="grid gap-4">
      {trending && (
        <Panel title="Trending" icon={<TrendingUp className="size-3.5" />}>
          <div className="rounded-lg border border-neon-cyan/25 bg-neon-cyan/[0.05] p-3">
            <p className="text-[12.5px] leading-relaxed text-chrome-200">"{trending.text}"</p>
            <p className="mt-2 font-mono text-[10px] text-chrome-500">
              — {trending.authorName} @{trending.handle} ·{' '}
              {compactCount(trending.likes)} likes
            </p>
          </div>
        </Panel>
      )}

      <Panel
        title="Social"
        icon={<Radio className="size-3.5" />}
        flush
        actions={
          <Badge tone="neutral" mono>
            {posts.length} post{posts.length === 1 ? '' : 's'}
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-1.5 border-b border-carbon-600/60 px-3 py-2.5">
          {(['ALL', 'MINE', ...topics] as Filter[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={cx(
                'rounded-md border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase transition-colors',
                filter === option
                  ? 'border-neon-cyan/45 bg-neon-cyan/12 text-neon-cyan'
                  : 'border-carbon-600 bg-carbon-900/60 text-chrome-400 hover:text-chrome-100',
              )}
            >
              {option === 'ALL'
                ? 'Everything'
                : option === 'MINE'
                  ? 'About us'
                  : SOCIAL_TOPIC_LABEL[option]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="px-3 py-14 text-center text-[11px] text-chrome-500">
            {posts.length === 0
              ? 'Quiet out there. Qualifying, results, transfers and unhappy drivers all end up here.'
              : 'Nothing under that filter.'}
          </p>
        ) : (
          <div className="max-h-[72vh] overflow-y-auto">
            <AnimatePresence initial={false}>
              {filtered.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </Panel>
    </div>
  );
}
