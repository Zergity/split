import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuthContext, AuthModal } from './auth';
import { ProfileModal } from './ProfileModal';
import type { Member } from '../types';

type AuthFlow = 'signin' | 'register' | 'edit-profile' | null;

export function MemberSelector() {
  const { group, currentUser, setCurrentUser, addMember, updateProfile } = useApp();
  const {
    authenticated,
    session,
    loading: authLoading,
    isSupported,
    webAuthnLoading,
    webAuthnError,
    authenticate,
    register,
    logout,
    clearWebAuthnError,
  } = useAuthContext();

  const [authFlow, setAuthFlow] = useState<AuthFlow>(null);
  const [newName, setNewName] = useState('');
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Sync current user with auth session and group data
  useEffect(() => {
    if (authLoading || !group) return;

    if (authenticated && session) {
      const member = group.members.find((m) => m.id === session.memberId);
      if (member) {
        // Update if ID changed OR name changed
        if (currentUser?.id !== member.id || currentUser?.name !== member.name) {
          setCurrentUser(member);
        }
      }
    } else if (!authenticated && currentUser) {
      setCurrentUser(null);
    }
  }, [authenticated, session, authLoading, group, currentUser, setCurrentUser]);

  const handleSignIn = async () => {
    clearWebAuthnError();
    setAuthFlow('signin');
    try {
      await authenticate();
      setAuthFlow(null);
    } catch {
      // Error shown in UI
    }
  };

  const handleRegister = async () => {
    if (!newName.trim()) return;

    setRegisterError(null);
    clearWebAuthnError();

    try {
      // Check if member already exists (case-insensitive)
      const existingMember = group?.members.find(
        m => m.name.toLowerCase() === newName.trim().toLowerCase()
      );

      let member;
      if (existingMember) {
        // Use existing member (re-registration for member without passkey)
        member = existingMember;
      } else {
        // Create new member
        member = await addMember(newName.trim());
        if (!member) {
          throw new Error('Failed to create member');
        }
      }

      // Register passkey for member
      await register(member.id, member.name);
      setNewName('');
      setAuthFlow(null);
    } catch (err) {
      // Show specific error for already registered case
      const message = err instanceof Error ? err.message : 'Registration failed';
      if (message.includes('already registered') || message.includes('credential already exists')) {
        setRegisterError('This user already has a passkey. Please sign in instead.');
      }
      // Other errors shown via webAuthnError
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentUser(null);
  };

  const handleEditProfile = () => {
    setAuthFlow('edit-profile');
  };

  const handleProfileSave = async (updates: Partial<Member>) => {
    try {
      await updateProfile(updates);
    } catch (err) {
      // Error will be handled by ProfileModal
      throw err;
    }
  };

  const handleCloseModal = () => {
    setAuthFlow(null);
    setNewName('');
    setRegisterError(null);
    clearWebAuthnError();
  };

  if (!isSupported) {
    return (
      <div className="text-sm text-red-400">
        Passkeys not supported
      </div>
    );
  }

  // Show loading state
  if (authLoading) {
    return <div className="text-sm text-gray-400">Loading...</div>;
  }

  // Authenticated state
  if (authenticated && currentUser) {
    return (
      <>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEditProfile}
            className="text-sm font-medium text-gray-300 hover:text-cyan-400 hover:underline"
            title="Click to edit profile"
          >
            {currentUser.name}
          </button>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            Logout
          </button>
        </div>

        <ProfileModal
          isOpen={authFlow === 'edit-profile'}
          currentUser={currentUser}
          onClose={handleCloseModal}
          onSave={handleProfileSave}
        />
      </>
    );
  }

  // Not authenticated state
  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSignIn}
          disabled={webAuthnLoading}
          className="px-3 py-1 bg-cyan-600 text-white text-sm rounded hover:bg-cyan-700 disabled:opacity-50"
        >
          {webAuthnLoading && authFlow === 'signin' ? 'Signing in...' : 'Sign In'}
        </button>
        <button
          onClick={() => setAuthFlow('register')}
          disabled={webAuthnLoading}
          className="text-cyan-400 text-sm font-medium hover:text-cyan-300 disabled:opacity-50"
        >
          New User
        </button>
      </div>

      <AuthModal isOpen={authFlow === 'register'} onClose={handleCloseModal}>
        <div className="p-6">
          <div className="text-center">
            <div className="text-4xl mb-4">👤</div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Create Account</h2>
            <p className="text-gray-400 mb-6">
              Enter your name to create an account with passkey authentication.
            </p>

            <div className="mb-6">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                placeholder="Your name"
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-center text-gray-100"
                autoFocus
                disabled={webAuthnLoading}
              />
            </div>

            {(webAuthnError || registerError) && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{registerError || webAuthnError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCloseModal}
                disabled={webAuthnLoading}
                className="flex-1 px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={webAuthnLoading || !newName.trim()}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                {webAuthnLoading ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      </AuthModal>

      <AuthModal isOpen={authFlow === 'signin' && !!webAuthnError} onClose={handleCloseModal}>
        <div className="p-6">
          <div className="text-center">
            <div className="text-4xl mb-4">🔐</div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Sign In Failed</h2>

            {webAuthnError && (
              <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{webAuthnError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSignIn}
                disabled={webAuthnLoading}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </AuthModal>
    </>
  );
}
