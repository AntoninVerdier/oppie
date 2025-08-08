"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GeneratedQuestion } from "@/types/qcm";
import clsx from "clsx";
import { CheckCircle2 } from "lucide-react";

type Answer = boolean; // true = user marked "Vrai"; false = "Faux"

export default function QuizPage() {
  const [quiz, setQuiz] = useState<GeneratedQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer[]>>({});
  const [validatedBy, setValidatedBy] = useState<Record<string, boolean>>({});
  const router = useRouter();

  useEffect(() => {
    const stored = sessionStorage.getItem("oppie-quiz");
    if (stored) {
      try {
        const q = JSON.parse(stored) as GeneratedQuestion[];
        setQuiz(q);
        const initial: Record<string, Answer[]> = {};
        const val: Record<string, boolean> = {};
        q.forEach((qq) => {
          initial[qq.id] = Array(qq.propositions.length).fill(false);
          val[qq.id] = false;
        });
        setAnswers(initial);
        setValidatedBy(val);
      } catch {
        // ignore
      }
    }
  }, []);

  function toggleAnswer(qid: string, idx: number) {
    // prevent edits after validation
    if (validatedBy[qid]) return;
    setAnswers((prev) => ({ ...prev, [qid]: prev[qid].map((v, i) => (i === idx ? !v : v)) }));
  }

  function computeQuestionScore(q: GeneratedQuestion): { mismatches: number; score: number } {
    const user = answers[q.id] || [];
    let mismatches = 0;
    q.propositions.forEach((p, i) => {
      const userTrue = user[i] === true;
      if (userTrue !== p.isTrue) mismatches += 1;
    });
    let score = 0;
    if (mismatches === 0) score = 1;
    else if (mismatches === 1) score = 0.5;
    else if (mismatches === 2) score = 0.2;
    else score = 0;
    return { mismatches, score };
  }

  // Persist answers and validation map for summary page
  useEffect(() => {
    if (quiz) {
      try {
        sessionStorage.setItem("oppie-answers", JSON.stringify(answers));
        sessionStorage.setItem("oppie-validated", JSON.stringify(validatedBy));
      } catch {}
    }
  }, [answers, validatedBy, quiz]);

  const allValidated = useMemo(() => {
    const ids = quiz?.map((q) => q.id) || [];
    if (ids.length === 0) return false;
    return ids.every((id) => validatedBy[id]);
  }, [validatedBy, quiz]);

  function finishSession() {
    if (!quiz) return;
    const per = quiz.map((q) => {
      const { mismatches, score } = computeQuestionScore(q);
      return { id: q.id, topic: q.topic, mismatches, score };
    });
    const sum = per.reduce((acc, p) => acc + p.score, 0);
    const count = per.length;
    const summary = {
      at: new Date().toISOString(),
      per,
      sum,
      count,
    };
    try {
      sessionStorage.setItem("oppie-summary", JSON.stringify(summary));
    } catch {}
    router.push("/summary");
  }

  const globalScore = useMemo(() => {
    if (!quiz) return null;
    let sum = 0;
    let count = 0;
    quiz.forEach((q) => {
      if (validatedBy[q.id]) {
        const { score } = computeQuestionScore(q);
        sum += score;
        count += 1;
      }
    });
    return { sum, count };
  }, [answers, validatedBy, quiz]);

  // Legacy page kept for compatibility; redirect to progressive flow if session exists
  useEffect(() => {
    const sid = sessionStorage.getItem("oppie-session-id");
    if (sid) router.replace(`/quiz/0?sid=${encodeURIComponent(sid)}`);
  }, [router]);

  if (!quiz) {
    return (
      <main className="min-h-screen grid place-items-center">
        <div className="text-slate-600">Aucun QCM trouvé. Revenez à l’accueil et générez un questionnaire.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QCM</h1>
        {globalScore && (
          <div className="rounded-full bg-slate-800 text-slate-200 px-4 py-1 text-sm">
            Score total: {globalScore.sum.toFixed(1)}/{globalScore.count}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {quiz.map((q, qIdx) => (
          <div key={q.id} className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-sm float-in">
            <h3 className="font-semibold text-slate-800">{qIdx + 1}. {q.topic}</h3>
            <ul className="mt-3 space-y-2">
              {q.propositions.map((p, i) => {
                const userTrue = answers[q.id]?.[i] === true;
                const isValidated = validatedBy[q.id];
                const isCorrect = isValidated ? userTrue === p.isTrue : undefined;
                return (
                  <li
                    key={i}
                    onClick={() => toggleAnswer(q.id, i)}
                    className={clsx(
                      "rounded-xl border p-3 select-none transition pop",
                      isValidated
                        ? (isCorrect ? "bg-emerald-50 border-emerald-200" : "bg-rose-50 border-rose-200")
                        : userTrue
                          ? "bg-mint-50 border-mint-200 cursor-pointer"
                          : "border-slate-700 bg-slate-900 cursor-pointer",
                      isValidated && "cursor-not-allowed opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400">{String.fromCharCode(65 + i)}</span>
                      <span className="text-sm flex-1">{p.statement}</span>
                      {isValidated && (
                        <span className={clsx("inline-flex items-center gap-1 text-xs", isCorrect ? "text-emerald-300" : "text-rose-300") }>
                          <CheckCircle2 size={14} /> {p.isTrue ? "Vrai" : "Faux"}
                        </span>
                      )}
                    </div>
                    {isValidated && (
                      <p className="text-xs text-slate-300 mt-2 pl-5">{p.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between">
              <button onClick={() => setValidatedBy((prev) => ({ ...prev, [q.id]: true }))} disabled={validatedBy[q.id]} className={clsx("rounded-xl px-3 py-1.5 text-sm", validatedBy[q.id] ? "bg-slate-200 text-slate-600 cursor-not-allowed" : "bg-mint-600 text-white")}>
                {validatedBy[q.id] ? "Validé" : "Valider ce QCM"}
              </button>
              {validatedBy[q.id] && (
                <div className="text-sm text-slate-300 flex-1 text-right">
                  {(() => {
                    const { mismatches, score } = computeQuestionScore(q);
                    return <>Score: {score.toFixed(1)}/1 • {mismatches} discordance{mismatches > 1 ? "s" : ""}</>;
                  })()}
                </div>
              )}
            </div>
            {validatedBy[q.id] && q.rationale && (
              <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
                <div className="font-medium text-slate-200 mb-1">Justification détaillée</div>
                <p>{q.rationale}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-3">
        <button onClick={() => setValidatedBy((prev) => Object.fromEntries(Object.keys(prev).map(k => [k, true])))} className="rounded-xl border border-slate-200 px-4 py-2">Tout valider</button>
        <button onClick={() => setValidatedBy((prev) => Object.fromEntries(Object.keys(prev).map(k => [k, false])))} className="rounded-xl border border-slate-200 px-4 py-2">Réinitialiser l’évaluation</button>
        <button onClick={finishSession} disabled={!allValidated} className={clsx("rounded-xl px-4 py-2", allValidated ? "bg-mint-600 text-white" : "bg-slate-200 text-slate-600 cursor-not-allowed")}>Terminer la session</button>
      </div>
    </main>
  );
}



