/**
 * Design Tokens - Signature Enterprise Dark System
 * Workspai Incident Studio vNext
 */

export const colorTokens = {
  // Base canvas
  root: '#091018',
  surface1: 'rgba(10, 20, 29, 0.86)',
  surface2: 'rgba(16, 28, 39, 0.92)',
  surface3: 'rgba(24, 39, 53, 0.96)',
  surface4: 'rgba(34, 52, 67, 0.98)',
  canvas: '#0b1520',
  heroGlow: 'none',

  // Borders & dividers
  border: {
    subtle: 'rgba(163, 194, 219, 0.10)',
    medium: 'rgba(163, 194, 219, 0.18)',
    strong: 'rgba(185, 219, 240, 0.32)',
  },

  // Text
  text: {
    primary: 'rgba(242, 248, 252, 0.95)',
    secondary: 'rgba(208, 221, 231, 0.88)',
    tertiary: 'rgba(173, 191, 204, 0.80)',
    quaternary: 'rgba(138, 158, 172, 0.78)',
    // Legacy aliases
    high: 'rgba(242, 248, 252, 0.95)',
    medium: 'rgba(200, 214, 224, 0.84)',
    muted: 'rgba(155, 175, 189, 0.72)',
    subtle: 'rgba(112, 134, 149, 0.76)',
  },

  // Brand & emphasis
  primary: '#1CD2FF',
  primaryHover: '#61DFFF',
  primaryActive: '#0DB9EA',
  primaryInverse: 'rgba(28, 210, 255, 0.16)',
  accent: '#7E8CFF',
  accentHover: '#A5AEFF',
  teal: '#1CD2FF',
  tealHover: '#61DFFF',

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

export const fontTokens = {
  ui: 'var(--vscode-font-family, "Aptos", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif)',
  mono: 'var(--vscode-editor-font-family, "Consolas", "Courier New", monospace)',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  xxxl: '40px',
};

export const typography = {
  display: {
    fontSize: '30px',
    fontWeight: 700,
    lineHeight: '1.1',
    letterSpacing: '-0.9px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: 700,
    lineHeight: '1.2',
    letterSpacing: '-0.6px',
  },
  h2: {
    fontSize: '17px',
    fontWeight: 600,
    lineHeight: '1.35',
    letterSpacing: '-0.2px',
  },
  h3: {
    fontSize: '15px',
    fontWeight: 600,
    lineHeight: '1.4',
    letterSpacing: '0px',
  },
  labelSmall: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase' as const,
  },
  label: {
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.35px',
  },
  bodySmall: {
    fontSize: '12px',
    fontWeight: 500,
    lineHeight: '1.5',
  },
  body: {
    fontSize: '13px',
    fontWeight: 400,
    lineHeight: '1.6',
  },
  bodyLarge: {
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '1.65',
  },
  code: {
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '1.5',
    fontFamily: fontTokens.mono,
  },
  caption: {
    fontSize: '11px',
    fontWeight: 400,
    lineHeight: '1.45',
  },
  captionSmall: {
    fontSize: '11px',
    fontWeight: 600,
    lineHeight: '1.4',
    letterSpacing: '0.2px',
  },
  headingSmall: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: '1.4',
  },
  heading: {
    fontSize: '14px',
    fontWeight: 600,
    lineHeight: '1.5',
  },
};

export const borderRadius = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  full: '999px',
};

export const layout = {
  activityBar: '46px',
  contextPanel: '280px',
};

export const breakpoints = {
  wide: '1440px',
  normal: '1240px',
  compact: '1024px',
  mobile: '760px',
};

export const shadows = {
  xs: 'none',
  sm: 'none',
  md: 'none',
  lg: 'none',
  xl: 'none',
  elevation1: 'none',
  elevation2: 'none',
};

export const gridBaseline = 8;

export const transitions = {
  microInteraction: 'all 120ms cubic-bezier(0.4, 0, 0.2, 1)',
  standard: 'all 220ms cubic-bezier(0.22, 1, 0.36, 1)',
  emphasized: 'all 360ms cubic-bezier(0.22, 1, 0.36, 1)',
};

export const motionTokens = {
  easing: {
    emphasized: 'cubic-bezier(0.22, 1, 0.36, 1)',
  },
  durations: {
    headerEnter: 380,
    stepperEnter: 420,
    surfaceEnter: 460,
    deckEnter: 420,
    chipFade: 360,
    pulse: 1500,
  },
  delays: {
    stepperAfterHeader: 60,
    surfaceAfterHeader: 110,
    deckAfterSurface: 170,
    chipsBase: 130,
    chipsStep: 40,
  },
};
