import { requireAuth } from "@/lib/auth";
import { NextRequest } from "next/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  // This is a server component; we can't access the request directly here.
  // Use a nested route handler to fetch user info instead.
  const me = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/auth/me`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ user: null }));
  const user = me?.user;
  return (
    <main className="min-h-screen w-full">
      <section className="mx-auto max-w-3xl px-6 pt-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold gradient-violet">Mon compte</h1>
          <Link href="/" className="text-slate-400 hover:text-slate-200 text-sm">Accueil</Link>
        </div>
        {!user ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-sm text-slate-300">Vous n'êtes pas connecté.</p>
            <Link href="/login" className="inline-block mt-3 rounded-md bg-violet-600 text-white px-3 py-2 text-sm hover:bg-violet-700">Se connecter</Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-lg mb-2">Profil</h2>
              <div className="text-sm text-slate-300">Email: <span className="text-slate-100">{user.email}</span></div>
              <form action="/api/auth/logout" method="post" className="mt-4">
                <button className="rounded-md bg-rose-600 text-white px-3 py-2 text-sm hover:bg-rose-700">Se déconnecter</button>
              </form>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-lg mb-2">Données</h2>
              <ul className="list-disc pl-5 text-sm text-slate-300">
                <li>Vos flashcards sont privées et associées à votre compte.</li>
                <li>Vos sessions de génération sont visibles uniquement par vous.</li>
              </ul>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}


