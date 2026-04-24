import { useState, useCallback } from 'react';
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import * as authApi from '../api/auth';
import type { SessionInfo } from '../types';
import type { PasskeyInviteInfo } from '../api/auth';

interface WebAuthnState {
  loading: boolean;
  error: string | null;
}

interface UseWebAuthnReturn extends WebAuthnState {
  isSupported: boolean;
  register: (
    memberId: string,
    memberName: string,
    friendlyName?: string,
    inviteCode?: string,
  ) => Promise<SessionInfo>;
  authenticate: () => Promise<SessionInfo>;
  linkPasskey: (friendlyName?: string) => Promise<void>;
  createPasskeyInvite: () => Promise<PasskeyInviteInfo>;
  acceptPasskeyInvite: (inviteCode: string, friendlyName?: string) => Promise<SessionInfo>;
  clearError: () => void;
}

export function useWebAuthn(): UseWebAuthnReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = browserSupportsWebAuthn();

  const register = useCallback(async (
    memberId: string,
    memberName: string,
    friendlyName?: string,
    inviteCode?: string,
  ): Promise<SessionInfo> => {
    setLoading(true);
    setError(null);

    try {
      // Get registration options from server
      const options = await authApi.getRegistrationOptions(memberId, memberName);

      // Start WebAuthn registration (shows biometric prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // Verify with server and get session. An invite code, when provided,
      // routes the registration to the invite's group instead of legacy —
      // creating the User and joining the group in one round trip.
      const session = await authApi.verifyRegistration(
        memberId,
        memberName,
        credential,
        friendlyName,
        inviteCode,
      );

      return session;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const authenticate = useCallback(async (): Promise<SessionInfo> => {
    setLoading(true);
    setError(null);

    try {
      // Get authentication options from server (discoverable credentials)
      const options = await authApi.getLoginOptions();

      // Start WebAuthn authentication (shows biometric prompt with all available passkeys)
      const credential = await startAuthentication({ optionsJSON: options });

      // Verify with server and get session
      const session = await authApi.verifyLogin(credential);

      return session;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const linkPasskey = useCallback(async (friendlyName?: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Get registration options from server (uses session data)
      const options = await authApi.getLinkPasskeyOptions();

      // Start WebAuthn registration (shows biometric prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // Verify with server (no new session created)
      await authApi.verifyLinkPasskey(credential, friendlyName);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const createPasskeyInvite = useCallback(async (): Promise<PasskeyInviteInfo> => {
    setLoading(true);
    setError(null);

    try {
      const invite = await authApi.createPasskeyInvite();
      return invite;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptPasskeyInvite = useCallback(async (
    inviteCode: string,
    friendlyName?: string
  ): Promise<SessionInfo> => {
    setLoading(true);
    setError(null);

    try {
      // Get registration options using invite code
      const { options } = await authApi.getInvitePasskeyOptions(inviteCode);

      // Start WebAuthn registration (shows biometric prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // Verify with server and get session
      const session = await authApi.verifyInvitePasskey(inviteCode, credential, friendlyName);

      return session;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    isSupported,
    register,
    authenticate,
    linkPasskey,
    createPasskeyInvite,
    acceptPasskeyInvite,
    clearError,
  };
}

// Helper to extract user-friendly error messages
function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Handle WebAuthn-specific errors
    if (err.name === 'NotAllowedError') {
      return 'Authentication was cancelled or timed out. Please try again.';
    }
    if (err.name === 'InvalidStateError') {
      return 'This passkey is already registered.';
    }
    if (err.name === 'NotSupportedError') {
      return 'Your device does not support passkeys.';
    }
    if (err.name === 'SecurityError') {
      return 'Security error occurred. Please ensure you are using HTTPS.';
    }
    if (err.name === 'AbortError') {
      return 'Authentication was cancelled.';
    }

    // Handle API errors with codes
    const errWithCode = err as Error & { code?: string };
    if (errWithCode.code === 'NO_PASSKEYS') {
      return 'No passkeys registered. Please set up a passkey first.';
    }

    return err.message;
  }
  return 'An unexpected error occurred';
}
