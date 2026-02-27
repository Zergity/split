import { useState, useEffect, useRef } from 'react';
import type { NotifyPrefs, TelegramStatus } from '../../types';
import {
  getTelegramStatus,
  connectTelegram,
  disconnectTelegram,
  updateTelegramPreferences,
} from '../../api/telegram';

const PREF_LABELS: Record<keyof NotifyPrefs, string> = {
  newExpense: 'New expense added',
  expenseEdited: 'Expense edited',
  expenseDeleted: 'Expense deleted',
  settlementRequest: 'Settlement request received',
  settlementAccepted: 'Settlement accepted',
  settlementRejected: 'Settlement rejected',
};

export function NotificationsTab() {
  const [status, setStatus] = useState<TelegramStatus>({ connected: false, notifyPrefs: null });
  const [connecting, setConnecting] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getTelegramStatus().then(setStatus).catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleConnect = async () => {
    setError('');
    setConnecting(true);
    try {
      const { deepLink: link } = await connectTelegram();
      setDeepLink(link);

      // Poll every 3s for up to 2 minutes (40 attempts)
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const s = await getTelegramStatus();
          if (s.connected) {
            setStatus(s);
            setDeepLink(null);
            setConnecting(false);
            stopPolling();
          } else if (attempts >= 40) {
            setConnecting(false);
            setDeepLink(null);
            stopPolling();
          }
        } catch {
          // ignore poll errors
        }
      }, 3000);
    } catch {
      setError('Failed to generate connect link. Please try again.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    try {
      await disconnectTelegram();
      setStatus({ connected: false, notifyPrefs: null });
    } catch {
      setError('Failed to disconnect. Please try again.');
    }
  };

  const togglePref = async (key: keyof NotifyPrefs) => {
    if (!status.notifyPrefs) return;
    const updated = { ...status.notifyPrefs, [key]: !status.notifyPrefs[key] };
    setStatus((s) => ({ ...s, notifyPrefs: updated }));
    try {
      await updateTelegramPreferences({ [key]: updated[key] });
    } catch {
      // Revert on failure
      setStatus((s) => ({ ...s, notifyPrefs: status.notifyPrefs }));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-sm text-gray-200 mb-3">
          Telegram Notifications
        </h3>

        <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${status.connected ? 'text-green-400' : 'text-gray-500'}`}>
              ●
            </span>
            <span className="text-sm text-gray-200">
              {status.connected ? 'Connected' : 'Not connected'}
            </span>
          </div>

          {status.connected ? (
            <button
              onClick={handleDisconnect}
              className="text-xs text-red-500 hover:text-red-600 underline"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors"
            >
              {connecting ? 'Waiting...' : 'Connect Telegram'}
            </button>
          )}
        </div>

        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 mt-2 p-2.5 bg-blue-900/30 text-blue-400 text-sm rounded-lg hover:bg-blue-900/50 transition-colors"
          >
            <span>Open in Telegram</span>
            <span>→</span>
          </a>
        )}

        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}
      </div>

      {status.connected && status.notifyPrefs && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2">
            Notify me when:
          </p>
          <div className="space-y-2.5">
            {(Object.keys(PREF_LABELS) as Array<keyof NotifyPrefs>).map((key) => (
              <label
                key={key}
                className="flex items-center gap-3 text-sm text-gray-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={status.notifyPrefs![key]}
                  onChange={() => togglePref(key)}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500"
                />
                {PREF_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
