import { MongoClient } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import type { EngineComponent, Track } from '../src/types/career.ts';

/* =====================================================================
 * MongoDB access layer.
 *
 * Collections:
 *   tracks     — catalog, one document per circuit
 *   components — catalog, one document per car component + its tech tree
 *   saves      — one document per slot, wrapping a whole GameState
 * ===================================================================== */

export interface TrackDocument {
  _id: string;
  track: Track;
}

export interface ComponentDocument {
  _id: string;
  component: EngineComponent;
}

export interface Collections {
  tracks: Collection<TrackDocument>;
  components: Collection<ComponentDocument>;
}

let client: MongoClient | null = null;
let database: Db | null = null;

export function mongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (uri) return uri;

  const user = process.env.MONGODB_USERNAME;
  const pass = process.env.MONGODB_PASSWORD;
  const host = process.env.MONGODB_HOST;
  if (user && pass && host) {
    return `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}`;
  }

  throw new Error('MONGODB_URI is not set. Copy .env.example to .env and fill it in.');
}

export async function connect(): Promise<Db> {
  if (database) return database;

  client = new MongoClient(mongoUri(), {
    serverSelectionTimeoutMS: 15_000,
    retryWrites: true,
  });

  await client.connect();
  database = client.db(process.env.MONGODB_DB ?? 'motorsport_manager');
  return database;
}

export function collections(db: Db): Collections {
  return {
    tracks: db.collection<TrackDocument>('tracks'),
    components: db.collection<ComponentDocument>('components'),
  };
}

export async function disconnect(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
}

/** Keeps the save listing ordered without a collection scan. */
export async function ensureIndexes(db: Db): Promise<void> {
  await db.collection('saves').createIndex({ updatedAt: -1 });
}
