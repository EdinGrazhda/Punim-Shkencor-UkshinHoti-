import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const lifetimeMs = 30 * 24 * 60 * 60 * 1000;
export type AccountRole = "teacher" | "admin";
export type Teacher = { id: string; name: string; email: string; role: AccountRole; mustChangePassword: boolean };
export type TeacherListing = Teacher & { createdAt: string };
type StoredTeacher = Teacher & { passwordHash: string; createdAt: string };
type StoredSession = { teacherId: string; expiresAt: number };

export interface TeacherStore {
  init(): Promise<void>;
  findByEmail(email: string): Promise<StoredTeacher | null>;
  create(name: string, email: string, passwordHash: string, role: AccountRole, mustChangePassword?: boolean): Promise<Teacher>;
  listTeachers(): Promise<TeacherListing[]>;
  updateTeacher(teacherId: string, name: string, email: string, passwordHash?: string): Promise<Teacher>;
  deleteTeacher(teacherId: string): Promise<void>;
  updatePassword(teacherId: string, passwordHash: string): Promise<void>;
  saveSession(teacherId: string, tokenHash: string, expiresAt: number): Promise<void>;
  findByToken(tokenHash: string): Promise<Teacher | null>;
  deleteSession(tokenHash: string): Promise<void>;
  close(): Promise<void>;
}

class MemoryTeacherStore implements TeacherStore {
  private teachers = new Map<string, StoredTeacher>();
  private sessions = new Map<string, StoredSession>();
  async init() {}
  async findByEmail(email: string) { return this.teachers.get(email) ?? null; }
  async create(name: string, email: string, passwordHash: string, role: AccountRole, mustChangePassword = role === "teacher") {
    if (this.teachers.has(email)) throw new Error("email_taken");
    const teacher = { id: randomUUID(), name, email, passwordHash, role, mustChangePassword, createdAt: new Date().toISOString() };
    this.teachers.set(email, teacher);
    return publicTeacher(teacher);
  }
  async listTeachers() { return [...this.teachers.values()].filter(teacher => teacher.role === "teacher").map(({ id, name, email, role, mustChangePassword, createdAt }) => ({ id, name, email, role, mustChangePassword, createdAt })); }
  async updateTeacher(teacherId: string, name: string, email: string, passwordHash?: string) {
    const current = [...this.teachers.values()].find(item => item.id === teacherId);
    if (!current) throw new Error("teacher_not_found");
    const existing = this.teachers.get(email);
    if (existing && existing.id !== teacherId) throw new Error("email_taken");
    this.teachers.delete(current.email);
    current.name = name; current.email = email;
    if (passwordHash) { current.passwordHash = passwordHash; current.mustChangePassword = false; for (const [tokenHash, session] of this.sessions) if (session.teacherId === teacherId) this.sessions.delete(tokenHash); }
    this.teachers.set(email, current);
    return publicTeacher(current);
  }
  async deleteTeacher(teacherId: string) {
    const current = [...this.teachers.values()].find(item => item.id === teacherId);
    if (!current) throw new Error("teacher_not_found");
    this.teachers.delete(current.email);
    for (const [tokenHash, session] of this.sessions) if (session.teacherId === teacherId) this.sessions.delete(tokenHash);
  }
  async updatePassword(teacherId: string, passwordHash: string) {
    const teacher = [...this.teachers.values()].find(item => item.id === teacherId);
    if (!teacher) throw new Error("teacher_not_found");
    teacher.passwordHash = passwordHash;
    teacher.mustChangePassword = false;
    for (const [tokenHash, session] of this.sessions) if (session.teacherId === teacherId) this.sessions.delete(tokenHash);
  }
  async saveSession(teacherId: string, tokenHash: string, expiresAt: number) { this.sessions.set(tokenHash, { teacherId, expiresAt }); }
  async findByToken(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session || session.expiresAt <= Date.now()) return null;
    const teacher = [...this.teachers.values()].find(t => t.id === session.teacherId);
    return teacher ? publicTeacher(teacher) : null;
  }
  async deleteSession(tokenHash: string) { this.sessions.delete(tokenHash); }
  async close() {}
}

class PostgresTeacherStore implements TeacherStore {
  private pool: pg.Pool;
  constructor(connectionString: string) { this.pool = new pg.Pool({ connectionString }); }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS teachers (
      id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
      password_hash text NOT NULL, role text NOT NULL DEFAULT 'teacher',
      must_change_password boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.pool.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'teacher'");
    await this.pool.query("ALTER TABLE teachers ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false");
    await this.pool.query(`CREATE TABLE IF NOT EXISTS teacher_sessions (
      token_hash text PRIMARY KEY, teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    )`);
    await this.pool.query("CREATE INDEX IF NOT EXISTS teacher_sessions_expires_at_idx ON teacher_sessions(expires_at)");
  }
  async findByEmail(email: string) {
    const result = await this.pool.query<StoredTeacher>("SELECT id, name, email, role, must_change_password AS \"mustChangePassword\", password_hash AS \"passwordHash\", created_at::text AS \"createdAt\" FROM teachers WHERE email = $1", [email]);
    return result.rows[0] ?? null;
  }
  async create(name: string, email: string, passwordHash: string, role: AccountRole, mustChangePassword = role === "teacher") {
    try {
      const result = await this.pool.query<Teacher>("INSERT INTO teachers(id, name, email, password_hash, role, must_change_password) VALUES($1, $2, $3, $4, $5, $6) RETURNING id, name, email, role, must_change_password AS \"mustChangePassword\"", [randomUUID(), name, email, passwordHash, role, mustChangePassword]);
      return result.rows[0]!;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("email_taken");
      throw error;
    }
  }
  async listTeachers() {
    const result = await this.pool.query<TeacherListing>("SELECT id, name, email, role, must_change_password AS \"mustChangePassword\", created_at::text AS \"createdAt\" FROM teachers WHERE role = 'teacher' ORDER BY created_at DESC");
    return result.rows;
  }
  async updateTeacher(teacherId: string, name: string, email: string, passwordHash?: string) {
    try {
      const result = await this.pool.query<Teacher>("UPDATE teachers SET name = $1, email = $2, password_hash = COALESCE($3, password_hash), must_change_password = CASE WHEN $3 IS NULL THEN must_change_password ELSE false END WHERE id = $4 AND role = 'teacher' RETURNING id, name, email, role, must_change_password AS \"mustChangePassword\"", [name, email, passwordHash ?? null, teacherId]);
      if (!result.rows[0]) throw new Error("teacher_not_found");
      if (passwordHash) await this.pool.query("DELETE FROM teacher_sessions WHERE teacher_id = $1", [teacherId]);
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new Error("email_taken");
      throw error;
    }
  }
  async deleteTeacher(teacherId: string) {
    const result = await this.pool.query("DELETE FROM teachers WHERE id = $1 AND role = 'teacher'", [teacherId]);
    if (!result.rowCount) throw new Error("teacher_not_found");
  }
  async updatePassword(teacherId: string, passwordHash: string) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE teachers SET password_hash = $1, must_change_password = false WHERE id = $2", [passwordHash, teacherId]);
      await client.query("DELETE FROM teacher_sessions WHERE teacher_id = $1", [teacherId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  async saveSession(teacherId: string, tokenHash: string, expiresAt: number) {
    await this.pool.query("INSERT INTO teacher_sessions(token_hash, teacher_id, expires_at) VALUES($1, $2, $3)", [tokenHash, teacherId, new Date(expiresAt)]);
  }
  async findByToken(tokenHash: string) {
    const result = await this.pool.query<Teacher>("SELECT t.id, t.name, t.email, t.role, t.must_change_password AS \"mustChangePassword\" FROM teacher_sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.token_hash = $1 AND s.expires_at > now()", [tokenHash]);
    return result.rows[0] ?? null;
  }
  async deleteSession(tokenHash: string) { await this.pool.query("DELETE FROM teacher_sessions WHERE token_hash = $1", [tokenHash]); }
  async close() { await this.pool.end(); }
}

function publicTeacher(teacher: StoredTeacher): Teacher { return { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role, mustChangePassword: teacher.mustChangePassword }; }
export function makeTeacherStore(): TeacherStore { return process.env.DATABASE_URL ? new PostgresTeacherStore(process.env.DATABASE_URL) : new MemoryTeacherStore(); }
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const digest = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${digest.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function issueTeacherSession(store: TeacherStore, teacher: Teacher) {
  const token = randomBytes(32).toString("hex");
  await store.saveSession(teacher.id, hashToken(token), Date.now() + lifetimeMs);
  return { teacher, token };
}
