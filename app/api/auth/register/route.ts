import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSession } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(()=> ({}));
    const { email, password } = schema.parse(json);
    const user = createUser(email, password);
    const sess = createSession(user, req.headers.get('user-agent')||undefined, req.headers.get('x-forwarded-for')||undefined);
    const res = NextResponse.json({ user: { id: user.id, email: user.email } });
    res.headers.set('Set-Cookie', `oppie_session=${encodeURIComponent(sess.token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000`);
    return res;
  } catch (e:any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 400 });
  }
}
