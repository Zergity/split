import * as jose from 'jose';
import type { JWTPayload, Session, AuthEnv } from '../types/auth';
import { KV_KEYS, SESSION_TTL_SECONDS } from '../types/auth';

// Create a new session and JWT token
export async function createSession(
  env: AuthEnv,
  userId: string,
  userName: string
): Promise<{ session: Session; token: string }> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_SECONDS * 1000).toISOString();

  const session: Session = {
    sessionId,
    userId,
    userName,
    createdAt: new Date(now).toISOString(),
    expiresAt,
  };

  // Store session in KV
  await env.SPLITTER_KV.put(
    KV_KEYS.session(sessionId),
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECONDS }
  );

  // Create JWT token
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new jose.SignJWT({
    sessionId,
    userId,
    userName,
  } as Omit<JWTPayload, 'iat' | 'exp'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);

  return { session, token };
}

// Verify JWT token and return payload.
// Normalizes legacy tokens (which carried memberId/memberName) since those
// may still be in circulation at the time of deploy — legacy invariant: userId === memberId.
export async function verifyToken(
  env: AuthEnv,
  token: string
): Promise<JWTPayload | null> {
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jose.jwtVerify(token, secret);
    const raw = payload as unknown as Record<string, unknown>;
    const userId = (raw.userId as string | undefined) ?? (raw.memberId as string | undefined);
    const userName = (raw.userName as string | undefined) ?? (raw.memberName as string | undefined);
    if (!userId || !userName) return null;
    return {
      sessionId: raw.sessionId as string,
      userId,
      userName,
      iat: raw.iat as number,
      exp: raw.exp as number,
    };
  } catch {
    return null;
  }
}

// Get session from KV by session ID.
// Normalizes legacy sessions (which carried memberId/memberName) to the new
// userId/userName shape — legacy invariant: userId === memberId.
export async function getSession(
  env: AuthEnv,
  sessionId: string
): Promise<Session | null> {
  const data = await env.SPLITTER_KV.get<Session | LegacySession>(
    KV_KEYS.session(sessionId),
    'json',
  );
  if (!data) return null;
  if ('userId' in data) return data;
  return {
    sessionId: data.sessionId,
    userId: data.memberId,
    userName: data.memberName,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}

// Legacy shape kept local to this file for one-way normalization on read.
interface LegacySession {
  sessionId: string;
  memberId: string;
  memberName: string;
  createdAt: string;
  expiresAt: string;
}

// Delete session (logout)
export async function deleteSession(
  env: AuthEnv,
  sessionId: string
): Promise<void> {
  await env.SPLITTER_KV.delete(KV_KEYS.session(sessionId));
}

// Verify token and session are both valid
export async function verifySession(
  env: AuthEnv,
  token: string
): Promise<Session | null> {
  const payload = await verifyToken(env, token);
  if (!payload) return null;

  const session = await getSession(env, payload.sessionId);
  if (!session) return null;

  // Check if session has expired
  if (new Date(session.expiresAt) < new Date()) {
    await deleteSession(env, session.sessionId);
    return null;
  }

  return session;
}

// Extract token from cookie header
export function getTokenFromCookies(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const authCookie = cookies.find(c => c.startsWith('auth_token='));
  if (!authCookie) return null;

  return authCookie.split('=')[1];
}

// Create cookie header for setting auth token
export function createAuthCookie(token: string, maxAge: number = SESSION_TTL_SECONDS): string {
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
}

// Create cookie header for clearing auth token
export function clearAuthCookie(): string {
  return 'auth_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
