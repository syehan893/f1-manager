import { SAVE_VERSION } from './types';
import type { GameState } from './types';

/* =====================================================================
 * Single save slot, database-backed.
 *
 * MongoDB is authoritative: the game boots from it and every accepted
 * transition is written back. localStorage holds a mirror of the same
 * slot so the game still runs — and still saves — when the API is
 * unreachable, and so the main menu can show the slot instantly on boot.
 * ===================================================================== */

export const SAVE_KEY = 'mm.game.save';

/*
 * Where the career API lives. Unset means there is no API to talk to —
 * a static deployment, for instance — and the game runs entirely on the
 * localStorage mirror.
 *
 * That distinction matters: without it a hosted build would spend six
 * seconds timing out against a localhost address on every boot and every
 * save, and on an HTTPS origin the browser would block the request as
 * mixed content anyway. In development the default keeps the local
 * Express server working with no configuration.
 */
const API_BASE = (import.meta.env.VITE_CAREER_API_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:4000' : '');

/** True when a remote save service is configured at all. */
export const HAS_REMOTE_API = API_BASE.length > 0;

const SLOT_ID = (import.meta.env.VITE_SAVE_SLOT as string | undefined) ?? 'slot-1';
const REQUEST_TIMEOUT_MS = 6_000;

export type SaveOrigin = 'database' | 'local' | 'none';

export interface SaveSummary {
  managerName: string;
  teamId: string | null;
  season: number;
  round: number;
  phase: GameState['phase'];
  updatedAt: string;
  origin: SaveOrigin;
}

function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<GameState>;
  return (
    typeof candidate.version === 'number' &&
    typeof candidate.phase === 'string' &&
    typeof candidate.season === 'number' &&
    Array.isArray(candidate.teams) &&
    // Finance arrived with save version 5; a save without it is stale
    // regardless of what the version field claims.
    typeof candidate.finance === 'object' &&
    candidate.finance !== null
  );
}

/** A save from an older shape is discarded rather than migrated. */
function accept(value: unknown): GameState | null {
  return isGameState(value) && value.version === SAVE_VERSION ? value : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  // No API configured: report unreachable rather than dialling nowhere.
  if (!HAS_REMOTE_API) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ local cache --------------------------- */

export function readLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = accept(JSON.parse(raw) as unknown);
    if (!parsed) localStorage.removeItem(SAVE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked; the session continues in memory.
  }
}

/* ------------------------------ public API ---------------------------- */

export interface LoadResult {
  state: GameState | null;
  origin: SaveOrigin;
  /** True when the database could not be reached during the load. */
  offline: boolean;
}

/** Boot the slot: database first, local cache as the fallback. */
export async function loadSave(): Promise<LoadResult> {
  const remote = await request<{ ok: boolean; state?: unknown }>(
    `/api/save?slot=${encodeURIComponent(SLOT_ID)}`,
  );

  if (remote === null) {
    // Could not reach the API at all — fall back to the cache.
    const local = readLocal();
    return { state: local, origin: local ? 'local' : 'none', offline: true };
  }

  const state = accept(remote.state);
  if (state) {
    writeLocal(state);
    return { state, origin: 'database', offline: false };
  }

  // The API answered but holds no usable save (404 or stale version).
  const local = readLocal();
  if (local) {
    // Push the local copy up so the database becomes the source of truth.
    void saveState(local);
    return { state: local, origin: 'local', offline: false };
  }

  return { state: null, origin: 'none', offline: false };
}

/** Persist to the database, always mirroring locally first. */
export async function saveState(state: GameState): Promise<boolean> {
  writeLocal(state);
  const result = await request<{ ok: boolean }>(
    `/api/save?slot=${encodeURIComponent(SLOT_ID)}`,
    { method: 'PUT', body: JSON.stringify({ state }) },
  );
  return result?.ok === true;
}

export async function clearSave(): Promise<void> {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to do */
  }
  await request(`/api/save?slot=${encodeURIComponent(SLOT_ID)}`, { method: 'DELETE' });
}

export function summarise(state: GameState, origin: SaveOrigin): SaveSummary {
  return {
    managerName: state.managerName,
    teamId: state.playerTeamId,
    season: state.season,
    round: state.round,
    phase: state.phase,
    updatedAt: state.updatedAt,
    origin,
  };
}

export { SLOT_ID };
