"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Trash2, ArrowLeft, Book, Play } from "lucide-react";
import clsx from "clsx";
import { useForm } from "react-hook-form";

type DeckMeta = { id: string; name: string; createdAt: string; updatedAt: string; numCards: number };
type Card = { id: string; front: string; back: string; createdAt: string; updatedAt: string };
type Deck = { id: string; name: string; createdAt: string; updatedAt: string; cards: Card[] };

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-6 pt-10 text-slate-400">Chargement…</div>}>
      <FlashcardsClient />
    </Suspense>
  );
}

function FlashcardsClient() {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [currentDeck, setCurrentDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [studyIdx, setStudyIdx] = useState<number>(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const deckIdParam = params.get("deck");

  const { register, handleSubmit, reset } = useForm();
  const { register: registerCard, handleSubmit: handleSubmitCard, reset: resetCard } = useForm();
  const [createDeckOpen, setCreateDeckOpen] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);

  useEffect(() => {
    refreshDecks();
  }, []);

  useEffect(() => {
    if (deckIdParam) {
      fetch(`/api/flashcards?deckId=${encodeURIComponent(deckIdParam)}`)
        .then(r => r.json())
        .then((d) => setCurrentDeck(d))
        .catch(() => setCurrentDeck(null));
    } else {
      setCurrentDeck(null);
    }
  }, [deckIdParam]);

  function refreshDecks() {
    fetch("/api/flashcards")
      .then(r => r.json())
      .then((j) => setDecks(j.decks || []))
      .catch(() => setDecks([]));
  }

  function onCreateDeck(data: any) {
    const name = (data?.name || "").trim();
    if (!name) return;
    setLoading(true);
    fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "createDeck", name }) })
      .then(r => r.json())
      .then((d) => {
        reset({ name: "" });
        refreshDecks();
        router.push(`/flashcards?deck=${encodeURIComponent(d.id)}`);
      })
      .catch(() => setError("Impossible de créer le deck"))
      .finally(() => setLoading(false));
  }

  function onRenameDeck(newName: string) {
    if (!currentDeck) return;
    const name = newName.trim();
    if (!name || name === currentDeck.name) return;
    setLoading(true);
    fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "renameDeck", deckId: currentDeck.id, name }) })
      .then(r => r.json())
      .then((d) => {
        setCurrentDeck(d);
        refreshDecks();
      })
      .catch(() => setError("Impossible de renommer le deck"))
      .finally(() => setLoading(false));
  }

  function onDeleteDeck(deckId: string) {
    if (!confirm("Supprimer ce deck ?")) return;
    setLoading(true);
    fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "deleteDeck", deckId }) })
      .then(() => {
        refreshDecks();
        if (currentDeck?.id === deckId) router.push("/flashcards");
      })
      .catch(() => setError("Impossible de supprimer le deck"))
      .finally(() => setLoading(false));
  }

  function onAddCard(data: any) {
    if (!currentDeck) return;
    const front = (data?.front || "").trim();
    const back = (data?.back || "").trim();
    if (!front || !back) return;
    setLoading(true);
    fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "addCard", deckId: currentDeck.id, front, back }) })
      .then(r => r.json())
      .then((card) => {
        setCurrentDeck({ ...currentDeck, cards: [card, ...currentDeck.cards] });
        resetCard({ front: "", back: "" });
        refreshDecks();
      })
      .catch(() => setError("Impossible d'ajouter la carte"))
      .finally(() => setLoading(false));
  }

  function onRemoveCard(cardId: string) {
    if (!currentDeck) return;
    setLoading(true);
    fetch("/api/flashcards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "removeCard", deckId: currentDeck.id, cardId }) })
      .then(() => {
        setCurrentDeck({ ...currentDeck, cards: currentDeck.cards.filter(c => c.id !== cardId) });
        refreshDecks();
      })
      .catch(() => setError("Impossible de supprimer la carte"))
      .finally(() => setLoading(false));
  }

  const studyCards = useMemo(() => currentDeck?.cards || [], [currentDeck]);
  const canStudy = studyCards.length > 0;

  const beginStudy = useCallback(() => {
    if (!canStudy || !currentDeck) return;
    router.push(`/flashcards/study?deck=${encodeURIComponent(currentDeck.id)}`);
  }, [canStudy, currentDeck, router]);

  const nextCard = useCallback(() => {
    if (!canStudy) return;
    setStudyIdx((i) => (i + 1) % studyCards.length);
    setShowAnswer(false);
  }, [canStudy, studyCards.length]);

  // Keyboard shortcuts in study mode
  // keyboard shortcuts for inline quick training kept minimal; removed modal shortcuts

  return (
    <main className="min-h-screen w-full">
      <section className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1"><ArrowLeft size={16} /> Accueil</Link>
            <h1 className="text-2xl font-semibold gradient-violet">Flashcards</h1>
          </div>
        </div>

        <AllDaily />

        <div className="grid grid-cols-12 gap-5">
          {/* Left: Decks list & create */}
          <div className="col-span-12 lg:col-span-4 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 grid place-items-center rounded bg-slate-600 text-white"><Book size={16} /></div>
              <h2 className="text-lg">Vos decks</h2>
            </div>
            <div className="flex justify-end mb-3">
              <button type="button" onClick={() => setCreateDeckOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-mint-600 text-white px-3 py-2 hover:bg-mint-700 transition">
                <Plus size={16} /> Nouveau deck
              </button>
            </div>
            <div className="divide-y divide-slate-800">
              {decks.length === 0 ? (
                <p className="text-sm text-slate-400">Aucun deck pour l'instant.</p>
              ) : (
                decks.map((d) => (
                  <div key={d.id} className="py-2 flex items-center justify-between gap-2">
                    <button onClick={() => router.push(`/flashcards?deck=${encodeURIComponent(d.id)}`)} className="text-left min-w-0 flex-1">
                      <div className="truncate text-slate-200">{d.name}</div>
                      <div className="text-xs text-slate-400">{d.numCards} carte{d.numCards > 1 ? 's' : ''}</div>
                    </button>
                    <button onClick={() => onDeleteDeck(d.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={16} /></button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Current deck detail */}
          <div className="col-span-12 lg:col-span-8 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
            {!currentDeck ? (
              <p className="text-sm text-slate-400">Sélectionnez ou créez un deck pour commencer.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <input
                    defaultValue={currentDeck.name}
                    onBlur={(e) => onRenameDeck(e.target.value)}
                    className="rounded-md border border-violet-700 bg-slate-900/70 px-3 py-2 text-sm text-violet-200 shadow-[0_0_6px_rgba(139,92,246,0.3)]"
                  />
                  <button type="button" onClick={beginStudy} disabled={!canStudy} className={clsx("inline-flex items-center gap-2 rounded-md bg-emerald-600 text-white px-3 py-2 hover:bg-emerald-700 transition", !canStudy && "opacity-60 cursor-not-allowed")}> <Play size={16} /> Réviser</button>
                </div>

                {/* Daily suggestion */}
                <DailySuggestion deckId={currentDeck.id} />

                {/* Add card */}
                <div className="flex justify-end">
                  <button type="button" onClick={() => setAddCardOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-mint-600 text-white px-3 py-2 hover:bg-mint-700 transition">
                    <Plus size={16} /> Ajouter une carte
                  </button>
                </div>

                {/* Cards list */}
                <div className="grid grid-cols-1 gap-3">
                  {currentDeck.cards.length === 0 ? (
                    <p className="text-sm text-slate-400">Aucune carte dans ce deck.</p>
                  ) : (
                    currentDeck.cards.map((c) => (
                      <div key={c.id} className="rounded border border-slate-700 bg-slate-800/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-slate-200 whitespace-pre-wrap">{c.front}</div>
                            <div className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{c.back}</div>
                          </div>
                          <button onClick={() => onRemoveCard(c.id)} className="text-rose-400 hover:text-rose-300"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick training removed in favor of dedicated study page */}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Create deck modal */}
      {createDeckOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setCreateDeckOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl">
            <h3 className="text-lg mb-3">Nouveau deck</h3>
            <form onSubmit={handleSubmit(onCreateDeck)} className="space-y-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Nom du deck</span>
                <input autoFocus {...register("name")} placeholder="Ex: Endocrino — Diabète" className="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm" />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setCreateDeckOpen(false)} className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Annuler</button>
                <button className={clsx("rounded-md bg-mint-600 text-white px-3 py-2 text-sm hover:bg-mint-700 transition", loading && "opacity-60 cursor-not-allowed")}>Créer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add card modal */}
      {addCardOpen && currentDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setAddCardOpen(false)} />
          <div className="relative w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900/95 p-6 shadow-2xl">
            <h3 className="text-lg mb-3">Ajouter une carte</h3>
            <form onSubmit={handleSubmitCard(onAddCard)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Question</span>
                <textarea {...registerCard("front")} placeholder="Ex: Quelles sont les causes de ...?" className="min-h-[100px] rounded-md border border-slate-700 bg-slate-900 p-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Réponse</span>
                <textarea {...registerCard("back")} placeholder="Ex: 1) ... 2) ..." className="min-h-[100px] rounded-md border border-slate-700 bg-slate-900 p-2 text-sm" />
              </label>
              <div className="md:col-span-2 flex items-center justify-end gap-2">
                <button type="button" onClick={() => setAddCardOpen(false)} className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Annuler</button>
                <button className={clsx("rounded-md bg-mint-600 text-white px-3 py-2 text-sm hover:bg-mint-700 transition", loading && "opacity-60 cursor-not-allowed")}>
                  <Plus size={16} /> Ajouter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function DailySuggestion({ deckId }: { deckId: string }) {
  const [dueCount, setDueCount] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'getDaily', deckId, limit: 9999 }) })
      .then(r => r.json())
      .then((j) => setDueCount(Array.isArray(j?.due) ? j.due.length : 0))
      .catch(() => setDueCount(null));
  }, [deckId]);
  if (dueCount === null || dueCount === 0) return null;
  return (
    <div className="rounded-md border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">
      {dueCount} carte{dueCount > 1 ? 's' : ''} à réviser aujourd'hui
    </div>
  );
}

function AllDaily() {
  const [decks, setDecks] = useState<Array<{ deckId: string; name: string; due: any[] }> | null>(null);
  useEffect(() => {
    fetch('/api/flashcards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'getDaily', limit: 9999 }) })
      .then(r => r.json())
      .then((j) => setDecks(Array.isArray(j?.decks) ? j.decks : []))
      .catch(() => setDecks(null));
  }, []);
  if (!decks || decks.length === 0) return null;
  const total = decks.reduce((acc, d) => acc + (d.due?.length || 0), 0);
  if (total === 0) return null;
  return (
    <div className="mx-auto max-w-6xl px-6 pb-2">
      <div className="rounded-md border border-emerald-700/40 bg-emerald-900/20 p-3 text-sm text-emerald-200">
        {total} carte{total > 1 ? 's' : ''} à réviser aujourd'hui
      </div>
    </div>
  );
}


