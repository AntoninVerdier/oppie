"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, FileText, Wand2, ChevronDown, Search, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import clsx from "clsx";

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [domainStats, setDomainStats] = useState<any[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const { register, handleSubmit, setValue, watch } = useForm();
  const tone = watch("tone");
  const numQuestions = watch("numQuestions");
  const filename = watch("filename");
  const router = useRouter();
  const [fileResults, setFileResults] = useState<{ name: string; size: number }[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileQuery, setFileQuery] = useState<string>("");

  function parseFilename(name: string | null): { item: string; title: string } | null {
    if (!name) return null;
    const withoutExt = name.replace(/\.pdf$/i, "");
    const parts = withoutExt.split("_");
    if (parts.length === 0) return null;
    const rawItem = parts[0] || "";
    const itemNumberMatch = rawItem.match(/\d+/);
    const item = itemNumberMatch ? itemNumberMatch[0] : rawItem;
    const rawTitle = parts.slice(1).join(" ") || rawItem;
    const cleaned = rawTitle.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    const words = cleaned.split(" ");
    const title = words
      .map((w) => (w.length === 0 ? "" : w.charAt(0).toLocaleUpperCase("fr-FR") + w.slice(1).toLocaleLowerCase("fr-FR")))
      .join(" ")
      .normalize("NFC");
    return { item, title };
  }

  function getDisplayName(name: string): string {
    return name.replace(/\.pdf$/i, "").replace(/_/g, " ").normalize("NFC");
  }

  async function onSubmit(data: any) {
    setIsLoading(true);
    setError(null);
    try {
      const form = new FormData();
      const effectiveFilename = data.filename || selectedFile;
      if (!effectiveFilename) throw new Error("Veuillez sélectionner un fichier depuis le dossier data.");
      form.append("filename", effectiveFilename);
      form.append("numQuestions", data.numQuestions || "8");
      form.append("tone", data.tone || "concis");

      const res = await fetch("/api/generate/start", { method: "POST", body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j.error || "Échec de génération");
      }
      const json = await res.json();
      try {
        sessionStorage.removeItem("oppie-quiz");
        sessionStorage.removeItem("oppie-steps");
        sessionStorage.removeItem("oppie-summary");
      } catch {}
      // Persist first question immediately to avoid waiting on /api/generate/get
      try {
        if (json?.question) {
          sessionStorage.setItem("oppie-quiz", JSON.stringify([json.question]));
        }
      } catch {}
      sessionStorage.setItem("oppie-session-id", json.sessionId);
      sessionStorage.setItem("oppie-session", JSON.stringify({
        sessionId: json.sessionId,
        filename: effectiveFilename
      }));
      // Push directly to first step; background generation will continue
      router.push(`/quiz/0?sid=${encodeURIComponent(json.sessionId)}`);
    } catch (e: any) {
      setError(e.message || "Failed to generate.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // Load sessions and model only once
    fetch("/api/sessions").then(r => r.json()).then(setSessions).catch(() => setSessions([]));
    fetch("/api/debug/model").then(r => r.json()).then(data => setCurrentModel(data.model)).catch(() => setCurrentModel(""));
    
    // Only update domain stats periodically (for the evolution chart)
    fetch("/api/domains/stats").then(r => r.json()).then(data => setDomainStats(data.stats || [])).catch(() => setDomainStats([]));
    const iv = setInterval(() => {
      fetch("/api/domains/stats").then(r => r.json()).then(data => setDomainStats(data.stats || [])).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  function queryFiles(q: string) {
    fetch(`/api/files?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((arr) => setFileResults(arr))
      .catch(() => setFileResults([]));
  }

  // no reset button anymore

  return (
    <main className="min-h-screen w-full">
      {/* Debug chip - top right */}
      {currentModel && (
        <div className="fixed top-4 right-4 z-50">
          <div className="bg-slate-800/80 backdrop-blur-sm border border-slate-600 rounded-full px-3 py-1 text-xs text-slate-300">
            Model: {currentModel}
          </div>
        </div>
      )}
      <section className="mx-auto max-w-6xl px-6 pt-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold gradient-violet">Bienvenue</h1>
            <p className="text-slate-400 mt-1">Générez des QCM depuis vos PDF et suivez vos performances.</p>
          </div>
          
        </div>

        {/* Dashboard grid */}
        <div className="mt-6 grid grid-cols-12 gap-5">
          {/* Quick start */}
          <div className="col-span-12 lg:col-span-7 rounded-lg border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 grid place-items-center rounded bg-mint-600 text-white"><Wand2 size={16} /></div>
              <h2 className="text-xl">Démarrer une génération</h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="grid sm:grid-cols-3 gap-4">
              <label className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-sm text-slate-300">Rechercher un PDF (dossier data)</span>
                {!selectedFile ? (
                  <div className="relative">
                    <div className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 p-3">
                      <Search className="text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Nom du fichier..."
                        className="flex-1 bg-transparent outline-none text-sm"
                        value={fileQuery}
                        onChange={(e) => { setFileQuery(e.target.value); queryFiles(e.target.value); }}
                      />
                    </div>
                    {fileResults.length > 0 && (
                      <div className="absolute z-20 mt-2 w-full rounded-md border border-slate-700 bg-slate-900 max-h-64 overflow-auto">
                        {fileResults.map((f) => (
                          <button
                            type="button"
                            key={f.name}
                            className="w-full text-left px-3 py-2 hover:bg-slate-800 text-sm"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setValue("filename", f.name, { shouldDirty: true, shouldValidate: true });
                              setSelectedFile(f.name);
                              setFileResults([]);
                              setFileQuery("");
                            }}
                          >
                            <span className="block whitespace-normal break-words leading-snug">{getDisplayName(f.name)}</span>
                            <span className="block text-xs text-slate-400">{Math.round(f.size/1024)} ko</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-md border border-mint-600/40 bg-slate-900 p-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => { const p = parseFilename(selectedFile); return p ? (
                        <span className="inline-flex items-start gap-2 rounded px-2 py-1 text-xs border border-violet-600 bg-violet-900/30 text-violet-200 shadow-[0_0_6px_rgba(139,92,246,0.5)]">
                          <span className="inline-block shrink-0 rounded bg-violet-700/60 px-1.5 py-0.5 text-[10px] tracking-wide">ITEM {p.item}</span>
                          <span className="max-w-[22rem] whitespace-normal break-words leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</span>
                        </span>
                      ) : <span className="truncate text-slate-200">{selectedFile}</span>; })()}
                    </div>
                    <button type="button" className="text-xs text-mint-400 hover:text-mint-300" onClick={() => { setSelectedFile(null); setValue("filename", "", { shouldDirty: true }); setFileQuery(""); }}>Changer</button>
                  </div>
                )}
                <input type="hidden" {...register("filename")}/>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Nombre</span>
                <input type="number" min={3} max={25} defaultValue={8} {...register("numQuestions")} className="rounded-md border border-slate-700 bg-slate-900 p-3 text-sm" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-300">Ton</span>
                <div className="relative">
                  <select
                    defaultValue="concis"
                    {...register("tone")}
                    className="w-full appearance-none rounded-md border border-slate-700 bg-slate-900 p-3 pr-10 text-sm text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-mint-600/50 focus:border-mint-500 transition pixel-border"
                  >
                    <option value="concis">Concis</option>
                    <option value="examen">Examen</option>
                    <option value="amical">Amical</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
              </label>
              <div className="sm:col-span-3 flex items-center gap-3 mt-1">
                <button disabled={isLoading || !(filename || selectedFile)} className={clsx("inline-flex items-center gap-2 rounded-md bg-mint-600 text-white px-4 py-2 hover:bg-mint-700 transition", (isLoading || !(filename || selectedFile)) && "opacity-60 cursor-not-allowed")}> 
                  <Wand2 size={16} /> {isLoading ? "Génération..." : "Générer"}
                </button>
                {error && (<span className="text-sm text-rose-400">{error}</span>)}
              </div>
            </form>

            {isLoading && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 text-mint-400">
                  <div className="w-4 h-4 border-2 border-mint-400 border-t-transparent rounded-full animate-spin" />
                  Génération en cours...
                </div>
              </div>
            )}
          </div>

          {/* Side widgets - Top right */}
          <div className="col-span-12 lg:col-span-5 grid gap-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
                <h3 className="text-lg mb-2">Raccourcis</h3>
                <ul className="text-sm text-slate-300 space-y-2">
                  <li>• Générer rapidement: Importer un PDF et cliquer Générer</li>
                  <li>• Valider chaque QCM pour voir corrections et justifications</li>
                  <li>• Terminer la session pour accéder au bilan</li>
                  <li>• <Link href="/domains" className="text-mint-400 hover:text-mint-300">Voir l'évolution par domaine</Link></li>
                  
                </ul>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
                <h3 className="text-lg mb-2">Sessions récentes</h3>
                {sessions.length === 0 ? (
                  <p className="text-sm text-slate-400">Aucune session récente trouvée.</p>
                ) : (
                  <ul className="divide-y divide-slate-800 text-sm">
                    {sessions.slice(0, 5).map((s) => (
                      <li key={s.id} className="py-2 flex items-center justify-between">
                        <div className="min-w-0 pr-3">
                          <div className="truncate text-slate-200 text-xs">{s.filename}</div>
                          <div className="text-xs text-slate-400">{new Date(s.createdAt).toLocaleDateString()} • {s.numQuestions}q</div>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded border ${s.status === 'completed' ? 'border-emerald-500 text-emerald-300' : s.status === 'processing' ? 'border-amber-500 text-amber-300' : 'border-rose-500 text-rose-300'}`}>
                          {s.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* Domain evolution below all cards */}
          <div className="col-span-12 mt-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 grid place-items-center rounded bg-slate-600 text-white"><TrendingUp size={16} /></div>
                <h2 className="text-xl">Évolution par domaine</h2>
              </div>
              {domainStats.length === 0 ? (
                <p className="text-sm text-slate-400">Aucune donnée de domaine trouvée.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {domainStats.slice(0, 8).map((domain) => (
                    <div key={domain.key} className="flex items-center gap-3 p-3 rounded border border-slate-700 bg-slate-800/50">
                      <div 
                        className="w-4 h-4 rounded-full shrink-0" 
                        style={{ backgroundColor: domain.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{domain.name}</div>
                        <div className="text-xs text-slate-400">
                          {domain.totalSessions} session{domain.totalSessions > 1 ? 's' : ''} • 
                          {(domain.averageScore * 100).toFixed(0)}% moy
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 shrink-0">
                        {domain.lastSession ? new Date(domain.lastSession).toLocaleDateString() : 'Jamais'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      
    </main>
  );
}


