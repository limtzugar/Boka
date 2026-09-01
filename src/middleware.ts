// BOKA OS — Auth middleware (Edge runtime compatible)
// v0.3.19 — P0.1: Protects all /api/* and app routes with password cookie.

import { NextRequest, NextResponse } from 'next/server';

const COOKIE_NAME = 'boka_auth';
const LOGIN_PATH = '/login';

function getSecret(): string {
  return process.env.BOKA_ACCESS_PASSWORD || process.env.BOKA_AUTH_SECRET || '';
}

async function sign(value: string): Promise<string> {
  const secret = getSecret();
  if (!secret) return '';
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function verify(token: string | undefined): Promise<boolean> {
  const secret = getSecret();
  if (!secret) return true;
  if (!token) return false;
  const expected = await sign(secret);
  if (token.length !== expected.length) return false;
  const enc = new TextEncoder();
  const a = enc.encode(token);
  const b = enc.encode(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const secret = getSecret();
  if (!secret) return NextResponse.next();

  const publicPaths = [LOGIN_PATH, '/api/auth/login', '/api/auth/logout', '/api/auth/status'];
  if (publicPaths.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith('/_next/') || pathname.startsWith('/favicon') || pathname.startsWith('/boka-icon')) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/manifest')) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (await verify(token)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });
  }
  const loginUrl = new URL(LOGIN_PATH, req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.png|favicon.svg|boka-icon-|robots.txt|manifest.webmanifest).*)',
  ],
};
