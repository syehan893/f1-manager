import { useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Timer, X } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GameButton } from '@/components/game/GameButton';
import { PARTS } from '@/game/carModel';
import {
  DEVELOPMENT_INTENSITY,
  canDevelop,
  developmentCost,
  developmentGain,
  developmentWeeks,
  partLevel,
} from '@/game/partDevelopment';
import type { DevelopmentIntensity } from '@/game/partDevelopment';
import { buildTimeReduction } from '@/game/facilities';
import { staffBuildTimeReduction } from '@/game/staffing';
import { cx, formatCurrency } from '@/lib/format';
import { GROUP_META, levelTone } from '@/lib/partStyle';
import { useGame } from '@/state/gameContext';
import type { PartState } from '@/game/types';

/* =====================================================================
 * Step one: the drawing.
 *
 * This is where money becomes a better *design*. It commissions a
 * programme on one part, the programme takes weeks, and when it lands
 * the drawing for that part moves up.
 *
 * Nothing here touches the car. A drawing is not a part: the level this
 * screen raises is what the factory will build to next, and the car only
 * changes when something built to it is bolted on. That is the point of
 * splitting the two screens — R&D decides what the car could be, the
 * garage decides what it is.
 * ===================================================================== */

function PartRow({
  part,
  intensity,
}: {
  part: PartState;
  intensity: DevelopmentIntensity;
}) {
  const { state, playerTeam, dispatch } = useGame();
  if (!state || !playerTeam) return null;

  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const definition = PARTS.find((entry) => entry.id === part.category)!;
  const Icon = GROUP_META[definition.group].icon;

  const project = team.development.find((entry) => entry.category === part.category);
  const level = partLevel(team, part.category);
  const cost = developmentCost(part.category, level, intensity);
  const gain = developmentGain(state, part.category, level, intensity);
  const weeks = developmentWeeks(
    part.category,
    intensity,
    buildTimeReduction(state) + staffBuildTimeReduction(state),
  );
  const check = canDevelop(team, part.category, intensity);
  const tone = levelTone(level);

  /* What is actually on the car against what the drawing now says. A gap
   * here is the whole reason to walk over to the garage. */
  const fitted = (team.builtParts ?? []).find(
    (entry) => entry.category === part.category && entry.status === 'FITTED',
  );
  const behind = fitted ? level - fitted.spec : 0;

  return (
    <li className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon
          className="size-3.5 shrink-0"
          style={{ color: GROUP_META[definition.group].tone }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-bold text-chrome-100">{definition.label}</p>
          <p className="truncate text-[10px] text-chrome-500">{definition.effect}</p>
        </div>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[16px] font-bold" style={{ color: tone }}>
            {level.toFixed(1)}
          </span>
          <span className="block text-[8px] tracking-widest text-chrome-600 uppercase">
            drawing
          </span>
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-carbon-700">
        <motion.div
          className="h-full rounded-full"
          initial={false}
          animate={{ width: `${level}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 22 }}
          style={{ background: tone, boxShadow: `0 0 8px ${tone}` }}
        />
      </div>

      {behind >= 0.5 && (
        <p className="mt-1.5 text-[10px] text-neon-amber">
          The car is running a {fitted!.spec.toFixed(1)} — {behind.toFixed(1)} behind the
          drawing. Build a new one in the garage to put this on the car.
        </p>
      )}

      {project ? (
        /* In build: show what is coming and when, and let it be stopped. */
        <div className="mt-2.5 rounded-md border border-neon-amber/35 bg-neon-amber/[0.05] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-neon-amber">
              <Timer className="size-3" />
              In design · +{project.gain.toFixed(1)} in {project.weeksRemaining}w
            </span>
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'CANCEL_PART_DEVELOPMENT', projectId: project.id })
              }
              title="Cancel this programme. Work already done is not refunded."
              className="flex items-center gap-0.5 rounded border border-carbon-600 px-1.5 py-0.5 font-mono text-[9px] text-chrome-400 transition-colors hover:border-neon-red/50 hover:text-neon-red"
            >
              <X className="size-2.5" />
              Stop
            </button>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-carbon-700">
            <div
              className="h-full rounded-full bg-neon-amber"
              style={{
                width: `${((project.totalWeeks - project.weeksRemaining) / project.totalWeeks) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="flex-1 font-mono text-[10px] text-chrome-500">
            +{gain.toFixed(1)} · {weeks}w · {formatCurrency(cost, true)}
          </span>
          <GameButton
            size="sm"
            variant={check.ok ? 'secondary' : 'ghost'}
            disabled={!check.ok}
            title={check.reason ?? `Commission ${definition.label} development`}
            onClick={() =>
              dispatch({ type: 'DEVELOP_PART', category: part.category, intensity })
            }
          >
            Commission
          </GameButton>
        </div>
      )}
    </li>
  );
}

/** Step one of the build loop, on the screen that owns it. */
export function PartDevelopmentPanel() {
  const { state, playerTeam } = useGame();
  const [intensity, setIntensity] = useState<DevelopmentIntensity>(2);
  const [group, setGroup] = useState<'ALL' | keyof typeof GROUP_META>('ALL');

  if (!state || !playerTeam) return null;
  const team = state.teams.find((entry) => entry.teamId === playerTeam.id);
  if (!team) return null;

  const visible =
    group === 'ALL'
      ? team.parts
      : team.parts.filter(
          (part) => PARTS.find((entry) => entry.id === part.category)?.group === group,
        );

  const committed = team.development.reduce((sum, project) => sum + project.cost, 0);

  return (
    <Panel
      title="Part Development — Step 1: The Drawing"
      icon={<FlaskConical className="size-3.5" />}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            name="dev-group"
            size="sm"
            value={group}
            onChange={setGroup}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'POWER_UNIT', label: 'PU' },
              { value: 'AERODYNAMICS', label: 'Aero' },
              { value: 'MECHANICAL', label: 'Mech' },
            ]}
          />
          <SegmentedControl
            name="dev-intensity"
            size="sm"
            value={String(intensity)}
            onChange={(value) => setIntensity(Number(value) as DevelopmentIntensity)}
            options={[
              { value: '1', label: 'Steady' },
              { value: '2', label: 'Normal' },
              { value: '3', label: 'Max' },
            ]}
          />
        </div>
      }
    >
      <p className="mb-3 text-[11px] leading-relaxed text-chrome-500">
        Development raises the <span className="text-chrome-300">drawing</span> for a part — what
        the factory will build to next. It does not change the car on its own: take the new
        drawing to the <span className="text-chrome-300">garage</span>, build the part, and fit
        it.{' '}
        <span className="text-chrome-300">{DEVELOPMENT_INTENSITY[intensity].label}</span>{' '}
        intensity — {intensity === 1 && 'cheapest, and the slowest to arrive.'}
        {intensity === 2 && 'the standard programme.'}
        {intensity === 3 && 'costs far more, arrives sooner, and gains more.'} A part that is
        already strong costs progressively more to move.
      </p>

      {committed > 0 && (
        <p className={cx('mb-3 font-mono text-[10px] text-chrome-400')}>
          {formatCurrency(committed, true)} committed across {team.development.length} programme
          {team.development.length === 1 ? '' : 's'}.
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {visible.map((part) => (
          <PartRow key={part.category} part={part} intensity={intensity} />
        ))}
      </ul>
    </Panel>
  );
}
