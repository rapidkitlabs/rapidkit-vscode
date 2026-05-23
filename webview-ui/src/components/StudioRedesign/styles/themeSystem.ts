/**
 * Theme System for Incident Studio
 * Supports light/dark/auto with persistent user preference
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

type ThemeKind = 'light' | 'dark';

// ─── Dark Theme (default, current system) ──────────────────────────────────

export const darkTheme = {
  // Base canvas
  root: '#0B1118',
  surface1: 'rgba(12, 20, 29, 0.88)',
  surface2: 'rgba(17, 27, 38, 0.93)',
  surface3: 'rgba(23, 35, 47, 0.97)',
  surface4: 'rgba(30, 45, 58, 0.98)',
  canvas: '#0D141D',
  heroGlow: 'none',

  // Borders & dividers
  border: {
    subtle: 'rgba(163, 194, 219, 0.12)',
    medium: 'rgba(163, 194, 219, 0.20)',
    strong: 'rgba(185, 219, 240, 0.34)',
  },

  // Text
  text: {
    primary: 'rgba(242, 248, 252, 0.95)',
    secondary: 'rgba(200, 214, 224, 0.84)',
    tertiary: 'rgba(155, 175, 189, 0.72)',
    quaternary: 'rgba(112, 134, 149, 0.76)',
    // Legacy aliases
    high: 'rgba(242, 248, 252, 0.95)',
    medium: 'rgba(200, 214, 224, 0.84)',
    muted: 'rgba(155, 175, 189, 0.72)',
    subtle: 'rgba(112, 134, 149, 0.76)',
  },

  // Brand & emphasis
  primary: '#18B8F2',
  primaryHover: '#47CBFC',
  primaryActive: '#0E9ECE',
  primaryInverse: 'rgba(24, 184, 242, 0.16)',
  accent: '#6F86F7',
  accentHover: '#94A4FF',
  teal: '#11C2DC',
  tealHover: '#50D2E8',

  success: '#33E199',
  successBg: 'rgba(51, 225, 153, 0.12)',
  warning: '#FFC462',
  warningBg: 'rgba(255, 196, 98, 0.13)',
  error: '#FF7E7E',
  errorBg: 'rgba(255, 126, 126, 0.13)',

  health: {
    ok: '#33E199',
    warning: '#FFC462',
    error: '#FF7E7E',
    unknown: 'rgba(127, 149, 167, 0.60)',
  },
};

// ─── Light Theme ───────────────────────────────────────────────────────────

export const lightTheme = {
  // Base canvas
  root: '#F7F9FC',
  surface1: 'rgba(255, 255, 255, 0.98)',
  surface2: 'rgba(247, 250, 253, 0.98)',
  surface3: 'rgba(241, 246, 251, 0.97)',
  surface4: 'rgba(234, 240, 247, 0.95)',
  canvas: '#F5F8FC',
  heroGlow: 'none',

  // Borders & dividers
  border: {
    subtle: 'rgba(15, 23, 42, 0.09)',
    medium: 'rgba(15, 23, 42, 0.14)',
    strong: 'rgba(15, 23, 42, 0.20)',
  },

  // Text
  text: {
    primary: 'rgba(15, 23, 42, 0.96)',
    secondary: 'rgba(51, 65, 85, 0.88)',
    tertiary: 'rgba(100, 116, 139, 0.80)',
    quaternary: 'rgba(148, 163, 184, 0.76)',
    // Legacy aliases
    high: 'rgba(15, 23, 42, 0.96)',
    medium: 'rgba(51, 65, 85, 0.88)',
    muted: 'rgba(100, 116, 139, 0.80)',
    subtle: 'rgba(148, 163, 184, 0.76)',
  },

  // Brand & emphasis
  primary: '#0A69D1',
  primaryHover: '#0957AE',
  primaryActive: '#07498F',
  primaryInverse: 'rgba(10, 105, 209, 0.10)',
  accent: '#5158D4',
  accentHover: '#4147B7',
  teal: '#0D8AA8',
  tealHover: '#0FB4D8',

  success: '#10B981',
  successBg: 'rgba(16, 185, 129, 0.10)',
  warning: '#F59E0B',
  warningBg: 'rgba(245, 158, 11, 0.10)',
  error: '#EF4444',
  errorBg: 'rgba(239, 68, 68, 0.10)',

  health: {
    ok: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    unknown: 'rgba(148, 163, 184, 0.60)',
  },
};

export type ColorTokens = typeof darkTheme;

function expandHex(value: string): string {
  const hex = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return '';
}

function rgbToHex(value: string): string {
  const match = value
    .trim()
    .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (!match) {
    return '';
  }

  const r = Math.max(0, Math.min(255, Number(match[1])))
    .toString(16)
    .padStart(2, '0');
  const g = Math.max(0, Math.min(255, Number(match[2])))
    .toString(16)
    .padStart(2, '0');
  const b = Math.max(0, Math.min(255, Number(match[3])))
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

function toHexColor(value: string, fallbackHex: string): string {
  return expandHex(value) || rgbToHex(value) || fallbackHex;
}

function readVSCodeVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }

  const computed = window.getComputedStyle(document.documentElement);
  const value = computed.getPropertyValue(name).trim();
  return value || fallback;
}

function readVSCodeHexVar(name: string, fallbackHex: string): string {
  return toHexColor(readVSCodeVar(name, fallbackHex), fallbackHex);
}

function withAlpha(hexColor: string, alphaPercent: number): string {
  return `color-mix(in srgb, ${hexColor} ${alphaPercent}%, transparent)`;
}

function buildAutoThemeFromVSCode(kind: ThemeKind): ColorTokens {
  const editorBg = readVSCodeHexVar(
    '--vscode-editor-background',
    kind === 'light' ? '#FFFFFF' : '#0B1118'
  );
  const panelBg = readVSCodeHexVar(
    '--vscode-sideBar-background',
    kind === 'light' ? '#F5F7FB' : '#0F1621'
  );
  const inputBg = readVSCodeHexVar(
    '--vscode-input-background',
    kind === 'light' ? '#FFFFFF' : '#111C28'
  );
  const foreground = readVSCodeHexVar(
    '--vscode-foreground',
    kind === 'light' ? '#0F172A' : '#E5EDF5'
  );
  const description = readVSCodeHexVar(
    '--vscode-descriptionForeground',
    kind === 'light' ? '#64748B' : '#9BAFC0'
  );
  const border = readVSCodeHexVar(
    '--vscode-panel-border',
    kind === 'light' ? '#CBD5E1' : '#2A3A4A'
  );
  const buttonBg = readVSCodeHexVar(
    '--vscode-button-background',
    kind === 'light' ? '#0A69D1' : '#1C8EE8'
  );
  const buttonHover = readVSCodeHexVar(
    '--vscode-button-hoverBackground',
    kind === 'light' ? '#0957AE' : '#3FA6F0'
  );
  const focusBorder = readVSCodeHexVar(
    '--vscode-focusBorder',
    kind === 'light' ? '#0A69D1' : '#47CBFC'
  );
  const link = readVSCodeHexVar(
    '--vscode-textLink-foreground',
    kind === 'light' ? '#0A69D1' : '#53C6FF'
  );
  const error = readVSCodeHexVar(
    '--vscode-errorForeground',
    kind === 'light' ? '#D13438' : '#F48771'
  );
  const warning = readVSCodeHexVar(
    '--vscode-editorWarning-foreground',
    kind === 'light' ? '#B36200' : '#CCA700'
  );
  const success = readVSCodeHexVar(
    '--vscode-terminal-ansiGreen',
    kind === 'light' ? '#0F8A5F' : '#33E199'
  );

  return {
    root: editorBg,
    surface1: withAlpha(editorBg, kind === 'light' ? 98 : 90),
    surface2: withAlpha(panelBg, kind === 'light' ? 96 : 92),
    surface3: withAlpha(inputBg, kind === 'light' ? 95 : 94),
    surface4: withAlpha(panelBg, kind === 'light' ? 92 : 97),
    canvas: editorBg,
    heroGlow: 'none',
    border: {
      subtle: withAlpha(border, kind === 'light' ? 34 : 46),
      medium: withAlpha(border, kind === 'light' ? 52 : 64),
      strong: withAlpha(border, kind === 'light' ? 70 : 80),
    },
    text: {
      primary: withAlpha(foreground, 96),
      secondary: withAlpha(foreground, kind === 'light' ? 82 : 88),
      tertiary: withAlpha(description, kind === 'light' ? 86 : 82),
      quaternary: withAlpha(description, kind === 'light' ? 72 : 70),
      high: withAlpha(foreground, 96),
      medium: withAlpha(foreground, kind === 'light' ? 82 : 88),
      muted: withAlpha(description, kind === 'light' ? 86 : 82),
      subtle: withAlpha(description, kind === 'light' ? 72 : 70),
    },
    primary: buttonBg,
    primaryHover: buttonHover,
    primaryActive: buttonBg,
    primaryInverse: withAlpha(buttonBg, kind === 'light' ? 14 : 20),
    accent: link,
    accentHover: focusBorder,
    teal: link,
    tealHover: focusBorder,
    success,
    successBg: withAlpha(success, kind === 'light' ? 14 : 18),
    warning,
    warningBg: withAlpha(warning, 18),
    error,
    errorBg: withAlpha(error, 16),
    health: {
      ok: success,
      warning,
      error,
      unknown: withAlpha(description, 65),
    },
  };
}

function hasThemeClass(target: Element | null, themeClass: string): boolean {
  return Boolean(target?.classList.contains(themeClass));
}

export function detectVSCodeThemeKind(): ThemeKind {
  if (typeof document === 'undefined') {
    return 'dark';
  }

  const html = document.documentElement;
  const body = document.body;

  if (
    hasThemeClass(html, 'vscode-light') ||
    hasThemeClass(html, 'vscode-high-contrast-light') ||
    hasThemeClass(body, 'vscode-light') ||
    hasThemeClass(body, 'vscode-high-contrast-light')
  ) {
    return 'light';
  }

  if (
    hasThemeClass(html, 'vscode-dark') ||
    hasThemeClass(html, 'vscode-high-contrast') ||
    hasThemeClass(body, 'vscode-dark') ||
    hasThemeClass(body, 'vscode-high-contrast')
  ) {
    return 'dark';
  }

  // Fallback for environments that expose theme kind via dataset attributes.
  const htmlTheme = html?.getAttribute('data-vscode-theme-kind');
  const bodyTheme = body?.getAttribute('data-vscode-theme-kind');
  const themeHint = `${htmlTheme || ''} ${bodyTheme || ''}`.toLowerCase();
  if (themeHint.includes('light')) {
    return 'light';
  }
  if (themeHint.includes('dark') || themeHint.includes('hc')) {
    return 'dark';
  }

  return 'dark';
}

/**
 * Get theme based on user preference + system preference
 */
export function getActiveTheme(userMode: ThemeMode): ColorTokens {
  if (userMode === 'dark') {
    return darkTheme;
  }
  if (userMode === 'light') {
    return lightTheme;
  }

  // 'auto' mode: derive tokens from active VS Code webview theme variables
  return buildAutoThemeFromVSCode(detectVSCodeThemeKind());
}

/**
 * Persist theme preference to localStorage
 */
export function saveThemePreference(mode: ThemeMode): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('studio-theme', mode);
  }
}

/**
 * Load theme preference from localStorage
 */
export function loadThemePreference(): ThemeMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('studio-theme') as ThemeMode | null;
    if (saved && ['light', 'dark', 'auto'].includes(saved)) {
      return saved;
    }
  }
  return 'auto'; // default
}
