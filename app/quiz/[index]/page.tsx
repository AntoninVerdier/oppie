"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { GeneratedQuestion } from "@/types/qcm";
import clsx from "clsx";

type Answer = boolean;

export default function QuizStepPage() {
  const params = useParams();
  const router = useRouter();
  const search = useSearchParams();
  const idx = parseInt(String(params?.index ?? "0"), 10) || 0;
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<GeneratedQuestion | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [available, setAvailable] = useState<number>(0);
  const [status, setStatus] = useState<string>("processing");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [validated, setValidated] = useState<boolean>(false);
  const [initializedQid, setInitializedQid] = useState<string | null>(null);
  const initializedQidRef = useRef<string | null>(null);

  useEffect(() => {
    const sid = search.get("sid") || sessionStorage.getItem("oppie-session-id");
    if (!sid) {
      router.replace("/");
      return;
    }
    setSessionId(sid);
  }, [search, router]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    async function fetchQuestion() {
      const res = await fetch(`/api/generate/get?id=${sessionId}&index=${idx}`);
      if (cancelled) return;
      if (res.ok) {
        const j = await res.json();
        setQuestion(j.question);
        setTotal(j.total);
        setAvailable(j.available);
        setStatus(j.status);
        if (j.question?.id && j.question.id !== initializedQidRef.current) {
          setAnswers(Array(j.question.propositions.length).fill(false));
          setInitializedQid(j.question.id);
          initializedQidRef.current = j.question.id;
          setValidated(false);
        }
        // persist/merge question into local quiz store for summary later
        try {
          const raw = sessionStorage.getItem("oppie-quiz");
          const arr: GeneratedQuestion[] = raw ? JSON.parse(raw) : [];
          const exists = arr.findIndex((qq) => qq.id === j.question.id);
          if (exists >= 0) arr[exists] = j.question; else arr.push(j.question);
          sessionStorage.setItem("oppie-quiz", JSON.stringify(arr));
        } catch {}
        // kick background generation
        if (j.status !== "completed") {
          fetch(`/api/generate/continue`, { method: "POST", body: JSON.stringify({ sessionId }) }).catch(() => {});
        }
      } else if (res.status === 404) {
        // question not yet available: ensure background generation runs
        setQuestion(null);
        const cont = await fetch(`/api/generate/continue`, { method: "POST", body: JSON.stringify({ sessionId }) });
        // ignore result; we'll poll below
      } else {
        // error, go home
        router.replace("/");
      }
    }
    fetchQuestion();
    const iv = setInterval(async () => {
      const r = await fetch(`/api/generate/get?id=${sessionId}&index=${idx}`);
      if (cancelled) return;
      if (r.ok) {
        const j = await r.json();
        setQuestion(j.question);
        setTotal(j.total);
        setAvailable(j.available);
        setStatus(j.status);
        if (j.question?.id && j.question.id !== initializedQidRef.current) {
          setAnswers(Array(j.question.propositions.length).fill(false));
          setInitializedQid(j.question.id);
          initializedQidRef.current = j.question.id;
          setValidated(false);
        }
        if (j.status !== "completed" && j.available < j.total) {
          // keep generation moving in the background
          fetch(`/api/generate/continue`, { method: "POST", body: JSON.stringify({ sessionId }) }).catch(() => {});
        }
      } else if (r.status === 404) {
        // keep waiting
      }
    }, 2500);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sessionId, idx]);

  function toggle(i: number) {
    if (validated) return;
    setAnswers((prev) => prev.map((v, k) => (k === i ? !v : v)));
  }

  const score = useMemo(() => {
    if (!question) return { mismatches: 0, score: 0 };
    let mismatches = 0;
    question.propositions.forEach((p, i) => {
      const userTrue = answers[i] === true;
      if (userTrue !== p.isTrue) mismatches += 1;
    });
    let s = 0;
    if (mismatches === 0) s = 1; else if (mismatches === 1) s = 0.5; else if (mismatches === 2) s = 0.2; else s = 0;
    return { mismatches, score: s };
  }, [answers, question]);

  function next() {
    if (!question) return;
    // persist for summary
    const stored = JSON.parse(sessionStorage.getItem("oppie-steps") || "{}");
    stored[question.id] = { answers, validated: true, topic: question.topic };
    sessionStorage.setItem("oppie-steps", JSON.stringify(stored));
    if (idx + 1 >= total) {
      // build overall summary
      try {
        const quizRaw = sessionStorage.getItem("oppie-quiz");
        const arr: GeneratedQuestion[] = quizRaw ? JSON.parse(quizRaw) : [];
        const per = arr.map((q, i) => {
          const st = stored[q.id]?.answers as boolean[] | undefined;
          let mismatches = 0;
          if (st && Array.isArray(st)) {
            q.propositions.forEach((p, idx2) => {
              const userTrue = st[idx2] === true;
              if (userTrue !== p.isTrue) mismatches += 1;
            });
          } else {
            mismatches = q.propositions.length; // unanswered => count all mismatches
          }
          let s = 0;
          if (mismatches === 0) s = 1; else if (mismatches === 1) s = 0.5; else if (mismatches === 2) s = 0.2; else s = 0;
          return { id: q.id, topic: q.topic, mismatches, score: s };
        });
        const sum = per.reduce((acc, p) => acc + p.score, 0);
        const summary = { at: new Date().toISOString(), per, sum, count: per.length };
        sessionStorage.setItem("oppie-summary", JSON.stringify(summary));
      } catch {}
      router.push("/summary");
    } else {
      router.push(`/quiz/${idx + 1}`);
    }
  }

  if (!sessionId) return null;

  return (
    <main className="min-h-screen px-6 py-10 mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QCM {idx + 1}/{total || "…"}</h1>
        <div className="text-xs text-slate-400">{status === "completed" ? "Génération terminée" : `Génération en cours… (${available}/${total || "?"})`}</div>
      </div>

      {!question ? (
        <div className="mt-10 text-slate-400">Préparation du QCM…</div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <h3 className="font-semibold">{question.topic}</h3>
          <ul className="mt-3 space-y-2">
            {question.propositions.map((p, i) => {
              const userTrue = answers[i] === true;
              const isValidated = validated;
              const truth = p.isTrue;
              const isHitTrue = isValidated && truth && userTrue;
              const isMissTrue = isValidated && truth && !userTrue;
              const isFalsePositive = isValidated && !truth && userTrue;
              const isTrueNegative = isValidated && !truth && !userTrue;
              const statusLabel = isHitTrue
                ? "Vrai — bien répondu"
                : isMissTrue
                  ? "Vrai — non sélectionné"
                  : isFalsePositive
                    ? "Faux — sélectionné à tort"
                    : "";
              const statusClass = isHitTrue
                ? "text-emerald-700"
                : isMissTrue
                  ? "text-amber-700"
                  : isFalsePositive
                    ? "text-rose-700"
                    : "";
              return (
                <li
                  key={i}
                  onClick={() => toggle(i)}
                  className={clsx(
                    "rounded-xl border p-3 select-none transition",
                    isValidated
                      ? (
                          isHitTrue
                            ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                            : isMissTrue
                              ? "bg-amber-100 border-amber-300 text-amber-900"
                              : isFalsePositive
                                ? "bg-rose-100 border-rose-300 text-rose-900"
                                : "border-slate-700 bg-slate-900 text-slate-200"
                        )
                      : userTrue
                        ? "bg-mint-50 border-mint-200 text-violet-900 cursor-pointer"
                        : "border-slate-700 bg-slate-900 cursor-pointer text-slate-200",
                    isValidated && "cursor-not-allowed"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-400">{String.fromCharCode(65 + i)}</span>
                    <span className="text-sm flex-1">{p.statement}</span>
                    {isValidated && statusLabel && (
                      <span className={clsx("inline-flex items-center gap-1 text-xs", statusClass)}>
                        {statusLabel}
                      </span>
                    )}
                  </div>
                  {isValidated && (
                    <p className={clsx("text-xs mt-2 pl-5", isHitTrue ? "text-emerald-900" : isMissTrue ? "text-amber-900" : isFalsePositive ? "text-rose-900" : "text-slate-300")}>{p.explanation}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <button onClick={() => setValidated(true)} disabled={validated} className={clsx("rounded-xl px-3 py-1.5 text-sm", validated ? "bg-slate-200 text-slate-600 cursor-not-allowed" : "bg-mint-600 text-white")}>{validated ? "Validé" : "Valider ce QCM"}</button>
            {validated && (
              <div className="text-sm text-slate-300 flex-1 text-right">{`Score: ${score.score.toFixed(1)}/1 • ${score.mismatches} discordance${score.mismatches>1?"s":""}`}</div>
            )}
          </div>
          {validated && question.rationale && (
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
              <div className="font-medium text-slate-200 mb-1">Justification détaillée</div>
              <p>{question.rationale}</p>
            </div>
          )}
          {validated && (
            <div className="mt-5 flex justify-end">
              <button onClick={next} className="rounded-xl bg-violet-600 text-white px-4 py-2">{idx + 1 >= (total || 0) ? "Terminer la session" : "QCM suivant"}</button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}


