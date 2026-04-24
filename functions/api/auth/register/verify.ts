import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthEnv, RegisterVerifyRequest, StoredCredential } from '../../types/auth';
import { consumeChallenge } from '../../utils/challenges';
import { addCredential } from '../../utils/credentials';
import { createSession, createAuthCookie } from '../../utils/jwt';
import {
  LEGACY_GROUP_ID,
  GroupMember,
  getGroup,
  saveGroup,
} from '../../utils/groups';
import { createUser, getUser, saveUser, addMembership } from '../../utils/users';

// This endpoint only registers new members into the legacy '1matrix' group
// (where userId === memberId). Joining any other group goes through the
// invite-accept flow at /api/groups/invites/:code, which gates on a valid
// invite code and reuses the caller's existing userId. Accepting a
// client-supplied groupId here would let an unauthenticated caller bind a
// passkey to an arbitrary member row in any group.
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
    const targetGroupId = LEGACY_GROUP_ID;

    // Get and consume the challenge (one-time use)
    const expectedChallenge = await consumeChallenge(env, memberId, 'registration');
    if (!expectedChallenge) {
      return Response.json(
        { success: false, error: 'Challenge expired or not found. Please try again.' },
        { status: 400 }
      );
    }

    const origin = env.RP_ORIGIN || new URL(context.request.url).origin;
    const rpID = env.RP_ID || 'localhost';

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

    // Legacy 1matrix invariant: userId === memberId. Credentials stored under
    // 'credentials:<memberId>' on main remain readable after this PR.
    const userId = memberId;

    // Upsert the User record.
    let user = await getUser(env, userId);
    if (!user) {
      user = await createUser(env, { id: userId, name: memberName });
    } else if (user.name !== memberName) {
      user = { ...user, name: memberName };
      await saveUser(env, user);
    }

    // Ensure the group exists and the member row points at this user.
    const group = await getGroup(env, targetGroupId);
    if (!group) {
      return Response.json(
        { success: false, error: `Group ${targetGroupId} not found` },
        { status: 404 }
      );
    }

    const existingMemberIdx = group.members.findIndex((m) => m.id === memberId);
    const now = new Date().toISOString();
    if (existingMemberIdx === -1) {
      // Fresh legacy-group member — insert. (The caller-side flow creates the
      // placeholder row via addMember before calling this endpoint, so in
      // practice the row already exists; guard for the first-member case.)
      const newMember: GroupMember = {
        id: memberId,
        userId,
        name: memberName,
        joinedAt: now,
      };
      group.members.push(newMember);
    } else {
      const existing = group.members[existingMemberIdx];
      // Refuse to rebind a member row that's already claimed by a different
      // user. In legacy this can't happen (userId === memberId invariant);
      // the check is defense-in-depth for stale/promoted data.
      if (existing.userId && existing.userId !== userId) {
        return Response.json(
          { success: false, error: 'Member is already claimed' },
          { status: 409 }
        );
      }
      group.members[existingMemberIdx] = {
        ...existing,
        userId,
        name: memberName,
        joinedAt: existing.joinedAt ?? now,
      };
    }
    await saveGroup(env, group);
    await addMembership(env, userId, {
      groupId: targetGroupId,
      memberId,
      joinedAt: now,
    });

    const { registrationInfo } = verification;
    const storedCredential: StoredCredential = {
      id: credential.id,
      publicKey: registrationInfo.credential.publicKey,
      counter: registrationInfo.credential.counter,
      deviceType: registrationInfo.credentialDeviceType,
      backedUp: registrationInfo.credentialBackedUp,
      transports: credential.response.transports,
      createdAt: now,
      friendlyName: friendlyName || getDefaultFriendlyName(context.request),
    };
    await addCredential(env, userId, storedCredential);

    const { session, token } = await createSession(env, userId, user.name);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          verified: true,
          session: {
            userId: session.userId,
            userName: session.userName,
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
