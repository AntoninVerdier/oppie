"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type DueDeck = { deckId: string; name: string; due: Array<{ id: string; front: string; back: string }> };

export default function StudyAllPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-6 pt-12 text-slate-400">Chargement…</div>}>
      <StudyAllClient />
    </Suspense>
  );
}

function StudyAllClient() {
  const [decks, setDecks] = useState<DueDeck[] | null>(null);

  useEffect(() => {
    fetch('/api/flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'getDaily', limit: 9999 }) })
      .then(r => r.json())
      .then((j) => setDecks(Array.isArray(j?.decks) ? j.decks : []))
      .catch(() => setDecks([]));
  }, []);

  const total = useMemo(() => (decks || []).reduce((acc, d) => acc + (d.due?.length || 0), 0), [decks]);

  return (
    <main className="min-h-screen w-full">
      <section className="mx-auto max-w-5xl px-6 pt-10">
        <div className="flex items-center justify-between mb-6">
          <div className="text-lg font-semibold">Révisions du jour</div>
          <Link href="/flashcards" className="text-slate-400 hover:text-slate-200">Retour</Link>
        </div>

        {(!decks || decks.length === 0 || total === 0) ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-6 text-center text-slate-300">
            Aucune carte due aujourd'hui.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {decks!.map((d) => (
              <div key={d.deckId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-slate-200 font-medium truncate">{d.name}</div>
                  <Link href={`/flashcards/study?deck=${encodeURIComponent(d.deckId)}`} className="rounded-md bg-violet-600 text-white px-3 py-1.5 text-xs hover:bg-violet-700">Réviser</Link>
                </div>
                <div className="text-xs text-slate-400">{d.due.length} carte{d.due.length > 1 ? 's' : ''} à revoir</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}


