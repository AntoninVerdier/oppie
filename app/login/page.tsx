import { Suspense } from 'react';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>}>
      <LoginClient />
    </Suspense>
  );
}
