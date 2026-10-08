import pg from "pg";
import type { PersistedSession } from "./session.js";

export type RuntimeSessionRecord = {
  code: string;
  ownerTeacherId: string | null;
  state: PersistedSession;
};

export interface RuntimeSessionStore {
  init(): Promise<void>;
  list(): Promise<RuntimeSessionRecord[]>;
  save(record: RuntimeSessionRecord): Promise<void>;
  close(): Promise<void>;
}

export class MemoryRuntimeSessionStore implements RuntimeSessionStore {
  private records = new Map<string, RuntimeSessionRecord>();
  async init() {}
  async list() { return structuredClone([...this.records.values()]); }
  async save(record: RuntimeSessionRecord) { this.records.set(record.code, structuredClone(record)); }
  async close() {}
}

class PostgresRuntimeSessionStore implements RuntimeSessionStore {
  private pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new pg.Pool({ connectionString }); }

  async init() {
    await this.pool.query("SELECT code, owner_teacher_id, snapshot, state, created_at, updated_at FROM runtime_sessions LIMIT 0");
  }

  async list() {
    const result = await this.pool.query<{
      code: string;
      ownerTeacherId: string | null;
      state: PersistedSession;
    }>(`SELECT code, owner_teacher_id AS "ownerTeacherId", state
        FROM runtime_sessions ORDER BY created_at, code`);
    return result.rows;
  }

  async save(record: RuntimeSessionRecord) {
    const createdAt = new Date(record.state.events[0]?.at ?? Date.now());
    await this.pool.query(
      `INSERT INTO runtime_sessions(code, owner_teacher_id, snapshot, state, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
       ON CONFLICT (code) DO UPDATE SET
         owner_teacher_id = EXCLUDED.owner_teacher_id,
         snapshot = EXCLUDED.snapshot,
         state = EXCLUDED.state,
         updated_at = now()`,
      [record.code, record.ownerTeacherId, JSON.stringify(record.state.snapshot), JSON.stringify(record.state), createdAt],
    );
  }

  async close() { await this.pool.end(); }
}

export function makeRuntimeSessionStore(): RuntimeSessionStore {
  return process.env.DATABASE_URL
    ? new PostgresRuntimeSessionStore(process.env.DATABASE_URL)
    : new MemoryRuntimeSessionStore();
}
