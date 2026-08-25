import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Gauge,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users2,
} from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { ROLES, ROLE_BY_ID } from '@/data/staff';
import type { StaffCandidate, StaffRole } from '@/data/staff';
import { gridTeamOf } from '@/data/grid2026';
import {
  canHire,
  contributions,
  departmentStrength,
  effectiveRating,
  hireCost,
  roundStaffBill,
  seasonStaffBill,
  severanceFor,
  staffMarket,
} from '@/game/staffing';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/* =====================================================================
 * Personnel.
 *
 * A team is the people in it, and this is the screen where that becomes
 * a budget decision. Every seat here is attached to a number elsewhere
 * in the game, and an empty seat is worse than a mediocre appointment —
 * the drag is real and the screen says so rather than hiding it.
 * ===================================================================== */

/** Colour by how good the appointment is, on the usual 0-100 scale. */
function toneFor(rating: number): string {
  if (rating >= 82) return 'var(--color-neon-lime)';
  if (rating >= 66) return 'var(--color-neon-cyan)';
  if (rating >= 52) return 'var(--color-neon-amber)';
  return 'var(--color-neon-red)';
}

function RatingBar({ rating }: { rating: number }) {
  const tone = toneFor(rating);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-carbon-700">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${rating}%` }}
          transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-[12px] font-bold" style={{ color: tone }}>
        {rating}
      </span>
    </div>
  );
}

/* ---------------------------- current staff ---------------------------- */

function Organisation() {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const vacant = ROLES.filter(
    (role) => !state.staff.some((entry) => entry.role === role.id),
  ).length;

  return (
    <Panel
      title="Organisation"
      icon={<Users2 className="size-3.5" />}
      actions={
        <div className="flex items-center gap-2">
          {vacant > 0 && (
            <Badge tone="amber" mono>
              {vacant} vacant
            </Badge>
          )}
          <Badge tone="cyan" mono>
            {departmentStrength(state)} avg
          </Badge>
        </div>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        Eight senior roles, each attached to something you can watch change. A seat left empty
        is a handicap, not a saving — an unfilled department performs as if it were staffed at
        44.
      </p>

      <ul className="space-y-2">
        {ROLES.map((role) => {
          const appointment = state.staff.find((entry) => entry.role === role.id);
          const rating = effectiveRating(state, role.id);

          return (
            <li
              key={role.id}
              className={cx(
                'rounded-lg border p-3',
                appointment
                  ? 'border-carbon-600/70 bg-carbon-900/40'
                  : 'border-neon-amber/35 bg-neon-amber/[0.04]',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-bold text-chrome-100">
                    {role.label}
                  </span>
                  <span className="block truncate text-[10px] text-chrome-500">
                    {role.effect}
                  </span>
                </span>

                {appointment ? (
                  <GameButton
                    size="sm"
                    variant="danger"
                    title={`Dismiss ${appointment.name}. Tearing up the contract costs ${formatCurrency(
                      severanceFor(appointment, state),
                    )} in severance.`}
                    onClick={() => {
                      const cost = formatCurrency(severanceFor(appointment, state));
                      if (
                        !window.confirm(
                          `Dismiss ${appointment.name}?

Severance of ${cost} is payable immediately, and the role will be vacant until you replace them.`,
                        )
                      ) {
                        return;
                      }
                      dispatch({ type: 'RELEASE_STAFF', role: role.id });
                    }}
                    icon={<UserMinus className="size-3" />}
                  >
                    Fire · {formatCurrency(severanceFor(appointment, state), true)}
                  </GameButton>
                ) : (
                  <Badge tone="amber" mono>
                    Vacant
                  </Badge>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  {appointment ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-chrome-300">
                      <span>{flagEmoji(appointment.countryCode)}</span>
                      <span className="truncate font-semibold">{appointment.name}</span>
                      <span className="shrink-0 font-mono text-[10px] text-chrome-500">
                        {formatCurrency(appointment.salary, true)}/yr
                      </span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-neon-amber">
                      Nobody in post — costing you performance every round.
                    </span>
                  )}
                </span>
                <span className="w-28 shrink-0">
                  <RatingBar rating={rating} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ------------------------------ the market ----------------------------- */

function CandidateCard({
  candidate,
  eligible,
  reason,
  affordable,
  onHire,
}: {
  candidate: StaffCandidate;
  eligible: boolean;
  reason?: string;
  affordable: boolean;
  onHire: () => void;
}) {
  const tone = toneFor(candidate.rating);
  const poaching = candidate.currentTeamId != null;
  const blocked = !eligible || !affordable;

  return (
    <motion.div
      layout
      className={cx(
        'flex flex-col rounded-lg border p-3 transition-colors',
        blocked
          ? 'border-carbon-700/60 bg-carbon-900/20 opacity-75'
          : 'border-carbon-600 bg-carbon-900/50 hover:border-carbon-500',
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 size-2.5 shrink-0 rounded-full"
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-chrome-100">
            {flagEmoji(candidate.countryCode)} {candidate.name}
          </p>
          <p className="truncate text-[10px] text-chrome-500">
            {ROLE_BY_ID.get(candidate.role)?.label} · age {candidate.age}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[16px] font-bold" style={{ color: tone }}>
          {candidate.rating}
        </span>
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-chrome-400">{candidate.note}</p>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Salary</p>
          <p className="font-mono text-[11px] font-bold text-neon-amber">
            {formatCurrency(candidate.salary, true)}/yr
          </p>
        </div>
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">
            {poaching ? 'Buyout' : 'Signing'}
          </p>
          <p
            className="font-mono text-[11px] font-bold"
            style={{
              color: affordable ? 'var(--color-neon-lime)' : 'var(--color-neon-red)',
            }}
          >
            {formatCurrency(hireCost(candidate), true)}
          </p>
        </div>
      </div>

      {poaching ? (
        <p className="mt-1.5 flex items-center gap-1 rounded-md border border-neon-amber/30 bg-neon-amber/[0.06] px-1.5 py-1 text-[9px] leading-tight text-neon-amber">
          <Briefcase className="size-2.5 shrink-0" />
          <span className="min-w-0">
            Poaching from {gridTeamOf(candidate.currentTeamId!).name} — the fee buys them out
            of that contract.
          </span>
        </p>
      ) : (
        <p className="mt-1.5 flex items-center gap-1 text-[9px] text-chrome-500">
          <Briefcase className="size-2.5" />
          Free agent — available for the signing fee alone.
        </p>
      )}

      <GameButton
        size="sm"
        className="mt-2.5"
        variant={blocked ? 'ghost' : 'primary'}
        disabled={blocked}
        title={!eligible ? reason : !affordable ? 'Not enough in the bank.' : undefined}
        onClick={onHire}
        icon={<UserPlus className="size-3" />}
      >
        {eligible ? (affordable ? (poaching ? 'Poach' : 'Appoint') : 'Cannot afford') : 'Seat filled'}
      </GameButton>

      {!eligible && reason && (
        <p className="mt-1.5 text-[9px] leading-relaxed text-chrome-600">{reason}</p>
      )}
    </motion.div>
  );
}

function Market() {
  const { state, dispatch, playerTeam } = useGame();
  const [role, setRole] = useState<StaffRole | 'ALL'>('ALL');

  const market = useMemo(() => (state ? staffMarket(state) : []), [state]);
  if (!state || !playerTeam) return null;

  const budget = state.teams.find((t) => t.teamId === playerTeam.id)?.budget ?? 0;
  const visible = role === 'ALL' ? market : market.filter((c) => c.role === role);
  const ranked = [...visible].sort((a, b) => b.rating - a.rating);

  return (
    <Panel
      title="Recruitment"
      icon={<BadgeCheck className="size-3.5" />}
      actions={
        <SegmentedControl
          name="staff-role"
          size="sm"
          value={role}
          onChange={setRole}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'TECHNICAL_DIRECTOR', label: 'TD' },
            { value: 'AERODYNAMICIST', label: 'Aero' },
            { value: 'POWER_UNIT_ENGINEER', label: 'PU' },
            { value: 'CHIEF_MECHANIC', label: 'Mech' },
          ]}
        />
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        The shortlist is fixed for the season — it will not reroll if you reload. Someone
        already under contract elsewhere can be poached, but you are buying them out of that
        deal as well as paying them.
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.map((candidate) => {
          const eligibility = canHire(state, candidate);
          return (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              eligible={eligibility.ok}
              reason={eligibility.reason}
              affordable={budget >= hireCost(candidate)}
              onHire={() => void dispatch({ type: 'HIRE_STAFF', candidateId: candidate.id })}
            />
          );
        })}
      </div>
    </Panel>
  );
}

/* -------------------------------- screen -------------------------------- */

export function StaffView() {
  const { state } = useGame();
  if (!state) return null;

  const vacant = ROLES.filter(
    (role) => !state.staff.some((entry) => entry.role === role.id),
  ).length;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid gap-4">
        {vacant > 0 && (
          <div className="flex items-start gap-2.5 rounded-lg border border-neon-amber/30 bg-neon-amber/[0.06] p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-neon-amber" />
            <p className="text-[11px] leading-relaxed text-chrome-300">
              <span className="font-bold text-neon-amber">
                {vacant} senior role{vacant === 1 ? '' : 's'} unfilled.
              </span>{' '}
              An empty department performs as if it were staffed at 44, so the money you spend
              on the car goes less far than it should.
            </p>
          </div>
        )}
        <Market />
      </div>

      <div className="grid content-start gap-4">
        <Organisation />

        <Panel title="What They Are Worth" icon={<Gauge className="size-3.5" />}>
          <p className="mb-2.5 text-[11px] leading-relaxed text-chrome-500">
            Live figures, read from the same helpers the rest of the game uses. A negative
            number is what an empty or weak seat is costing you right now.
          </p>
          <ul className="space-y-1">
            {contributions(state).map((line) => {
              const positive = line.value > 0.05;
              const negative = line.value < -0.05;
              const tone = positive
                ? 'var(--color-neon-lime)'
                : negative
                  ? 'var(--color-neon-red)'
                  : 'var(--color-chrome-500)';

              return (
                <li
                  key={line.role}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-carbon-800/60"
                  title={line.effect}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: line.filled ? tone : 'var(--color-neon-amber)' }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] text-chrome-300">
                      {line.label}
                    </span>
                    <span className="block truncate text-[9px] text-chrome-600">
                      {line.filled ? ROLE_BY_ID.get(line.role)?.label : 'Vacant'}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-mono text-[12px] font-bold"
                    style={{ color: tone }}
                  >
                    {line.value > 0 ? '+' : ''}
                    {line.value.toFixed(line.unit === 'pts' ? 0 : 1)}
                    <span className="ml-0.5 text-[9px] font-normal opacity-70">
                      {line.unit}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel title="Payroll" icon={<TrendingUp className="size-3.5" />}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
              <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Per season</p>
              <p className="mt-1 font-mono text-[14px] font-bold text-neon-amber">
                {formatCurrency(seasonStaffBill(state), true)}
              </p>
            </div>
            <div className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5">
              <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Per round</p>
              <p className="mt-1 font-mono text-[14px] font-bold text-neon-amber">
                {formatCurrency(roundStaffBill(state), true)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-chrome-500">
            Charged alongside the drivers' wages after every race, and shown on the finance
            ledger as its own line.
          </p>
        </Panel>
      </div>
    </div>
  );
}
