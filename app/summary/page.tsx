"use client";

import { useEffect, useMemo, useState } from "react";
import { GeneratedQuestion } from "@/types/qcm";
import Link from "next/link";

type Per = { id: string; topic: string; mismatches: number; score: number };
type Summary = { at: string; per: Per[]; sum: number; count: number };

export default function SummaryPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [quiz, setQuiz] = useState<GeneratedQuestion[] | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("oppie-summary");
      const rawQuiz = sessionStorage.getItem("oppie-quiz");
      if (raw) setSummary(JSON.parse(raw));
      if (rawQuiz) setQuiz(JSON.parse(rawQuiz));
    } catch {}
  }, []);

  const percent = useMemo(() => {
    if (!summary) return 0;
    const max = summary.count;
    return max > 0 ? Math.round((summary.sum / max) * 100) : 0;
  }, [summary]);

  if (!summary) {
    return (
      <main className="min-h-screen grid place-items-center">
        <div className="text-slate-600">Aucun résumé trouvé. <Link href="/" className="text-mint-700 underline">Retour</Link></div>
      </main>
    );
  }

  if (summary.count === 0) {
    return (
      <main className="min-h-screen px-6 py-10 mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold">Bilan de session</h1>
        <p className="text-slate-300 mt-1">{new Date(summary.at).toLocaleString()}</p>
        
        <div className="mt-6 rounded-2xl border border-amber-700 bg-amber-900/30 p-5">
          <div className="text-amber-200 font-medium mb-2">Aucun QCM validé</div>
          <p className="text-amber-300 text-sm">Vous n'avez validé aucun QCM lors de cette session.</p>
        </div>
        
        <div className="mt-8">
          <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800">Refaire une session</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold">Bilan de session</h1>
      <p className="text-slate-300 mt-1">{new Date(summary.at).toLocaleString()}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
          <div className="text-slate-400 text-sm">Score total</div>
          <div className="text-3xl font-semibold mt-1">{summary.sum.toFixed(1)}/{summary.count}</div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
          <div className="text-slate-400 text-sm">Réussite</div>
          <div className="text-3xl font-semibold mt-1">{percent}%</div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-sm">
          <div className="text-slate-400 text-sm">QCM évalués</div>
          <div className="text-3xl font-semibold mt-1">{summary.count}</div>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {summary.per.map((p, idx) => (
          <div key={p.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{idx + 1}. {p.topic}</h3>
              <div className="text-sm text-slate-300">{p.score.toFixed(1)}/1 • {p.mismatches} discordance{p.mismatches > 1 ? "s" : ""}</div>
            </div>
            {quiz && (
              <ul className="mt-3 list-disc pl-6 text-sm text-slate-300">
            {quiz.find(q => q.id === p.id)?.propositions.map((pr, i) => (
              <li key={i}>{pr.statement} — <span className="italic">{pr.explanation}</span></li>
            ))}
              </ul>
            )}
        {quiz && quiz.find(q => q.id === p.id)?.rationale && (
          <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
            <div className="font-medium text-slate-200 mb-1">Justification du QCM</div>
            <p>{quiz.find(q => q.id === p.id)?.rationale}</p>
          </div>
        )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800">Refaire une session</Link>
      </div>
    </main>
  );
}


