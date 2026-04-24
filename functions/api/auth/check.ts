import type { AuthEnv } from '../types/auth';
import { hasPasskeys } from '../utils/credentials';

// POST /api/auth/check - Check if a user has passkeys registered.
// Accepts either { userId } (new) or { memberId } (legacy — memberId === userId
// for pre-multi-group data).
export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const body = await context.request.json() as { userId?: string; memberId?: string };
    const userId = body.userId ?? body.memberId;

    if (!userId) {
      return Response.json(
        { success: false, error: 'userId or memberId is required' },
        { status: 400 }
      );
    }

    const hasKeys = await hasPasskeys(context.env, userId);

    return Response.json({
      success: true,
      data: { hasPasskeys: hasKeys },
    });
  } catch (error) {
    console.error('Check passkeys error:', error);
    return Response.json(
      { success: false, error: 'Failed to check passkeys' },
      { status: 500 }
    );
  }
};
