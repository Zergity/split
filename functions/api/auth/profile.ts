import type { AuthEnv } from '../types/auth';
import { createSession, createAuthCookie } from '../utils/jwt';
import { requireGroup } from '../utils/session';
import { saveGroup } from '../utils/groups';
import { getUser, saveUser } from '../utils/users';

// PUT /api/auth/profile — update the caller's per-group member profile
// (name, avatar, bank). Also updates the global User.name so it stays in
// sync across groups (last-write-wins — users can refine later if they
// want different names per group).
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { session, group, member } = ctx;

    const {
      name,
      avatarSeed,
      bankId,
      bankName,
      bankShortName,
      accountName,
      accountNo,
    } = await context.request.json() as {
      name?: string;
      avatarSeed?: string;
      bankId?: string;
      bankName?: string;
      bankShortName?: string;
      accountName?: string;
      accountNo?: string;
    };

    if (!name || !name.trim()) {
      return Response.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      );
    }
    const trimmedName = name.trim();

    if (accountNo !== undefined && accountNo !== null && accountNo !== '') {
      if (!/^[0-9]{6,20}$/.test(accountNo)) {
        return Response.json(
          { success: false, error: 'Account number must be 6-20 digits' },
          { status: 400 }
        );
      }
    }
    if (accountName !== undefined && accountName !== null && accountName !== '') {
      if (!/^[A-Z\s]+$/.test(accountName)) {
        return Response.json(
          { success: false, error: 'Account name must contain only uppercase letters and spaces' },
          { status: 400 }
        );
      }
    }

    const nameExists = group.members.some(
      (m) => m.id !== member.id && m.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) {
      return Response.json(
        { success: false, error: 'Name already taken' },
        { status: 400 }
      );
    }

    const updatedMember = {
      ...member,
      name: trimmedName,
      ...(avatarSeed !== undefined && { avatarSeed }),
      ...(bankId !== undefined && { bankId }),
      ...(bankName !== undefined && { bankName }),
      ...(bankShortName !== undefined && { bankShortName }),
      ...(accountName !== undefined && { accountName }),
      ...(accountNo !== undefined && { accountNo }),
    };
    const updatedGroup = {
      ...group,
      members: group.members.map((m) => (m.id === member.id ? updatedMember : m)),
    };
    await saveGroup(context.env, updatedGroup);

    // Sync User.name so future sessions and cross-group name prompts use it.
    const user = await getUser(context.env, session.userId);
    if (user && user.name !== trimmedName) {
      await saveUser(context.env, { ...user, name: trimmedName });
    }

    const { token: newToken } = await createSession(
      context.env,
      session.userId,
      trimmedName,
    );

    return new Response(
      JSON.stringify({ success: true, data: updatedMember }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': createAuthCookie(newToken),
        },
      }
    );
  } catch (error) {
    console.error('Profile update error:', error);
    return Response.json(
      { success: false, error: 'Failed to update profile' },
      { status: 500 }
    );
  }
};
