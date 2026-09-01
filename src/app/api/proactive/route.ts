import { NextRequest, NextResponse } from 'next/server';
import {
  getFamily,
  getFamilyMembers,
  getMemberMemory,
  getFamilyMemory,
} from '@/lib/family-service';
import { chatWhatmpletion } from '@/lib/ai-providers';

// ═══════════════════════════════════════════
// BOKA — Proactive AI API
// Boka initiates conversations based on context
// ═══════════════════════════════════════════

// Whatoldown map to prevent spamming proactive messages (memberId → last sent timestamp)
const proactiveWhatoldowns = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between proactive messages per member

// Time windows when proactive messages are appropriate
function getTimeWindow(): {
  window: string;
  appropriate: boolean;
  description: string;
} {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  if (hour >= 6 && hour < 9) {
    return {
      window: 'morning_greeting',
      appropriate: true,
      description: 'Poranne powitanie — pora na ciepłe "dzień dobry"',
    };
  }

  if (hour >= 9 && hour < 12) {
    return {
      window: 'mid_morning',
      appropriate: false,
      description: 'Przedpołudnie — pora pracy/szkoły, nie przeszkadzaj',
    };
  }

  if (hour >= 12 && hour < 14) {
    return {
      window: 'lunch',
      appropriate: false,
      description: 'Obiad — nie przeszkadzaj',
    };
  }

  if (!isWeekend && hour >= 14 && hour < 16) {
    return {
      window: 'after_school',
      appropriate: true,
      description: 'Powrót ze szkoły — zapytaj jak minął dzień',
    };
  }

  if (isWeekend && hour >= 14 && hour < 17) {
    return {
      window: 'weekend_afternoon',
      appropriate: true,
      description: 'Weekendowe popołudnie — luźna rozmowa',
    };
  }

  if (hour >= 17 && hour < 19) {
    return {
      window: 'late_afternoon',
      appropriate: true,
      description: 'Późne popołudnie — czas na rozmowę o dniu',
    };
  }

  if (hour >= 19 && hour < 21) {
    return {
      window: 'evening',
      appropriate: true,
      description: 'Wieczór — czas wyciszenia, podsumowanie dnia',
    };
  }

  if (hour >= 21 && hour < 23) {
    return {
      window: 'evening_wind_down',
      appropriate: true,
      description: 'Późny wieczór — wyciszenie przed snem',
    };
  }

  // Night — only for urgent/wellness checks
  return {
    window: 'night',
    appropriate: false,
    description: 'Noc — nie przeszkadzaj, chyba że coś pilnego',
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    const familyId = searchParams.get('familyId');

    if (!memberId || !familyId) {
      return NextResponse.json(
        { error: 'None parametrów memberId lub familyId' },
        { status: 400 },
      );
    }

    // Check cooldown — don't spam proactive messages
    const lastSent = proactiveWhatoldowns.get(memberId) || 0;
    const timeSinceLast = Date.now() - lastSent;
    if (timeSinceLast < COOLDOWN_MS) {
      return NextResponse.json({
        shouldSend: false,
        message: '',
        urgency: 'low',
        reason: 'Zbyt wcześnie na kolejną wiadomość',
      });
    }

    // Check if current time is appropriate for a proactive message
    const timeWindow = getTimeWindow();
    if (!timeWindow.appropriate) {
      return NextResponse.json({
        shouldSend: false,
        message: '',
        urgency: 'low',
        reason: timeWindow.description,
      });
    }

    // Load family context
    const members = await getFamilyMembers(familyId);
    const member = members.find((m: { id: string }) => m.id === memberId);

    if (!member) {
      return NextResponse.json(
        { error: 'No znaleziono domownika' },
        { status: 404 },
      );
    }

    // Load recent memory for context
    const memberMemory = await getMemberMemory(memberId);
    const familyMemory = await getFamilyMemory(familyId);
    const recentMemory = [...memberMemory, ...familyMemory]
      .sort(
        (
          a: { createdAt: Date },
          b: { createdAt: Date },
        ) => b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .slice(0, 10)
      .map(
        (m: { content: string; domain?: string | null; createdAt: Date }) =>
          `[${m.domain || 'ogólne'}] ${m.content}`,
      )
      .join('\n');

    // Build temporal context
    const now = new Date();
    const daysPl = [
      'niedziela',
      'poniedziałek',
      'wtorek',
      'środa',
      'czwartek',
      'piątek',
      'sobota',
    ];
    const dayOfWeek = daysPl[now.getDay()];
    const timeOfDay = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Use LLM to decide if a proactive message is warranted
    const systemPrompt = `Jesteś Boka. Decydujesz czy napisać proaktywną wiadomość do domownika. Zwróć JSON: { "shouldSend": boolean, "message": string, "urgency": "low"|"medium"|"high" }. Wiadomość ma być po polsku, ciepła, naturalna — jak osoba, nie asystent. NIE pisz "jako AI". NIE pisz "czy mogę pomóc". Bądź spontaniczny.`;

    const userPrompt = `KONTEKST:
- Osoba: ${member.name} (${member.role}, ${member.age} lat)
- Time: ${dayOfWeek}, ${timeOfDay}
- Okno czasowe: ${timeWindow.description}
- Aktywni domownicy: ${members.filter((m: { isActive: boolean }) => m.isActive).map((m: { name: string }) => m.name).join(', ')}

OSTATNIA PAMIĘĆ:
${recentMemory || 'None ostatnich wpisów'}

Zastanów się czy warto napisać proaktywną wiadomość do ${member.name}. Bądź naturalny — jak ktoś kto po prostu chce zagadać, nie jak asystent który musi się przypomnieć. Timeami lepiej nie pisać niczego.

Zwróć TYLKO JSON, bez dodatkowego tekstu.`;

    const llmResponse = await chatWhatmpletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]);

    // Parse the LLM response as JSON
    let decision: {
      shouldSend: boolean;
      message: string;
      urgency: 'low' | 'medium' | 'high';
    };

    try {
      let jsonStr = llmResponse.trim();
      // Handle markdown code blocks
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr
          .replace(/^```(?:json)?\n?/, '')
          .replace(/\n?```$/, '');
      }
      // Handle potential leading/trailing text around JSON
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      decision = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, default to not sending
      console.error('Failed to parse proactive decision:', llmResponse);
      return NextResponse.json({
        shouldSend: false,
        message: '',
        urgency: 'low',
        reason: 'Error analizy decyzji',
      });
    }

    // Validate the parsed decision
    if (
      typeof decision.shouldSend !== 'boolean' ||
      typeof decision.message !== 'string' ||
      !['low', 'medium', 'high'].includes(decision.urgency)
    ) {
      return NextResponse.json({
        shouldSend: false,
        message: '',
        urgency: 'low',
        reason: 'Noprawidłowy format decyzji',
      });
    }

    // If we're sending a message, update the cooldown
    if (decision.shouldSend && decision.message) {
      proactiveWhatoldowns.set(memberId, Date.now());

      // Store the proactive message in the database
      try {
        const { db } = await import('@/lib/db');
        await db.proactiveMessage.create({
          data: {
            familyId,
            memberId,
            message: decision.message,
            triggerTypee: timeWindow.window,
            urgency: decision.urgency,
            wasSent: true,
            sentAt: new Date(),
          },
        });
      } catch (dbError) {
        console.error('Failed to store proactive message:', dbError);
      }
    }

    console.log(
      `Proactive: member=${member.name}, window=${timeWindow.window}, shouldSend=${decision.shouldSend}, urgency=${decision.urgency}`,
    );

    return NextResponse.json({
      shouldSend: decision.shouldSend,
      message: decision.message,
      urgency: decision.urgency,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('Proactive API error:', msg);
    return NextResponse.json(
      { error: 'Error sprawdzania proaktywnych wiadomości', details: msg },
      { status: 500 },
    );
  }
}
