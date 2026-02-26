import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthEnv, RegisterVerifyRequest, StoredCredential } from '../../types/auth';
import { consumeChallenge } from '../../utils/challenges';
import { addCredential } from '../../utils/credentials';
import { createSession, createAuthCookie } from '../../utils/jwt';

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const { memberId, memberName, credential, friendlyName } =
      await context.request.json() as RegisterVerifyRequest;

    if (!memberId || !memberName || !credential) {
      return Response.json(
        { success: false, error: 'memberId, memberName, and credential are required' },
        { status: 400 }
      );
    }

    const env = context.env;

    // Get and consume the challenge (one-time use)
    const expectedChallenge = await consumeChallenge(env, memberId, 'registration');
    if (!expectedChallenge) {
      return Response.json(
        { success: false, error: 'Challenge expired or not found. Please try again.' },
        { status: 400 }
      );
    }

    // Determine origin from request or env
    const origin = env.RP_ORIGIN || new URL(context.request.url).origin;
    const rpID = env.RP_ID || 'localhost';

    console.log('[reg/verify] JWT_SECRET present:', !!env.JWT_SECRET, 'len:', env.JWT_SECRET?.length);
    console.log('[reg/verify] origin:', origin, 'rpID:', rpID);

    // Verify the registration response
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return Response.json(
        { success: false, error: 'Registration verification failed' },
        { status: 400 }
      );
    }

    const { registrationInfo } = verification;

    // Store the credential - use credential.id from client (already base64url)
    const storedCredential: StoredCredential = {
      id: credential.id, // Use the ID from client response directly
      publicKey: registrationInfo.credential.publicKey,
      counter: registrationInfo.credential.counter,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
      transports: credential.response.transports,
      createdAt: new Date().toISOString(),
      friendlyName: friendlyName || getDefaultFriendlyName(context.request),
    };

    await addCredential(env, memberId, storedCredential);

    // Create session
    const { session, token } = await createSession(env, memberId, memberName);

    // Set cookie and return response
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          verified: true,
          session: {
            memberId: session.memberId,
            memberName: session.memberName,
            expiresAt: session.expiresAt,
          },
        },
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createAuthCookie(token),
        },
      }
    );
  } catch (error) {
    console.error('[reg/verify] FULL ERROR:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { success: false, error: `Failed to verify registration: ${errorMessage}` },
      { status: 500 }
    );
  }
};

// Helper to get a default friendly name from the request
function getDefaultFriendlyName(request: Request): string {
  const userAgent = request.headers.get('User-Agent') || '';

  if (userAgent.includes('iPhone')) return 'iPhone';
  if (userAgent.includes('iPad')) return 'iPad';
  if (userAgent.includes('Mac')) return 'Mac';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Linux')) return 'Linux';

  return 'Passkey';
}
