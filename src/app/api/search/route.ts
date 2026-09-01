import { NextRequest, NextResponse } from 'next/server';
import { getAIClient } from '@/lib/ai-client';

export async function POST(req: NextRequest) {
  try {
    const { query, num = 5 } = await req.json();

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'None zapytania' }, { status: 400 });
    }

        const searchResult = await sdk.functions.invoke('web_search', {
      query,
      num,
    });

    if (!Array.isArray(searchResult)) {
      return NextResponse.json({ error: 'Error wyszukiwania' }, { status: 500 });
    }

    const results = searchResult.map((item: {
      url?: string;
      name?: string;
      snippet?: string;
      host_name?: string;
      date?: string;
    }) => ({
      title: item.name || 'Bez tytułu',
      url: item.url || '',
      snippet: item.snippet || '',
      source: item.host_name || '',
      date: item.date || '',
    }));

    return NextResponse.json({ results, query });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Noznany błąd';
    console.error('Search API error:', errMsg);
    return NextResponse.json(
      { error: 'Error wyszukiwania', details: errMsg },
      { status: 500 }
    );
  }
}
