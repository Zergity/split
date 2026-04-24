import type { AuthEnv, PasskeyInfo } from '../types/auth';
import { getTokenFromCookies, verifySession } from '../utils/jwt';
import { getCredentials } from '../utils/credentials';

// GET /api/auth/passkeys - List user's registered passkeys
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const token = getTokenFromCookies(context.request);

    if (!token) {
      return Response.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await verifySession(context.env, token);

    if (!session) {
      return Response.json(
        { success: false, error: 'Session expired' },
        { status: 401 }
      );
    }

    const credentials = await getCredentials(context.env, session.userId);

    const passkeys: PasskeyInfo[] = credentials.map(cred => ({
      id: cred.id,
      createdAt: cred.createdAt,
      lastUsedAt: cred.lastUsedAt,
      friendlyName: cred.friendlyName,
    }));

    return Response.json({
      success: true,
      data: { passkeys },
    });
  } catch (error) {
    console.error('List passkeys error:', error);
    return Response.json(
      { success: false, error: 'Failed to list passkeys' },
      { status: 500 }
    );
  }
};
