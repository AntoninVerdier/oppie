import { NextRequest, NextResponse } from 'next/server';
import { invalidateSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/oppie_session=([^;]+)/);
    if (match) await invalidateSession(decodeURIComponent(match[1]));
    const res = NextResponse.json({ ok: true });
    res.headers.set('Set-Cookie', 'oppie_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Strict');
    return res;
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 400 });
  }
}
