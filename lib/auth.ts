import { randomUUID, createHash, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { SessionRecord, UserRecord } from '@/types/auth';

// --- KV helpers (mirror lib/storage.ts logic) ---
async function getKV() {
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  const mod = await import('@vercel/kv');
  return mod.kv;
}

function isVercelProd(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL
  );
}

async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const kv = await getKV();
    const value = await kv.get<any>(key);
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
      try { return JSON.parse(value) as T; } catch { return fallback; }
    }
    return value as T;
  } catch {
    return fallback;
  }
}

async function kvSetJson<T>(key: string, value: T): Promise<void> {
  const kv = await getKV();
  await kv.set(key, value as any);
}

// --- File paths for local dev fallback ---
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
// Distinct file for auth cookie sessions to avoid clashing with app sessions
const AUTH_SESSIONS_FILE = path.join(DATA_DIR, 'auth-sessions.json');

function ensureFiles() {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, '[]', 'utf8');
  if (!existsSync(AUTH_SESSIONS_FILE)) writeFileSync(AUTH_SESSIONS_FILE, '[]', 'utf8');
}

async function loadUsers(): Promise<UserRecord[]> {
  if (isVercelProd()) {
    return kvGetJson<UserRecord[]>('auth:users', []);
  }
  ensureFiles();
  try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return []; }
}

async function saveUsers(list: UserRecord[]) {
  if (isVercelProd()) {
    await kvSetJson('auth:users', list);
    return;
  }
  ensureFiles();
  writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

async function loadSessions(): Promise<SessionRecord[]> {
  if (isVercelProd()) {
    return kvGetJson<SessionRecord[]>('auth:sessions', []);
  }
  ensureFiles();
  try { return JSON.parse(readFileSync(AUTH_SESSIONS_FILE, 'utf8')); } catch { return []; }
}

async function saveSessions(list: SessionRecord[]) {
  if (isVercelProd()) {
    await kvSetJson('auth:sessions', list);
    return;
  }
  ensureFiles();
  writeFileSync(AUTH_SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

export function hashPassword(password: string) {
  const salt = randomUUID().replace(/-/g,'');
  const hash = pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
  return `pbkdf2$sha256$120000$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, algo, iterStr, salt, hash] = stored.split('$');
    if (scheme !== 'pbkdf2' || algo !== 'sha256') return false;
    const iters = parseInt(iterStr, 10);
    const test = pbkdf2Sync(password, salt, iters, 32, 'sha256').toString('hex');
    return timingSafeEqual(Buffer.from(test,'hex'), Buffer.from(hash,'hex'));
  } catch { return false; }
}

function sha256(str: string) { return createHash('sha256').update(str).digest('hex'); }

export function findUserByEmailSync(email: string): UserRecord | null {
  // For compatibility in Node-only contexts, read synchronously from file if not prod
  if (!isVercelProd()) {
    try {
      ensureFiles();
      const users: UserRecord[] = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
      return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    } catch { return null; }
  }
  // In prod, consumers should use the async wrapper
  return null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const users = await loadUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export async function createUser(email: string, password: string): Promise<UserRecord> {
  const users = await loadUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email déjà utilisé');
  const user: UserRecord = { id: randomUUID(), email, passwordHash: hashPassword(password), roles: ['user'], createdAt: new Date().toISOString(), stats: { sessionsCount: 0, averageScore: 0 } };
  users.push(user);
  await saveUsers(users);
  return user;
}

export async function createSession(user: UserRecord, userAgent?: string, ip?: string): Promise<SessionRecord> {
  const sessions = await loadSessions();
  const perUser = sessions.filter(s => s.userId === user.id).slice(-19); // keep last 19
  const others = sessions.filter(s => s.userId !== user.id);
  const token = randomUUID() + randomUUID().replace(/-/g,'');
  const rec: SessionRecord = {
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000*60*60*24*30).toISOString(),
    userAgentHash: userAgent ? sha256(userAgent) : undefined,
    ipHash: ip ? sha256(ip) : undefined,
  };
  others.push(...perUser, rec);
  await saveSessions(others);
  return rec;
}

export async function getSession(token: string, userAgent?: string, ip?: string): Promise<UserRecord | null> {
  if (!token) return null;
  const sessions = await loadSessions();
  const rec = sessions.find(s => s.token === token);
  if (!rec) return null;
  if (Date.parse(rec.expiresAt) < Date.now()) return null;
  if (rec.userAgentHash && userAgent && rec.userAgentHash !== sha256(userAgent)) return null;
  if (rec.ipHash && ip && rec.ipHash !== sha256(ip)) return null;
  const users = await loadUsers();
  const user = users.find(u => u.id === rec.userId) || null;
  return user || null;
}

export async function invalidateSession(token: string) {
  const sessions = (await loadSessions()).filter(s => s.token !== token);
  await saveSessions(sessions);
}

export async function requireAuth(req: Request): Promise<UserRecord | null> {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/oppie_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : '';
  const ua = req.headers.get('user-agent') || undefined;
  const ip = (req as any).ip || req.headers.get('x-forwarded-for')?.split(',')[0];
  return getSession(token, ua, ip || undefined);
}
