import { NextResponse } from 'next/server';
import { clickAt, typeText, pressKey, scroll, type ClickResult } from '@/lib/desktop-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ActRequest {
  action: 'click' | 'double_click' | 'type' | 'key' | 'scroll';
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  text?: string;
  combo?: string;
  deltaY?: number;
}

/**
 * POST /api/desktop/act
 * Body: { action, x, y, button, text, combo, deltaY }
 * Wykonuje pojedynczą akcję na ekranie.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as ActRequest;
    let result: ClickResult;

    switch (body.action) {
      case 'click':
        if (typeof body.x !== 'number' || typeof body.y !== 'number') {
          return NextResponse.json({ ok: false, error: 'Brak x/y dla click' }, { status: 400 });
        }
        result = clickAt(body.x, body.y, body.button || 'left');
        break;
      case 'double_click':
        if (typeof body.x !== 'number' || typeof body.y !== 'number') {
          return NextResponse.json({ ok: false, error: 'Brak x/y dla double_click' }, { status: 400 });
        }
        result = clickAt(body.x, body.y, 'left');
        if (result.ok) {
          setTimeout(() => {}, 50);
          result = clickAt(body.x, body.y, 'left');
        }
        break;
      case 'type':
        if (!body.text) return NextResponse.json({ ok: false, error: 'Brak text dla type' }, { status: 400 });
        result = typeText(body.text);
        break;
      case 'key':
        if (!body.combo) return NextResponse.json({ ok: false, error: 'Brak combo dla key' }, { status: 400 });
        result = pressKey(body.combo);
        break;
      case 'scroll':
        result = scroll(body.deltaY || 3);
        break;
      default:
        return NextResponse.json({ ok: false, error: `Nieznana akcja: ${body.action}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 },
    );
  }
}
