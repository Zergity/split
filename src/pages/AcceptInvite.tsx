import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthContext } from '../components/auth';
import * as authApi from '../api/auth';

type Mode = 'choose' | 'new-passkey' | 'existing-passkey';

export function AcceptInvite() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    authenticated,
    acceptPasskeyInvite,
    authenticate,
    webAuthnLoading,
    webAuthnError,
    clearWebAuthnError,
  } = useAuthContext();

  const [memberName, setMemberName] = useState<string | null>(null);
  const [friendlyName, setFriendlyName] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'registering' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('choose');

  // Validate invite code on mount
  useEffect(() => {
    if (!code) {
      setStatus('error');
      setError('Invalid invite link');
      return;
    }

    // Check if invite is valid by fetching options (this also returns memberName)
    authApi.getInvitePasskeyOptions(code)
      .then(({ memberName }) => {
        setMemberName(memberName);
        setStatus('ready');
      })
      .catch((err) => {
        setStatus('error');
        setError(err.message || 'Invalid or expired invite code');
      });
  }, [code]);

  const handleCreateNewPasskey = async () => {
    if (!code) return;

    setStatus('registering');
    clearWebAuthnError();
    setError(null);

    try {
      await acceptPasskeyInvite(code, friendlyName || undefined);
      setStatus('success');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setStatus('ready');
      setError(err instanceof Error ? err.message : 'Failed to register passkey');
    }
  };

  const handleUseExistingPasskey = async () => {
    setStatus('registering');
    clearWebAuthnError();
    setError(null);

    try {
      await authenticate();
      setStatus('success');
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setStatus('ready');
      setError(err instanceof Error ? err.message : 'Failed to sign in');
    }
  };

  const handleBack = () => {
    setMode('choose');
    setError(null);
    clearWebAuthnError();
  };

  // If user is already authenticated, show a different message
  if (authenticated) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-gray-800 rounded-xl p-6 text-center border border-gray-700">
          <div className="text-4xl mb-4">Done!</div>
          <h2 className="text-xl font-semibold text-green-400 mb-2">You're signed in!</h2>
          <p className="text-gray-400 mb-4">
            You're now signed in as <span className="text-cyan-400 font-medium">{memberName}</span>.
          </p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        {status === 'loading' && (
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">...</div>
            <p className="text-gray-400">Validating invite...</p>
          </div>
        )}

        {status === 'ready' && mode === 'choose' && (
          <div className="text-center">
            <div className="text-4xl mb-4">+</div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Join as {memberName}</h2>
            <p className="text-gray-400 mb-6">
              How would you like to sign in on this device?
            </p>

            {(error || webAuthnError) && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error || webAuthnError}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={() => setMode('existing-passkey')}
                className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-medium"
              >
                Use existing passkey
              </button>
              <p className="text-xs text-gray-500">
                If you already have a passkey for this account on this device
              </p>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-800 text-gray-400">or</span>
                </div>
              </div>

              <button
                onClick={() => setMode('new-passkey')}
                className="w-full px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-500 font-medium"
              >
                Create new passkey
              </button>
              <p className="text-xs text-gray-500">
                Register a new passkey on this device
              </p>
            </div>
          </div>
        )}

        {status === 'ready' && mode === 'existing-passkey' && (
          <div className="text-center">
            <div className="text-4xl mb-4">*</div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Use Existing Passkey</h2>
            <p className="text-gray-400 mb-6">
              Sign in with a passkey you've already registered for <span className="text-cyan-400 font-medium">{memberName}</span>.
            </p>

            {(error || webAuthnError) && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error || webAuthnError}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleUseExistingPasskey}
                disabled={webAuthnLoading}
                className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 font-medium"
              >
                {webAuthnLoading ? 'Signing in...' : 'Sign in with passkey'}
              </button>
              <button
                onClick={handleBack}
                disabled={webAuthnLoading}
                className="w-full px-4 py-2 text-gray-400 hover:text-gray-300"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {status === 'ready' && mode === 'new-passkey' && (
          <div className="text-center">
            <div className="text-4xl mb-4">+</div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Create New Passkey</h2>
            <p className="text-gray-400 mb-6">
              Register a new passkey for <span className="text-cyan-400 font-medium">{memberName}</span> on this device.
            </p>

            {(error || webAuthnError) && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error || webAuthnError}</p>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-2 text-left">
                Device name (optional)
              </label>
              <input
                type="text"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="e.g., My iPhone"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100"
                disabled={webAuthnLoading}
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCreateNewPasskey}
                disabled={webAuthnLoading}
                className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 font-medium"
              >
                {webAuthnLoading ? 'Creating...' : 'Create passkey'}
              </button>
              <button
                onClick={handleBack}
                disabled={webAuthnLoading}
                className="w-full px-4 py-2 text-gray-400 hover:text-gray-300"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {status === 'registering' && (
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">...</div>
            <p className="text-gray-400">
              {mode === 'existing-passkey'
                ? 'Complete the sign-in on your device...'
                : 'Complete the passkey registration on your device...'}
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="text-4xl mb-4">Done!</div>
            <h2 className="text-xl font-semibold text-green-400 mb-2">
              {mode === 'existing-passkey' ? 'Signed In!' : 'Passkey Added!'}
            </h2>
            <p className="text-gray-400">Redirecting to home...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="text-4xl mb-4">x</div>
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
            <p className="text-gray-400 mb-4">{error || webAuthnError}</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
            >
              Go Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
