"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Me = { id: string; email: string } | null;

export default function ClientUserMenu() {
  const [me, setMe] = useState<Me>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMe(j?.user || null))
      .catch(() => setMe(null));
  }, []);

  if (!me) {
    return (
      <Link href="/login" className="hover:text-white">Se connecter</Link>
    );
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
        {me.email}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-md border border-slate-700 bg-slate-900 shadow-lg z-50">
          <Link href="/account" className="block px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Mon compte</Link>
          <button
            onClick={async () => {
              try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
              window.location.href = "/login";
            }}
            className="block w-full text-left px-3 py-2 text-sm text-rose-300 hover:bg-slate-800"
          >
            Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}


