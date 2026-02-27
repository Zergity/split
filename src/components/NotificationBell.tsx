import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationRecord } from '../types';
import * as api from '../api/client';
import { useAuthContext } from './auth/AuthProvider';
import { usePushNotifications } from '../hooks/usePushNotifications';

export function NotificationBell() {
  const { authenticated } = useAuthContext();
  const navigate = useNavigate();
  const push = usePushNotifications();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!authenticated) return;
    try {
      const data = await api.getNotifications();
      setNotifications(data);
    } catch {
      // ignore
    }
  }, [authenticated]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Refresh on service worker REFRESH_DATA
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handler = () => { fetchNotifications(); };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = async () => {
    setOpen(!open);
    if (!open && unreadCount > 0) {
      try {
        const updated = await api.markNotificationsRead();
        setNotifications(updated);
      } catch {
        // ignore
      }
    }
  };

  const handleClick = (n: NotificationRecord) => {
    setOpen(false);
    if (n.url) navigate(n.url);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  if (!authenticated) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="p-1.5 text-gray-400 hover:text-gray-200 relative"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
          {/* Push notification toggle */}
          {push.isSupported && (
            <div className="px-3 py-2.5 border-b border-gray-700">
              {push.permission === 'denied' ? (
                <p className="text-xs text-gray-500">Push notifications blocked in browser settings</p>
              ) : (
                <button
                  onClick={push.isSubscribed ? push.unsubscribe : push.subscribe}
                  disabled={push.loading}
                  className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded text-xs font-medium ${
                    push.isSubscribed
                      ? 'text-cyan-400 bg-cyan-900/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                  } disabled:opacity-50`}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  {push.loading ? '...' : push.isSubscribed ? 'Push notifications on' : 'Enable push notifications'}
                </button>
              )}
            </div>
          )}

          {/* Notification history */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50 ${
                    !n.read ? 'bg-gray-700/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-200 truncate">{n.title}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{n.body}</div>
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
