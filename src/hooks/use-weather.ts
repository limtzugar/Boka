'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ═══════════════════════════════════════════
// BOKA — Weather Hook
// Checks weather in Rozprza for sneezy rainy days
// Uses /api/weather (Open-Meteo, free, no API key)
// ═══════════════════════════════════════════

interface WeatherData {
  temperature: number;
  weatherCode: number;
  weatherDescription: string;
  isRaining: boolean;
  isSnowing: boolean;
  windSpeed: number;
  humidity: number;
  location: string;
}

interface WeatherState {
  /** Current weather data */
  weather: WeatherData | null;
  /** Is weather data loading */
  isLoading: boolean;
  /** Is it currently raining in Rozprza */
  isRaining: boolean;
  /** Is it currently snowing */
  isSnowing: boolean;
  /** Last error */
  error: string | null;
}

/**
 * Hook for checking weather conditions
 * Defaults to Rozprza, Poland (51.3667°N, 19.6333°E)
 * Polls every 10 minutes, can be manually refreshed
 */
export function useWeather(location?: { lat?: string; lon?: string; name?: string }) {
  const lat = location?.lat || '51.3667';
  const lon = location?.lon || '19.6333';
  const locName = location?.name || 'Rozprza';

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRaining, setIsRaining] = useState(false);
  const [isSnowing, setIsSnowing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchWeather = useCallback(async () => {
    // Throttle: don't fetch more than once per 5 minutes
    const now = Date.now();
    if (now - lastFetchRef.current < 5 * 60 * 1000 && weather) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/weather?lat=${lat}&lon=${lon}&location=${encodeURIComponent(locName)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: WeatherData = await res.json();
      setWeather(data);
      setIsRaining(data.isRaining);
      setIsSnowing(data.isSnowing);
      lastFetchRef.current = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Nieznany błąd';
      console.error('[BOKA Weather] Fetch error:', message);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [lat, lon, locName, weather]);

  // Auto-poll every 10 minutes
  useEffect(() => {
    // Initial fetch
    fetchWeather();

    timerRef.current = setInterval(fetchWeather, 10 * 60 * 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [fetchWeather]);

  return {
    weather,
    isLoading,
    isRaining,
    isSnowing,
    error,
    refreshWeather: fetchWeather,
  };
}
