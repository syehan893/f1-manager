import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Award, FileSignature, Heart, UserRound } from 'lucide-react';
import { Panel } from '@/components/ui/Panel';
import { Badge } from '@/components/ui/Badge';
import { StatBar } from '@/components/ui/StatBar';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { DriverPortrait } from '@/components/ui/DriverPortrait';
import { driverRating, gridTeamOf } from '@/data/grid2026';
import { cx, flagEmoji, formatCurrency } from '@/lib/format';
import { useGame } from '@/state/gameContext';
import type { Driver, DriverAttributes } from '@/types';

type Scope = 'team' | 'grid';

const ATTRIBUTES: Array<{ key: keyof DriverAttributes; label: string }> = [
  { key: 'pace', label: 'Pace' },
  { key: 'cornering', label: 'Cornering' },
  { key: 'braking', label: 'Braking' },
  { key: 'overtaking', label: 'Racecraft' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'reaction', label: 'Reaction Time' },
  { key: 'stamina', label: 'Stamina' },
  { key: 'wetWeather', label: 'Wet Weather' },
];

/** Eight-axis radar of a driver's attribute spread. */
function AttributeRadar({ driver, color }: { driver: Driver; color: string }) {
  const size = 190;
  const centre = size / 2;
  const radius = centre - 26;

  const points = useMemo(
    () =>
      ATTRIBUTES.map((attribute, index) => {
        const angle = (index / ATTRIBUTES.length) * Math.PI * 2 - Math.PI / 2;
        const value = driver.attributes[attribute.key] / 100;
        return {
          label: attribute.label,
          x: centre + Math.cos(angle) * radius * value,
          y: centre + Math.sin(angle) * radius * value,
          ax: centre + Math.cos(angle) * radius,
          ay: centre + Math.sin(angle) * radius,
          lx: centre + Math.cos(angle) * (radius + 16),
          ly: centre + Math.sin(angle) * (radius + 16),
        };
      }),
    [driver, centre, radius],
  );

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-auto w-full max-w-[210px]"
      role="img"
      aria-label="attribute radar"
    >
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={ATTRIBUTES.map((_, index) => {
            const angle = (index / ATTRIBUTES.length) * Math.PI * 2 - Math.PI / 2;
            return `${centre + Math.cos(angle) * radius * ring},${centre + Math.sin(angle) * radius * ring}`;
          }).join(' ')}
          fill="none"
          stroke="var(--color-carbon-600)"
          strokeWidth={0.8}
        />
      ))}

      {points.map((point) => (
        <line
          key={point.label}
          x1={centre}
          y1={centre}
          x2={point.ax}
          y2={point.ay}
          stroke="var(--color-carbon-600)"
          strokeWidth={0.8}
        />
      ))}

      <motion.polygon
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill={color}
        fillOpacity={0.22}
        stroke={color}
        strokeWidth={1.8}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{ transformOrigin: `${centre}px ${centre}px`, filter: `drop-shadow(0 0 8px ${color})` }}
      />

      {points.map((point) => (
        <circle key={`${point.label}-dot`} cx={point.x} cy={point.y} r={2.4} fill={color} />
      ))}

      {points.map((point) => (
        <text
          key={`${point.label}-text`}
          x={point.lx}
          y={point.ly}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={6.4}
          fontFamily="var(--font-mono)"
          fill="var(--color-chrome-500)"
          letterSpacing="0.08em"
        >
          {point.label.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}

export function DriversView() {
  const { state, roster, playerTeam } = useGame();
  const [scope, setScope] = useState<Scope>('team');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useMemo(
    () => (scope === 'team' ? roster.filter((d) => d.teamId === playerTeam?.id) : roster),
    [scope, roster, playerTeam],
  );

  if (!state) return null;

  const selected =
    roster.find((driver) => driver.id === selectedId) ?? list[0] ?? roster[0];
  if (!selected) return null;

  const team = gridTeamOf(selected.teamId);
  const wdc = state.standings.drivers.find((row) => row.driverId === selected.id);
  const contractYearsLeft = selected.contract.expiresAfterSeason - state.season;

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      {/* Roster */}
      <Panel
        title="Driver Roster"
        icon={<UserRound className="size-3.5" />}
        actions={
          <SegmentedControl
            name="driver-scope"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'team', label: 'My Team' },
              { value: 'grid', label: 'Full Grid' },
            ]}
          />
        }
        bodyClassName="max-h-[640px] overflow-y-auto"
      >
        <ul className="space-y-1.5">
          {list.map((driver) => {
            const driverTeam = gridTeamOf(driver.teamId);
            const isSelected = driver.id === selected.id;
            return (
              <li key={driver.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(driver.id)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors',
                    isSelected
                      ? 'border-neon-cyan/40 bg-neon-cyan/8'
                      : 'border-carbon-700/60 hover:border-carbon-500 hover:bg-carbon-800/50',
                  )}
                >
                  <DriverPortrait
                    driver={driver}
                    teamColor={driverTeam.color}
                    size={38}
                    showNumber={false}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold text-chrome-100">
                      {driver.firstName.charAt(0)}. {driver.lastName}
                    </p>
                    <p className="truncate text-[10px] text-chrome-500">
                      {flagEmoji(driver.countryCode)} {driverTeam.shortName} · #{driver.carNumber}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold"
                    style={{ background: `${driverTeam.color}22`, color: driverTeam.color }}
                  >
                    {driverRating(driver)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* Detail */}
      <div className="grid gap-4">
        <Panel title="Driver Profile" icon={<Award className="size-3.5" />}>
          <div className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
            <div className="flex items-start gap-4">
              <DriverPortrait driver={selected} teamColor={team.color} size={88} />
              <div>
                <p className="font-mono text-[11px] tracking-widest text-chrome-500">
                  #{selected.carNumber}
                </p>
                <h3 className="text-xl leading-tight font-bold text-chrome-100">
                  {selected.firstName}
                  <br />
                  <span className="uppercase">{selected.lastName}</span>
                </h3>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-chrome-500">
                  <span>{flagEmoji(selected.countryCode)}</span>
                  {selected.country} · {selected.age} yrs
                </p>
                <Badge tone={selected.teamId === playerTeam?.id ? 'cyan' : 'neutral'} className="mt-2">
                  {team.name}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
              {ATTRIBUTES.map((attribute) => (
                <StatBar
                  key={attribute.key}
                  label={attribute.label}
                  value={selected.attributes[attribute.key]}
                  color={team.color}
                  size="sm"
                />
              ))}
            </div>

            <div className="grid place-items-center">
              <AttributeRadar driver={selected} color={team.color} />
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Condition" icon={<Heart className="size-3.5" />}>
            <div className="space-y-3">
              <StatBar
                label="Morale"
                value={selected.morale}
                color={selected.morale > 70 ? 'var(--color-neon-lime)' : 'var(--color-neon-amber)'}
              />
              <StatBar label="Fitness" value={selected.fitness} color="var(--color-neon-blue)" />
              <StatBar
                label="Overall rating"
                value={driverRating(selected)}
                color={team.color}
                segmented
              />
            </div>
          </Panel>

          <Panel title="Contract" icon={<FileSignature className="size-3.5" />}>
            <dl className="space-y-2.5">
              {[
                { label: 'Salary', value: formatCurrency(selected.contract.salaryPerSeason) },
                { label: 'Win bonus', value: formatCurrency(selected.contract.bonusPerWin) },
                { label: 'Buyout', value: formatCurrency(selected.contract.buyoutClause) },
                { label: 'Expires after', value: `Season ${selected.contract.expiresAfterSeason}` },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="text-[10px] tracking-wider text-chrome-500 uppercase">
                    {row.label}
                  </dt>
                  <dd className="font-mono text-[12px] font-semibold text-chrome-100">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2">
              <span className="text-[10px] tracking-wider text-chrome-500 uppercase">
                Time remaining
              </span>
              <Badge
                tone={contractYearsLeft <= 0 ? 'red' : contractYearsLeft === 1 ? 'amber' : 'lime'}
              >
                {contractYearsLeft <= 0
                  ? 'Expiring'
                  : `${contractYearsLeft} season${contractYearsLeft > 1 ? 's' : ''}`}
              </Badge>
            </div>
          </Panel>

          <Panel title="Season Record" icon={<Award className="size-3.5" />}>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Championship', value: `P${wdc?.position ?? '—'}` },
                { label: 'Points', value: wdc?.points ?? 0 },
                { label: 'Wins', value: wdc?.wins ?? 0 },
                { label: 'Podiums', value: wdc?.podiums ?? 0 },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-carbon-600/70 bg-carbon-900/40 px-3 py-2.5"
                >
                  <p className="text-[9px] tracking-widest text-chrome-500 uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-chrome-100">{stat.value}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
