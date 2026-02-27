import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { MemberSelector } from './MemberSelector';
import { NotificationBell } from './NotificationBell';
import { useApp } from '../context/AppContext';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { loading, error } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const canGoBack = location.key !== 'default';

  const handleBack = () => {
    navigate(-1);
  };

  const handleReload = async () => {
    // Hard reload: clear caches first, then reload
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-gray-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 shadow-sm border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* iOS Safari navigation buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleBack}
                disabled={!canGoBack}
                className="cursor-pointer p-2.5 text-gray-400 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Go back"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={handleReload}
                className="cursor-pointer p-2.5 text-gray-400 hover:text-gray-200"
                aria-label="Reload"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="1Matrix" className="w-8 h-8" />
              <h1 className="text-xl font-bold text-cyan-400">1Matrix</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <MemberSelector />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>
      <Navigation />
    </div>
  );
}
