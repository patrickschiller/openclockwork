const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

export interface HealthResponse {
  status: string;
  service: string;
  utcTimestamp: string;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${baseUrl}/api/health`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
