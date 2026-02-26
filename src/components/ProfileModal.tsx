import { useState, useEffect } from 'react';
import type { Member } from '../types';
import { ProfileTab } from './settings/ProfileTab';
import { PreferencesTab } from './settings/PreferencesTab';
import { NotificationsTab } from './settings/NotificationsTab';

interface ProfileModalProps {
  isOpen: boolean;
  currentUser: Member | null;
  onClose: () => void;
  onSave: (updates: Partial<Member>) => Promise<void>;
}

type Tab = 'profile' | 'preferences' | 'notifications';

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: '👤 Profile' },
  { id: 'preferences', label: '⚙️ Preferences' },
  { id: 'notifications', label: '🔔 Notifications' },
];

export function ProfileModal({ isOpen, currentUser, onClose, onSave }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Reset to profile tab when modal opens
  useEffect(() => {
    if (isOpen) setActiveTab('profile');
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-gray-700">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'profile' && (
          <ProfileTab currentUser={currentUser} onSave={onSave} onClose={onClose} />
        )}
        {activeTab === 'preferences' && <PreferencesTab currentUser={currentUser} onSave={onSave} />}
        {activeTab === 'notifications' && (
          <div className="p-6">
            <NotificationsTab />
          </div>
        )}
      </div>
    </div>
  );
}
