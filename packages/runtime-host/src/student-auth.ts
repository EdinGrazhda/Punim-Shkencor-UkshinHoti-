import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword, hashToken } from "./teacher-auth.js";

const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
export type StudentAccount = { id: string; name: string; email: string };
type StoredAccount = StudentAccount & { passwordHash: string };
type StoredSession = { studentId: string; expiresAt: number };

export interface StudentAccountStore {
  init(): Promise<void>;
  listAccounts(): Promise<StudentAccount[]>;
  create(name: string, email: string, password: string): Promise<StudentAccount>;
  authenticate(email: string, password: string): Promise<StudentAccount | null>;
  saveSession(studentId: string, tokenHash: string, expiresAt: number): Promise<void>;
  findByToken(tokenHash: string): Promise<StudentAccount | null>;
  deleteSession(tokenHash: string): Promise<void>;
  close(): Promise<void>;
}

class MemoryStudentAccountStore implements StudentAccountStore {
  private accounts = new Map<string, StoredAccount>();
  private sessions = new Map<string, StoredSession>();
  async init() {}
  async listAccounts() { return [...this.accounts.values()].map(publicAccount); }
  async create(name: string, email: string, password: string) {
    if (this.accounts.has(email)) throw new Error("email_taken");
    const account = { id: randomUUID(), name, email, passwordHash: await hashPassword(password) };
    this.accounts.set(email, account);
    return publicAccount(account);
  }
  async authenticate(email: string, password: string) {
    const account = this.accounts.get(email);
    return account && await verifyPassword(password, account.passwordHash) ? publicAccount(account) : null;
  }
  async saveSession(studentId: string, tokenHash: string, expiresAt: number) { this.sessions.set(tokenHash, { studentId, expiresAt }); }
  async findByToken(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) return null;
    const account = [...this.accounts.values()].find(item => item.id === session.studentId);
    return account ? publicAccount(account) : null;
  }
  async deleteSession(tokenHash: string) { this.sessions.delete(tokenHash); }
  async close() {}
}

class PostgresStudentAccountStore implements StudentAccountStore {
  private pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new pg.Pool({ connectionString }); }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS student_accounts (
      id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
      password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.pool.query(`CREATE TABLE IF NOT EXISTS student_sessions (
      token_hash text PRIMARY KEY, student_id uuid NOT NULL REFERENCES student_accounts(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`);
    await this.pool.query("CREATE INDEX IF NOT EXISTS student_sessions_expires_at_idx ON student_sessions(expires_at)");
  }
  async listAccounts() {
    const result = await this.pool.query<StudentAccount>("SELECT id, name, email FROM student_accounts ORDER BY name, id");
    return result.rows;
  }
  async create(name: string, email: string, password: string) {
    const id = randomUUID();
    try {
      const result = await this.pool.query<StudentAccount>("INSERT INTO student_accounts(id, name, email, password_hash) VALUES($1, $2, $3, $4) RETURNING id, name, email", [id, name, email, await hashPassword(password)]);
      return result.rows[0]!;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("email_taken");
      throw error;
    }
  }
  async authenticate(email: string, password: string) {
    const result = await this.pool.query<StoredAccount>("SELECT id, name, email, password_hash AS \"passwordHash\" FROM student_accounts WHERE email = $1", [email]);
    const account = result.rows[0];
    return account && await verifyPassword(password, account.passwordHash) ? publicAccount(account) : null;
  }
  async saveSession(studentId: string, tokenHash: string, expiresAt: number) { await this.pool.query("INSERT INTO student_sessions(token_hash, student_id, expires_at) VALUES($1, $2, $3)", [tokenHash, studentId, new Date(expiresAt)]); }
  async findByToken(tokenHash: string) {
    const result = await this.pool.query<StudentAccount>("SELECT a.id, a.name, a.email FROM student_sessions s JOIN student_accounts a ON a.id = s.student_id WHERE s.token_hash = $1 AND s.expires_at > now()", [tokenHash]);
    return result.rows[0] ?? null;
  }
  async deleteSession(tokenHash: string) { await this.pool.query("DELETE FROM student_sessions WHERE token_hash = $1", [tokenHash]); }
  async close() { await this.pool.end(); }
}

function publicAccount(account: StoredAccount): StudentAccount { return { id: account.id, name: account.name, email: account.email }; }
export function makeStudentAccountStore(): StudentAccountStore {
  return process.env.DATABASE_URL ? new PostgresStudentAccountStore(process.env.DATABASE_URL) : new MemoryStudentAccountStore();
}
export async function issueStudentSession(store: StudentAccountStore, account: StudentAccount) {
  const token = randomBytes(32).toString("hex");
  await store.saveSession(account.id, hashToken(token), Date.now() + lifetimeMs);
  return { student: account, token };
}
