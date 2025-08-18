"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

type Card = { id: string; front: string; back: string };
type Deck = { id: string; name: string; cards: Card[] };

export default function StudyPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-6 pt-12 text-slate-400">Chargement…</div>}>
      <StudyClient />
    </Suspense>
  );
}

function StudyClient() {
  const params = useSearchParams();
  const router = useRouter();
  const deckId = params.get("deck");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!deckId) return;
    fetch(`/api/flashcards?deckId=${encodeURIComponent(deckId)}`)
      .then(r => r.json())
      .then((d) => setDeck({ id: d.id, name: d.name, cards: d.cards || [] }))
      .catch(() => setDeck(null));
  }, [deckId]);

  const sessionCards = useMemo(() => {
    const d = deck?.cards || [];
    const now = new Date();
    const due = d.filter((c: any) => {
      const dueAtStr = c?.srs?.dueAt || c?.updatedAt || c?.createdAt;
      const dueAt = new Date(dueAtStr);
      // If invalid date, consider due
      return !isNaN(dueAt.getTime()) ? dueAt <= now : true;
    }).sort((a: any, b: any) => {
      const da = new Date(a?.srs?.dueAt || a?.updatedAt || a?.createdAt).getTime();
      const db = new Date(b?.srs?.dueAt || b?.updatedAt || b?.createdAt).getTime();
      return da - db;
    });
    return due;
  }, [deck]);
  const canStudy = sessionCards.length > 0;

  const next = useCallback(() => {
    if (!canStudy) return;
    setIdx((i) => {
      const nextIndex = i + 1;
      if (nextIndex >= sessionCards.length) {
        setDone(true);
        return i; // keep current index
      }
      return nextIndex;
    });
    setShow(false);
  }, [canStudy, sessionCards.length]);

  function grade(quality: number) {
    if (!deck) return;
    const card = sessionCards[idx];
    fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "reviewCard", deckId: deck.id, cardId: card.id, quality })
    }).finally(() => {
      next();
    });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.push(`/flashcards?deck=${encodeURIComponent(deckId || "")}`);
      else if (e.key === "ArrowRight") next();
      else if (e.key === " " || e.key === "Enter") { e.preventDefault(); setShow((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, deckId, next]);

  return (
    <main className="min-h-screen w-full">
      <section className="mx-auto max-w-3xl px-6 pt-10">
        <div className="flex items-center justify-between mb-6">
          <div className="text-sm text-slate-400">{deck?.name || "Étude"}</div>
          <div className="text-xs text-slate-500">{canStudy ? `Carte ${idx + 1} / ${sessionCards.length}` : "Aucune carte"}</div>
        </div>

        {!done ? (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6">
              <div className="text-lg text-slate-100 whitespace-pre-wrap min-h-[100px]">
                {canStudy ? sessionCards[idx]?.front : "Aucune carte due pour ce deck."}
              </div>
              {show && (
                <div className="text-base text-slate-300 mt-4 whitespace-pre-wrap">
                  {sessionCards[idx]?.back}
                </div>
              )}
            </div>

            {canStudy && (
              <div className="flex items-center justify-between gap-2 mt-4">
                <button onClick={() => setShow((v) => !v)} className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">{show ? "Cacher" : "Voir la réponse"}</button>
                <div className="flex items-center gap-2">
                  <button onClick={() => grade(1)} className="rounded-md border border-rose-700 text-rose-200 px-3 py-1.5 text-xs hover:bg-rose-900/40">Difficile</button>
                  <button onClick={() => grade(3)} className="rounded-md border border-amber-700 text-amber-200 px-3 py-1.5 text-xs hover:bg-amber-900/40">Bien</button>
                  <button onClick={() => grade(5)} className="rounded-md border border-emerald-700 text-emerald-200 px-3 py-1.5 text-xs hover:bg-emerald-900/40">Facile</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 text-center">
            <div className="text-lg text-slate-100 mb-2">Session terminée</div>
            <div className="text-sm text-slate-400 mb-4">Toutes les cartes dues de ce deck ont été révisées.</div>
            <div className="flex items-center justify-center gap-3">
              <Link href={`/flashcards?deck=${encodeURIComponent(deckId || "")}`} className="rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Retour au deck</Link>
              <Link href="/flashcards/study/all" className="rounded-md bg-violet-600 text-white px-4 py-2 text-sm hover:bg-violet-700">Réviser les cartes du jour (tous les decks)</Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}


