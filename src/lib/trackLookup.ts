import { buildTracks } from './careerGen';
import type { Track } from '@/types/career';

/* The circuit catalogue is deterministic, so one module-level index
 * serves every screen that needs to turn a stored track id back into a
 * name and a flag — archived seasons especially, where the calendar the
 * round was run on may no longer be the current one. */
const BY_ID = new Map(buildTracks().map((track) => [track.id, track]));

export function trackOf(trackId: string): Track | undefined {
  return BY_ID.get(trackId);
}
