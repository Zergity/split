import type { AuthEnv, PasskeyInvite } from '../../types/auth';
import { KV_KEYS, INVITE_TTL_SECONDS } from '../../types/auth';
import { getTokenFromCookies, verifySession } from '../../utils/jwt';

// POST /api/auth/passkeys/invite - Create an invite for cross-device passkey registration
export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
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

    const env = context.env;

    // Generate a random invite code (8 characters, alphanumeric, easy to type)
    const inviteCode = generateInviteCode();

    const now = Date.now();
    const invite: PasskeyInvite = {
      inviteCode,
      userId: session.userId,
      userName: session.userName,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + INVITE_TTL_SECONDS * 1000).toISOString(),
    };

    // Store invite in KV
    await env.SPLITTER_KV.put(
      KV_KEYS.invite(inviteCode),
      JSON.stringify(invite),
      { expirationTtl: INVITE_TTL_SECONDS }
    );

    // Generate invite URL
    const origin = env.RP_ORIGIN || new URL(context.request.url).origin;
    const inviteUrl = `${origin}/invite/${inviteCode}`;

    return Response.json({
      success: true,
      data: {
        inviteCode,
        inviteUrl,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    console.error('Create invite error:', error);
    return Response.json(
      { success: false, error: 'Failed to create invite' },
      { status: 500 }
    );
  }
};

// Generate a short, easy-to-type invite code
function generateInviteCode(): string {
  // Use only uppercase letters and numbers, avoiding ambiguous characters (0, O, I, 1, L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < 8; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}
