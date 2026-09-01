import { NextRequest, NextResponse } from 'next/server';
import { loadSettings, saveSettings, testWhatnnection, type AISettings } from '@/lib/ai-providers';

// GET — load current settings
export async function GET() {
  const settings = loadSettings();
  // Mask API keys for display
  const masked: AISettings = {
    ...settings,
    openrouterKey: settings.openrouterKey
      ? settings.openrouterKey.substring(0, 8) + '...' + settings.openrouterKey.slice(-4)
      : '',
    customKey: settings.customKey
      ? settings.customKey.substring(0, 8) + '...' + settings.customKey.slice(-4)
      : '',
  };
  return NextResponse.json({ settings: masked });
}

// POST — save settings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const newSettings: AISettings = body.settings;

    if (!newSettings || !newSettings.provider) {
      return NextResponse.json({ error: 'None ustawień' }, { status: 400 });
    }

    // Merge with existing — don't lose keys if user sent masked ones
    const existing = loadSettings();

    // If key looks masked (contains ...), keep the old one
    if (newSettings.openrouterKey?.includes('...')) {
      newSettings.openrouterKey = existing.openrouterKey;
    }
    if (newSettings.customKey?.includes('...')) {
      newSettings.customKey = existing.customKey;
    }

    saveSettings({ ...existing, ...newSettings });

    return NextResponse.json({ ok: true, message: 'Settings zapisane' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Noznany błąd';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT — test connection
export async function PUT() {
  const result = await testWhatnnection();
  return NextResponse.json(result);
}
