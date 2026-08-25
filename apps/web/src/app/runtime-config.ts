declare global {
  interface Window {
    __OPENClockwork_CONFIG__?: {
      demoMode?: boolean;
      supportUrl?: string | null;
    };
  }
}

const DEFAULT_SUPPORT_URL = 'https://github.com/sponsors/patrickschiller';

export function isDemoMode(): boolean {
  return window.__OPENClockwork_CONFIG__?.demoMode === true;
}

/**
 * Voluntary support is deliberately just a link. It never controls an
 * entitlement and can be disabled by self-hosters with an empty/null value.
 */
export function supportUrl(): string | null {
  const configured = window.__OPENClockwork_CONFIG__?.supportUrl;
  if (configured === null || configured === '') return null;
  const candidate = configured ?? DEFAULT_SUPPORT_URL;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}
