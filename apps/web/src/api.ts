const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

type ApiOptions = {
  token?: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
};

export const api = async <T>(path: string, options: ApiOptions = {}): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorBody.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
};
