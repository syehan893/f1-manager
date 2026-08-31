import { useMemo, useState } from 'react';
import { GraduationCap, Sparkles, Star, Trophy } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { driverRating } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { prospectToDriver, scoutedRange } from '@/game/driverDevelopment';
import { F2_MAX_SEASONS } from '@/game/feederSeries';
import { ARCHETYPES, TIERS, seasonsUntilTier, tierDueIn } from '@/game/youthTalent';
import { MAX_SQUAD_SIZE, squadHasRoom } from '@/game/roster';
import { useGame } from '@/state/gameContext';
import type { ProspectDriver, TalentTier } from '@/game/types';

/* =====================================================================
 * The Youth Academy.
 *
 * Juniors used to be a panel at the bottom of the driver market: six
 * cards, a name, an age and a ceiling nobody could check. There was no
 * reason to prefer one to another beyond the number printed on them, and
 * no way to be wrong about it — which made the whole thing a lottery
 * wearing a scouting report's clothes.
 *
 * The screen exists on its own now because there is finally something to
 * look at. The same twenty-two juniors race a championship every season,
 * so the potential on the card can be read against what they actually
 * did with it. Signing the driver who won F2 is a different decision to
 * signing the one with the highest number, and the point of this screen
 * is to let the player make it.
 * ===================================================================== */

const TIER_TONE: Record<TalentTier, 'neutral' | 'cyan' | 'violet' | 'amber'> = {
  STANDARD: 'neutral',
  STANDOUT: 'cyan',
  GENERATIONAL: 'violet',
  PRODIGY: 'amber',
};

const TIER_RING: Record<TalentTier, string> = {
  STANDARD: 'border-carbon-600',
  STANDOUT: 'border-neon-cyan/40',
  GENERATIONAL: 'border-violet-400/50',
  PRODIGY: 'border-amber-400/60 shadow-[0_0_18px_-6px] shadow-amber-400/40',
};

/* --------------------------- the F2 standings -------------------------- */

/**
 * Last season's feeder championship.
 *
 * This is the evidence, so it is the first thing on the screen. The
 * rows name their own drivers rather than looking them up in the current
 * field — by the time the player reads this the champion has usually
 * been signed by somebody, and a table that goes blank for exactly the
 * drivers worth reading about would be worse than no table at all.
 */
function FeederStandings() {
  const { state } = useGame();
  if (!state) return null;

  const table = state.f2;
  const inField = new Set(state.prospects.map((entry) => entry.id));

  return (
    <Panel
      title={table ? `Formula 2 — ${table.season} Championship` : 'Formula 2'}
      icon={<Trophy className="size-3.5" />}
      flush={Boolean(table)}
      actions={
        table ? (
          <Badge tone="amber" mono>
            {table.rounds} rounds
          </Badge>
        ) : null
      }
    >
      {!table ? (
        <p className="px-4 py-6 text-center text-[11px] leading-relaxed text-chrome-500">
          The feeder series runs alongside the championship. The table appears here at the end
          of the season, once there is a result to read.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="border-b border-carbon-600/60 bg-carbon-900/60">
                {['', 'Driver', 'Pts', 'Wins', 'Podiums', 'Poles', 'Best', ''].map((label, i) => (
                  <th
                    key={i}
                    className={cx(
                      'px-3 py-2 text-[9px] font-semibold tracking-widest text-chrome-500 uppercase',
                      i === 1 ? 'text-left' : 'text-right',
                      i === 0 && 'text-center',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.standings.map((row) => {
                const gone = !inField.has(row.driverId);
                const seat = state.driverTeams[row.driverId];
                return (
                  <tr
                    key={row.driverId}
                    className={cx(
                      'border-b border-carbon-800/60 last:border-0',
                      row.position <= 3 && 'bg-amber-400/[0.04]',
                    )}
                  >
                    <td className="px-3 py-1.5 text-center font-mono text-[11px] font-bold text-chrome-400">
                      {row.position}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="text-[12px] font-semibold text-chrome-100">{row.name}</span>
                      {row.tier !== 'STANDARD' && (
                        <Badge tone={TIER_TONE[row.tier]} className="ml-2">
                          {TIERS[row.tier].label}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[12px] font-bold text-chrome-200">
                      {row.points}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-chrome-400">
                      {row.wins}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-chrome-400">
                      {row.podiums}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-chrome-400">
                      {row.poles}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-chrome-500">
                      P{row.bestFinish}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {seat ? (
                        <Badge tone="lime">Promoted</Badge>
                      ) : gone ? (
                        <Badge tone="neutral">Released</Badge>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/* ------------------------------ one junior ----------------------------- */

function JuniorCard({ prospect }: { prospect: ProspectDriver }) {
  const { state, dispatch } = useGame();
  if (!state) return null;

  const driver = prospectToDriver(prospect);
  const now = driverRating(driver);
  /* A ceiling nobody can measure is the whole gamble. Scouts give a
   * range, not a number, and it narrows as the driver actually races. */
  const scouted = scoutedRange(state, prospect.id);
  const room = state.playerTeamId ? squadHasRoom(state, state.playerTeamId) : false;
  const place = state.f2?.standings.find((row) => row.driverId === prospect.id);
  const archetype = ARCHETYPES[prospect.archetype];
  const finalYear = prospect.seasonsInF2 + 1 >= F2_MAX_SEASONS;

  return (
    <div
      className={cx(
        'flex flex-col rounded-lg border bg-carbon-900/50 p-3',
        TIER_RING[prospect.tier],
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-chrome-100">
            {flagEmoji(prospect.countryCode)} {prospect.firstName} {prospect.lastName}
          </p>
          <p className="truncate text-[10px] text-chrome-500">
            Age {prospect.age} · {formatCurrency(prospect.salary, true)}/yr ·{' '}
            {prospect.seasonsInF2 === 0
              ? 'rookie season'
              : `${prospect.seasonsInF2 + 1}${finalYear ? ' — final year' : ''}`}
          </p>
        </div>
        {prospect.tier !== 'STANDARD' && (
          <Badge tone={TIER_TONE[prospect.tier]}>
            <Star className="mr-1 inline size-2.5" />
            {TIERS[prospect.tier].label}
          </Badge>
        )}
      </div>

      {/* What kind of driver this is, before anybody knows how good. */}
      <p className="mt-2 text-[10px] leading-relaxed text-chrome-500 italic">
        <span className="text-chrome-300 not-italic">{archetype.label}.</span> {prospect.note}
      </p>

      {/* Now against ceiling: the gap is the reason to sign them. */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <div className="rounded-md border border-carbon-700 bg-carbon-950/50 px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Today</p>
          <p className="font-mono text-[13px] font-bold text-chrome-300">{now}</p>
        </div>
        <div className="rounded-md border border-neon-cyan/25 bg-neon-cyan/[0.06] px-2 py-1.5">
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">Ceiling</p>
          <p className="font-mono text-[13px] font-bold text-neon-cyan">
            {scouted.low}–{scouted.high}
          </p>
        </div>
        <div
          className={cx(
            'rounded-md border px-2 py-1.5',
            place && place.position <= 3
              ? 'border-amber-400/30 bg-amber-400/[0.07]'
              : 'border-carbon-700 bg-carbon-950/50',
          )}
        >
          <p className="text-[8px] tracking-widest text-chrome-600 uppercase">F2</p>
          <p
            className={cx(
              'font-mono text-[13px] font-bold',
              place && place.position <= 3 ? 'text-amber-300' : 'text-chrome-400',
            )}
          >
            {place ? `P${place.position}` : '—'}
          </p>
        </div>
      </div>

      <GameButton
        size="sm"
        className="mt-2.5"
        disabled={!room}
        title={
          room
            ? `Promote ${prospect.lastName} into the squad`
            : `Your squad is full at ${MAX_SQUAD_SIZE}. Release or sell somebody first.`
        }
        onClick={() => dispatch({ type: 'SIGN_PROSPECT', prospectId: prospect.id })}
        icon={<Sparkles className="size-3" />}
      >
        Promote
      </GameButton>
    </div>
  );
}

/* ------------------------------ the screen ----------------------------- */

type Filter = 'ALL' | 'RARE' | 'NEW';

export function YouthAcademyView() {
  const { state } = useGame();
  const [filter, setFilter] = useState<Filter>('ALL');

  const juniors = useMemo(() => {
    if (!state) return [];
    const place = new Map((state.f2?.standings ?? []).map((row) => [row.driverId, row.position]));
    return state.prospects
      .filter((prospect) => !state.driverTeams[prospect.id])
      .filter((prospect) =>
        filter === 'RARE'
          ? prospect.tier !== 'STANDARD'
          : filter === 'NEW'
            ? prospect.scoutedInSeason === state.season
            : true,
      )
      /* Championship order first, because that is the ranking the player
       * should be arguing with. Anybody the table has not seen — this
       * year's intake — sorts behind it on potential. */
      .sort((a, b) => {
        const pa = place.get(a.id);
        const pb = place.get(b.id);
        if (pa != null && pb != null) return pa - pb;
        if (pa != null) return -1;
        if (pb != null) return 1;
        return b.potential - a.potential;
      });
  }, [state, filter]);

  if (!state) return null;

  const rare = state.prospects.filter((p) => p.tier !== 'STANDARD');
  const nextProdigy = seasonsUntilTier(state.season, 'PRODIGY');
  const nextGenerational = seasonsUntilTier(state.season, 'GENERATIONAL');

  return (
    <div className="grid gap-4">
      <FeederStandings />

      <Panel
        title="Junior Intake"
        icon={<GraduationCap className="size-3.5" />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={juniors.length > 0 ? 'cyan' : 'neutral'} mono>
              {juniors.length} available
            </Badge>
            <SegmentedControl
              name="youth-filter"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'RARE', label: 'Rated' },
                { value: 'NEW', label: 'New' },
              ]}
            />
          </div>
        }
      >
        <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
          Everybody here races in F2, so the ceiling on the card can be read against what they
          actually did with it. They stay in the series for up to {F2_MAX_SEASONS} seasons,
          getting better and more expensive, until somebody promotes them or the bottom of the
          table clears them out. Rivals promote from this list too — a driver you are still
          thinking about is a driver somebody else can sign.
        </p>

        {/* What is out there this year, and what is coming. */}
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-carbon-700 bg-carbon-950/40 px-3 py-2">
          <span className="text-[10px] tracking-widest text-chrome-600 uppercase">
            In the field
          </span>
          {rare.length === 0 ? (
            <span className="text-[11px] text-chrome-500">Nothing exceptional right now.</span>
          ) : (
            rare.map((prospect) => (
              <Badge key={prospect.id} tone={TIER_TONE[prospect.tier]}>
                {TIERS[prospect.tier].label}: {prospect.lastName}
              </Badge>
            ))
          )}
          <span className="ml-auto text-[10px] text-chrome-600">
            {tierDueIn(state.season) === 'PRODIGY'
              ? 'A once-in-a-decade talent joins the series this year.'
              : nextProdigy > 0
                ? `Next prodigy in ${nextProdigy} season${nextProdigy === 1 ? '' : 's'}` +
                  (nextGenerational > 0
                    ? ` · generational in ${nextGenerational}`
                    : ' · generational this year')
                : ''}
          </span>
        </div>

        {juniors.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-chrome-500">
            Nobody matches that filter.
          </p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {juniors.map((prospect) => (
              <JuniorCard key={prospect.id} prospect={prospect} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
