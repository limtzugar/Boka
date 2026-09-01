// ═══════════════════════════════════════════════════════════
// BOKA — Memory Paths Configuration
// Centralna konfiguracja ścieżek pamięci
// Pamięć jest OSOBNO od aplikacji — /home/z/boka-memory/
// Aplikację można nadpisać, pamięć przetrwa
// ═══════════════════════════════════════════════════════════

import path from 'path';
import fs from 'fs';

// ── ŚCIEŻKA BAZOWA PAMIĘCI ────────────────────
// Można nadpisać zmienną środowiskową BOKA_MEMORY_DIR
const MEMORY_BASE = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';

// ── STRUKTURA FOLDERU PAMIĘCI ─────────────────
// /home/z/boka-memory/
// ├── db/              ← Baza danych SQLite (boka.db)
// ├── vault/           ← Notatki .md BOKA (jak Obsidian Vault)
// ├── daily-notes/     ← Codzienne notatki (po jednym .md na dzień)
// ├── settings/        ← Ustawienia (boka-settings.json)
// ├── backups/         ← Auto-backupy pamięci
// └── logs/            ← Logi pamięci (decay, evolucja soul)

export const MEMORY_PATHS = {
  base: MEMORY_BASE,
  db: path.join(MEMORY_BASE, 'db'),
  vault: path.join(MEMORY_BASE, 'vault'),
  dailyNotes: path.join(MEMORY_BASE, 'daily-notes'),
  settings: path.join(MEMORY_BASE, 'settings'),
  backups: path.join(MEMORY_BASE, 'backups'),
  logs: path.join(MEMORY_BASE, 'logs'),
} as const;

// ── KONKRETNE PLIKI ───────────────────────────

export const MEMORY_FILES = {
  database: path.join(MEMORY_PATHS.db, 'boka.db'),
  settings: path.join(MEMORY_PATHS.settings, 'boka-settings.json'),
  memoryLog: path.join(MEMORY_PATHS.logs, 'memory.log'),
  soulLog: path.join(MEMORY_PATHS.logs, 'soul-evolution.log'),
  vaultIndex: path.join(MEMORY_PATHS.vault, '_index.json'),
  integrityCheck: path.join(MEMORY_PATHS.base, '.boka-integrity.json'),
} as const;

// ── DATABASE URL dla Prisma ───────────────────

export const DATABASE_URL = `file:${MEMORY_FILES.database}`;

// ── INICJALIZACJA ─────────────────────────────

/**
 * Sprawdź i utwórz strukturę folderów pamięci.
 * Wywoływane przy starcie aplikacji.
 */
export function ensureMemoryStructure(): {
  ok: boolean;
  created: string[];
  errors: string[];
} {
  const created: string[] = [];
  const errors: string[] = [];

  for (const [name, dirPath] of Object.entries(MEMORY_PATHS)) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        created.push(`${name}: ${dirPath}`);
      }
    } catch (e) {
      errors.push(`${name}: ${dirPath} — ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }

  return {
    ok: errors.length === 0,
    created,
    errors,
  };
}

/**
 * Weryfikacja integralności pamięci.
 * Sprawdza czy pliki DB istnieją i są poprawne.
 * Wywoływane przy każdym starcie.
 */
export function verifyMemoryIntegrity(): {
  ok: boolean;
  database: { exists: boolean; size: number; readable: boolean };
  settings: { exists: boolean; parseable: boolean };
  vault: { exists: boolean; fileCount: number };
  errors: string[];
} {
  const errors: string[] = [];

  // Database check
  const dbExists = fs.existsSync(MEMORY_FILES.database);
  const dbSize = dbExists ? fs.statSync(MEMORY_FILES.database).size : 0;
  let dbReadable = false;
  if (dbExists && dbSize > 0) {
    try {
      const buffer = fs.readFileSync(MEMORY_FILES.database);
      // SQLite magic header: "SQLite format 3\000"
      dbReadable = buffer.slice(0, 16).toString('ascii').startsWith('SQLite');
      if (!dbReadable) errors.push('Plik bazy danych nie jest poprawnym SQLite');
    } catch {
      errors.push('Nie można odczytać pliku bazy danych');
    }
  } else if (!dbExists) {
    errors.push('Plik bazy danych nie istnieje — zostanie utworzony');
  }

  // Settings check
  const settingsExists = fs.existsSync(MEMORY_FILES.settings);
  let settingsParseable = false;
  if (settingsExists) {
    try {
      JSON.parse(fs.readFileSync(MEMORY_FILES.settings, 'utf-8'));
      settingsParseable = true;
    } catch {
      errors.push('Plik ustawień nie jest poprawnym JSON');
    }
  }

  // Vault check
  const vaultExists = fs.existsSync(MEMORY_PATHS.vault);
  let vaultFileCount = 0;
  if (vaultExists) {
    try {
      vaultFileCount = fs.readdirSync(MEMORY_PATHS.vault).filter(f => f.endsWith('.md')).length;
    } catch {
      // empty vault is ok
    }
  }

  // Write integrity report
  const report = {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    database: { exists: dbExists, size: dbSize, readable: dbReadable },
    settings: { exists: settingsExists, parseable: settingsParseable },
    vault: { exists: vaultExists, fileCount: vaultFileCount },
    errors,
  };

  try {
    fs.writeFileSync(MEMORY_FILES.integrityCheck, JSON.stringify(report, null, 2), 'utf-8');
  } catch {
    // Non-critical
  }

  return report;
}

/**
 * Zapisz notatkę .md do vault na dysku.
 * BOKA pisze notatki jak człowiek — każdy plik to .md
 */
export function writeVaultNote(filename: string, content: string): string {
  // Sanitize filename
  const safeName = filename.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ_\-\.\/ ]/g, '_');
  const filePath = path.join(MEMORY_PATHS.vault, `${safeName}.md`);

  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  } catch (e) {
    throw new Error(`Nie można zapisać notatki: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

/**
 * Czytaj notatkę .md z vault.
 */
export function readVaultNote(filename: string): string | null {
  const filePath = path.join(MEMORY_PATHS.vault, `${filename}.md`);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Lista wszystkich notatek .md w vault.
 */
export function listVaultNotes(): string[] {
  try {
    return fs.readdirSync(MEMORY_PATHS.vault)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));
  } catch {
    return [];
  }
}

/**
 * Zapisz Daily Note na dysk.
 * Jeden plik .md per dzień — jak w Obsidian.
 */
export function writeDailyNote(date: string, content: string): string {
  const filePath = path.join(MEMORY_PATHS.dailyNotes, `${date}.md`);
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  } catch (e) {
    throw new Error(`Nie można zapisać daily note: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}

/**
 * Czytaj Daily Note z dysku.
 */
export function readDailyNote(date: string): string | null {
  const filePath = path.join(MEMORY_PATHS.dailyNotes, `${date}.md`);
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Backup pamięci — kopia DB + vault + settings.
 */
export function createMemoryBackup(label?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupLabel = label || timestamp;
  const backupDir = path.join(MEMORY_PATHS.backups, backupLabel);

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    // Copy database
    if (fs.existsSync(MEMORY_FILES.database)) {
      fs.copyFileSync(MEMORY_FILES.database, path.join(backupDir, 'boka.db'));
    }

    // Copy settings
    if (fs.existsSync(MEMORY_FILES.settings)) {
      fs.copyFileSync(MEMORY_FILES.settings, path.join(backupDir, 'boka-settings.json'));
    }

    // Copy vault
    const vaultBackup = path.join(backupDir, 'vault');
    if (fs.existsSync(MEMORY_PATHS.vault)) {
      fs.mkdirSync(vaultBackup, { recursive: true });
      for (const file of fs.readdirSync(MEMORY_PATHS.vault)) {
        if (file.endsWith('.md')) {
          fs.copyFileSync(
            path.join(MEMORY_PATHS.vault, file),
            path.join(vaultBackup, file)
          );
        }
      }
    }

    // Copy daily notes
    const dailyBackup = path.join(backupDir, 'daily-notes');
    if (fs.existsSync(MEMORY_PATHS.dailyNotes)) {
      fs.mkdirSync(dailyBackup, { recursive: true });
      for (const file of fs.readdirSync(MEMORY_PATHS.dailyNotes)) {
        if (file.endsWith('.md')) {
          fs.copyFileSync(
            path.join(MEMORY_PATHS.dailyNotes, file),
            path.join(dailyBackup, file)
          );
        }
      }
    }

    return backupDir;
  } catch (e) {
    throw new Error(`Backup pamięci nie powiódł się: ${e instanceof Error ? e.message : 'unknown'}`);
  }
}
