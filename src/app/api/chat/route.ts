import { NextRequest, NextResponse } from 'next/server';
import {
  getFamily, isChildNearby, getFamilyMembers,
  getFamilyMemory, getOrCreateConversation,
  saveMessage, createMemory, getMemberMemory,
} from '@/lib/family-service';
import { db } from '@/lib/db';
import {
  buildSystemPrompt, routeToAgent, filterChildSafety,
  extractMemoryUpdates, cleanResponseTags, extractSearchQueries,
  extractImageGenPrompts, extractReminderTags,
  containsWakeWord, stripWakeWord,
  extractExpenseTags, extractCalendarTags,
} from '@/lib/agent-system';
import { extractFactsFromConversation, buildMemoryContext } from '@/lib/memory-extractor';
import { chatCompletion, loadSettings } from '@/lib/ai-providers';
import { ensureFamilySeeded } from '@/lib/auto-seed';
import { retrieveMemoryContext, recordConversationTurn } from '@/lib/agent-memory/chat-integration';
import { getAIClient } from '@/lib/ai-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { message, memberId, inputMode = 'text', childNearby: clientChildNearby, attachmentIds } = body;

    if (!message || typeof message !== 'string') {
      if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
        message = '[User przesłał pliki — patrz kontekst załączników poniżej]';
      } else {
        return NextResponse.json({ error: 'Brak wiadomości' }, { status: 400 });
      }
    }

    // Strip wake word from message but remember it was used
    const wakeWordDetected = containsWakeWord(message);
    if (wakeWordDetected) {
      message = stripWakeWord(message) || message;
    }

    // Auto-seed if database is empty (first run protection).
    // Run BEFORE getFamily so the family exists when we query.
    let seedResult = await ensureFamilySeeded();
    let family = await getFamily();
    let members = await getFamilyMembers(family.id);

    // ── Resolve member ──
    // Strategy: if memberId is provided AND exists in DB, use it.
    // Otherwise fall back to parent → partner → first member.
    // (Stale memberId from localStorage after DB reset is the #1 cause of
    //  the "Nie znaleziono domownika" bug — we must NOT keep looking for
    //  the stale ID after re-seed, just pick a sensible default.)
    const pickDefault = (list: typeof members) =>
      list.find((m: { role: string }) => m.role === 'parent') ||
      list.find((m: { role: string }) => m.role === 'partner') ||
      list[0];

    let member = memberId
      ? members.find((m: { id: string }) => m.id === memberId)
      : pickDefault(members);

    // Retry path: member not found. Try re-seeding once (handles corrupt/empty DB)
    // and pick a DEFAULT member (ignore stale memberId — it pointed to a deleted row).
    if (!member) {
      try {
        if (!seedResult.seeded) {
          // DB has members but the supplied memberId doesn't match any of them.
          // Most likely: stale localStorage on the client. Just pick a default.
          member = pickDefault(members);
        }
        if (!member) {
          // Still nothing — force a fresh seed and try again.
          seedResult = await ensureFamilySeeded();
          family = await getFamily();
          members = await getFamilyMembers(family.id);
          member = pickDefault(members);
        }
        if (!member) {
          // Last-resort: create an empty family member so chat can still work.
          member = await db.familyMember.create({
            data: {
              familyId: family.id,
              name: 'Gość',
              role: 'parent',
              age: 30,
              avatarEmoji: '👤',
              preferences: '{}',
              isActive: true,
            },
            include: { profiles: true },
          }) as any;
        }
      } catch (seedErr) {
        return NextResponse.json({
          error: 'Nie znaleziono domownika. Auto-seed nie powiódł się. Uruchom ręcznie: npm run db:seed',
          details: `seed error: ${seedErr instanceof Error ? seedErr.message : 'unknown'}`,
        }, { status: 404 });
      }
    }

    // v0.3.19 — TypeScript: assert member is defined after all fallback paths
    if (!member) {
      return NextResponse.json({ error: 'Nie znaleziono domownika' }, { status: 404 });
    }

    // v0.3.7: childNearby from client takes precedence (frontend toggle)
    const childNearby = typeof clientChildNearby === 'boolean' ? clientChildNearby : await isChildNearby(family.id);

    // Load memory context
    const familyMemoryEntries = await getFamilyMemory(family.id);
    const memberMemoryEntries = await getMemberMemory(member.id);
    const allMemoryEntries = [...memberMemoryEntries, ...familyMemoryEntries];
    const memoryContext = buildMemoryContext(allMemoryEntries);

    // Get recent conversation history
    const conversation = await getOrCreateConversation(family.id, member.id);
    const recentMessages = await getConversationMessages(conversation.id);
    const conversationHistory = recentMessages
      .slice(-10)
      .map((m: { role: string; content: string }) =>
        m.role === 'user' ? `Użytkownik: ${m.content}` : `BOKA: ${m.content}`
      )
      .join('\n');

    // AHI: Sensing — temporal context for Prediction layer
    const now = new Date();
    const timeOfDay = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    const daysPl = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
    const dayOfWeek = daysPl[now.getDay()];

    const ctx = {
      childNearby,
      activeMemberName: member.name,
      activeMemberRole: member.role,
      activeMemberAge: member.age,
      memberPreferences: JSON.parse(member.preferences || '{}'),
      familyMemory: memoryContext,
      timeOfDay,
      dayOfWeek,
    };

    const agentId = routeToAgent(message, member.role);
    const systemPrompt = buildSystemPrompt(ctx);

    // Load AI settings
    const settings = loadSettings();

    // Build messages with history
    const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    if (conversationHistory) {
      chatMessages.push({
        role: 'system',
        content: `POPRZEDNIA ROZMOWA:\n${conversationHistory}`,
      });
    }

    // Add wake word context
    if (wakeWordDetected) {
      chatMessages.push({
        role: 'system',
        content: 'Użytkownik użył komendy aktywacyjnej "Hej Boka" — odpowiadaj przyjaźnie, jesteś gotowy do pomocy.',
      });
    }

    // ══ v0.3.16: ATTACHMENTS — drag&drop files ──
    let attachmentContext = '';
    if (Array.isArray(attachmentIds) && attachmentIds.length > 0) {
      try {
        const attachments = await db.chatAttachment.findMany({
          where: { id: { in: attachmentIds } },
        });
        if (attachments.length > 0) {
          const parts = attachments.map((a: {
            fileName: string;
            fileType: string;
            extractionKind: string | null;
            extractedText: string | null;
          }) => {
            const preview = (a.extractedText || '').slice(0, 4000);
            return `📎 ${a.fileName} (${a.fileType}, ${a.extractionKind || 'unknown'}):\n${preview || '[brak ekstrakcji]'}`;
          });
          attachmentContext = `\n\n═══ ZAŁĄCZNIKI OD USERA ═══\n${parts.join('\n\n')}\n═══ KONIEC ZAŁĄCZNIKÓW ═══\n\nUser odnosi się do tych załączników w swojej wiadomości. Jeśli nie odnosi się — użyj ich jako kontekst rozmowy.`;
        }
      } catch (attErr) {
        console.warn('[chat] attachment fetch failed:', attErr);
      }
    }

    // ══ v0.4: Retrieve agent-memory context (BM25 smart search) ══
    // Best-effort — failures don't break chat.
    // v3: Persona filtering — child sees only child-safe memories.
    const chatPersona: 'parent' | 'partner' | 'child' | 'guest' =
      childNearby ? 'child' :
      member.role === 'child' ? 'child' :
      member.role === 'partner' ? 'partner' :
      member.role === 'parent' ? 'parent' : 'guest';
    const agentMemoryContext = await retrieveMemoryContext(message, family.id, chatPersona).catch(() => '');
    const userContent = agentMemoryContext
      ? `${agentMemoryContext}\n\n---\n\nUser: ${attachmentContext + message}`
      : attachmentContext + message;

    chatMessages.push({ role: 'user', content: userContent });

    // ══ CALL AI PROVIDER ══
    let responseText = await chatCompletion(chatMessages, settings);

    if (!responseText) {
      responseText = 'Przepraszam, nie mogłem przetworzyć odpowiedzi.';
    }

    // Check if agent wants to search the web (only supported with openrouter)
    const searchQueries = extractSearchQueries(responseText);
    let searchResults: Array<{ title: string; url: string; snippet: string; source: string }> = [];

    if (searchQueries.length > 0 && settings.provider === 'openrouter') {
      try {
                        const searchResult = await sdk.functions.invoke('web_search', {
          query: searchQueries[0],
          num: 5,
        });

        if (Array.isArray(searchResult)) {
          searchResults = searchResult.map((item: {
            url?: string; name?: string; snippet?: string; host_name?: string;
          }) => ({
            title: item.name || '',
            url: item.url || '',
            snippet: item.snippet || '',
            source: item.host_name || '',
          }));

          const searchContext = searchResults
            .map(r => `[${r.source}] ${r.title}: ${r.snippet}`)
            .join('\n');

          const enrichedResponse = await chatCompletion([
            ...chatMessages,
            { role: 'assistant' as const, content: responseText },
            {
              role: 'system' as const,
              content: `WYNIKI WYSZUKIWANIA DLA "${searchQueries[0]}":\n${searchContext}\n\nNa podstawie tych wyników, podaj zwięzłą odpowiedź po polsku. Nie używaj już tagu [SZUKAM:].`,
            },
          ], settings);

          if (enrichedResponse) {
            responseText = enrichedResponse;
          }
        }
      } catch (searchError) {
        console.error('Web search error:', searchError);
      }
    }

    // Also check if the user explicitly asked to search
    if (agentId === 'search' && searchQueries.length === 0 && settings.provider === 'openrouter') {
      try {
                        const searchResult = await sdk.functions.invoke('web_search', {
          query: message.replace(/szukaj|wyszukaj|znajdź w internecie|poguglaj|sprawdź w sieci/gi, '').trim(),
          num: 5,
        });

        if (Array.isArray(searchResult)) {
          searchResults = searchResult.map((item: {
            url?: string; name?: string; snippet?: string; host_name?: string;
          }) => ({
            title: item.name || '',
            url: item.url || '',
            snippet: item.snippet || '',
            source: item.host_name || '',
          }));

          const searchContext = searchResults
            .map(r => `[${r.source}] ${r.title}: ${r.snippet}`)
            .join('\n');

          const enrichedResponse = await chatCompletion([
            { role: 'system' as const, content: systemPrompt },
            { role: 'user' as const, content: `Znajdź w internecie informacje o: ${message}` },
            {
              role: 'system' as const,
              content: `WYNIKI WYSZUKIWANIA:\n${searchContext}\n\nPodsumuj te wyniki po polsku w zwięzły sposób.`,
            },
          ], settings);

          if (enrichedResponse) {
            responseText = enrichedResponse;
          }
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
          // Save to DB
          try {
            const { db } = await import('@/lib/db');
            await db.generatedImage.create({
              data: {
                familyId: family.id,
                memberId: member.id,
                prompt: imageGenPrompts[0],
                imageBase64: imgResult.data[0].base64.substring(0, 100) + '...', // Don't store full base64 in DB
                size: '1024x1024',
              },
            });
          } catch { /* ignore DB error */ }
        }
        // Remove the tag from response
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
        const { db } = await import('@/lib/db');
        await db.reminder.create({
          data: {
            familyId: family.id,
            memberId: member.id,
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
        const { db } = await import('@/lib/db');
        await db.expense.create({
          data: {
            familyId: family.id,
            memberId: member.id,
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

    // ── HANDLE [KALENDARZ: ...] TAGS — Create calendar events ──
    const calendarTags = extractCalendarTags(responseText);
    let calendarEventsCreated = 0;

    for (const calEvent of calendarTags) {
      try {
        const { db } = await import('@/lib/db');
        await db.reminder.create({
          data: {
            familyId: family.id,
            memberId: member.id,
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
    const { filtered, wasFiltered } = filterChildSafety(responseText, childNearby);
    responseText = filtered;

    // Clean internal tags for display
    const displayText = cleanResponseTags(responseText);

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
    await recordConversationTurn({
      message,
      response: displayText,
      familyId: family.id,
      agentId,
    }).catch(err => console.warn('[chat] agent-memory observe failed:', err));

    // Extract explicit [ZAPAMIĘTAJ: ...] tags
    const explicitMemoryUpdates = extractMemoryUpdates(responseText);
    for (const update of explicitMemoryUpdates) {
      await createMemory({
        familyId: family.id,
        memberId: member.id,
        entryType: 'semantic',
        domain: 'general',
        title: `Zapamiętane od ${member.name}`,
        content: update,
        importance: 0.7,
        tags: ['auto', member.name.toLowerCase()],
        source: 'conversation',
      });
    }

    // ── AUTOMATIC MEMORY EXTRACTION ──
    let autoMemoryCount = 0;
    try {
      const facts = await extractFactsFromConversation({
        userMessage: message,
        assistantResponse: displayText,
        memberName: member.name,
        memberRole: member.role,
        memberAge: member.age,
        existingMemory: memoryContext,
      });

      for (const fact of facts) {
        const existingMemories = await getMemberMemory(member.id);
        const isDuplicate = existingMemories.some((m: { content: string }) =>
          m.content.toLowerCase().includes(fact.content.toLowerCase().substring(0, 30))
        );

        if (!isDuplicate) {
          await createMemory({
            familyId: family.id,
            memberId: member.id,
            entryType: 'episodic',
            domain: fact.domain,
            title: `Auto: ${fact.aboutMember}`,
            content: fact.content,
            importance: fact.importance,
            tags: [...fact.tags, 'auto-extract', member.name.toLowerCase()],
            source: 'auto-extraction',
          });
          autoMemoryCount++;
        }
      }
    } catch (extractError) {
      console.error('Auto memory extraction failed:', extractError);
    }

    // Log safety event if filtering was applied
    if (wasFiltered) {
      try {
        const { db } = await import('@/lib/db');
        await db.safetyEvent.create({
          data: {
            familyId: family.id,
            agentId,
            riskLevel: 'warning',
            category: 'language',
            description: `Filtr języka zastosowany — dziecko w pobliżu`,
            actionTaken: 'filtered',
          },
        });
      } catch { /* ignore */ }
    }

    // Detect emotion for the face (v3: includes greeting)
    let emotion = 'neutral';
    const lowerResponse = displayText.toLowerCase();
    if (lowerResponse.includes('dzień dobry') || lowerResponse.includes('dobry wieczór') ||
        lowerResponse.includes('cześć') || lowerResponse.includes('witam') || lowerResponse.includes('witaj')) {
      emotion = 'greeting';
    } else if (lowerResponse.includes('świetni') || lowerResponse.includes('wspaniał') || lowerResponse.includes('super') || lowerResponse.includes('ciesz') || lowerResponse.includes('fajnie')) {
      emotion = 'happy';
    } else if (lowerResponse.includes('niestet') || lowerResponse.includes('uwag') || lowerResponse.includes('błąd')) {
      emotion = 'angry';
    } else if (lowerResponse.includes('ciekaw') || lowerResponse.includes('niesamowit')) {
      emotion = 'surprised';
    } else if (searchResults.length > 0) {
      emotion = 'thinking';
    } else {
      emotion = 'talking';
    }

    return NextResponse.json({
      response: displayText,
      agentId,
      wasFiltered,
      memoryUpdates: explicitMemoryUpdates.length + autoMemoryCount,
      autoExtracted: autoMemoryCount,
      emotion,
      wakeWordDetected,
      searchPerformed: searchResults.length > 0,
      provider: settings.provider,
      generatedImageUrl,
      generatedImagePrompt,
      remindersCreated,
      expensesCreated,
      calendarEventsCreated,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('Chat API error:', errMsg);
    return NextResponse.json(
      { error: 'Błąd przetwarzania', details: errMsg },
      { status: 500 }
    );
  }
}

async function getConversationMessages(conversationId: string) {
  const { db } = await import('@/lib/db');
  return db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
}
