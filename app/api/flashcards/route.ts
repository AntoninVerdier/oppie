import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { FlashcardDeck, FlashcardDeckMeta, Flashcard } from "@/types/flashcards";
import {
  loadFlashcardDecksMeta,
  saveFlashcardDecksMeta,
  readFlashcardDeck,
  writeFlashcardDeck
} from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/flashcards?deckId=... -> deck details, otherwise list meta
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const deckId = searchParams.get("deckId");
    if (deckId) {
      const deck = await readFlashcardDeck(deckId);
      if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      return NextResponse.json(deck);
    }
    const list = await loadFlashcardDecksMeta();
    return NextResponse.json({ decks: list });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/flashcards -> create deck, add/remove card, update deck name, delete deck
// Actions by "op" field
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const op = body?.op as string;

    if (op === "createDeck") {
      const name = (body?.name as string || "").trim();
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      const now = new Date().toISOString();
      const deck: FlashcardDeck = { id: randomUUID(), name, createdAt: now, updatedAt: now, cards: [] };
      await writeFlashcardDeck(deck);
      const list = await loadFlashcardDecksMeta();
      const meta: FlashcardDeckMeta = { id: deck.id, name: deck.name, createdAt: deck.createdAt, updatedAt: deck.updatedAt, numCards: 0 };
      await saveFlashcardDecksMeta([meta, ...list.filter(d => d.id !== deck.id)]);
      return NextResponse.json(deck);
    }

    if (op === "renameDeck") {
      const deckId = body?.deckId as string;
      const name = (body?.name as string || "").trim();
      if (!deckId || !name) return NextResponse.json({ error: "deckId and name are required" }, { status: 400 });
      const deck = await readFlashcardDeck(deckId);
      if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      deck.name = name;
      deck.updatedAt = new Date().toISOString();
      await writeFlashcardDeck(deck);
      const list = await loadFlashcardDecksMeta();
      const updated = list.map(d => d.id === deck.id ? { ...d, name: deck.name, updatedAt: deck.updatedAt } : d);
      await saveFlashcardDecksMeta(updated);
      return NextResponse.json(deck);
    }

    if (op === "deleteDeck") {
      const deckId = body?.deckId as string;
      if (!deckId) return NextResponse.json({ error: "deckId is required" }, { status: 400 });
      // We do not physically delete deck file in dev; we mark meta removal so it's hidden
      const list = await loadFlashcardDecksMeta();
      await saveFlashcardDecksMeta(list.filter(d => d.id !== deckId));
      return NextResponse.json({ ok: true });
    }

    if (op === "addCard") {
      const deckId = body?.deckId as string;
      const front = (body?.front as string || "").trim();
      const back = (body?.back as string || "").trim();
      if (!deckId || !front || !back) return NextResponse.json({ error: "deckId, front, back required" }, { status: 400 });
      const deck = await readFlashcardDeck(deckId);
      if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      const now = new Date().toISOString();
      const card: Flashcard = {
        id: randomUUID(),
        front,
        back,
        createdAt: now,
        updatedAt: now,
        srs: {
          repetition: 0,
          intervalDays: 0,
          easeFactor: 2.5,
          dueAt: now,
          lapses: 0,
        },
      };
      deck.cards.unshift(card);
      deck.updatedAt = now;
      await writeFlashcardDeck(deck);
      const list = await loadFlashcardDecksMeta();
      const updated = list.map(d => d.id === deck.id ? { ...d, updatedAt: now, numCards: deck.cards.length } : d);
      await saveFlashcardDecksMeta(updated);
      return NextResponse.json(card);
    }
    if (op === "reviewCard") {
      const deckId = body?.deckId as string;
      const cardId = body?.cardId as string;
      const quality = Math.max(0, Math.min(5, Number(body?.quality ?? 0)));
      if (!deckId || !cardId) return NextResponse.json({ error: "deckId, cardId required" }, { status: 400 });
      const deck = await readFlashcardDeck(deckId);
      if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      const card = deck.cards.find(c => c.id === cardId);
      if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
      const now = new Date();
      // Initialize SRS if missing
      if (!card.srs) {
        card.srs = { repetition: 0, intervalDays: 0, easeFactor: 2.5, dueAt: now.toISOString(), lapses: 0 };
      }
      // SM-2 like
      let { repetition, intervalDays, easeFactor } = card.srs;
      if (quality >= 3) {
        if (repetition === 0) intervalDays = 1;
        else if (repetition === 1) intervalDays = 6;
        else intervalDays = Math.round(intervalDays * easeFactor);
        repetition += 1;
        easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        if (easeFactor < 1.3) easeFactor = 1.3;
      } else {
        repetition = 0;
        intervalDays = 1;
        easeFactor = Math.max(1.3, easeFactor - 0.2);
        card.srs.lapses += 1;
      }
      const due = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
      card.srs.repetition = repetition;
      card.srs.intervalDays = intervalDays;
      card.srs.easeFactor = easeFactor;
      card.srs.dueAt = due.toISOString();
      card.updatedAt = now.toISOString();
      await writeFlashcardDeck(deck);
      return NextResponse.json({ ok: true, nextDueAt: card.srs.dueAt, repetition, intervalDays, easeFactor });
    }

    if (op === "getDaily") {
      const deckId = body?.deckId as string | undefined;
      const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 40)));
      const now = new Date();
      function isDue(c: Flashcard) {
        const dueAt = c.srs?.dueAt ? new Date(c.srs.dueAt) : now;
        return dueAt <= now;
      }
      if (deckId) {
        const deck = await readFlashcardDeck(deckId);
        if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
        const due = deck.cards.filter(isDue).slice(0, limit);
        return NextResponse.json({ deckId, due });
      } else {
        const metas = await loadFlashcardDecksMeta();
        const result: Array<{ deckId: string; name: string; due: Flashcard[] }> = [];
        for (const m of metas) {
          const d = await readFlashcardDeck(m.id);
          if (!d) continue;
          const due = d.cards.filter(isDue).slice(0, limit);
          if (due.length > 0) result.push({ deckId: d.id, name: d.name, due });
        }
        return NextResponse.json({ decks: result });
      }
    }

    if (op === "removeCard") {
      const deckId = body?.deckId as string;
      const cardId = body?.cardId as string;
      if (!deckId || !cardId) return NextResponse.json({ error: "deckId, cardId required" }, { status: 400 });
      const deck = await readFlashcardDeck(deckId);
      if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
      const before = deck.cards.length;
      deck.cards = deck.cards.filter(c => c.id !== cardId);
      deck.updatedAt = new Date().toISOString();
      if (deck.cards.length === before) return NextResponse.json({ error: "Card not found" }, { status: 404 });
      await writeFlashcardDeck(deck);
      const list = await loadFlashcardDecksMeta();
      const updated = list.map(d => d.id === deck.id ? { ...d, updatedAt: deck.updatedAt, numCards: deck.cards.length } : d);
      await saveFlashcardDecksMeta(updated);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


