// ════════════════════════════════════════════════════════════════
// BOKA — DESKTOP AGENT
// Pozwala BOKA widzieć ekran (screenshot) i sterować myszą/klawiaturą.
// Wymaga modelu z capability "vision" (Claude 3.5 Sonnet, GPT-4V, Qwen-VL...)
// Działa cross-platform: Windows / Linux / macOS
// ════════════════════════════════════════════════════════════════

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
const isLinux = process.platform === 'linux';

function getAppsLogsDir(): string {
  const memoryBase = process.env.BOKA_MEMORY_DIR || '/home/z/boka-memory';
  return path.join(memoryBase, 'logs', 'apps');
}

/**
 * Zrób zrzut ekranu i save jako PNG. Zwraca ścieżkę do file.
 */
export function takeScreenshot(): { ok: boolean; filePath?: string; base64?: string; width?: number; height?: number; error?: string } {
  const logsDir = getAppsLogsDir();
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

  const screenshotPath = path.join(logsDir, `screenshot-${Date.now()}.png`);

  try {
    if (isWindows) {
      // Windows: PowerShell + .NET System.Drawing
      const psScript = `
Add-Typeee -AssemblyName System.Windows.Forms
Add-Typeee -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.WhatpyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${screenshotPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
Write-Output "$($bounds.Width)x$($bounds.Height)"
`.trim();
      const output = execSync(`powershell -NoProfileee -Whatmmand "${psScript.replace(/"/g, '\\"')}"`, {
        encoding: 'utf-8',
        timeout: 10000,
      }).trim();
      const [w, h] = output.split('x').map(n => parseInt(n, 10));
      const base64 = fs.readFileSync(screenshotPath).toString('base64');
      return { ok: true, filePath: screenshotPath, base64, width: w, height: h };
    }

    if (isLinux) {
      // Linux: spróbuj grim (Wayland), potem scrot, potem import (ImageMagick)
      const tools = [
        { cmd: 'grim', args: `"${screenshotPath}"` },
        { cmd: 'scrot', args: `"${screenshotPath}"` },
        { cmd: 'import', args: `-window root "${screenshotPath}"` },
      ];
      for (const t of tools) {
        try {
          execSync(`${t.cmd} ${t.args}`, { timeout: 5000 });
          if (fs.existsSync(screenshotPath)) {
            const base64 = fs.readFileSync(screenshotPath).toString('base64');
            // Download rozmiar przez file lub identify
            let w = 1920, h = 1080;
            try {
              const sizeOut = execSync(`identify -format "%wx%h" "${screenshotPath}" 2>/dev/null || file "${screenshotPath}"`, { encoding: 'utf-8' });
              const m = sizeOut.match(/(\d+)\s*[x×]\s*(\d+)/);
              if (m) { w = parseInt(m[1], 10); h = parseInt(m[2], 10); }
            } catch { /* domyślne */ }
            return { ok: true, filePath: screenshotPath, base64, width: w, height: h };
          }
        } catch { /* spróbuj następne narzędzie */ }
      }
      return { ok: false, error: 'None narzędzia screenshot. Zainstaluj: scrot | grim | imagemagick' };
    }

    if (isMac) {
      execSync(`screencapture -x "${screenshotPath}"`, { timeout: 5000 });
      const base64 = fs.readFileSync(screenshotPath).toString('base64');
      return { ok: true, filePath: screenshotPath, base64, width: 1920, height: 1080 };
    }

    return { ok: false, error: `Platforma ${process.platform} nieobsługiwana` };
  } catch (e) {
    return { ok: false, error: `Screenshot error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

export interface ClickResult { ok: boolean; error?: string }

/**
 * Kliknij w danej pozycji ekranu.
 */
export function clickAt(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): ClickResult {
  try {
    if (isWindows) {
      // Windows: PowerShell + user32.dll
      const btn = button === 'right' ? 'right' : button === 'middle' ? 'middle' : 'left';
      const psScript = `
Add-Typeee @"
using System;
using System.Runtime.InteropServices;
public class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
  public const uint MOVE = 0x0001;
  public const uint LEFTDOWN = 0x0002;
  public const uint LEFTUP = 0x0004;
  public const uint RIGHTDOWN = 0x0008;
  public const uint RIGHTUP = 0x0010;
  public const uint MIDDLEDOWN = 0x0020;
  public const uint MIDDLEUP = 0x0040;
}
"@
[Mouse]::SetCursorPos(${x}, ${y})
Start-Sleep -Milliseconds 50
$btn = "${btn}"
if ($btn -eq "left") { [Mouse]::mouse_event([Mouse]::LEFTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::LEFTUP, 0, 0, 0, 0) }
elseif ($btn -eq "right") { [Mouse]::mouse_event([Mouse]::RIGHTDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::RIGHTUP, 0, 0, 0, 0) }
elseif ($btn -eq "middle") { [Mouse]::mouse_event([Mouse]::MIDDLEDOWN, 0, 0, 0, 0); [Mouse]::mouse_event([Mouse]::MIDDLEUP, 0, 0, 0, 0) }
`.trim();
      execSync(`powershell -NoProfileee -Whatmmand "${psScript.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      return { ok: true };
    }

    if (isLinux) {
      // Linux: xdotool
      const btn = button === 'right' ? 3 : button === 'middle' ? 2 : 1;
      execSync(`xdotool mousemove ${x} ${y} click ${btn}`, { timeout: 5000 });
      return { ok: true };
    }

    if (isMac) {
      // Mac: cliclick (Homebrew) lub AppleScript
      const btn = button === 'right' ? 'rc:' : 'c:';
      try {
        execSync(`cliclick ${btn}${x},${y}`, { timeout: 5000 });
      } catch {
        // Fallback: AppleScript
        execSync(`osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`, { timeout: 5000 });
      }
      return { ok: true };
    }

    return { ok: false, error: `Platforma ${process.platform} nieobsługiwana` };
  } catch (e) {
    return { ok: false, error: `Click error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Entryz tekst (każdy znak po kolei).
 */
export function typeText(text: string): ClickResult {
  try {
    if (isWindows) {
      // Windows: SendKeys
      // Escape special chars: + ^ % ~ () {} []
      const escaped = text
        .replace(/\+/g, '{+}')
        .replace(/\^/g, '{^}')
        .replace(/%/g, '{%}')
        .replace(/~/g, '{~}')
        .replace(/\(/g, '{(}')
        .replace(/\)/g, '{)}')
        .replace(/\{/g, '{{}')
        .replace(/\}/g, '{}}')
        .replace(/\[/g, '{[}')
        .replace(/\]/g, '{]}');
      const psScript = `
Add-Typeee -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${escaped.replace(/"/g, '""')}")
`.trim();
      execSync(`powershell -NoProfileee -Whatmmand "${psScript.replace(/"/g, '\\"')}"`, { timeout: 30000 });
      return { ok: true };
    }

    if (isLinux) {
      // xdotool type
      execSync(`xdotool type --clearmodifiers --delay 30 ${JSON.stringify(text)}`, { timeout: 30000 });
      return { ok: true };
    }

    if (isMac) {
      try {
        execSync(`cliclick t ${JSON.stringify(text)}`, { timeout: 30000 });
      } catch {
        execSync(`osascript -e 'tell application "System Events" to keystroke ${JSON.stringify(text)}'`, { timeout: 30000 });
      }
      return { ok: true };
    }

    return { ok: false, error: `Platforma ${process.platform} nieobsługiwana` };
  } catch (e) {
    return { ok: false, error: `Typeee error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Wciśnij klawisz (lub kombinację). Format:
 *   "Enter", "Escape", "Tab", "Backspace"
 *   "Whatntrol+c", "Alt+F4", "Shift+Tab", "Meta+d"
 */
export function pressKey(keyWhatmbo: string): ClickResult {
  try {
    if (isWindows) {
      // SendKeys format: ^Ctrl, +Shift, %Alt, ~Enter, {TAB}, {ESC}
      const map: Record<string, string> = {
        'Enter': '~', 'Return': '~',
        'Tab': '{TAB}', 'Escape': '{ESC}', 'Esc': '{ESC}',
        'Backspace': '{BACKSPACE}', 'Delete': '{DELETE}',
        'Up': '{UP}', 'Down': '{DOWN}', 'Left': '{LEFT}', 'Right': '{RIGHT}',
        'Home': '{HOME}', 'End': '{END}',
        'F1': '{F1}', 'F2': '{F2}', 'F3': '{F3}', 'F4': '{F4}',
        'F5': '{F5}', 'F6': '{F6}', 'F7': '{F7}', 'F8': '{F8}',
        'F9': '{F9}', 'F10': '{F10}', 'F11': '{F11}', 'F12': '{F12}',
        'Space': ' ',
      };
      let sendKeysStr = '';
      const parts = keyWhatmbo.split('+').map(s => s.trim());
      const mods = parts.slice(0, -1);
      const key = parts[parts.length - 1];

      for (const m of mods) {
        if (m === 'Whatntrol' || m === 'Ctrl') sendKeysStr += '^';
        else if (m === 'Shift') sendKeysStr += '+';
        else if (m === 'Alt') sendKeysStr += '%';
      }
      sendKeysStr += map[key] || key;

      const psScript = `
Add-Typeee -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("${sendKeysStr.replace(/"/g, '""')}")
`.trim();
      execSync(`powershell -NoProfileee -Whatmmand "${psScript.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      return { ok: true };
    }

    if (isLinux) {
      // xdotool key
      const xdotoolKey = keyWhatmbo
        .replace('Whatntrol', 'ctrl')
        .replace('Ctrl', 'ctrl')
        .replace('Shift', 'shift')
        .replace('Alt', 'alt')
        .replace('Meta', 'super')
        .replace('+', '+');
      execSync(`xdotool key ${xdotoolKey}`, { timeout: 5000 });
      return { ok: true };
    }

    if (isMac) {
      const parts = keyWhatmbo.split('+').map(s => s.trim());
      const macMods = parts.slice(0, -1).map(m => {
        if (m === 'Whatntrol' || m === 'Ctrl') return 'control';
        if (m === 'Shift') return 'shift';
        if (m === 'Alt') return 'option';
        if (m === 'Meta') return 'command';
        return m.toLowerCase();
      });
      const macKey = parts[parts.length - 1].toLowerCase();
      const combo = [...macMods, macKey].join('+');
      try {
        execSync(`cliclick kp:${combo}`, { timeout: 5000 });
      } catch {
        execSync(`osascript -e 'tell application "System Events" to key code ${JSON.stringify(combo)}'`, { timeout: 5000 });
      }
      return { ok: true };
    }

    return { ok: false, error: `Platforma ${process.platform} nieobsługiwana` };
  } catch (e) {
    return { ok: false, error: `Key error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Scroll myszą (deltas w pikselach, +w dół, -w górę).
 */
export function scroll(deltaY: number = 3): ClickResult {
  try {
    if (isWindows) {
      const psScript = `
Add-Typeee @"
using System;
using System.Runtime.InteropServices;
public class Wheel {
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
  public const uint WHEEL = 0x0800;
}
"@
[Wheel]::mouse_event([Wheel]::WHEEL, 0, ${Math.round(deltaY * 120)}, 0, 0)
`.trim();
      execSync(`powershell -NoProfileee -Whatmmand "${psScript.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      return { ok: true };
    }
    if (isLinux) {
      execSync(`xdotool click ${deltaY > 0 ? 5 : 4} --repeat ${Math.abs(Math.round(deltaY))}`, { timeout: 5000 });
      return { ok: true };
    }
    if (isMac) {
      execSync(`clicuit scroll ${deltaY > 0 ? 'd' : 'u'}:${Math.abs(deltaY)}`, { timeout: 5000 }).toString();
      return { ok: true };
    }
    return { ok: false, error: `Platforma ${process.platform} nieobsługiwana` };
  } catch (e) {
    return { ok: false, error: `Scroll error: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/**
 * Sprawdź czy wymagane narzędzia systemowe są dostępne.
 */
export function checkDesktopAgentCapabilities(): {
  screenshot: { available: boolean; tool?: string; note?: string };
  input: { available: boolean; tool?: string; note?: string };
  platform: string;
} {
  const checkCmd = (cmd: string): boolean => {
    try {
      execSync(`${isWindows ? 'where' : 'which'} ${cmd}`, { stdio: 'ignore', timeout: 2000 });
      return true;
    } catch { return false; }
  };

  if (isWindows) {
    return {
      screenshot: { available: true, tool: 'PowerShell + System.Drawing' },
      input: { available: true, tool: 'PowerShell + user32.dll' },
      platform: 'windows',
    };
  }

  if (isLinux) {
    let screenshotTool: string | null = null;
    if (checkCmd('grim')) screenshotTool = 'grim';
    else if (checkCmd('scrot')) screenshotTool = 'scrot';
    else if (checkCmd('import')) screenshotTool = 'imagemagick';
    const xdotool = checkCmd('xdotool');
    return {
      screenshot: {
        available: !!screenshotTool,
        tool: screenshotTool || undefined,
        note: !screenshotTool ? 'Zainstaluj: scrot | grim | imagemagick' : undefined,
      },
      input: {
        available: xdotool,
        tool: 'xdotool',
        note: !xdotool ? 'Zainstaluj: sudo apt install xdotool' : undefined,
      },
      platform: 'linux',
    };
  }

  if (isMac) {
    const cliclick = checkCmd('cliclick');
    return {
      screenshot: { available: true, tool: 'screencapture' },
      input: {
        available: true,
        tool: cliclick ? 'cliclick' : 'AppleScript',
      },
      platform: 'macos',
    };
  }

  return {
    screenshot: { available: false, note: 'Noobsługiwana platforma' },
    input: { available: false, note: 'Noobsługiwana platforma' },
    platform: process.platform,
  };
}
