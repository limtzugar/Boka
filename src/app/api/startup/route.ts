// ═══════════════════════════════════════════════════════════
// BOKA — Startup Initialization
// Sprawdzanie pamięci przy każdym uruchomieniu
// Jeśli pamięć nie istnieje — tworzy nową
// Jeśli pamięć jest uszkodzona — informuje i naprawia
// ═══════════════════════════════════════════════════════════

import { NextResponse } from 'next/server';
import { ensureMemoryStructure, verifyMemoryIntegrity, MEMORY_PATHS, MEMORY_FILES } from '@/lib/memory-paths';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const startupLog: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  startupLog.push(`BOKA OS Startup — ${new Date().toISOString()}`);

  // ── 1. SPRAWDŹ STRUKTURĘ FOLDERÓW ────────────
  startupLog.push('Sprawdzam strukturę folderów pamięci...');
  const structure = ensureMemoryStructure();
  if (structure.created.length > 0) {
    startupLog.push(`Utworzono foldery: ${structure.created.join(', ')}`);
    warnings.push('Nowe foldery pamięci zostały utworzone — pierwsze uruchomienie?');
  }
  if (structure.errors.length > 0) {
    errors.push(...structure.errors);
  }

  // ── 2. SPRAWDŹ INTEGRALNOŚĆ ─────────────────
  startupLog.push('Weryfikuję integralność pamięci...');
  const integrity = verifyMemoryIntegrity();

  // Database
  if (!integrity.database.exists) {
    startupLog.push('Baza danych nie istnieje — BOKA utworzy nową przy pierwszym zapisie');
    warnings.push('Baza danych nie istnieje — dane będą tworzone od nowa');
  } else if (!integrity.database.readable) {
    errors.push('Baza danych istnieje ale jest uszkodzona!');
  } else {
    startupLog.push(`Baza danych OK (${(integrity.database.size / 1024).toFixed(0)}KB)`);
  }

  // Settings
  if (!integrity.settings.exists) {
    startupLog.push('Ustawienia nie istnieją — użyję domyślnych');
    warnings.push('Brak pliku ustawień — użyto wartości domyślnych');
  } else if (!integrity.settings.parseable) {
    errors.push('Plik ustawień jest uszkodzony (niepoprawny JSON)');
  } else {
    startupLog.push('Ustawienia OK');
  }

  // Vault
  startupLog.push(`Vault: ${integrity.vault.fileCount} notatek .md`);
  if (integrity.vault.fileCount === 0) {
    startupLog.push('Vault jest pusty — BOKA zacznie pisać notatki');
  }

  // ── 3. SPRAWDŹ ŚCIEŻKI ──────────────────────
  startupLog.push('Ścieżki pamięci:');
  startupLog.push(`  Baza: ${MEMORY_PATHS.base}`);
  startupLog.push(`  DB: ${MEMORY_FILES.database}`);
  startupLog.push(`  Vault: ${MEMORY_PATHS.vault}`);
  startupLog.push(`  Daily Notes: ${MEMORY_PATHS.dailyNotes}`);
  startupLog.push(`  Settings: ${MEMORY_FILES.settings}`);

  // ── 4. SPRAWDŹ WERSJĘ PAMIĘCI ───────────────
  const versionFile = path.join(MEMORY_PATHS.base, '.boka-version');
  let memoryVersion = 'unknown';
  if (fs.existsSync(versionFile)) {
    memoryVersion = fs.readFileSync(versionFile, 'utf-8').trim();
    startupLog.push(`Wersja pamięci: ${memoryVersion}`);
  } else {
    // Create version file
    const appVersion = '0.2.0';
    fs.writeFileSync(versionFile, appVersion, 'utf-8');
    memoryVersion = appVersion;
    startupLog.push(`Utworzono plik wersji pamięci: ${appVersion}`);
  }

  // ── 5. AUTO-SEED BAZY (dodane v0.2.0) ─────────
  // Jeśli baza istnieje ale nie ma członków rodziny — auto-seed
  // Zapobiega błędom "Nie znaleziono domownika" przy pierwszym uruchomieniu
  if (integrity.database.exists && integrity.database.readable) {
    startupLog.push('Sprawdzam bazę danych domowników...');
    try {
      const { ensureFamilySeeded } = await import('@/lib/auto-seed');
      const seedResult = await ensureFamilySeeded();
      if (seedResult.seeded) {
        startupLog.push(`Auto-seed: utworzono rodzinę i domowników (Tata, Mama, Syn)`);
        warnings.push('Baza została zseedowana domyślnymi domownikami (Tata Michał, Mama Ewa, Syn Jaś). Możesz to zmienić w zakładce Rodzina.');
      } else {
        startupLog.push(`Baza domowników OK (już ma dane)`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown';
      startupLog.push(`Auto-seed nie powiódł się: ${msg}`);
      errors.push(`Auto-seed bazy nie powiódł się: ${msg}. Uruchom ręcznie: npm run db:seed`);
    }
  }

  // ── RESULT ───────────────────────────────────
  const status = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok';

  return NextResponse.json({
    status,
    memoryVersion,
    paths: {
      base: MEMORY_PATHS.base,
      database: MEMORY_FILES.database,
      vault: MEMORY_PATHS.vault,
      dailyNotes: MEMORY_PATHS.dailyNotes,
      settings: MEMORY_FILES.settings,
    },
    integrity,
    startupLog,
    warnings,
    errors,
  });
}
