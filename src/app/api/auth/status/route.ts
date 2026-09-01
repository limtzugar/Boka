import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
const COOKIE_NAME = 'boka_auth';
function getSecret(): string {
  return process.env.BOKA_ACCESS_PASSWORD || process.env.BOKA_AUTH_SECRET || '';
}
function verify(token: string | undefined): boolean {
  const secret = getSecret();
  if (!secret) return true;
  if (!token) return false;
  const expected = createHmac('sha256', secret).update(secret).digest('base64url');
  if (token.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(token), Buffer.from(expected)); } catch { return false; }
}
export async function GET(req: NextRequest) {
  const secret = getSecret();
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return NextResponse.json({ authRequired: !!secret, authenticated: verify(token) });
}
