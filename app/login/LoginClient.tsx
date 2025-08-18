"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

export default function LoginClient() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error||'Erreur');
      router.replace(next);
    } catch (e:any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>}>
      <main className="min-h-screen flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur p-6 space-y-5 shadow-[0_0_24px_rgba(160,125,255,0.15)]">
          <h1 className="text-2xl font-semibold text-center gradient-violet">{mode === 'login' ? 'Connexion' : 'Créer un compte'}</h1>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint-600/40" required />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400">Mot de passe</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-md border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mint-600/40" required minLength={8} />
            </div>
            {error && <div className="text-xs text-rose-400">{error}</div>}
            <button disabled={loading} className="w-full rounded-md bg-violet-600 hover:bg-violet-700 text-white py-2 text-sm disabled:opacity-60 shadow-[0_0_10px_rgba(139,92,246,0.3)]">{loading ? '…' : mode==='login' ? 'Se connecter' : 'Créer le compte'}</button>
          </form>
          <button onClick={()=> setMode(m => m==='login' ? 'register':'login')} className="w-full text-xs text-slate-400 hover:text-slate-200">
            {mode==='login' ? "Créer un compte" : "Déjà inscrit ? Connexion"}
          </button>
        </div>
      </main>
    </Suspense>
  );
}


