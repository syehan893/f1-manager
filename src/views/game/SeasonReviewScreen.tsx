import { motion } from 'framer-motion';
import { ArrowRight, ArrowLeftRight, Award, Handshake, Receipt, Trophy } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { GameButton } from '@/components/game/GameButton';
import { ActiveContracts, SponsorMarketPanel } from '@/views/SponsorsView';
import { LEDGER_LABEL, isIncome } from '@/game/finance';
import { DRIVER_BY_ID } from '@/data/drivers';
import { gridTeamOf } from '@/data/grid2026';
import { cx, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';

/* =====================================================================
 * Season review.
 *
 * The one screen in the game the player cannot skip past. The books for
 * the season just gone are closed by the time this renders — prize money
 * banked, penalties taken — and the only way forward is to fund the next
 * one. That is the point: a championship campaign has to be paid for
 * before it is planned.
 * ===================================================================== */

export function SeasonReviewScreen() {
  const { state, playerTeam, dispatch } = useGame();
  if (!state || !playerTeam) return null;

  // The rollover already advanced the season, so the year being reviewed
  // is the one before the current counter.
  const reviewedSeason = state.season - 1;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  const balance = team?.budget ?? 0;

  const closingEntries = state.finance.ledger.filter(
    (entry) => entry.season === reviewedSeason,
  );
  const prize = closingEntries.find((entry) => entry.kind === 'PRIZE');
  const penalties = closingEntries.filter((entry) => entry.kind === 'PENALTY');

  const seasonHistory = state.history.filter((round) => round.season === reviewedSeason);
  const pointsScored = seasonHistory.reduce((sum, round) => sum + round.pointsScored, 0);
  const wins = seasonHistory.filter((round) => round.bestFinish === 1).length;
  const podiums = seasonHistory.filter(
    (round) => round.bestFinish != null && round.bestFinish <= 3,
  ).length;

  const contracts = state.finance.contracts.filter((c) => c.seasonsRemaining > 0);
  const canProceed = contracts.length > 0;
  const broke = balance <= 0;

  return (
    <div className="mx-auto grid w-full max-w-[1400px] gap-4 p-1">
      {/* Headline */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center gap-4 rounded-xl border border-carbon-600 bg-carbon-900/60 p-4"
      >
        <span
          className="grid size-12 shrink-0 place-items-center rounded-lg"
          style={{ background: `${playerTeam.color}22`, color: playerTeam.color }}
        >
          <Trophy className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Season {reviewedSeason} — Final Reckoning</p>
          <h1 className="text-lg font-bold text-chrome-100">
            {prize ? prize.label : 'Championship complete'}
          </h1>
          <p className="mt-0.5 text-[11px] text-chrome-500">
            {pointsScored} points · {wins} win{wins === 1 ? '' : 's'} · {podiums} podium
            {podiums === 1 ? '' : 's'} across {seasonHistory.length} rounds.
          </p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Cash at bank</p>
          <p
            className="font-mono text-xl font-bold"
            style={{
              color: broke ? 'var(--color-neon-red)' : 'var(--color-neon-lime)',
            }}
          >
            {formatCurrency(balance)}
          </p>
        </div>
        <GameButton
          size="lg"
          disabled={!canProceed}
          title={
            canProceed
              ? undefined
              : 'Sign at least one commercial partner to fund the coming season.'
          }
          onClick={() => dispatch({ type: 'CONFIRM_SPONSORS' })}
          icon={<ArrowRight className="size-4" />}
        >
          {canProceed ? `Begin ${state.season} pre-season` : 'Sign a partner to continue'}
        </GameButton>
      </motion.div>

      {broke && (
        <div className="rounded-lg border border-neon-red/40 bg-neon-red/[0.07] p-3">
          <p className="text-[12px] font-bold text-neon-red">The team is out of money.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-chrome-300">
            Nothing can be developed or bought until the balance is positive again. Signing
            bonuses land immediately — take the deals you can get, even the bad ones.
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SponsorMarketPanel />

        <div className="grid content-start gap-4">
          <ActiveContracts />

          {/* Closing statement for the season just finished. */}
          <Panel title={`${reviewedSeason} Closing Statement`} icon={<Receipt className="size-3.5" />}>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-neon-lime/25 bg-neon-lime/[0.05] p-2.5">
                <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Prize money</p>
                <p className="mt-1 font-mono text-[14px] font-bold text-neon-lime">
                  {prize ? formatCurrency(prize.amount, true) : '—'}
                </p>
              </div>
              <div
                className={cx(
                  'rounded-lg border p-2.5',
                  penalties.length > 0
                    ? 'border-neon-red/25 bg-neon-red/[0.05]'
                    : 'border-carbon-600/70 bg-carbon-900/40',
                )}
              >
                <p className="text-[9px] tracking-widest text-chrome-600 uppercase">Penalties</p>
                <p
                  className="mt-1 font-mono text-[14px] font-bold"
                  style={{
                    color:
                      penalties.length > 0
                        ? 'var(--color-neon-red)'
                        : 'var(--color-chrome-400)',
                  }}
                >
                  {penalties.length > 0
                    ? formatCurrency(
                        penalties.reduce((sum, entry) => sum + entry.amount, 0),
                        true,
                      )
                    : 'None'}
                </p>
              </div>
            </div>

            {penalties.length > 0 && (
              <ul className="mb-2 space-y-1">
                {penalties.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-neon-red/20 bg-neon-red/[0.04] px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[10px] text-chrome-300">
                      {entry.label}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] font-bold text-neon-red">
                      {formatCurrency(entry.amount, true)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <ul className="max-h-[240px] space-y-1 overflow-y-auto">
              {closingEntries.slice(0, 30).map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-carbon-800/60"
                >
                  <span className="w-7 shrink-0 font-mono text-[9px] text-chrome-600">
                    R{entry.round}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10px] text-chrome-300">
                      {entry.label}
                    </span>
                    <span className="block truncate text-[9px] text-chrome-600">
                      {LEDGER_LABEL[entry.kind]}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-mono text-[11px] font-bold"
                    style={{
                      color: isIncome(entry.kind)
                        ? 'var(--color-neon-lime)'
                        : 'var(--color-neon-red)',
                    }}
                  >
                    {entry.amount >= 0 ? '+' : ''}
                    {formatCurrency(entry.amount, true)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          {/* The rest of the grid moved on while the books were closing. */}
          <Panel title="Silly Season" icon={<ArrowLeftRight className="size-3.5" />}>
            {state.lastTransferWindow.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-chrome-500">
                A quiet winter. Every rival team kept its line-up — nobody under-delivered
                badly enough, and nobody aged out of a drive.
              </p>
            ) : (
              <>
                <p className="mb-2.5 text-[11px] leading-relaxed text-chrome-500">
                  Rival teams reshuffled {state.lastTransferWindow.length} seat
                  {state.lastTransferWindow.length === 1 ? '' : 's'} on the back of last
                  season's form.
                </p>
                <ul className="space-y-2">
                  {state.lastTransferWindow.map((move) => {
                    const incoming = DRIVER_BY_ID[move.incomingDriverId];
                    const outgoing = DRIVER_BY_ID[move.outgoingDriverId];
                    const toTeam = gridTeamOf(move.toTeamId);
                    const fromTeam = gridTeamOf(move.fromTeamId);

                    return (
                      <li
                        key={`${move.incomingDriverId}-${move.outgoingDriverId}`}
                        className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone={move.reason === 'AGE' ? 'amber' : 'red'} mono>
                            {move.reason === 'AGE' ? 'Age' : 'Form'}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-chrome-100">
                            {incoming?.lastName ?? move.incomingDriverId}
                            <span className="text-chrome-500"> → </span>
                            {toTeam.shortName}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] leading-relaxed text-chrome-500">
                          {outgoing?.lastName ?? move.outgoingDriverId} drops to{' '}
                          {fromTeam.shortName}. {move.note}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Panel>

          {/* Contracts that ran out are the reason slots are free again. */}
          <Panel title="Contract Status" icon={<Award className="size-3.5" />}>
            <p className="text-[11px] leading-relaxed text-chrome-500">
              Every deal lost a season at the flag. Anything that expired has released its slot
              and is back on the market — often on worse terms than you had.
            </p>
            <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2">
              <Handshake className="size-3.5 text-chrome-500" />
              <span className="text-[11px] text-chrome-400">Partners under contract</span>
              <Badge tone={contracts.length > 0 ? 'lime' : 'red'} mono className="ml-auto">
                {contracts.length}
              </Badge>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
