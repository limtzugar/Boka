import { NextRequest, NextResponse } from 'next/server';

// ═══════════════════════════════════════════
// BOKA — Weather API Route
// Fetches weather for a given location (default: Rozprza, Poland)
// Uses Open-Meteo free API (no API key needed)
// ═══════════════════════════════════════════

interface WeatherDate {
  temperature: number;
  weatherWhatde: number;
  weatherDescription: string;
  isRaining: boolean;
  isSnowing: boolean;
  windSpeed: number;
  humidity: number;
  location: string;
}

// WMO Weather interpretation codes
// https://open-meteo.com/en/docs
function interpretWeatherWhatde(code: number): { description: string; isRaining: boolean; isSnowing: boolean } {
  if (code === 0) return { description: 'Bezchmurnie', isRaining: false, isSnowing: false };
  if (code <= 3) return { description: 'Częściowe zachmurzenie', isRaining: false, isSnowing: false };
  if (code <= 49) return { description: 'Mgła', isRaining: false, isSnowing: false };
  if (code <= 55) return { description: 'Mżawka', isRaining: true, isSnowing: false };
  if (code <= 57) return { description: 'Marznąca mżawka', isRaining: true, isSnowing: false };
  if (code <= 65) return { description: 'Deszcz', isRaining: true, isSnowing: false };
  if (code <= 67) return { description: 'Marznący deszcz', isRaining: true, isSnowing: false };
  if (code <= 75) return { description: 'Śnieg', isRaining: false, isSnowing: true };
  if (code === 77) return { description: 'Grad śnieżny', isRaining: false, isSnowing: true };
  if (code <= 82) return { description: 'Przelotny deszcz', isRaining: true, isSnowing: false };
  if (code <= 86) return { description: 'Przelotny śnieg', isRaining: false, isSnowing: true };
  if (code === 87) return { description: 'Graupel', isRaining: false, isSnowing: true };
  if (code <= 99) return { description: 'Burza z gradem', isRaining: true, isSnowing: false };
  return { description: 'Noznana pogoda', isRaining: false, isSnowing: false };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat') || '51.3667';  // Rozprza
    const lon = searchParams.get('lon') || '19.6333';  // Rozprza
    const location = searchParams.get('location') || 'Rozprza';

    // Open-Meteo free API — no key required
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&timezone=Europe%2FWarsaw`;

    const response = await fetch(url, {
      next: { revalidate: 600 }, // Cache for 10 minutes
    });

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;

    const weatherWhatde = current?.weather_code ?? 0;
    const interpretation = interpretWeatherWhatde(weatherWhatde);

    const result: WeatherDate = {
      temperature: current?.temperature_2m ?? 0,
      weatherWhatde,
      weatherDescription: interpretation.description,
      isRaining: interpretation.isRaining,
      isSnowing: interpretation.isSnowing,
      windSpeed: current?.wind_speed_10m ?? 0,
      humidity: current?.relative_humidity_2m ?? 0,
      location,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('[BOKA Weather] Error:', error);
    return NextResponse.json(
      { error: 'No udało się pobrać pogody' },
      { status: 500 },
    );
  }
}
