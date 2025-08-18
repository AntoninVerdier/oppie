import { randomUUID, createHash, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { SessionRecord, UserRecord } from '@/types/auth';

const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
// Use a distinct file for auth cookie sessions to avoid clashing with app sessions
const AUTH_SESSIONS_FILE = path.join(DATA_DIR, 'auth-sessions.json');

function ensureFiles() {
  try { mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  if (!existsSync(USERS_FILE)) writeFileSync(USERS_FILE, '[]', 'utf8');
  if (!existsSync(AUTH_SESSIONS_FILE)) writeFileSync(AUTH_SESSIONS_FILE, '[]', 'utf8');
}

function loadUsers(): UserRecord[] { ensureFiles(); try { return JSON.parse(readFileSync(USERS_FILE, 'utf8')); } catch { return []; } }
function saveUsers(list: UserRecord[]) { ensureFiles(); writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), 'utf8'); }
function loadSessions(): SessionRecord[] { ensureFiles(); try { return JSON.parse(readFileSync(AUTH_SESSIONS_FILE, 'utf8')); } catch { return []; } }
function saveSessions(list: SessionRecord[]) { ensureFiles(); writeFileSync(AUTH_SESSIONS_FILE, JSON.stringify(list, null, 2), 'utf8'); }

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

export function findUserByEmail(email: string) {
  const users = loadUsers();
  return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

export function createUser(email: string, password: string): UserRecord {
  const users = loadUsers();
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('Email déjà utilisé');
  const user: UserRecord = { id: randomUUID(), email, passwordHash: hashPassword(password), roles: ['user'], createdAt: new Date().toISOString(), stats: { sessionsCount: 0, averageScore: 0 } };
  users.push(user); saveUsers(users); return user;
}

export function createSession(user: UserRecord, userAgent?: string, ip?: string): SessionRecord {
  const sessions = loadSessions();
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
  others.push(...perUser, rec); saveSessions(others);
  return rec;
}

export function getSession(token: string, userAgent?: string, ip?: string): UserRecord | null {
  if (!token) return null;
  const sessions = loadSessions();
  const rec = sessions.find(s => s.token === token);
  if (!rec) return null;
  if (Date.parse(rec.expiresAt) < Date.now()) return null;
  if (rec.userAgentHash && userAgent && rec.userAgentHash !== sha256(userAgent)) return null;
  if (rec.ipHash && ip && rec.ipHash !== sha256(ip)) return null;
  const user = loadUsers().find(u => u.id === rec.userId) || null;
  return user || null;
}

export function invalidateSession(token: string) {
  const sessions = loadSessions().filter(s => s.token !== token);
  saveSessions(sessions);
}

export function requireAuth(req: Request): UserRecord | null {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(/oppie_session=([^;]+)/);
  const token = match ? decodeURIComponent(match[1]) : '';
  const ua = req.headers.get('user-agent') || undefined;
  const ip = (req as any).ip || req.headers.get('x-forwarded-for')?.split(',')[0];
  return getSession(token, ua, ip || undefined);
}
