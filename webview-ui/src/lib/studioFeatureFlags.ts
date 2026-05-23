/**
 * Feature flags for Studio UI versions
 */

export type StudioUIVersion = 'legacy' | 'vnext';

/**
 * Read feature flag from localStorage or environment
 */
export function getStudioUIVersion(): StudioUIVersion {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = localStorage.getItem('incident-studio-ui-version');
    if (stored === 'vnext' || stored === 'legacy') {
      return stored;
    }
  }
  // Fast preview default: show vNext when no explicit override exists.
  return 'vnext';
}

/**
 * Set feature flag
 */
export function setStudioUIVersion(version: StudioUIVersion): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('incident-studio-ui-version', version);
  }
}

/**
 * Check if vNext UI is enabled
 */
export function isStudioVNextEnabled(): boolean {
  return getStudioUIVersion() === 'vnext';
}
