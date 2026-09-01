// BOKA OS — API route helpers (P0.2)
// Validation + uniform error handling for all API routes.

import { NextRequest, NextResponse } from 'next/server';
import { z, ZodError } from 'zod';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, ...(details ? { details } : {}) },
    { status: 400 }
  );
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message = 'Internal server error', details?: unknown) {
  if (details) console.error('[BOKA API]', message, details);
  return NextResponse.json({ error: message }, { status: 500 });
}

export function withAsyncHandler<T extends (...args: any[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (e: any) {
      if (e instanceof ZodError) {
        return badRequest('Validation error', e.issues);
      }
      const msg = e?.message || 'Internal server error';
      console.error('[BOKA API] Unhandled error:', e);
      return serverError(msg);
    }
  }) as T;
}

export async function parseBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
  return schema.parse(body);
}

export function parseQuery<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): T {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params);
}

export const schemas = {
  familyMember: z.object({
    name: z.string().min(1).max(100),
    role: z.string().max(100).optional(),
    age: z.number().int().min(0).max(150).optional(),
    avatarEmoji: z.string().max(20).optional(),
    category: z.string().max(50).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    isActive: z.boolean().optional(),
    preferences: z.string().optional(),
  }),

  memoryEntry: z.object({
    content: z.string().min(1).max(10000),
    domain: z.string().max(100).optional(),
    importance: z.number().min(0).max(1).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    memberId: z.string().max(100).optional(),
    source: z.string().max(100).optional(),
  }),

  chatMessage: z.object({
    message: z.string().max(20000),
    memberId: z.string().max(100).optional(),
    familyId: z.string().max(100).optional(),
    agentId: z.string().max(100).optional(),
    stream: z.boolean().optional(),
  }),

  reminder: z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
    dueDate: z.string().min(8),
    category: z.string().max(50).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    memberId: z.string().max(100).optional(),
  }),

  idParam: z.object({
    id: z.string().min(1).max(200),
  }),

  filePath: z.string().max(2000).refine(
    s => !s.includes('\0') && !s.includes('..'),
    { message: 'Invalid path' }
  ),
};

export type Schemas = typeof schemas;
