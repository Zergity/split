import type {
  AuthenticatorTransportFuture,
  CredentialDeviceType,
} from '@simplewebauthn/server';

// Environment with auth config
export interface AuthEnv {
  SPLITTER_KV: KVNamespace;
  JWT_SECRET: string;
  RP_ID: string;
  RP_NAME: string;
  RP_ORIGIN: string;
}

// Stored WebAuthn credential for a user
export interface StoredCredential {
  id: string; // base64url encoded credential ID
  publicKey: Uint8Array;
  counter: number;
  deviceType: CredentialDeviceType;
  backedUp: boolean;
  transports?: AuthenticatorTransportFuture[];
  createdAt: string;
  lastUsedAt?: string;
  friendlyName?: string; // e.g., "iPhone 15", "MacBook Pro"
}

// Stored challenge for WebAuthn registration/authentication
export interface StoredChallenge {
  challenge: string;
  type: 'registration' | 'authentication';
  createdAt: string;
  expiresAt: string;
}

// Session stored in KV
export interface Session {
  sessionId: string;
  memberId: string;
  memberName: string;
  createdAt: string;
  expiresAt: string;
}

// JWT payload
export interface JWTPayload {
  sessionId: string;
  memberId: string;
  memberName: string;
  iat: number;
  exp: number;
}

// API request/response types
export interface RegisterOptionsRequest {
  memberId: string;
  memberName: string;
}

export interface RegisterOptionsResponse {
  options: PublicKeyCredentialCreationOptionsJSON;
}

export interface RegisterVerifyRequest {
  memberId: string;
  memberName: string;
  credential: RegistrationResponseJSON;
  friendlyName?: string;
}

export interface RegisterVerifyResponse {
  verified: boolean;
  session?: SessionInfo;
}

export interface LoginOptionsRequest {
  memberId: string;
}

export interface LoginOptionsResponse {
  options: PublicKeyCredentialRequestOptionsJSON;
}

export interface LoginVerifyRequest {
  memberId: string;
  credential: AuthenticationResponseJSON;
}

export interface LoginVerifyResponse {
  verified: boolean;
  session?: SessionInfo;
}

export interface SessionInfo {
  memberId: string;
  memberName: string;
  expiresAt: string;
}

export interface PasskeyInfo {
  id: string;
  createdAt: string;
  lastUsedAt?: string;
  friendlyName?: string;
}

// Re-export types from @simplewebauthn for convenience
export type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

// Passkey invite for cross-device registration
export interface PasskeyInvite {
  inviteCode: string;
  memberId: string;
  memberName: string;
  createdAt: string;
  expiresAt: string;
}

// KV key helpers
export const KV_KEYS = {
  credentials: (memberId: string) => `credentials:${memberId}`,
  challenge: (memberId: string) => `challenges:${memberId}`,
  session: (sessionId: string) => `sessions:${sessionId}`,
  invite: (inviteCode: string) => `invites:${inviteCode}`,
  inviteChallenge: (inviteCode: string) => `invite-challenges:${inviteCode}`,
} as const;

// Constants
export const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 minutes
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const INVITE_TTL_SECONDS = 10 * 60; // 10 minutes
