import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import { collections, connect, ensureIndexes } from './db.ts';
import { buildComponents, buildTracks } from '../src/lib/careerGen.ts';
import { GRID_2026_DRIVERS, GRID_2026_TEAMS } from '../src/data/grid2026.ts';

/* =====================================================================
 * Career-game API.
 *
 * MongoDB is the authoritative store for a save. The browser keeps a
 * localStorage copy purely as an offline cache — on boot it prefers the
 * database, and every accepted transition is written back here.
 *
 * Collections
 *   catalog — reference data (tracks, components, teams, drivers)
 *   saves   — one document per slot, wrapping a whole GameState
 * ===================================================================== */

const PORT = Number(process.env.PORT ?? 4000);

const db = await connect();
await ensureIndexes(db);
const { tracks, components } = collections(db);

const saves = db.collection<{
  _id: string;
  state: unknown;
  updatedAt: string;
}>('saves');

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));

/** Reference data never changes during a save, so it is cached in memory. */
let catalogCache: {
  tracks: unknown[];
  components: unknown[];
  teams: unknown[];
  drivers: unknown[];
} | null = null;

async function loadCatalog() {
  if (catalogCache) return catalogCache;

  const [trackDocs, componentDocs] = await Promise.all([
    tracks.find().toArray(),
    components.find().toArray(),
  ]);

  catalogCache = {
    // Fall back to the generators if the database has not been seeded.
    tracks: trackDocs.length ? trackDocs.map((doc) => doc.track) : buildTracks(),
    components: componentDocs.length
      ? componentDocs.map((doc) => doc.component)
      : buildComponents(),
    teams: GRID_2026_TEAMS,
    drivers: GRID_2026_DRIVERS,
  };

  return catalogCache;
}

function slotOf(req: Request): string {
  const raw = req.query.slot;
  return typeof raw === 'string' && raw.length > 0 && raw.length <= 64 ? raw : 'slot-1';
}

/* -------------------------------- routes ------------------------------ */

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true, db: db.databaseName, uptimeSec: Math.round(process.uptime()) });
  } catch (error) {
    res.status(503).json({ ok: false, message: (error as Error).message });
  }
});

/** Tracks, the component tech tree, and the 2026 grid. */
app.get('/api/catalog', async (_req: Request, res: Response) => {
  try {
    res.json({ ok: true, ...(await loadCatalog()) });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

/* ----------------------------- save slots ----------------------------- */

app.get('/api/save', async (req: Request, res: Response) => {
  try {
    const doc = await saves.findOne({ _id: slotOf(req) });
    if (!doc) {
      res.status(404).json({ ok: false, message: 'No save in that slot.' });
      return;
    }
    res.json({ ok: true, state: doc.state, updatedAt: doc.updatedAt });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.put('/api/save', async (req: Request, res: Response) => {
  const state = req.body?.state;
  if (!state || typeof state !== 'object') {
    res.status(400).json({ ok: false, message: 'Body must be { state }.' });
    return;
  }

  try {
    const updatedAt = new Date().toISOString();
    const slot = slotOf(req);
    await saves.updateOne(
      { _id: slot },
      { $set: { _id: slot, state, updatedAt } },
      { upsert: true },
    );
    res.json({ ok: true, updatedAt });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.delete('/api/save', async (req: Request, res: Response) => {
  try {
    await saves.deleteOne({ _id: slotOf(req) });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

/** Every slot with a save, for a future multi-slot menu. */
app.get('/api/saves', async (_req: Request, res: Response) => {
  try {
    const docs = await saves.find().sort({ updatedAt: -1 }).limit(20).toArray();
    res.json({
      ok: true,
      slots: docs.map((doc) => ({ slot: doc._id, updatedAt: doc.updatedAt })),
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: (error as Error).message });
  }
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`career-game api listening on http://localhost:${PORT}`);
  console.log(`  db: ${db.databaseName}`);
});
