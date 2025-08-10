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
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const questionRef = useRef<GeneratedQuestion | null>(null);
  const generationInFlightRef = useRef<boolean>(false); // Avoid concurrent /continue calls
  // Debug / instrumentation
  const [debug, setDebug] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<{
    getCalls: number;
    continueCalls: number;
    lastGetAt: string | null;
    lastContinueAt: string | null;
    lastQuestionSetAt: string | null;
  }>({ getCalls: 0, continueCalls: 0, lastGetAt: null, lastContinueAt: null, lastQuestionSetAt: null });
  
  // Derived progression state
  const isTotalKnown = total > 0;
  const isLast = isTotalKnown && (idx + 1) >= total;
  const nextIndex = idx + 1;
  const nextIsReady = nextIndex < available; // next question already generated
  const canAdvance = validated && (nextIsReady || isLast);

  // Reset lock and UI state when navigating between steps
  useEffect(() => {
    questionRef.current = null;
    initializedQidRef.current = null;
    setQuestion(null);
    setAnswers([]);
    setValidated(false);
    setHasInteracted(false);
  }, [idx]);

  useEffect(() => {
    const sid = search.get("sid") || sessionStorage.getItem("oppie-session-id");
    if (!sid) {
      router.replace("/");
      return;
    }
    setSessionId(sid);

    // Optimistic: if we already have this question in sessionStorage, render it immediately
    try {
      const raw = sessionStorage.getItem("oppie-quiz");
      if (raw) {
        const arr: GeneratedQuestion[] = JSON.parse(raw);
        const pre = arr[idx];
        if (pre && !questionRef.current) {
          setQuestion(pre);
          setAnswers(Array(pre.propositions.length).fill(false));
          questionRef.current = pre;
          initializedQidRef.current = pre.id || null;
          setInitializedQid(pre.id || null);
        }
      }
    } catch {}
  }, [search, router]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    function triggerBackgroundGeneration() {
      if (generationInFlightRef.current) return; // throttle
      generationInFlightRef.current = true;
      fetch(`/api/generate/continue`, { 
        method: "POST", 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ sessionId }) 
      }).catch(() => {})
        .finally(() => { 
          generationInFlightRef.current = false; 
          setMetrics(m => ({ ...m, continueCalls: m.continueCalls + 1, lastContinueAt: new Date().toISOString() }));
        });
    }

    async function fetchQuestion() {
    const res = await fetch(`/api/generate/get?id=${sessionId}&index=${idx}`);
    setMetrics(m => ({ ...m, getCalls: m.getCalls + 1, lastGetAt: new Date().toISOString() }));
      if (cancelled) return;
      if (res.ok) {
        const j = await res.json();
        // NEVER update question once it's been set - only set it once
        if (!questionRef.current && j.question) {
          setQuestion(j.question);
          setAnswers(Array(j.question.propositions.length).fill(false));
          questionRef.current = j.question;
          initializedQidRef.current = j.question.id || null;
          setInitializedQid(j.question.id || null);
          console.log('🔒 Question set and locked forever');
      setMetrics(m => ({ ...m, lastQuestionSetAt: new Date().toISOString() }));
        }
        // If a question is already locked, never clear/replace it
        setTotal(j.total);
        setAvailable(j.available);
        setStatus(j.status);
        // persist question into local quiz store for summary later - NEVER UPDATE EXISTING
        try {
          const raw = sessionStorage.getItem("oppie-quiz");
          const arr: GeneratedQuestion[] = raw ? JSON.parse(raw) : [];
          const exists = arr.findIndex((qq) => qq.id === j.question.id);
          if (exists === -1) {
            // Only add if not already present - NEVER UPDATE
            arr.push(j.question);
            sessionStorage.setItem("oppie-quiz", JSON.stringify(arr));
          }
        } catch {}
        // kick background generation (throttled)
        if (j.status !== "completed") {
          triggerBackgroundGeneration();
        }
      } else if (res.status === 404) {
        // question not yet available: ensure background generation runs
        // Do NOT clear an already displayed question to avoid flicker
        if (!questionRef.current) {
          setQuestion(null);
        }
  triggerBackgroundGeneration();
        // ignore result; we'll poll below
      } else {
        // error, go home
        router.replace("/");
      }
    }
    fetchQuestion();
    const iv = setInterval(async () => {
    const r = await fetch(`/api/generate/get?id=${sessionId}&index=${idx}`);
    setMetrics(m => ({ ...m, getCalls: m.getCalls + 1, lastGetAt: new Date().toISOString() }));
      if (cancelled) return;
      if (r.ok) {
        const j = await r.json();
        // NEVER update question once it's been set - only set it once
        if (!questionRef.current && j.question) {
          setQuestion(j.question);
          setAnswers(Array(j.question.propositions.length).fill(false));
          questionRef.current = j.question;
          initializedQidRef.current = j.question.id || null;
          setInitializedQid(j.question.id || null);
          console.log('🔒 Question set and locked forever');
      setMetrics(m => ({ ...m, lastQuestionSetAt: new Date().toISOString() }));
        }
        // If a question is already locked, never clear/replace it
        setTotal(j.total);
        setAvailable(j.available);
        setStatus(j.status);
        if (j.status !== "completed" && j.available < j.total) {
          // keep generation moving in the background (throttled)
          triggerBackgroundGeneration();
        }
      } else if (r.status === 404) {
        // If processing, we can also client-kick background generation (defensive)
        try {
          const j = await r.json();
          if (j?.status === 'failed') {
            router.replace('/');
            return;
          }
          if (j?.status === 'processing') {
            triggerBackgroundGeneration();
          }
        } catch {}
        // keep waiting otherwise
      }
    }, 2500);
    return () => { cancelled = true; clearInterval(iv); };
  }, [sessionId, idx]);

  function toggle(i: number) {
    if (validated) return;
    setHasInteracted(true); // Mark that user has started interacting
    console.log('👆 User clicked proposition', i, '- interaction recorded');
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

  // Validation functions
  const hasAtLeastOneSelection = useMemo(() => {
    return answers.some(answer => answer === true);
  }, [answers]);

  const hasAtLeastOneTrueAnswer = useMemo(() => {
    if (!question) return true;
    return question.propositions.some(prop => prop.isTrue);
  }, [question]);

  const canValidate = useMemo(() => {
    return hasAtLeastOneSelection && hasAtLeastOneTrueAnswer;
  }, [hasAtLeastOneSelection, hasAtLeastOneTrueAnswer]);

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
        
        // Only count questions that were actually answered
        const answeredQuestions = per.filter(p => {
          const st = stored[p.id]?.answers as boolean[] | undefined;
          return st && Array.isArray(st) && st.some(answer => answer === true);
        });
        
        // Handle case where no questions were answered
        if (answeredQuestions.length === 0) {
          const summary = { 
            at: new Date().toISOString(), 
            per: [], 
            sum: 0, 
            count: 0,
            message: "Aucun QCM n'a été validé"
          };
          sessionStorage.setItem("oppie-summary", JSON.stringify(summary));
          router.push("/summary");
          return;
        }
        
        const sum = answeredQuestions.reduce((acc, p) => acc + p.score, 0);
        const summary = { at: new Date().toISOString(), per: answeredQuestions, sum, count: answeredQuestions.length };
        sessionStorage.setItem("oppie-summary", JSON.stringify(summary));
        
        // Track domain scores
        try {
          const sessionData = JSON.parse(sessionStorage.getItem("oppie-session") || "{}");
          if (sessionData.filename) {
            // This will be handled by the API to avoid client-side domain mapping
            fetch('/api/domains/track-score', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                filename: sessionData.filename,
                score: sum,
                totalQuestions: arr.length,
                answeredQuestions: answeredQuestions.length,
                averageScore: answeredQuestions.length > 0 ? sum / answeredQuestions.length : 0
              })
            }).catch(console.error);
          }
        } catch (error) {
          console.error('Error tracking domain score:', error);
        }
      } catch {}
      router.push("/summary");
    } else {
      router.push(`/quiz/${idx + 1}`);
    }
  }

  if (!sessionId) return null;

  return (
    <main className="min-h-screen px-6 py-10 mx-auto max-w-3xl">
      <div className="fixed top-3 right-3 z-50 flex flex-col items-end gap-2">
        <button onClick={() => setDebug(d => !d)} className="rounded-md bg-slate-800 border border-slate-600 text-xs px-2 py-1 text-slate-200 hover:bg-slate-700">{debug ? '❌ Debug' : '🐞 Debug'}</button>
        {debug && (
          <div className="w-[300px] max-h-[60vh] overflow-auto rounded-lg border border-slate-600 bg-slate-900/95 backdrop-blur p-3 text-[11px] text-slate-200 shadow-xl">
            <div className="font-semibold mb-1">Debug QCM</div>
            <div className="space-y-1">
              <div><span className="text-slate-400">Session:</span> {sessionId}</div>
              <div><span className="text-slate-400">Index:</span> {idx}</div>
              <div><span className="text-slate-400">Question ID:</span> {question?.id || '—'}</div>
              <div><span className="text-slate-400">InitializedQidRef:</span> {initializedQidRef.current || '—'}</div>
              <div><span className="text-slate-400">Total (target):</span> {total || '…'}</div>
              <div><span className="text-slate-400">Available (generated):</span> {available}</div>
              <div><span className="text-slate-400">Status:</span> {status}</div>
              <div><span className="text-slate-400">Validated:</span> {String(validated)}</div>
              <div><span className="text-slate-400">HasInteracted:</span> {String(hasInteracted)}</div>
              <div className="h-px bg-slate-700 my-1" />
              <div><span className="text-slate-400">Get calls:</span> {metrics.getCalls}</div>
              <div><span className="text-slate-400">Continue calls:</span> {metrics.continueCalls}</div>
              <div><span className="text-slate-400">Last GET:</span> {metrics.lastGetAt || '—'}</div>
              <div><span className="text-slate-400">Last CONTINUE:</span> {metrics.lastContinueAt || '—'}</div>
              <div><span className="text-slate-400">Last Q set:</span> {metrics.lastQuestionSetAt || '—'}</div>
              <div className="h-px bg-slate-700 my-1" />
              <div><span className="text-slate-400">CanAdvance:</span> {String(canAdvance)}</div>
              <div><span className="text-slate-400">NextIdxReady:</span> {String(idx + 1 < available)}</div>
              <div><span className="text-slate-400">IsLast:</span> {String(isLast)}</div>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">QCM {idx + 1}/{total || "…"}</h1>
        <div className="text-xs text-slate-400">{status === "completed" ? "Génération terminée" : `Génération en cours… (${available}/${total || "?"})`}</div>
      </div>

      {!question ? (
        <div className="mt-10 text-slate-400">Préparation du QCM…</div>
      ) : (
        <div className="mt-6 rounded-2xl border border-slate-700 bg-slate-900 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{question.topic}</h3>
            {(question as any).chunkHeading && (
              <div className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">
                {(question as any).chunkHeading} • {(question as any).pageRange}
              </div>
            )}
          </div>
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
            <button 
              onClick={() => setValidated(true)} 
              disabled={validated || !canValidate} 
              className={clsx(
                "rounded-xl px-3 py-1.5 text-sm", 
                validated 
                  ? "bg-slate-200 text-slate-600 cursor-not-allowed" 
                  : canValidate 
                    ? "bg-mint-600 text-white hover:bg-mint-700" 
                    : "bg-slate-600 text-slate-400 cursor-not-allowed"
              )}
            >
              {validated ? "Validé" : canValidate ? "Valider ce QCM" : "Sélectionnez au moins une réponse"}
            </button>
            {validated && (
              <div className="text-sm text-slate-300 flex-1 text-right">{`Score: ${score.score.toFixed(1)}/1 • ${score.mismatches} discordance${score.mismatches>1?"s":""}`}</div>
            )}
          </div>
          {!hasAtLeastOneTrueAnswer && (
            <div className="mt-3 rounded-xl border border-amber-600 bg-amber-900/30 p-3 text-sm text-amber-300">
              <div className="font-medium text-amber-200 mb-1">⚠️ Attention</div>
              <p>Ce QCM ne contient aucune réponse vraie. Veuillez signaler ce problème.</p>
            </div>
          )}
          {validated && question.rationale && (
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">
              <div className="font-medium text-slate-200 mb-1">Justification détaillée</div>
              <p>{question.rationale}</p>
            </div>
          )}
          {validated && (
            <div className="mt-5 flex flex-col items-end gap-2">
              {!isLast && !nextIsReady && (
                <div className="text-xs text-slate-400 animate-pulse">Préparation du QCM suivant… ({available}/{isTotalKnown ? total : '…'})</div>
              )}
              {isLast && status !== 'completed' && (
                <div className="text-xs text-slate-400 animate-pulse">Génération des derniers QCM… ({available}/{isTotalKnown ? total : '…'})</div>
              )}
              <button
                onClick={next}
                disabled={!canAdvance}
                className={clsx(
                  "rounded-xl bg-violet-600 text-white px-4 py-2",
                  !canAdvance && "opacity-50 cursor-not-allowed"
                )}
              >
                {isLast ? "Terminer la session" : "QCM suivant"}
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}


