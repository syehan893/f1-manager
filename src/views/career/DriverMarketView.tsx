import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Handshake,
  Search,
  Sparkles,
  Tag,
  UserMinus,
  Users,
  UsersRound,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { GameButton } from '@/components/game/GameButton';
import { driverRating, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { prospectToDriver, scoutedRange } from '@/game/driverDevelopment';
import {
  MAX_CONTRACT_SEASONS,
  askingTerms,
  dealFor,
  interestIn,
  releaseCost,
  sellability,
  transferAsk,
} from '@/game/contracts';
import { GRID_SEATS_PER_TEAM, MAX_SQUAD_SIZE, squadHasRoom } from '@/game/roster';
import { useGame } from '@/state/gameContext';
import type { ContractOffer, DriverRole } from '@/game/types';
import type { Driver } from '@/types';

type SortKey = 'rating' | 'age' | 'salary';

/** Ages past this are shown in red — the driver is on the way down. */
const DECAY_AGE = 34;

/* ---------------------------------------------------------------------
 * Your squad.
 *
 * A team is no longer two drivers. The first two names race; anybody
 * after them is a reserve, paid and developing and waiting for a call.
 * Promotion swaps the two around — it does not send anybody home, which
 * is the whole point of having a bench.
 * ------------------------------------------------------------------- */

function SquadCard({
  driver,
  accent,
  racing,
  seatIndex,
}: {
  driver: Driver;
  accent: string;
  racing: boolean;
  seatIndex: number;
}) {
  const { state, dispatch, playerSquad } = useGame();
  const [listing, setListing] = useState(false);
  if (!state) return null;

  const deal = dealFor(state, driver.id);
  const listed = state.transferList.find((entry) => entry.driverId === driver.id);
  const severance = releaseCost(state, driver.id);
  const canDrop = playerSquad.length > GRID_SEATS_PER_TEAM;

  return (
    <motion.div
      layout
      className={cx(
        'rounded-lg border p-3',
        racing
          ? 'border-neon-cyan/35 bg-neon-cyan/[0.05]'
          : 'border-carbon-600/70 bg-carbon-900/40',
      )}
    >
      <div className="flex items-center gap-3">
        <DriverPortrait driver={driver} teamColor={accent} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[13px] font-bold text-chrome-100">
              {driver.firstName} {driver.lastName}
            </p>
            <Badge tone={racing ? 'cyan' : 'neutral'} mono>
              {racing ? `Car ${seatIndex + 1}` : 'Reserve'}
            </Badge>
            {listed && (
              <Badge tone="amber" mono>
                Listed
              </Badge>
            )}
          </div>
          <p className="truncate text-[10px] text-chrome-500">
            {flagEmoji(driver.countryCode)} #{driver.carNumber} · Age{' '}
            <span className={cx(driver.age >= DECAY_AGE && 'font-bold text-neon-red')}>
              {driver.age}
            </span>{' '}
            · {formatCurrency(deal?.salary ?? driver.contract.salaryPerSeason, true)}/yr
          </p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-1 font-mono text-[14px] font-bold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {driverRating(driver)}
        </span>
      </div>

      {/* The contract, which is now a real thing that runs out. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ['Pace', String(driver.attributes.pace)],
            ['Racecraft', String(driver.attributes.racecraft)],
            [
              'Contract',
              deal
                ? `${deal.seasonsRemaining} yr${deal.seasonsRemaining === 1 ? '' : 's'}`
                : '—',
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-[8.5px] tracking-widest text-chrome-500 uppercase">{label}</p>
            <p
              className={cx(
                'font-mono text-[13px] font-bold',
                label === 'Contract' && deal && deal.seasonsRemaining <= 1
                  ? 'text-neon-amber'
                  : 'text-chrome-100',
              )}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {racing ? (
          <GameButton
            size="sm"
            variant="secondary"
            disabled={!canDrop}
            title={
              canDrop
                ? 'Drop to reserve and put the first reserve in the car.'
                : 'You need a reserve to put in the car before benching anybody.'
            }
            onClick={() => dispatch({ type: 'DEMOTE_DRIVER', driverId: driver.id })}
            icon={<ArrowDownToLine className="size-3" />}
          >
            Bench
          </GameButton>
        ) : (
          <GameButton
            size="sm"
            title="Put him in the car. The second race driver drops to reserve — he stays under contract."
            onClick={() => dispatch({ type: 'PROMOTE_DRIVER', driverId: driver.id })}
            icon={<ArrowUpFromLine className="size-3" />}
          >
            Promote to race seat
          </GameButton>
        )}

        {listed ? (
          <GameButton
            size="sm"
            variant="secondary"
            onClick={() => dispatch({ type: 'UNLIST_DRIVER', driverId: driver.id })}
            icon={<Tag className="size-3" />}
          >
            Take off the market
          </GameButton>
        ) : (
          <GameButton
            size="sm"
            variant="secondary"
            disabled={!canDrop}
            title={
              canDrop
                ? 'Tell the paddock you will listen to offers.'
                : 'Selling him would leave you a car short.'
            }
            onClick={() => setListing((open) => !open)}
            icon={<Tag className="size-3" />}
          >
            Offer out
          </GameButton>
        )}

        <GameButton
          size="sm"
          variant="danger"
          disabled={!canDrop}
          title={
            canDrop
              ? `Terminate the contract — ${formatCurrency(severance, true)} in severance.`
              : 'You cannot go below two drivers.'
          }
          onClick={() => dispatch({ type: 'RELEASE_DRIVER', driverId: driver.id })}
          icon={<UserMinus className="size-3" />}
        >
          Release
        </GameButton>
      </div>

      {listing && !listed && (
        <ListingForm
          driverId={driver.id}
          suggested={transferAsk(state, driver.id)}
          onDone={() => setListing(false)}
        />
      )}

      {deal && deal.seasonsRemaining <= 1 && (
        <RenewalForm driverId={driver.id} role={deal.role} />
      )}
    </motion.div>
  );
}

function ListingForm({
  driverId,
  suggested,
  onDone,
}: {
  driverId: string;
  suggested: number;
  onDone: () => void;
}) {
  const { dispatch } = useGame();
  const [fee, setFee] = useState(suggested);

  return (
    <div className="mt-2.5 rounded-md border border-neon-amber/30 bg-neon-amber/[0.05] p-2.5">
      <p className="mb-2 text-[10px] text-chrome-400">
        Asking price. Bids usually come in under it, and nothing is binding until you accept
        one.
      </p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step={500_000}
          min={0}
          value={fee}
          onChange={(event) => setFee(Number(event.target.value))}
          aria-label="Asking fee"
          className="min-w-0 flex-1 rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 font-mono text-[11px] text-chrome-100 focus:border-neon-cyan/50 focus:outline-none"
        />
        <GameButton
          size="sm"
          onClick={() => {
            if (dispatch({ type: 'LIST_DRIVER', driverId, askingFee: fee })) onDone();
          }}
        >
          List
        </GameButton>
      </div>
    </div>
  );
}

/** A deal in its final year is the one the player has to act on. */
function RenewalForm({ driverId, role }: { driverId: string; role: DriverRole }) {
  const { state, dispatch } = useGame();
  const asked = state ? askingTerms(state, driverId, role) : null;
  const floor = asked ? Math.round(asked.salary * 0.88) : 0;

  const [salary, setSalary] = useState(floor);
  const [seasons, setSeasons] = useState(2);

  if (!asked) return null;

  return (
    <div className="mt-2.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.06] p-2.5">
      <p className="mb-2 text-[10px] text-neon-amber">
        Final year of his deal. He will re-sign at{' '}
        <span className="font-mono font-bold">{formatCurrency(floor, true)}</span> per season or
        better.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          step={100_000}
          min={0}
          value={salary}
          onChange={(event) => setSalary(Number(event.target.value))}
          aria-label="Salary offered"
          className="min-w-0 flex-1 rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 font-mono text-[11px] text-chrome-100 focus:border-neon-cyan/50 focus:outline-none"
        />
        <SegmentedControl
          name={`renew-${driverId}`}
          size="sm"
          value={String(seasons)}
          onChange={(value) => setSeasons(Number(value))}
          options={Array.from({ length: MAX_CONTRACT_SEASONS }, (_, index) => ({
            value: String(index + 1),
            label: `${index + 1}y`,
          }))}
        />
        <GameButton
          size="sm"
          onClick={() => dispatch({ type: 'RENEW_CONTRACT', driverId, salary, seasons })}
          icon={<Handshake className="size-3" />}
        >
          Renew
        </GameButton>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------
 * Talks in progress.
 *
 * Approaching somebody is not signing them. They name a price, their
 * team names another, and an offer that meets neither comes back as a
 * counter — three times, and the conversation is over.
 * ------------------------------------------------------------------- */

function NegotiationPanel() {
  const { state, dispatch, roster } = useGame();
  if (!state || state.negotiations.length === 0) return null;

  return (
    <Panel
      title="Contract Talks"
      icon={<Handshake className="size-3.5" />}
      actions={<Badge tone="cyan">{state.negotiations.length} open</Badge>}
    >
      <div className="grid gap-2.5">
        {state.negotiations.map((negotiation) => {
          const driver = roster.find((entry) => entry.id === negotiation.driverId);
          const dead = negotiation.stage === 'REJECTED' || negotiation.stage === 'WITHDRAWN';

          return (
            <div
              key={negotiation.id}
              className={cx(
                'rounded-lg border p-3',
                dead
                  ? 'border-carbon-700 bg-carbon-900/30 opacity-70'
                  : 'border-neon-cyan/30 bg-neon-cyan/[0.04]',
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="text-[12px] font-bold text-chrome-100">
                  {driver ? `${driver.firstName} ${driver.lastName}` : negotiation.driverId}
                </p>
                <Badge tone={dead ? 'red' : 'cyan'} mono>
                  {negotiation.stage.toLowerCase()}
                </Badge>
                <Badge
                  tone={
                    negotiation.interest >= 65
                      ? 'lime'
                      : negotiation.interest >= 40
                        ? 'amber'
                        : 'red'
                  }
                  mono
                >
                  {negotiation.interest}% keen
                </Badge>
                {negotiation.fromTeamId && (
                  <span className="font-mono text-[10px] text-chrome-500">
                    from {gridTeamOf(negotiation.fromTeamId).shortName}
                  </span>
                )}
              </div>

              <p className="mb-2.5 text-[11px] leading-relaxed text-chrome-400">
                {negotiation.note}
              </p>

              {!dead && <OfferForm negotiationId={negotiation.id} />}

              <GameButton
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() =>
                  dispatch({ type: 'WITHDRAW_APPROACH', negotiationId: negotiation.id })
                }
              >
                {dead ? 'Clear' : 'Walk away'}
              </GameButton>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function OfferForm({ negotiationId }: { negotiationId: string }) {
  const { state, dispatch } = useGame();
  const negotiation = state?.negotiations.find((entry) => entry.id === negotiationId);

  const [draft, setDraft] = useState<ContractOffer | null>(null);
  if (!negotiation) return null;

  // Their asking terms are the starting point, so the first offer is one click.
  const offer = draft ?? negotiation.asking;
  const update = (patch: Partial<ContractOffer>) => setDraft({ ...offer, ...patch });

  const upfront = offer.transferFee + offer.signingBonus;

  return (
    <div className="rounded-md border border-carbon-600/70 bg-carbon-900/50 p-2.5">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
            Salary / season — they want {formatCurrency(negotiation.asking.salary, true)}
          </span>
          <input
            type="number"
            step={100_000}
            min={0}
            value={offer.salary}
            onChange={(event) => update({ salary: Number(event.target.value) })}
            className="mt-1 w-full rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 font-mono text-[11px] text-chrome-100 focus:border-neon-cyan/50 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
            Signing bonus
          </span>
          <input
            type="number"
            step={100_000}
            min={0}
            value={offer.signingBonus}
            onChange={(event) => update({ signingBonus: Number(event.target.value) })}
            className="mt-1 w-full rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 font-mono text-[11px] text-chrome-100 focus:border-neon-cyan/50 focus:outline-none"
          />
        </label>

        {negotiation.fromTeamId && (
          <label className="block">
            <span className="text-[8.5px] tracking-widest text-chrome-500 uppercase">
              Transfer fee — {gridTeamOf(negotiation.fromTeamId).shortName} want{' '}
              {formatCurrency(negotiation.asking.transferFee, true)}
            </span>
            <input
              type="number"
              step={500_000}
              min={0}
              value={offer.transferFee}
              onChange={(event) => update({ transferFee: Number(event.target.value) })}
              className="mt-1 w-full rounded-md border border-carbon-600 bg-carbon-900/80 px-2 py-1.5 font-mono text-[11px] text-chrome-100 focus:border-neon-cyan/50 focus:outline-none"
            />
          </label>
        )}

        <div>
          <span className="text-[8.5px] tracking-widest text-chrome-500 uppercase">Term</span>
          <SegmentedControl
            className="mt-1"
            name={`term-${negotiationId}`}
            size="sm"
            value={String(offer.seasons)}
            onChange={(value) => update({ seasons: Number(value) })}
            options={Array.from({ length: MAX_CONTRACT_SEASONS }, (_, index) => ({
              value: String(index + 1),
              label: `${index + 1}y`,
            }))}
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-chrome-500">
          {formatCurrency(upfront, true)} up front ·{' '}
          {formatCurrency(offer.salary, true)}/yr for {offer.seasons}y ·{' '}
          {offer.role === 'RACE' ? 'race seat' : 'reserve'}
        </span>
        <GameButton
          size="sm"
          onClick={() => dispatch({ type: 'OFFER_CONTRACT', negotiationId, offer })}
          icon={<Handshake className="size-3" />}
        >
          Put it to him
        </GameButton>
      </div>
    </div>
  );
}

/* --------------------------- bids for our drivers --------------------- */

function BidsPanel() {
  const { state, dispatch, roster } = useGame();
  const open = state?.transferOffers.filter((offer) => offer.status === 'OPEN') ?? [];
  if (!state || open.length === 0) return null;

  return (
    <Panel
      title="Offers For Your Drivers"
      icon={<Tag className="size-3.5" />}
      actions={<Badge tone="amber">{open.length} on the table</Badge>}
    >
      <div className="grid gap-2.5">
        {open.map((offer) => {
          const driver = roster.find((entry) => entry.id === offer.driverId);
          return (
            <div
              key={offer.id}
              className="rounded-lg border border-neon-amber/30 bg-neon-amber/[0.05] p-3"
            >
              <p className="text-[12px] font-bold text-chrome-100">
                {gridTeamOf(offer.fromTeamId).name} bid{' '}
                <span className="font-mono text-neon-amber">
                  {formatCurrency(offer.fee, true)}
                </span>{' '}
                for {driver ? driver.lastName : offer.driverId}
              </p>
              <p className="mt-1 text-[11px] text-chrome-400">{offer.note}</p>
              <p className="mt-1 font-mono text-[10px] text-chrome-500">
                Takes {formatCurrency(offer.salaryRelieved, true)}/yr off the wage bill.
              </p>
              <div className="mt-2.5 flex gap-2">
                <GameButton
                  size="sm"
                  onClick={() => dispatch({ type: 'RESPOND_TO_BID', offerId: offer.id, accept: true })}
                >
                  Accept
                </GameButton>
                <GameButton
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    dispatch({ type: 'RESPOND_TO_BID', offerId: offer.id, accept: false })
                  }
                >
                  Turn it down
                </GameButton>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------------
 * The junior intake.
 *
 * A new class every season, and the one you pass on is gone — an AI team
 * will take them instead. A prospect is signed on their ceiling rather
 * than on what the timing screen says today, which is the whole gamble:
 * cheap, fast, and short on everything that only laps teach.
 * ------------------------------------------------------------------- */

function YoungTalent() {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const unsigned = state.prospects.filter((prospect) => !state.driverTeams[prospect.id]);
  const room = state.playerTeamId ? squadHasRoom(state, state.playerTeamId) : false;

  return (
    <Panel
      title={`Junior Intake — Class of ${state.season}`}
      icon={<Sparkles className="size-3.5" />}
      actions={
        <Badge tone={unsigned.length > 0 ? 'cyan' : 'neutral'} mono>
          {unsigned.length} available
        </Badge>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        A fresh class every season, and it does not carry over — anyone still unsigned at the
        flag can be promoted by a rival instead. You are buying the ceiling, not the current
        rating. Signing one adds him to the squad: he takes a race seat if you have one free,
        and goes on the bench if you do not. Nobody is released to make room.
      </p>

      {unsigned.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-chrome-500">
          This year's class has all found seats.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {unsigned.map((prospect) => {
            const driver = prospectToDriver(prospect);
            const now = driverRating(driver);
            /* A ceiling nobody can measure is the whole gamble. Scouts
             * give a range, not a number, and it only narrows once the
             * driver has actually run seasons. */
            const scouted = scoutedRange(state, prospect.id);

            return (
              <div
                key={prospect.id}
                className="flex flex-col rounded-lg border border-carbon-600 bg-carbon-900/50 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-chrome-100">
                      {flagEmoji(prospect.countryCode)} {prospect.firstName} {prospect.lastName}
                    </p>
                    <p className="truncate text-[10px] text-chrome-500">
                      Age {prospect.age} · {formatCurrency(prospect.salary, true)}/yr
                    </p>
                  </div>
                </div>

                {/* Now against ceiling: the gap is the reason to sign them. */}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
                    <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Today</p>
                    <p className="font-mono text-[13px] font-bold text-chrome-300">{now}</p>
                  </div>
                  <div className="rounded-md border border-neon-cyan/25 bg-neon-cyan/[0.06] px-2 py-1.5">
                    <p className="text-[8px] tracking-widest text-chrome-600 uppercase">
                      Scouted ceiling
                    </p>
                    <p className="font-mono text-[13px] font-bold text-neon-cyan">
                      {scouted.low}–{scouted.high}
                      <span className="ml-1 text-[9px] font-normal opacity-70">
                        ({scouted.high - scouted.low > 8 ? 'raw read' : 'confident'})
                      </span>
                    </p>
                  </div>
                </div>

                <GameButton
                  size="sm"
                  className="mt-2.5"
                  disabled={!room}
                  title={
                    room
                      ? `Sign ${prospect.lastName} into the squad`
                      : `Your squad is full at ${MAX_SQUAD_SIZE}. Release or sell somebody first.`
                  }
                  onClick={() =>
                    dispatch({ type: 'SIGN_PROSPECT', prospectId: prospect.id })
                  }
                  icon={<Sparkles className="size-3" />}
                >
                  Sign
                </GameButton>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function DriverMarketView() {
  const { state, roster, playerTeam, playerSquad, playerDrivers, dispatch } = useGame();

  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');

  const market = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return roster
      .filter((driver) => driver.teamId !== playerTeam?.id)
      .filter(
        (driver) =>
          !needle || `${driver.firstName} ${driver.lastName}`.toLowerCase().includes(needle),
      )
      .sort((a, b) => {
        if (sortKey === 'age') return a.age - b.age;
        if (sortKey === 'salary') return a.contract.salaryPerSeason - b.contract.salaryPerSeason;
        return driverRating(b) - driverRating(a);
      });
  }, [roster, playerTeam, query, sortKey]);

  if (!state || !playerTeam) return null;

  const racingIds = new Set(playerDrivers.map((driver) => driver.id));
  const roomLeft = MAX_SQUAD_SIZE - playerSquad.length;

  return (
    <div className="grid gap-4">
      {/* Your squad */}
      <Panel
        title="Your Squad"
        icon={<Users className="size-3.5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="cyan">{playerTeam.name}</Badge>
            <Badge tone={roomLeft > 0 ? 'neutral' : 'amber'} mono>
              {playerSquad.length}/{MAX_SQUAD_SIZE} under contract
            </Badge>
          </div>
        }
      >
        <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
          Two cars start every race — the top two here. Anyone below them is a reserve: still
          under contract, still paid, and one click from the car. Promoting a reserve drops the
          second race driver to the bench rather than sending him anywhere.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {playerSquad.map((driver, index) => (
              <SquadCard
                key={driver.id}
                driver={driver}
                accent={playerTeam.color}
                racing={racingIds.has(driver.id)}
                seatIndex={index}
              />
            ))}
          </AnimatePresence>
        </div>
      </Panel>

      <BidsPanel />
      <NegotiationPanel />
      <YoungTalent />

      {/* The rest of the grid */}
      <Panel
        title="Driver Market — The Grid"
        icon={<UsersRound className="size-3.5" />}
        flush
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-chrome-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search drivers"
                aria-label="Search drivers"
                className="w-36 rounded-md border border-carbon-600 bg-carbon-900/70 py-1.5 pr-2 pl-7 text-[11px] text-chrome-100 placeholder:text-chrome-500 focus:border-neon-cyan/50 focus:outline-none"
              />
            </label>
            <SegmentedControl
              name="market-sort"
              size="sm"
              value={sortKey}
              onChange={setSortKey}
              options={[
                { value: 'rating', label: 'Rating' },
                { value: 'age', label: 'Age' },
                { value: 'salary', label: 'Salary' },
              ]}
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-carbon-600/60 bg-carbon-900/60">
                {['Driver', 'Team', 'Age', 'Rating', 'Wants', 'Fee', 'Keen', ''].map(
                  (label, index) => (
                    <th
                      key={label || index}
                      className={cx(
                        'px-3 py-2 text-[9px] font-bold tracking-[0.16em] text-chrome-500 uppercase',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {market.map((driver) => {
                const team = gridTeamOf(driver.teamId);
                /* The role on offer follows from the squad: a free race
                 * seat is a race offer, a full line-up is a reserve one,
                 * and the driver's keenness is judged on exactly that. */
                const role: DriverRole =
                  playerDrivers.length < GRID_SEATS_PER_TEAM ? 'RACE' : 'RESERVE';
                const terms = askingTerms(state, driver.id, role);
                const keen = interestIn(state, driver.id, role);
                const sale = sellability(state, driver.id);
                const talking = state.negotiations.some(
                  (entry) => entry.driverId === driver.id,
                );

                return (
                  <tr
                    key={driver.id}
                    className="border-b border-carbon-700/50 transition-colors hover:bg-carbon-800/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <DriverPortrait
                          driver={driver}
                          teamColor={team.color}
                          size={28}
                          showNumber={false}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[12px] font-semibold text-chrome-100">
                            {driver.firstName} {driver.lastName}
                          </p>
                          <p className="truncate font-mono text-[9px] text-chrome-500">
                            {flagEmoji(driver.countryCode)} #{driver.carNumber}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="font-mono text-[11px] font-bold"
                        style={{ color: team.color }}
                      >
                        {team.shortName}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cx(
                          'font-mono text-[12px] font-bold',
                          driver.age >= DECAY_AGE ? 'text-neon-red' : 'text-chrome-200',
                        )}
                      >
                        {driver.age}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[13px] font-bold text-neon-cyan">
                      {driverRating(driver)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                      {formatCurrency(terms.salary, true)}/yr
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] text-chrome-300">
                      {formatCurrency(terms.transferFee, true)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={cx(
                          'font-mono text-[11px] font-bold',
                          keen >= 65
                            ? 'text-neon-lime'
                            : keen >= 40
                              ? 'text-neon-amber'
                              : 'text-neon-red',
                        )}
                      >
                        {keen}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <GameButton
                        size="sm"
                        disabled={talking || !sale.willing}
                        title={
                          talking
                            ? 'Already in talks.'
                            : (sale.reason ??
                              `Open talks about a ${role === 'RACE' ? 'race seat' : 'reserve role'}.`)
                        }
                        onClick={() =>
                          dispatch({ type: 'APPROACH_DRIVER', driverId: driver.id })
                        }
                      >
                        {talking ? 'In talks' : 'Approach'}
                      </GameButton>
                    </td>
                  </tr>
                );
              })}

              {market.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[11px] text-chrome-500">
                    No drivers match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Line-up strength */}
      <Panel title="Line-up Strength" icon={<Users className="size-3.5" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          {playerSquad.map((driver) => (
            <div key={driver.id}>
              <StatBar
                label={`${driver.firstName} ${driver.lastName}${
                  racingIds.has(driver.id) ? '' : ' (reserve)'
                }`}
                value={driverRating(driver)}
                color={playerTeam.color}
              />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-chrome-500">
          Race line-up rating{' '}
          <span className="font-mono font-bold text-chrome-200">
            {playerDrivers.length
              ? Math.round(
                  playerDrivers.reduce((sum, d) => sum + driverRating(d), 0) /
                    playerDrivers.length,
                )
              : 0}
          </span>
          . Every move is written to the save immediately and applies from the next session.
        </p>
      </Panel>
    </div>
  );
}
