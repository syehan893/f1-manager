import type { TrackProfile } from '@/types/career';

export const PROFILE_COLOR: Record<TrackProfile, string> = {
  HIGH_DOWNFORCE: 'var(--color-neon-violet)',
  POWER: 'var(--color-neon-red)',
  BALANCED: 'var(--color-neon-cyan)',
  STREET: 'var(--color-neon-amber)',
};

export const PROFILE_LABEL: Record<TrackProfile, string> = {
  HIGH_DOWNFORCE: 'High Downforce',
  POWER: 'Power',
  BALANCED: 'Balanced',
  STREET: 'Street',
};
