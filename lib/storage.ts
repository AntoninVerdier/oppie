import fs from "fs";
import path from "path";
import { FlashcardDeck, FlashcardDeckMeta } from "@/types/flashcards";

// Lazy-load @vercel/kv after ensuring env var compatibility with Marketplace (Upstash) names
async function getKV() {
  // If Vercel Marketplace injected Upstash vars, alias them for @vercel/kv
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  const mod = await import("@vercel/kv");
  return mod.kv;
}

// Generic JSON helpers for KV (handle both raw JSON objects and stringified values)
async function kvGetJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const kv = await getKV();
    const value = await kv.get<any>(key);
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    }
    return value as T;
  } catch {
    return fallback;
  }
}

async function kvSetJson<T>(key: string, value: T): Promise<void> {
  const kv = await getKV();
  // Store as structured JSON; the client will return the same shape on get
  await kv.set(key, value as any);
}

function isVercelProd(): boolean {
  return Boolean(
    process.env.VERCEL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL
  );
}

// ----- Sessions storage -----
export type SessionRecord = any;

export async function loadSessions(): Promise<any[]> {
  if (isVercelProd()) {
    return kvGetJson<any[]>("sessions:list", []);
  }
  try {
    const sessionsPath = path.join(process.cwd(), "data", "sessions.json");
    const raw = fs.readFileSync(sessionsPath, "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveSessions(list: any[]): Promise<void> {
  if (isVercelProd()) {
    await kvSetJson("sessions:list", list);
    return;
  }
  const sessionsPath = path.join(process.cwd(), "data", "sessions.json");
  fs.writeFileSync(sessionsPath, JSON.stringify(list, null, 2));
}

export async function readSessionFile(sessionId: string): Promise<SessionRecord | null> {
  if (isVercelProd()) {
    return kvGetJson<SessionRecord | null>(`session:${sessionId}`, null);
  }
  try {
    const filePath = path.join(process.cwd(), "data", `session-${sessionId}.json`);
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeSessionFile(sessionId: string, data: SessionRecord): Promise<void> {
  if (isVercelProd()) {
    await kvSetJson(`session:${sessionId}`, data);
    return;
  }
  const filePath = path.join(process.cwd(), "data", `session-${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ----- Domain scores storage -----
export type DomainScores = { scores: any[]; lastUpdated: string | null };

export async function loadDomainScoresKV(): Promise<DomainScores> {
  if (isVercelProd()) {
    return kvGetJson<DomainScores>("domains:scores", { scores: [], lastUpdated: null });
  }
  // Fallback to file in dev
  try {
    const scoresPath = path.join(process.cwd(), "data", "domain-scores.json");
    const raw = fs.readFileSync(scoresPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { scores: [], lastUpdated: null };
  }
}

export async function saveDomainScoresKV(scores: DomainScores): Promise<void> {
  const toSave = { ...scores, lastUpdated: new Date().toISOString() };
  if (isVercelProd()) {
    await kvSetJson("domains:scores", toSave);
    return;
  }
  const scoresPath = path.join(process.cwd(), "data", "domain-scores.json");
  fs.writeFileSync(scoresPath, JSON.stringify(toSave, null, 2));
}

// ----- Flashcards storage -----
const FLASHCARDS_LIST_KEY = "flashcards:decks:list";

export async function loadFlashcardDecksMeta(): Promise<FlashcardDeckMeta[]> {
  if (isVercelProd()) {
    return kvGetJson<FlashcardDeckMeta[]>(FLASHCARDS_LIST_KEY, []);
  }
  try {
    const p = path.join(process.cwd(), "data", "flashcards-decks.json");
    const raw = fs.readFileSync(p, "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function saveFlashcardDecksMeta(list: FlashcardDeckMeta[]): Promise<void> {
  if (isVercelProd()) {
    await kvSetJson(FLASHCARDS_LIST_KEY, list);
    return;
  }
  const p = path.join(process.cwd(), "data", "flashcards-decks.json");
  fs.writeFileSync(p, JSON.stringify(list, null, 2));
}

export async function readFlashcardDeck(deckId: string): Promise<FlashcardDeck | null> {
  if (isVercelProd()) {
    return kvGetJson<FlashcardDeck | null>(`flashcards:deck:${deckId}`, null);
  }
  try {
    const p = path.join(process.cwd(), "data", `flashcards-deck-${deckId}.json`);
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeFlashcardDeck(deck: FlashcardDeck): Promise<void> {
  if (isVercelProd()) {
    await kvSetJson(`flashcards:deck:${deck.id}`, deck);
    // Also ensure meta entry updated separately by API
    return;
  }
  const p = path.join(process.cwd(), "data", `flashcards-deck-${deck.id}.json`);
  fs.writeFileSync(p, JSON.stringify(deck, null, 2));
}


