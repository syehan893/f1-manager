import { Battery, Cog, Wind } from 'lucide-react';

/* Shared presentation for the fourteen parts: the icon and accent each
 * group is drawn in, and the colour a development level reads as. Kept
 * out of the component files so both the R&D screen and the garage can
 * use them without either importing the other. */

export const GROUP_META = {
  POWER_UNIT: { label: 'Power Unit', icon: Battery, tone: 'var(--color-neon-red)' },
  AERODYNAMICS: { label: 'Aerodynamics', icon: Wind, tone: 'var(--color-neon-cyan)' },
  MECHANICAL: { label: 'Mechanical', icon: Cog, tone: 'var(--color-neon-violet)' },
} as const;

/** Where a level sits on the grid, at a glance. */
export function levelTone(level: number): string {
  if (level >= 92) return 'var(--color-neon-lime)';
  if (level >= 80) return 'var(--color-neon-cyan)';
  if (level >= 68) return 'var(--color-neon-amber)';
  return 'var(--color-neon-red)';
}
