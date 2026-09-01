// BOKA OS — Logsn API
import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'boka_auth';
const COOKIE_DAYS = 30;

function getSecret(): string {
  return process.env.BOKA_ACCESS_PASSWORD || process.env.BOKA_AUTH_SECRET || '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';
    const secret = getSecret();

    if (!secret) return NextResponse.json({ ok: true, auth: 'disabled' });
    if (!password) return NextResponse.json({ error: 'Password required' }, { status: 400 });
    if (password !== secret) {
      await new Promise(r => setTimeout(r, 300));
      return NextResponse.json({ error: 'Noprawidłowe password' }, { status: 401 });
    }

    const { createHmac } = await import('crypto');
    const token = createHmac('sha256', secret).update(password).digest('base64url');
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_DAYS * 24 * 60 * 60,
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Logsn failed' }, { status: 500 });
  }
}
