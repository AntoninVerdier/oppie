import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { Flashcard, FlashcardDeckSummary, FlashcardsListResponse } from '@/types/flashcard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function dataDir() {
  return path.join(process.cwd(), 'data', 'flashcards');
}

export async function GET(_req: NextRequest) {
  try {
    const dir = dataDir();
    let decks: Record<string, FlashcardDeckSummary> = {};
    try {
      const files = readdirSync(dir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          const raw = readFileSync(full, 'utf8');
            const fc: Flashcard = JSON.parse(raw);
            if (!decks[fc.deck]) {
              decks[fc.deck] = { deck: fc.deck, count: 0, lastCreatedAt: null };
            }
            decks[fc.deck].count += 1;
            const last = decks[fc.deck].lastCreatedAt;
            if (!last || last < fc.createdAt) {
              decks[fc.deck].lastCreatedAt = fc.createdAt;
            }
        } catch {}
      }
    } catch {}
    const list = Object.values(decks).sort((a,b)=> (b.lastCreatedAt||'').localeCompare(a.lastCreatedAt||''));
    const resp: FlashcardsListResponse = { decks: list, total: list.reduce((a,b)=>a+b.count,0) };
    return NextResponse.json(resp);
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'error' }, { status: 500 });
  }
}
