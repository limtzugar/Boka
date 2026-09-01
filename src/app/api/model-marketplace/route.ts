import { NextResponse } from 'next/server';
import {
  listAllMarketplaceModels,
  filterMarketplaceModels,
  estimateCostPer1000Calls,
  loadSettings,
  type MarketplaceModel,
} from '@/lib/ai-providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/model-marketplace
 *   ?source=all|openrouter|muapi|catalogs
 *   ?sort=cheapest-input|cheapest-output|cheapest-total|largest-context|newest|popular
 *   ?search=llama
 *   ?family=llama
 *   ?maxInputPrice=1.0
 *   ?maxOutputPrice=2.0
 *   ?minContext=32000
 *   ?modalities=text,vision
 *   ?limit=50
 *
 * Zwraca listę modeli z marketplace z cenami.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get('source') || 'all';
  const sort = (url.searchParams.get('sort') || 'cheapest-total') as
    | 'cheapest-input' | 'cheapest-output' | 'cheapest-total' | 'largest-context' | 'newest' | 'popular';
  const search = url.searchParams.get('search') || undefined;
  const family = url.searchParams.get('family') || undefined;
  const maxInputPrice = url.searchParams.has('maxInputPrice') ? parseFloat(url.searchParams.get('maxInputPrice')!) : undefined;
  const maxOutputPrice = url.searchParams.has('maxOutputPrice') ? parseFloat(url.searchParams.get('maxOutputPrice')!) : undefined;
  const minContext = url.searchParams.has('minContext') ? parseInt(url.searchParams.get('minContext')!, 10) : undefined;
  const modalitiesParam = url.searchParams.get('modalities');
  const modalities = modalitiesParam ? modalitiesParam.split(',').filter(Boolean) : undefined;
  const freeOnly = url.searchParams.get('freeOnly') === '1' || url.searchParams.get('freeOnly') === 'true';
  const limit = url.searchParams.has('limit') ? parseInt(url.searchParams.get('limit')!, 10) : 100;

  // Klucz OpenRouter bierzemy z zapisanych ustawień — user go już raz wpisał
  const settings = loadSettings();
  const openrouterKey = settings.openrouterKey || undefined;

  try {
    const { openrouter, muapi, catalogs, errors } = await listAllMarketplaceModels(openrouterKey);

    // Połącz modele z OpenRouter + MUAPI w jedną listę
    let combined: MarketplaceModel[] = [];
    if (source === 'all' || source === 'openrouter') combined = combined.concat(openrouter);
    if (source === 'all' || source === 'muapi') combined = combined.concat(muapi);

    // Konwertuj hardcoded catalogs na MarketplaceModel[] (DeepSeek, Together, Fireworks)
    if (!freeOnly && (source === 'all' || source === 'catalogs')) {
      for (const cat of catalogs) {
        for (const m of cat.popularCheapModels) {
          combined.push({
            source: cat.source,
            id: m.id,
            name: m.name,
            description: m.notes,
            contextWindow: m.contextWindow,
            priceInputPerM: m.priceInputPerM,
            priceOutputPerM: m.priceOutputPerM,
            currency: 'USD',
            family: m.id.split('/')[0]?.toLowerCase() || m.id.split('-')[0]?.toLowerCase(),
            homepage: cat.pricingPage,
          });
        }
      }
    }

    // Filtruj i sortuj
    const filtered = filterMarketplaceModels(combined, {
      sort, search, family, maxInputPrice, maxOutputPrice, minContext, modalities, freeOnly,
    }).slice(0, limit);

    // Statystyki
    const stats = {
      totalModels: combined.length,
      filteredCount: filtered.length,
      freeCount: combined.filter(m => m.priceInputPerM === 0 && m.priceOutputPerM === 0).length,
      sources: {
        openrouter: openrouter.length,
        muapi: muapi.length,
        catalogs: catalogs.reduce((sum, c) => sum + c.popularCheapModels.length, 0),
      },
      errors,
      cheapestInput: filtered[0] || null,
      cheapestOutput: [...filtered].sort((a, b) => a.priceOutputPerM - b.priceOutputPerM)[0] || null,
      largestContext: [...filtered].sort((a, b) => (b.contextWindow || 0) - (a.contextWindow || 0))[0] || null,
    };

    // Dodaj pole estimateCostPer1000Calls do każdego modelu
    const enriched = filtered.map(m => ({
      ...m,
      isFree: m.priceInputPerM === 0 && m.priceOutputPerM === 0 && (!m.pricePerRequest || m.pricePerRequest === 0),
      estimateCostPer1000Calls: estimateCostPer1000Calls(m),
    }));

    return NextResponse.json({
      models: enriched,
      stats,
      catalogs: !freeOnly && (source === 'all' || source === 'catalogs') ? catalogs : undefined,
      filters: { sort, search, family, maxInputPrice, maxOutputPrice, minContext, modalities, freeOnly, limit },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown', models: [] },
      { status: 500 },
    );
  }
}
