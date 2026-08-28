import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Handshake,
  Inbox,
  Mail,
  MailOpen,
  Trash2,
  X,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { GameButton } from '@/components/game/GameButton';
import { MAIL_CATEGORY_LABEL, unreadCount } from '@/game/mail';
import type { MailCategory, MailMessage } from '@/game/mail';
import { gridTeamOf } from '@/data/grid2026';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/* =====================================================================
 * The inbox.
 *
 * Two columns on a wide screen: the list on the left, the message on the
 * right. On a phone the list is the screen until something is opened,
 * which is the only layout that works at that width.
 *
 * A message that carries a decision — a bid for one of your drivers, a
 * counter-offer from a driver's management — is answered here rather
 * than sending the player off to find the screen it came from.
 * ===================================================================== */

const CATEGORY_TONE: Record<MailCategory, 'neutral' | 'cyan' | 'red' | 'amber' | 'lime' | 'violet' | 'blue'> =
  {
    TRANSFER: 'violet',
    DRIVER: 'cyan',
    STAFF: 'blue',
    BOARD: 'red',
    SPONSOR: 'lime',
    MEDIA: 'neutral',
    RESULT: 'amber',
    RND: 'blue',
    FINANCE: 'lime',
  };

type Filter = 'ALL' | 'UNREAD' | MailCategory;

function relativeStamp(message: MailMessage): string {
  return `S${message.season} · R${message.round}`;
}

/** The decision a message is carrying, if it is carrying one. */
function MailActions({ message }: { message: MailMessage }) {
  const { state, dispatch, roster } = useGame();
  if (!state) return null;

  if (message.offerId) {
    const offer = state.transferOffers.find((entry) => entry.id === message.offerId);
    if (!offer) return null;

    if (offer.status !== 'OPEN') {
      return (
        <Badge tone={offer.status === 'ACCEPTED' ? 'lime' : 'neutral'} mono>
          {offer.status.toLowerCase()}
        </Badge>
      );
    }

    const driver = roster.find((entry) => entry.id === offer.driverId);
    return (
      <div className="rounded-lg border border-neon-amber/35 bg-neon-amber/[0.06] p-3">
        <p className="mb-2.5 text-[11px] text-chrome-300">
          {gridTeamOf(offer.fromTeamId).name} are offering{' '}
          <span className="font-mono font-bold text-neon-amber">
            {formatCurrency(offer.fee, true)}
          </span>{' '}
          for {driver?.lastName ?? offer.driverId}.
        </p>
        <div className="flex flex-wrap gap-2">
          <GameButton
            size="sm"
            onClick={() =>
              dispatch({ type: 'RESPOND_TO_BID', offerId: offer.id, accept: true })
            }
            icon={<Check className="size-3" />}
          >
            Accept the offer
          </GameButton>
          <GameButton
            size="sm"
            variant="secondary"
            onClick={() =>
              dispatch({ type: 'RESPOND_TO_BID', offerId: offer.id, accept: false })
            }
            icon={<X className="size-3" />}
          >
            Turn it down
          </GameButton>
        </div>
      </div>
    );
  }

  if (message.negotiationId) {
    const negotiation = state.negotiations.find((entry) => entry.id === message.negotiationId);
    if (!negotiation) return null;

    return (
      <div className="rounded-lg border border-neon-cyan/30 bg-neon-cyan/[0.05] p-3">
        <p className="text-[11px] text-chrome-300">
          Talks are open. Terms are put to him on the Driver Market screen — he is{' '}
          <span className="font-mono font-bold text-neon-cyan">{negotiation.interest}%</span>{' '}
          keen on the move.
        </p>
      </div>
    );
  }

  return null;
}

export function MailView() {
  const { state, dispatch } = useGame();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);

  const mail = useMemo(() => state?.mail ?? [], [state]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return mail;
    if (filter === 'UNREAD') return mail.filter((message) => !message.read);
    return mail.filter((message) => message.category === filter);
  }, [mail, filter]);

  /* Whatever is selected, or the newest thing in view. An inbox that
   * opens on nothing is a wasted half of the screen. */
  const open = mail.find((message) => message.id === openId) ?? filtered[0] ?? null;
  const unread = unreadCount(mail);

  if (!state) return null;

  const select = (message: MailMessage) => {
    setOpenId(message.id);
    if (!message.read) dispatch({ type: 'READ_MAIL', mailId: message.id });
  };

  /* Only the categories that actually have post in them. A tab row of
   * nine empty filters is worse than no filters. */
  const categories = [...new Set(mail.map((message) => message.category))];

  return (
    <Panel
      title="Mail"
      icon={<Inbox className="size-3.5" />}
      flush
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {unread > 0 && (
            <Badge tone="red" mono>
              {unread} unread
            </Badge>
          )}
          <GameButton
            size="sm"
            variant="ghost"
            disabled={unread === 0}
            onClick={() => dispatch({ type: 'READ_ALL_MAIL' })}
            icon={<CheckCheck className="size-3" />}
          >
            Mark all read
          </GameButton>
        </div>
      }
    >
      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 border-b border-carbon-600/60 px-3 py-2.5">
        {(['ALL', 'UNREAD', ...categories] as Filter[]).map((option) => {
          const label =
            option === 'ALL'
              ? 'All'
              : option === 'UNREAD'
                ? `Unread${unread > 0 ? ` (${unread})` : ''}`
                : MAIL_CATEGORY_LABEL[option];
          return (
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
              {label}
            </button>
          );
        })}
      </div>

      {mail.length === 0 ? (
        <p className="px-3 py-14 text-center text-[11px] text-chrome-500">
          Nothing yet. Results, driver messages, transfer offers and the board all land here.
        </p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* The list */}
          <div className="max-h-[70vh] min-h-0 overflow-y-auto border-carbon-600/60 lg:border-r">
            <AnimatePresence initial={false}>
              {filtered.map((message) => {
                const active = open?.id === message.id;
                return (
                  <motion.button
                    layout
                    key={message.id}
                    type="button"
                    onClick={() => select(message)}
                    className={cx(
                      'flex w-full gap-2.5 border-b border-carbon-700/50 px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-neon-cyan/[0.07]' : 'hover:bg-carbon-800/50',
                    )}
                  >
                    <span className="mt-0.5 shrink-0">
                      {message.read ? (
                        <MailOpen className="size-3.5 text-chrome-600" />
                      ) : (
                        <Mail className="size-3.5 text-neon-cyan" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cx(
                            'min-w-0 flex-1 truncate text-[11.5px]',
                            message.read
                              ? 'font-medium text-chrome-300'
                              : 'font-bold text-chrome-100',
                          )}
                        >
                          {message.subject}
                        </span>
                        {message.importance === 'HIGH' && !message.read && (
                          <span className="size-1.5 shrink-0 rounded-full bg-neon-red" />
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <Badge tone={CATEGORY_TONE[message.category]} mono>
                          {MAIL_CATEGORY_LABEL[message.category]}
                        </Badge>
                        <span className="truncate font-mono text-[9px] text-chrome-500">
                          {message.from} · {relativeStamp(message)}
                        </span>
                      </span>
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>

            {filtered.length === 0 && (
              <p className="px-3 py-10 text-center text-[11px] text-chrome-500">
                Nothing in this folder.
              </p>
            )}
          </div>

          {/* The message */}
          {open && (
            <motion.div
              key={open.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-h-[70vh] min-h-0 overflow-y-auto p-4"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[15px] leading-tight font-bold text-chrome-100">
                    {open.subject}
                  </h3>
                  <p className="mt-1 font-mono text-[10px] tracking-wider text-chrome-500">
                    From {open.from} · Season {open.season}, round {open.round}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={CATEGORY_TONE[open.category]}>
                    {MAIL_CATEGORY_LABEL[open.category]}
                  </Badge>
                  <button
                    type="button"
                    title="Delete this message"
                    onClick={() => {
                      dispatch({ type: 'DELETE_MAIL', mailId: open.id });
                      setOpenId(null);
                    }}
                    className="rounded-md border border-carbon-600 p-1.5 text-chrome-500 transition-colors hover:border-neon-red/40 hover:text-neon-red"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {open.body.split('\n\n').map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-[12px] leading-relaxed whitespace-pre-line text-chrome-300"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="mt-4">
                <MailActions message={open} />
              </div>

              {!open.offerId && !open.negotiationId && (
                <p className="mt-4 flex items-center gap-1.5 font-mono text-[10px] text-chrome-600">
                  <Handshake className="size-3" />
                  No reply needed.
                </p>
              )}
            </motion.div>
          )}
        </div>
      )}
    </Panel>
  );
}
