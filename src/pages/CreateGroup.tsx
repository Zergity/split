import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import { useApp } from '../context/AppContext';
import { useAuthContext } from '../components/auth';

export function CreateGroup() {
  const navigate = useNavigate();
  const { setActiveGroup, refreshGroups, refreshData } = useApp();
  const { authenticated, session } = useAuthContext();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('K');
  const [displayName, setDisplayName] = useState(session?.userName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!authenticated) {
    return (
      <div className="max-w-md mx-auto mt-8 bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-400">Sign in first to create a group.</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const group = await api.createGroup(name.trim(), currency.trim() || 'K', displayName.trim() || undefined);
      // Switch into the new group before refreshing so the next data fetch targets it.
      setActiveGroup(group.id);
      await Promise.all([refreshGroups(), refreshData()]);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Create a new group</h1>
      <p className="text-sm text-gray-400 mb-6">
        You'll be the admin. Invite others by sharing the invite link from the group manager.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Group name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Weekend Trip"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100"
            autoFocus
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Currency</label>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="K, VND, USD…"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100"
          />
          <p className="text-xs text-gray-500 mt-1">Shown next to amounts. You can change this later.</p>
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">Your display name in this group</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={session?.userName ?? 'Your name'}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100"
          />
          <p className="text-xs text-gray-500 mt-1">Can differ per group. Defaults to your profile name.</p>
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/groups')}
            className="flex-1 py-2.5 border border-gray-600 hover:bg-gray-800 text-gray-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg font-medium"
          >
            {submitting ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}
