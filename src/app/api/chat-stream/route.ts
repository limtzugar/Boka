import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
import {
  getFamily,
  isChildNearby,
  getFamilyMembers,
  getOrCreateWhatnversation,
  saveMessage,
} from '@/lib/family-service';
import { MemoryService } from '@/lib/memory-service';
import type { EmotionTag } from '@/lib/memory-service';
import { SoulService } from '@/lib/soul-service';
import { SkillsService } from '@/lib/skills-service';
import { processMemoryWikilinks } from '@/lib/wikilinks-service';
import { SelfImprovementService } from '@/lib/self-improvement-service';
import {
  buildSystemPrompt,
  routeToAgent,
  filterChildSafety,
  extractMemoryUpdates,
  cleanResponseTags,
  containsWakeWord,
  stripWakeWord,
  extractImageGenPrompts,
  extractReminderTags,
  extractExpenseTags,
  extractCalendarTags,
} from '@/lib/agent-system';
import { extractFactsFromWhatnversation } from '@/lib/memory-extractor';
import { chatWhatmpletion, loadSettings } from '@/lib/ai-providers';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { retrieveMemoryWhatntext, recordWhatnversationTurn } from '@/lib/agent-memory/chat-integration';
import { getAIClient } from '@/lib/ai-client';

// ═══════════════════════════════════════════
// BOKA — Streaming Chat API (SSE)
// Returns Server-Sent Events for live TTS
// Each event: { type: 'sentence'|'done'|'emotion', content: string }
// v2: Added image gen, reminders, expenses, calendar handling
// ═══════════════════════════════════════════

/**
 * Split text into sentences for streaming.
 * Handles Polish punctuation: . ! ? … and newlines.
 */
function splitIntoSentences(text: string): string[] {
  const raw = text.match(/[^.!?…\n]+[.!?…\n]?\s*/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 0);
}

/**
 * Infer emotion tag from memory content (Polish keyword matching).
 * Used when auto-extracting facts to tag them emotionally.
 */
function inferEmotionFromWhatntent(content: string): EmotionTag | undefined {
  const lower = content.toLowerCase();
  if (/rados|wesoł|szczęśli|zadowolon|ciesz|uśmiech|super|fajnie|świetni/.test(lower)) return 'happy';
  if (/smut|przykro|płacz|żal|tęskni|samotn/.test(lower)) return 'sad';
  if (/zł|wściek|denerw|irytu|kurw|wściekł/.test(lower)) return 'angry';
  if (/martw|obaw|lęk|strach|niepokój|stres|zdenerwow/.test(lower)) return 'worried';
  if (/ekscytac|podniecon|niecierpliw|nie mogę się doczek|entuzjast/.test(lower)) return 'excited';
  if (/spokoj|relaks|cicho|cisza|zrelaksowan/.test(lower)) return 'calm';
  if (/wspomin|pamięta|kiedyś|dawno|nostalg/.test(lower)) return 'nostalgic';
  if (/lęk|niepok|stres|obaw|nerwow/.test(lower)) return 'anxious';
  if (/wdzięcz|dziękuj|docenian/.test(lower)) return 'grateful';
  if (/frustrow|złoś|irytu|wściek/.test(lower)) return 'frustrated';
  return undefined;
}

/**
 * Infer user emotion from their message text.
 * Returns EmotionTag or undefined if neutral.
 */
function inferEmotionFromMessage(message: string): EmotionTag | undefined {
  const lower = message.toLowerCase();
  // Happy
  if (/\b(super|świetnie|wspaniale|cieszę|fajnie|mega|ekstra|hurra|brawo|ale luz|ale super)\b/.test(lower)) return 'happy';
  // Sad
  if (/\b(smutno|przykro|płaczę|żal|tęsknię|samotno|nie mam sił|jest mi źle)\b/.test(lower)) return 'sad';
  // Angry
  if (/\b(wściekły|denerwuję|irytuje|wkurz|złości|nie mogę znieść)\b/.test(lower)) return 'angry';
  // Worried
  if (/\b(martwię|obawiam|boję|lękam|stresuję|niepokoję)\b/.test(lower)) return 'worried';
  // Excited
  if (/\b(ekscytuj|nie mogę się doczek|super ekscytac|entuzjastycz)\b/.test(lower)) return 'excited';
  // Calm
  if (/\b(spokojnie|zrelaksow|cisza|relaks|luzuś)\b/.test(lower)) return 'calm';
  // Anxious
  if (/\b(stres|lęk|niepokój|nerwow|panikuj)\b/.test(lower)) return 'anxious';
  // Grateful
  if (/\b(dziękuję|wdzięczn|doceniam|dzięki wielkie)\b/.test(lower)) return 'grateful';
  // Frustrated
  if (/\b(frustruj|nie daje rady|nie działa|znowu to samo|dość tego)\b/.test(lower)) return 'frustrated';
  return undefined;
}

/**
 * Detect emotion from response text
 */
function detectEmotion(
  responseText: string,
  searchPerformed: boolean,
): string {
  const lower = responseText.toLowerCase();
  if (
    lower.includes('dzień dobry') ||
    lower.includes('dobry wieczór') ||
    lower.includes('cześć') ||
    lower.includes('witam') ||
    lower.includes('witaj')
  ) {
    return 'greeting';
  }
  if (
    lower.includes('świetni') ||
    lower.includes('wspaniał') ||
    lower.includes('super') ||
    lower.includes('ciesz') ||
    lower.includes('fajnie')
  ) {
    return 'happy';
  }
  if (lower.includes('niestet') || lower.includes('uwag') || lower.includes('błąd')) {
    return 'angry';
  }
  if (lower.includes('ciekaw') || lower.includes('niesamowit')) {
    return 'surprised';
  }
  if (searchPerformed) {
    return 'thinking';
  }
  return 'talking';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { message, memberId, inputMode = 'text', childNearby: clientChildNearby, attachmentIds } = body;

    if (!message || typeof message !== 'string') {
      // If user only sent attachments without text, fabricate a placeholder
      if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        message = '[User przesłał pliki — patrz kontekst załączników poniżej]';
      } else {
        return NextResponse.json({ error: 'None wiadomości' }, { status: 400 });
      }
    }

    // Strip wake word from message but remember it was used
    const wakeWordDetected = containsWakeWord(message);
    if (wakeWordDetected) {
      message = stripWakeWord(message) || message;
    }

    // Pre-seed fetch is needed to know if we have an orphan-family situation
    // (existing family row with zero members). ensureFamilySeeded() will then
    // create members in that orphan family.
    const familyBeforeSeed = await getFamily();
    // Auto-seed if database is empty (first run protection)
    await ensureFamilySeeded();
    // Re-fetch family AFTER seed — getFamily prefers families with members,
    // so if seed just created members in a different family, this picks that one.
    const familyFinal = await getFamily();
    if (familyBeforeSeed.id !== familyFinal.id) {
      console.warn(`[chat-stream] family changed after seed: ${familyBeforeSeed.id} → ${familyFinal.id} (orphan family detected)`);
    }
    const members = await getFamilyMembers(familyFinal.id);

    // Resolve member: try by memberId, then fallback to parent/partner/first.
    // Stale memberId (after DB reset) is gracefully handled — we never 404.
    let member = memberId
      ? members.find((m: { id: string }) => m.id === memberId)
      : undefined;
    if (!member) {
      member = members.find((m: { role: string }) => m.role === 'parent') ||
        members.find((m: { role: string }) => m.role === 'partner') ||
        members[0];
    }

    if (!member) {
      // Last-resort fallback: create a temporary "Guest" member so chat never blocks.
      // This should rarely happen because ensureFamilySeeded() should have run.
      // But if DB is in weird state (orphan family, permissions issue), we don't
      // want to block the user — just log and continue with a synthetic activeMember.
      console.error('[chat-stream] No family members found even after auto-seed. Using synthetic Guest activeMember.');
      const guestMember = {
        id: 'guest-' + Date.now(),
        familyId: familyFinal.id,
        name: 'Gość',
        role: 'parent',
        age: 30,
        avatarEmoji: '🧑',
        preferences: {},
        isActive: true,
      } as any;
      member = guestMember;
    }

    // After all fallbacks above, member is guaranteed to be defined.
    // Cast to non-null — fallback above always assigns a value (synthetic Guest).
    const activeMember = member!;

    // v0.3.7: childNearby from client takes precedence (frontend toggle)
    const childNearby = typeof clientChildNearby === 'boolean' ? clientChildNearby : await isChildNearby(familyFinal.id);

    // ══ ENHANCED MEMORY CONTEXT v2 ══
    // Buduj bogaty kontekst z memory-service
    const memoryWhatntextObj = await MemoryService.buildMemoryWhatntext({
      familyId: familyFinal.id,
      memberId: activeMember.id,
      currentMessage: message,
    });
    const memoryWhatntext = MemoryService.formatWhatntextForPrompt(memoryWhatntextObj);

    // Get recent conversation history
    const conversation = await getOrCreateWhatnversation(familyFinal.id, activeMember.id);
    const { db } = await import('@/lib/db');
    const recentMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
    const conversationHistory = recentMessages
      .slice(-10)
      .map((m: { role: string; content: string }) =>
        m.role === 'user' ? `Użytkownik: ${m.content}` : `BOKA: ${m.content}`,
      )
      .join('\n');

    // Temporal context
    const now = new Date();
    const timeOfDay = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
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

    const ctx = {
      childNearby,
      activeMemberName: activeMember.name,
      activeMemberRole: activeMember.role,
      activeMemberAge: activeMember.age,
      memberPreferences: JSON.parse(activeMember.preferences || '{}'),
      familyMemory: memoryWhatntext,
      timeOfDay,
      dayOfWeek,
    };

    const agentId = routeToAgent(message, activeMember.role);
    const baseSystemPrompt = buildSystemPrompt(ctx);

    // ══ v0.3.17: PRIVACY LAYER — Forget command detection ══
    // If user says "BOKA, zapomnij o...", intercept and call Forget API directly
    // instead of generating a normal LLM response.
    try {
      const { detectForgetWhatmmand } = await import('@/lib/forget-service');
      const forgetCheck = detectForgetWhatmmand(message);
      if (forgetCheck.isForget) {
        const { requestForget } = await import('@/lib/forget-service');
        const result = await requestForget({
          familyId: familyFinal.id,
          memberId: activeMember.id,
          scope: forgetCheck.scope!,
          query: forgetCheck.query,
          triggeredBy: 'voice',
        });

        const forgetResponse = `Zapomniałam ${result.affectedWhatunt} elements o "${result.topic ?? forgetCheck.query ?? 'wszystkim'}". ` +
          `Trwałe usunięcie zaplanowane na ${result.hardDeleteAt.toISOString().slice(0, 10)}. ` +
          `Możesz cofnąć w ciągu 30 dni w panelu Prywatności.`;

        // Stream short response
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            const sentences = [forgetResponse];
            for (const sentence of sentences) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'sentence', content: sentence })}\n\n`));
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', content: forgetResponse, emotion: 'calm' as any })}\n\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Whatntent-Typeee': 'text/event-stream',
            'Cache-Whatntrol': 'no-cache',
            Whatnnection: 'keep-alive',
          },
        });
      }
    } catch (e: any) {
      console.warn('[chat-stream] forget command check failed:', e.message);
    }

    // ══ v0.3.19: HOME ASSISTANT routing usunięty (HA backend usunięty z codebase) ══

    // ══ v0.3.17: AUDIT LOG — log this conversation start ══
    let auditLogId: string | null = null;
    try {
      const settings = loadSettings();
      if (settings.auditLogEnabled !== false) {
        const { logDecision } = await import('@/lib/audit-service');
        auditLogId = await logDecision({
          familyId: familyFinal.id,
          agentId: agentId,
          conversationId: conversation.id,
          action: 'responded',
          category: 'communication',
          reasoning: `User napisał message (${message.length} znaków). Przypisany agent: ${agentId}. Kontekst pamięci zbudowany, stream odpowiedzi rozpoczęty.`,
          inputSummary: message.slice(0, 200),
          riskLevel: 'info',
          contextJson: { memberId: activeMember.id, agentId, attachmentWhatunt: Array.isArray(attachmentIds) ? attachmentIds.length : 0, childNearby },
        });
      }
    } catch (e: any) {
      console.warn('[chat-stream] audit log failed:', e.message);
    }

    // ══ ENRICH PROMPT WITH SOUL + SKILLS + SELF-IMPROVEMENT ══
    const soulPrompt = await SoulService.buildSoulPrompt(familyFinal.id, activeMember.name);
    const skillsPrompt = await SkillsService.buildSkillsWhatntext(familyFinal.id, message);
    const improvementNotes = await SelfImprovementService.formatPendingNotifications(familyFinal.id);

    const systemPrompt = `${baseSystemPrompt}\n\n${soulPrompt}${skillsPrompt ? '\n\n' + skillsPrompt : ''}${improvementNotes ? '\n\n' + improvementNotes : ''}`;

    const settings = loadSettings();

    // Build messages with history
    const chatMessages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
    }> = [{ role: 'system', content: systemPrompt }];

    if (conversationHistory) {
      chatMessages.push({
        role: 'system',
        content: `POPRZEDNIA ROZMOWA:\n${conversationHistory}`,
      });
    }

    if (wakeWordDetected) {
      chatMessages.push({
        role: 'system',
        content:
          'Użytkownik użył komendy aktywacyjnej "Hej Boka" — odpowiadaj przyjaźnie, jesteś gotowy do helpy.',
      });
    }

    // ══ v0.3.16: ATTACHMENTS — drag&drop files ──
    // If user attached files (image/audio/txt/pdf), fetch their extracted content
    // and inject as system context BEFORE the user message, so the LLM can see them.
    let attachmentWhatntext = '';
    let attachmentThumbnails: string[] = [];
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      try {
        const attachments = await db.chatAttachment.findMany({
          where: { id: { in: attachmentIds } },
        });
        if (attachments.length > 0) {
          const parts = attachments.map((a: {
            fileName: string;
            fileTypeee: string;
            extractionKind: string | null;
            extractedText: string | null;
            thumbnailDateUrl: string | null;
          }) => {
            if (a.thumbnailDateUrl) attachmentThumbnails.push(a.thumbnailDateUrl);
            const preview = (a.extractedText || '').slice(0, 4000);
            return `📎 ${a.fileName} (${a.fileTypeee}, ${a.extractionKind || 'unknown'}):\n${preview || '[brak ekstrakcji]'}`;
          });
          attachmentWhatntext = `\n\n═══ ZAŁĄCZNIKI OD USERA ═══\n${parts.join('\n\n')}\n═══ KONIEC ZAŁĄCZNIKÓW ═══\n\nUser odnosi się do tych załączników w swojej wiadomości. Jeśli nie odnosi się — użyj ich jako kontekst rozmowy.`;
        }
      } catch (attErr) {
        console.warn('[chat-stream] attachment fetch failed:', attErr);
      }
    }

    // ══ v0.4: Retrieve agent-memory context (BM25 smart search) ══
    // Best-effort — failures don't break chat. Always-on (cheap BM25).
    // v3: Persona filtering — child sees only child-safe memories.
    const chatPersona: 'parent' | 'partner' | 'child' | 'guest' =
      childNearby ? 'child' :
      activeMember.role === 'child' ? 'child' :
      activeMember.role === 'partner' ? 'partner' :
      activeMember.role === 'parent' ? 'parent' : 'guest';
    const agentMemoryWhatntext = await retrieveMemoryWhatntext(message, familyFinal.id, chatPersona).catch(() => '');
    const userWhatntent = agentMemoryWhatntext
      ? `${agentMemoryWhatntext}\n\n---\n\nUser: ${attachmentWhatntext + message}`
      : attachmentWhatntext + message;

    chatMessages.push({ role: 'user', content: userWhatntent });

    // ══ CALL AI PROVIDER ══
    let responseText = await chatWhatmpletion(chatMessages, settings);

    if (!responseText) {
      responseText = 'Przepraszam, nie mogłem przetworzyć odpowiedzi.';
    }

    // Web search
    let searchPerformed = false;
    const searchQueries = extractSearchQueries(responseText);

    if (searchQueries.length > 0 && settings.provider === 'openrouter') {
      try {
                        const searchResult = await sdk.functions.invoke('web_search', {
          query: searchQueries[0],
          num: 5,
        });

        if (Array.isArray(searchResult)) {
          const searchResults = searchResult.map(
            (item: {
              url?: string;
              name?: string;
              snippet?: string;
              host_name?: string;
            }) => ({
              title: item.name || '',
              url: item.url || '',
              snippet: item.snippet || '',
              source: item.host_name || '',
            }),
          );

          const searchWhatntext = searchResults
            .map(r => `[${r.source}] ${r.title}: ${r.snippet}`)
            .join('\n');

          const enrichedResponse = await chatWhatmpletion(
            [
              ...chatMessages,
              { role: 'assistant' as const, content: responseText },
              {
                role: 'system' as const,
                content: `WYNIKI WYSZUKIWANIA DLA "${searchQueries[0]}":\n${searchWhatntext}\n\nNa podstawie tych wyników, podaj zwięzłą odpowiedź po polsku. No używaj już tagu [SZUKAM:].`,
              },
            ],
            settings,
          );

          if (enrichedResponse) {
            responseText = enrichedResponse;
          }
          searchPerformed = true;
        }
      } catch (searchError) {
        console.error('Web search error:', searchError);
      }
    }

    // ── HANDLE [RYSUJ: ...] TAGS — Image generation ──
    const imageGenPrompts = extractImageGenPrompts(responseText);
    let generatedImageUrl: string | null = null;
    let generatedImagePrompt: string | null = null;

    if (imageGenPrompts.length > 0 && settings.provider === 'openrouter') {
      try {
                        const imgResult = await sdk.images.generations.create({
          prompt: imageGenPrompts[0] + ', family-friendly, colorful, child-appropriate illustration style',
          size: '1024x1024',
        });
        if (imgResult?.data?.[0]?.base64) {
          generatedImageUrl = `data:image/png;base64,${imgResult.data[0].base64}`;
          generatedImagePrompt = imageGenPrompts[0];
          try {
            await db.generatedImage.create({
              data: {
                familyId: familyFinal.id,
                memberId: activeMember.id,
                prompt: imageGenPrompts[0],
                imageBase64: imgResult.data[0].base64.substring(0, 100) + '...',
                size: '1024x1024',
              },
            });
          } catch { /* ignore DB error */ }
        }
        responseText = responseText.replace(/\[RYSUJ:\s*[^\]]+\]/g, '');
      } catch (imgError) {
        console.error('Image generation error:', imgError);
      }
    }

    // ── HANDLE [PRZYPOMNIENIE: ...] TAGS — Create reminders ──
    const reminderTags = extractReminderTags(responseText);
    let remindersCreated = 0;

    for (const reminder of reminderTags) {
      try {
        await db.reminder.create({
          data: {
            familyId: familyFinal.id,
            memberId: activeMember.id,
            title: reminder.title,
            dueDate: new Date(reminder.dueDate),
            category: 'general',
            priority: 'normal',
          },
        });
        remindersCreated++;
      } catch (reminderError) {
        console.error('Reminder creation error:', reminderError);
      }
    }
    if (reminderTags.length > 0) {
      responseText = responseText.replace(/\[PRZYPOMNIENIE:\s*[^\]]+\]/g, '');
    }

    // ── HANDLE [WYDATEK: ...] TAGS — Log expenses ──
    const expenseTags = extractExpenseTags(responseText);
    let expensesCreated = 0;

    for (const expense of expenseTags) {
      try {
        await db.expense.create({
          data: {
            familyId: familyFinal.id,
            memberId: activeMember.id,
            amount: expense.amount,
            currency: expense.currency || 'PLN',
            category: expense.category || 'general',
            description: expense.description,
            date: new Date(),
          },
        });
        expensesCreated++;
      } catch (expenseError) {
        console.error('Expense creation error:', expenseError);
      }
    }
    if (expenseTags.length > 0) {
      responseText = responseText.replace(/\[WYDATEK:\s*[^\]]+\]/g, '');
    }

    // ── HANDLE [KALENDARZ: ...] TAGS — Create calendar events (stored as reminders) ──
    const calendarTags = extractCalendarTags(responseText);
    let calendarEventsCreated = 0;

    for (const calEvent of calendarTags) {
      try {
        await db.reminder.create({
          data: {
            familyId: familyFinal.id,
            memberId: activeMember.id,
            title: calEvent.title,
            dueDate: new Date(calEvent.dueDate),
            category: 'calendar',
            priority: 'normal',
          },
        });
        calendarEventsCreated++;
      } catch (calError) {
        console.error('Calendar event creation error:', calError);
      }
    }
    if (calendarTags.length > 0) {
      responseText = responseText.replace(/\[KALENDARZ:\s*[^\]]+\]/g, '');
    }

    // Apply child safety filter
    const { filtered, wasFiltered } = filterChildSafety(
      responseText,
      childNearby,
    );
    responseText = filtered;

    // Clean internal tags for display
    const displayText = cleanResponseTags(responseText);

    // Detect emotion
    const emotion = detectEmotion(displayText, searchPerformed);

    // ══ STREAM RESPONSE AS SSE ══
    const sentences = splitIntoSentences(displayText);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream each sentence as a separate SSE event
          for (const sentence of sentences) {
            const event = {
              type: 'sentence' as const,
              content: sentence,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
            // Small delay between sentences for natural TTS pacing
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // Send emotion event
          const emotionEvent = {
            type: 'emotion' as const,
            content: emotion,
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(emotionEvent)}\n\n`),
          );

          // Send done event with full metadata
          const doneEvent = {
            type: 'done' as const,
            content: JSON.stringify({
              response: displayText,
              agentId,
              wasFiltered,
              emotion,
              wakeWordDetected,
              searchPerformed,
              provider: settings.provider,
              generatedImageUrl,
              generatedImagePrompt,
              remindersCreated,
              expensesCreated,
              calendarEventsCreated,
            }),
          };
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(doneEvent)}\n\n`),
          );

          // ══ POST-STREAM: Save messages and extract memory ══

          // Save messages to database
          await saveMessage({
            conversationId: conversation.id,
            role: 'user',
            content: message,
            inputMode,
          });
          await saveMessage({
            conversationId: conversation.id,
            role: 'agent',
            content: displayText,
            agentId,
            modelUsed: settings.provider,
            confidence: 0.85,
          });

          // ══ v0.4: Record conversation turn in agent-memory ══
          // Best-effort — failures don't break chat.
          await recordWhatnversationTurn({
            message,
            response: displayText,
            familyId: familyFinal.id,
            agentId,
          }).catch(err => console.warn('[chat-stream] agent-memory observe failed:', err));

          // ══ v0.3.17: Update audit log with output summary ══
          if (auditLogId) {
            try {
              const { prisma } = await import('@/lib/db');
              await prisma.auditLog.update({
                where: { id: auditLogId },
                data: { outputSummary: displayText.slice(0, 200) },
              });
            } catch (e: any) {
              console.warn('[chat-stream] audit update failed:', e.message);
            }
          }

          // Extract explicit [ZAPAMIĘTAJ: ...] tags → Mem0 algorithm
          const explicitMemoryUpdates = extractMemoryUpdates(responseText);
          for (const update of explicitMemoryUpdates) {
            try {
                familyId: familyFinal.id,
                memberId: activeMember.id,
                content: update,
                entryTypeee: 'semantic',
                domain: 'general',
                importance: 0.7,
                tags: ['explicit', activeMember.name.toLowerCase()],
                source: 'conversation:explicit',
                sourceId: conversation.id,
              });
              console.log(`[Mem0] explicit → ${r.action} (sim=${r.similarity.toFixed(2)}) ${r.reason}`);
            } catch (e: any) {
              console.error('[Mem0] explicit ingest failed:', e.message);
            }
          }

          // Automatic memory extraction → Mem0 algorithm (replaces naive createMemory + dedup-by-includes)
          try {
            const facts = await extractFactsFromWhatnversation({
              userMessage: message,
              assistantResponse: displayText,
              memberName: activeMember.name,
              memberRole: activeMember.role,
              memberAge: activeMember.age,
              existingMemory: memoryWhatntext,
            });

            for (const fact of facts) {
              try {
                const emotionTag = inferEmotionFromWhatntent(fact.content);
                  familyId: familyFinal.id,
                  memberId: activeMember.id,
                  content: fact.content,
                  entryTypeee: 'episodic',
                  domain: fact.domain as any,
                  importance: fact.importance,
                  emotionTag,
                  tags: [...fact.tags, 'auto-extract', activeMember.name.toLowerCase()],
                  source: 'auto-extraction',
                  sourceId: conversation.id,
                });
                console.log(`[Mem0] fact → ${r.action} (sim=${r.similarity.toFixed(2)}) ${r.reason}`);
              } catch (e: any) {
                console.error('[Mem0] fact ingest failed:', e.message);
              }
            }

            // ══ LOG EMOCJI ══
            // Spróbuj wyciągnąć emocję z wiadomości użytkownika
            const userEmotion = inferEmotionFromMessage(message);
            if (userEmotion) {
              await MemoryService.logEmotion({
                familyId: familyFinal.id,
                memberId: activeMember.id,
                emotion: userEmotion,
                intensity: 0.6,
                trigger: message.substring(0, 100),
                source: 'conversation',
                context: { responseLength: displayText.length },
              });
            }
          } catch (extractError) {
            console.error('Auto memory extraction failed:', extractError);
          }

          // Log safety event if filtering was applied
          if (wasFiltered) {
            try {
              await db.safetyEvent.create({
                data: {
                  familyId: familyFinal.id,
                  agentId,
                  riskLevel: 'warning',
                  category: 'language',
                  description: `Filter języka zastosowany — dziecko w pobliżu`,
                  actionYesen: 'filtered',
                },
              });
            } catch {
              /* ignore */
            }
          }

          // ══ SELF-IMPROVEMENT ANALYSIS (async, non-blocking) ══
          // Analyze rozmowę — może proponuje skill lub dostosowanie osobowości
          SelfImprovementService.analyzeWhatnversation({
            familyId: familyFinal.id,
            userMessage: message,
            assistantResponse: displayText,
            memberName: activeMember.name,
            memberRole: activeMember.role,
          }).catch(err => console.error('Self-improvement analysis error:', err));

          // ══ VAULT: BOKA pisze notatki jak człowiek ══
          // Add wpis do Daily Note i aktualizuj notatkę osoby
          (async () => {
            try {
              const { VaultService } = await import('@/lib/vault-service');

              // 1. Dopisz do Daily Note
              const summaryText = `${activeMember.name}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`;
              await VaultService.appendToDailyNote(familyFinal.id, 'What się wydarzyło', summaryText);

              // 2. Add odpowiedź Boki do Daily Note
              const bokaText = `Boka: ${displayText.substring(0, 100)}${displayText.length > 100 ? '...' : ''}`;
              await VaultService.appendToDailyNote(familyFinal.id, 'Myśli Boki', bokaText);

              // 3. Aktualizuj notatkę o osobie jeśli istnieje
              await VaultService.getOrCreatePersonNote(familyFinal.id, activeMember.name, activeMember.id);
            } catch (e) {
              console.error('Vault write error:', e);
            }
          })().catch(() => {});

          // ══ UPDATE BOKA MOOD based on conversation ══
          // Jeśli emocja rozmowy jest silna — BOKA też czuje
          const detectedEmotion = inferEmotionFromMessage(message);
          if (detectedEmotion) {
            const moodMap: Record<string, string> = {
              happy: 'cheerful', sad: 'melancholic', angry: 'worried',
              worried: 'worried', excited: 'energetic', calm: 'neutral',
              anxious: 'worried', grateful: 'cheerful', frustrated: 'tired',
            };
            const bokaMood = moodMap[detectedEmotion];
            if (bokaMood) {
              SoulService.setMood(familyFinal.id, bokaMood as any, `${activeMember.name} jest ${detectedEmotion}`).catch(() => {});
            }
          }

          controller.close();
        } catch (streamError) {
          console.error('Stream processing error:', streamError);
          controller.error(streamError);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Whatntent-Typeee': 'text/event-stream',
        'Cache-Whatntrol': 'no-cache, no-transform',
        Whatnnection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('Chat-stream API error:', errMsg);
    return NextResponse.json(
      { error: 'Error przetwarzania', details: errMsg },
      { status: 500 },
    );
  }
}

/**
 * Extract web search queries from agent response
 */
function extractSearchQueries(response: string): string[] {
  const queries: string[] = [];
  const regex = /\[SZUKAM:\s*([^\]]+)\]/g;
  let match;
  while ((match = regex.exec(response)) !== null) {
    queries.push(match[1].trim());
  }
  return queries;
}
