import { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from './AuthProvider';
import type { PasskeyInfo } from '../../types';
import type { PasskeyInviteInfo } from '../../api/auth';

export function PasskeyList() {
  const {
    listPasskeys,
    deletePasskey,
    authenticated,
    linkPasskey,
    createPasskeyInvite,
    webAuthnLoading,
    webAuthnError,
    clearWebAuthnError,
  } = useAuthContext();

  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [invite, setInvite] = useState<PasskeyInviteInfo | null>(null);
  const [addingOnDevice, setAddingOnDevice] = useState(false);
  const [friendlyName, setFriendlyName] = useState('');

  const loadPasskeys = useCallback(async () => {
    if (!authenticated) return;

    try {
      setLoading(true);
      setError(null);
      const keys = await listPasskeys();
      setPasskeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load passkeys');
    } finally {
      setLoading(false);
    }
  }, [authenticated, listPasskeys]);

  useEffect(() => {
    loadPasskeys();
  }, [loadPasskeys]);

  const handleDelete = async (passkeyId: string) => {
    if (passkeys.length <= 1) {
      setError('Cannot delete your only passkey');
      return;
    }

    if (!confirm('Are you sure you want to remove this passkey?')) {
      return;
    }

    try {
      setDeletingId(passkeyId);
      setError(null);
      await deletePasskey(passkeyId);
      setPasskeys(prev => prev.filter(p => p.id !== passkeyId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete passkey');
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddOnThisDevice = async () => {
    setAddingOnDevice(true);
    clearWebAuthnError();
    setError(null);

    try {
      await linkPasskey(friendlyName || undefined);
      setFriendlyName('');
      setShowAddOptions(false);
      await loadPasskeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add passkey');
    } finally {
      setAddingOnDevice(false);
    }
  };

  const handleCreateInvite = async () => {
    clearWebAuthnError();
    setError(null);

    try {
      const newInvite = await createPasskeyInvite();
      setInvite(newInvite);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    }
  };

  const handleCopyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
    } catch {
      // Fallback: select the text
    }
  };

  const handleCloseInvite = () => {
    setInvite(null);
    setShowAddOptions(false);
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-400">
        Loading passkeys...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-100">Your Passkeys</h3>
        <button
          onClick={() => setShowAddOptions(true)}
          className="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
        >
          + Add New
        </button>
      </div>

      {(error || webAuthnError) && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
          <p className="text-sm text-red-300">{error || webAuthnError}</p>
        </div>
      )}

      {/* Add Passkey Options */}
      {showAddOptions && !invite && (
        <div className="p-4 bg-gray-700/50 rounded-lg space-y-4">
          <h4 className="font-medium text-gray-200">Add a new passkey</h4>

          {/* Add on this device */}
          <div className="space-y-2">
            <input
              type="text"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="Device name (optional)"
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100"
              disabled={addingOnDevice || webAuthnLoading}
            />
            <button
              onClick={handleAddOnThisDevice}
              disabled={addingOnDevice || webAuthnLoading}
              className="w-full px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 text-sm"
            >
              {addingOnDevice || webAuthnLoading ? 'Adding...' : 'Add on this device'}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-700/50 text-gray-400">or</span>
            </div>
          </div>

          {/* Create invite for another device */}
          <button
            onClick={handleCreateInvite}
            disabled={webAuthnLoading}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 disabled:opacity-50 text-sm"
          >
            {webAuthnLoading ? 'Creating...' : 'Create invite for another device'}
          </button>

          <button
            onClick={() => setShowAddOptions(false)}
            className="w-full px-4 py-2 text-gray-400 hover:text-gray-300 text-sm"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Invite Created */}
      {invite && (
        <div className="p-4 bg-cyan-900/30 border border-cyan-700 rounded-lg space-y-3">
          <h4 className="font-medium text-cyan-300">Invite Created!</h4>
          <p className="text-sm text-gray-300">
            Scan the QR code or share the link with your other device. Expires in 10 minutes.
          </p>

          {/* QR Code */}
          <div className="flex justify-center bg-white p-3 rounded-lg">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(invite.inviteUrl)}`}
              alt="Invite QR Code"
              className="w-[180px] h-[180px]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-800 px-3 py-2 rounded text-sm text-cyan-400 font-mono overflow-hidden text-ellipsis">
                {invite.inviteCode}
              </code>
              <button
                onClick={handleCopyInvite}
                className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 text-sm"
              >
                Copy
              </button>
            </div>

            <div className="text-xs text-gray-400 break-all">
              {invite.inviteUrl}
            </div>
          </div>

          <button
            onClick={handleCloseInvite}
            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 text-sm"
          >
            Done
          </button>
        </div>
      )}

      {/* Passkey List */}
      {passkeys.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <p>No passkeys registered yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {passkeys.map((passkey) => (
            <div
              key={passkey.id}
              className="flex items-center justify-between p-3 bg-gray-700 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl">*</div>
                <div>
                  <div className="font-medium text-gray-100">
                    {passkey.friendlyName || 'Passkey'}
                  </div>
                  <div className="text-xs text-gray-400">
                    Created {formatDate(passkey.createdAt)}
                    {passkey.lastUsedAt && (
                      <> | Last used {formatDate(passkey.lastUsedAt)}</>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(passkey.id)}
                disabled={deletingId === passkey.id || passkeys.length <= 1}
                className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={passkeys.length <= 1 ? 'Cannot delete your only passkey' : 'Remove passkey'}
              >
                {deletingId === passkey.id ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center">
        Passkeys are securely stored on your device
      </p>
    </div>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}
