import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  Handshake,
  Lock,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { TIER_LABEL, TIER_SLOTS, sponsorById } from '@/data/sponsors';
import type { Sponsor, SponsorTier } from '@/data/sponsors';
import {
  PRIZE_MONEY,
  roundRetainer,
  slotsFree,
  slotsUsed,
  sponsorMarket,
} from '@/game/finance';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/* =====================================================================
 * Commercial.
 *
 * Sponsorship is where the money the rest of the game spends comes from,
 * so the screen is built to make the trade legible: what a deal pays, in
 * what mix of guaranteed and earned money, and what it costs if the car
 * does not deliver. A contract with a penalty clause is not a better
 * contract, it is a bet — and the card says so.
 * ===================================================================== */

const TIER_ORDER: SponsorTier[] = ['TITLE', 'PRIMARY', 'SECONDARY'];

const TIER_TONE: Record<SponsorTier, 'violet' | 'cyan' | 'neutral'> = {
  TITLE: 'violet',
  PRIMARY: 'cyan',
  SECONDARY: 'neutral',
};

const TIER_ACCENT: Record<SponsorTier, string> = {
  TITLE: 'var(--color-neon-violet)',
  PRIMARY: 'var(--color-neon-cyan)',
  SECONDARY: 'var(--color-chrome-400)',
};

/** Guaranteed money over the life of the deal, for comparison. */
function guaranteedValue(sponsor: Sponsor, seasonLength: number): number {
  return sponsor.signingBonus + sponsor.perRaceFee * seasonLength * sponsor.seasons;
}

/* --------------------------- one deal card ---------------------------- */

function SponsorCard({
  sponsor,
  eligible,
  reason,
  seasonLength,
  onSign,
}: {
  sponsor: Sponsor;
  eligible: boolean;
  reason?: string;
  seasonLength: number;
  onSign: () => void;
}) {
  const accent = TIER_ACCENT[sponsor.tier];
  const guaranteed = guaranteedValue(sponsor, seasonLength);

  return (
    <motion.div
      layout
      className={cx(
        'flex flex-col rounded-lg border p-3 transition-colors',
        eligible
          ? 'border-carbon-600 bg-carbon-900/50 hover:border-carbon-500'
          : 'border-carbon-700/60 bg-carbon-900/20 opacity-70',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 size-2.5 shrink-0 rounded-full"
          style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-chrome-100">{sponsor.name}</p>
          <p className="truncate text-[10px] text-chrome-500">
            {sponsor.industry} · {TIER_LABEL[sponsor.tier]}
          </p>
        </div>
        <Badge tone={TIER_TONE[sponsor.tier]} mono>
          {sponsor.seasons}yr
        </Badge>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-chrome-400">{sponsor.blurb}</p>

      {/* The commercial terms, split into what is certain and what is not. */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Signing</p>
          <p className="font-mono text-[11px] font-bold text-neon-lime">
            {formatCurrency(sponsor.signingBonus, true)}
          </p>
        </div>
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Per race</p>
          <p className="font-mono text-[11px] font-bold text-neon-lime">
            {formatCurrency(sponsor.perRaceFee, true)}
          </p>
        </div>
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Per point</p>
          <p className="font-mono text-[11px] font-bold text-neon-cyan">
            {formatCurrency(sponsor.pointsBonus, true)}
          </p>
        </div>
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Per win</p>
          <p className="font-mono text-[11px] font-bold text-neon-cyan">
            {formatCurrency(sponsor.winBonus, true)}
          </p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[9px]">
        <span className="inline-flex items-center gap-1 rounded-md border border-carbon-700 px-1.5 py-1 text-chrome-400">
          <Target className="size-3" /> Target P{sponsor.targetPosition}
        </span>
        {sponsor.penalty > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-neon-red/30 bg-neon-red/[0.06] px-1.5 py-1 text-neon-red">
            <AlertTriangle className="size-3" /> {formatCurrency(sponsor.penalty, true)} if missed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-md border border-carbon-700 px-1.5 py-1 text-chrome-500">
            No penalty clause
          </span>
        )}
        <span className="ml-auto font-mono text-chrome-500">
          ≈{formatCurrency(guaranteed, true)} guaranteed
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <GameButton
          size="sm"
          variant={eligible ? 'primary' : 'ghost'}
          disabled={!eligible}
          className="flex-1"
          title={reason}
          onClick={onSign}
          icon={eligible ? <Handshake className="size-3" /> : <Lock className="size-3" />}
        >
          {eligible ? 'Sign deal' : 'Unavailable'}
        </GameButton>
      </div>

      {!eligible && reason && (
        <p className="mt-1.5 text-[9px] leading-relaxed text-chrome-600">{reason}</p>
      )}
    </motion.div>
  );
}

/* --------------------------- signed contracts -------------------------- */

export function ActiveContracts() {
  const { state } = useGame();
  if (!state) return null;

  const contracts = state.finance.contracts.filter((c) => c.seasonsRemaining > 0);
  const perRound = roundRetainer(state);

  return (
    <Panel
      title="Signed Partners"
      icon={<BadgeCheck className="size-3.5" />}
      actions={
        <Badge tone="lime" mono>
          {formatCurrency(perRound, true)} / round
        </Badge>
      }
    >
      {/* Slot occupancy, so it is obvious what is still available. */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        {TIER_ORDER.map((tier) => {
          const used = slotsUsed(state, tier);
          const total = TIER_SLOTS[tier];
          return (
            <div
              key={tier}
              className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-2.5 py-2"
            >
              <p className="truncate text-[9px] tracking-widest text-chrome-600 uppercase">
                {TIER_LABEL[tier]}
              </p>
              <p
                className="mt-1 font-mono text-[13px] font-bold"
                style={{ color: used > 0 ? TIER_ACCENT[tier] : 'var(--color-chrome-600)' }}
              >
                {used}/{total}
              </p>
            </div>
          );
        })}
      </div>

      {contracts.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-chrome-500">
          No commercial partners. The team is running on its own money — sign someone before
          that runs out.
        </p>
      ) : (
        <ul className="space-y-2">
          {contracts.map((contract) => {
            const sponsor = sponsorById(contract.sponsorId);
            const position =
              state.standings.constructors.find((row) => row.teamId === state.playerTeamId)
                ?.position ?? 11;
            const onTarget = position <= contract.targetPosition;

            return (
              <li
                key={contract.sponsorId}
                className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: TIER_ACCENT[contract.tier] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-chrome-100">
                    {sponsor?.name ?? contract.sponsorId}
                  </span>
                  <Badge tone={TIER_TONE[contract.tier]} mono>
                    {contract.seasonsRemaining}yr left
                  </Badge>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px]">
                  <span className="font-mono text-neon-lime">
                    {formatCurrency(contract.perRaceFee, true)}/race
                  </span>
                  <span className="font-mono text-neon-cyan">
                    {formatCurrency(contract.pointsBonus, true)}/pt
                  </span>
                  <span
                    className={cx(
                      'ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5',
                      onTarget
                        ? 'bg-neon-lime/10 text-neon-lime'
                        : 'bg-neon-amber/10 text-neon-amber',
                    )}
                  >
                    <Target className="size-2.5" />
                    P{position} vs target P{contract.targetPosition}
                    {!onTarget && contract.penalty > 0
                      ? ` · −${formatCurrency(contract.penalty, true)}`
                      : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------ the market ----------------------------- */

export function SponsorMarketPanel({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useGame();
  const [tier, setTier] = useState<SponsorTier | 'ALL'>('ALL');

  const market = useMemo(() => (state ? sponsorMarket(state) : []), [state]);
  if (!state) return null;

  const visible =
    tier === 'ALL' ? market : market.filter((entry) => entry.sponsor.tier === tier);

  return (
    <Panel
      title="Sponsorship Market"
      icon={<Handshake className="size-3.5" />}
      actions={
        <SegmentedControl
          name="sponsor-tier"
          size="sm"
          value={tier}
          onChange={setTier}
          options={[
            { value: 'ALL', label: 'All' },
            ...TIER_ORDER.map((entry) => ({
              value: entry,
              label: entry === 'SECONDARY' ? 'Assoc.' : entry === 'PRIMARY' ? 'Primary' : 'Title',
              color: TIER_ACCENT[entry],
            })),
          ]}
        />
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        Reputation ({Math.round(state.managerPerformanceScore)}) decides who will talk to you.
        Retainers are guaranteed; bonuses are not. A deal with a penalty clause pays more and
        costs you if the championship does not go your way.
      </p>

      <div
        className={cx(
          'grid gap-2.5',
          compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3',
        )}
      >
        {visible.map(({ sponsor, eligibility }) => (
          <SponsorCard
            key={sponsor.id}
            sponsor={sponsor}
            eligible={eligibility.ok}
            reason={eligibility.reason}
            seasonLength={state.settings.seasonLength}
            onSign={() => void dispatch({ type: 'SIGN_SPONSOR', sponsorId: sponsor.id })}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="py-8 text-center text-[11px] text-chrome-500">
          Nothing on the market in this tier.
        </p>
      )}
    </Panel>
  );
}

/* ------------------------------ prize money ---------------------------- */

function PrizeMoneyPanel() {
  const { state, playerTeam } = useGame();
  if (!state || !playerTeam) return null;

  const position =
    state.standings.constructors.find((row) => row.teamId === playerTeam.id)?.position ?? 11;

  return (
    <Panel title="Prize Money" icon={<Trophy className="size-3.5" />}>
      <p className="mb-3 text-[11px] text-chrome-500">
        Paid once, when the championship ends, on where you finish in the constructors' table.
      </p>
      <ul className="space-y-1">
        {PRIZE_MONEY.map((prize, index) => {
          const place = index + 1;
          const isUs = place === position;
          return (
            <li
              key={place}
              className={cx(
                'flex items-center justify-between rounded-md px-2 py-1.5',
                isUs ? 'bg-neon-cyan/8 ring-1 ring-neon-cyan/25' : 'hover:bg-carbon-800/50',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="w-5 font-mono text-[11px] font-bold text-chrome-400">
                  P{place}
                </span>
                {isUs && (
                  <span className="inline-flex items-center gap-1 text-[9px] text-neon-cyan">
                    <TrendingUp className="size-3" /> You, on current form
                  </span>
                )}
              </span>
              <span
                className={cx(
                  'font-mono text-[11px] font-bold',
                  isUs ? 'text-neon-cyan' : 'text-chrome-400',
                )}
              >
                {formatCurrency(prize, true)}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* -------------------------------- screen -------------------------------- */

export function SponsorsView() {
  const { state } = useGame();
  if (!state) return null;

  const titleFree = slotsFree(state, 'TITLE') > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        {titleFree && (
          <div className="flex items-start gap-2.5 rounded-lg border border-neon-amber/30 bg-neon-amber/[0.06] p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-neon-amber" />
            <p className="text-[11px] leading-relaxed text-chrome-300">
              <span className="font-bold text-neon-amber">No title partner.</span> The title slot
              is the single largest line of income available to the team, and it is currently
              empty.
            </p>
          </div>
        )}
        <SponsorMarketPanel />
      </div>

      <div className="grid content-start gap-4">
        <ActiveContracts />
        <PrizeMoneyPanel />
      </div>
    </div>
  );
}
