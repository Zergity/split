import type { AuthEnv } from '../../types/auth';
import { getTokenFromCookies, verifySession } from '../../utils/jwt';
import { deleteCredential, getCredentials } from '../../utils/credentials';

// DELETE /api/auth/passkeys/:id - Remove a passkey
export const onRequestDelete: PagesFunction<AuthEnv> = async (context) => {
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

    const passkeyId = context.params.id as string;

    if (!passkeyId) {
      return Response.json(
        { success: false, error: 'Passkey ID is required' },
        { status: 400 }
      );
    }

    // Check if user has more than one passkey (don't allow deleting last one)
    const credentials = await getCredentials(context.env, session.userId);
    if (credentials.length <= 1) {
      return Response.json(
        { success: false, error: 'Cannot delete your only passkey' },
        { status: 400 }
      );
    }

    const deleted = await deleteCredential(context.env, session.userId, passkeyId);

    if (!deleted) {
      return Response.json(
        { success: false, error: 'Passkey not found' },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error('Delete passkey error:', error);
    return Response.json(
      { success: false, error: 'Failed to delete passkey' },
      { status: 500 }
    );
  }
};
