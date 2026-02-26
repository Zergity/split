import { usePushNotifications } from '../hooks/usePushNotifications';

export function NotificationToggle() {
  const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } =
    usePushNotifications();

  if (!isSupported) return null;

  if (permission === 'denied') {
    return (
      <p className="text-xs text-gray-500">
        Notifications blocked in browser settings
      </p>
    );
  }

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full ${
        isSubscribed
          ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-700'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      } disabled:opacity-50`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
        />
      </svg>
      {loading ? '...' : isSubscribed ? 'Notifications On' : 'Enable Notifications'}
    </button>
  );
}
