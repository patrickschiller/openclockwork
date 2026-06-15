declare global {
  interface Window {
    __OPENClockwork_CONFIG__?: {
      demoMode?: boolean;
    };
  }
}

export function isDemoMode(): boolean {
  return window.__OPENClockwork_CONFIG__?.demoMode === true;
}
