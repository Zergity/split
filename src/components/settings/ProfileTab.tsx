import { useState, useEffect } from 'react';
import type { Member } from '../../types';

interface ProfileTabProps {
  currentUser: Member | null;
  onSave: (updates: Partial<Member>) => Promise<void>;
  onClose: () => void;
}

export function ProfileTab({ currentUser, onSave, onClose }: ProfileTabProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setError('');
    }
  }, [currentUser]);

  const handleSave = async () => {
    setError('');
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setLoading(true);
    try {
      await onSave({ name: name.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="p-6 space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Name field */}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
            Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Your name"
            disabled={loading}
          />
        </div>

      </div>

      {/* Footer */}
      <div className="flex gap-3 p-6 border-t border-gray-700">
        <button
          onClick={onClose}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </>
  );
}
