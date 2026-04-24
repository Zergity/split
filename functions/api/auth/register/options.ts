import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthEnv, RegisterOptionsRequest } from '../../types/auth';
import { storeChallenge } from '../../utils/challenges';
import { getCredentials } from '../../utils/credentials';

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const { memberId, memberName } = await context.request.json() as RegisterOptionsRequest;

    if (!memberId || !memberName) {
      return Response.json(
        { success: false, error: 'memberId and memberName are required' },
        { status: 400 }
      );
    }

    const env = context.env;

    // Get existing credentials to exclude them from registration
    const existingCredentials = await getCredentials(env, memberId);

    const options = await generateRegistrationOptions({
      rpName: env.RP_NAME || 'Split',
      rpID: env.RP_ID || 'localhost',
      userName: memberName,
      userID: new TextEncoder().encode(memberId),
      userDisplayName: memberName,
      attestationType: 'none', // We don't need attestation for this app
      excludeCredentials: existingCredentials.map(cred => ({
        id: cred.id,
        transports: cred.transports,
      })),
      authenticatorSelection: {
        residentKey: 'required', // Required for discoverable credentials
        userVerification: 'preferred',
      },
    });

    // Store challenge for verification
    await storeChallenge(env, memberId, options.challenge, 'registration');

    return Response.json({
      success: true,
      data: { options },
    });
  } catch (error) {
    console.error('Registration options error:', error);
    return Response.json(
      { success: false, error: 'Failed to generate registration options' },
      { status: 500 }
    );
  }
};
