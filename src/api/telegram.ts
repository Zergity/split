import type { NotifyPrefs, TelegramStatus, ApiResponse } from '../types';

const API_BASE = '/api/telegram';

async function fetchTelegramApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Telegram API request failed');
  }

  return data.data as T;
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const data = await fetchTelegramApi<TelegramStatus>('/status');
  return data ?? { connected: false, notifyPrefs: null };
}

export async function connectTelegram(): Promise<{ deepLink: string }> {
  return fetchTelegramApi<{ deepLink: string }>('/connect', { method: 'POST' });
}

export async function disconnectTelegram(): Promise<void> {
  await fetchTelegramApi<void>('/disconnect', { method: 'DELETE' });
}

export async function updateTelegramPreferences(prefs: Partial<NotifyPrefs>): Promise<void> {
  await fetchTelegramApi<void>('/preferences', {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  });
}
