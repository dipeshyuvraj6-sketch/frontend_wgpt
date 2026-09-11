export type WeatherData = {
  temperature?: number | string;
  temperature_max?: number | string;
  temperature_min?: number | string;
  humidity?: number | string;
  rain?: number | string;
  wind?: number | string;
  uv_index?: number | string;
  daily_forecast?: Array<Record<string, unknown>> | Record<string, unknown>;
};

export type ChatResponse = {
  response: string;
  weather_data?: WeatherData | null;
  intent?: string | null;
  location?: string | null;
  date?: string | null;
  voice_response?: string | null;
};

export type ChatRequest = {
  message: string;
  lat: number | null;
  lon: number | null;
};

type GeocodingResponse = {
  results?: Array<{ name: string; latitude: number; longitude: number }>;
};

function endpoint(kind: 'health' | 'chat') {
  const configured = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
  if (!configured) return kind === 'health' ? '/health' : '/api/chat';
  if (configured.endsWith('/api')) return kind === 'health' ? `${configured}/health` : `${configured}/chat`;
  return kind === 'health' ? `${configured}/health` : `${configured}/api/chat`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      detail = body.detail || body.message || detail;
    } catch {
      // Keep the useful status message when the server did not return JSON.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function checkHealth(signal?: AbortSignal) {
  const response = await fetch(endpoint('health'), { method: 'GET', signal });
  return parseResponse<Record<string, unknown>>(response);
}

export async function sendChat(payload: ChatRequest, signal?: AbortSignal) {
  const response = await fetch(endpoint('chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  return parseResponse<ChatResponse>(response);
}

export async function geocodeCity(city: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ name: city, count: '1', language: 'en', format: 'json' });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
  const data = await parseResponse<GeocodingResponse>(response);
  const result = data.results?.[0];
  if (!result) throw new Error(`Could not find coordinates for ${city}`);
  return result;
}