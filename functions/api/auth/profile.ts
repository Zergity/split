import type { AuthEnv } from '../types/auth';
import { getTokenFromCookies, verifySession, createSession, createAuthCookie } from '../utils/jwt';

interface Group {
  id: string;
  name: string;
  currency: string;
  members: {
    id: string;
    name: string;
    bankId?: string;
    bankName?: string;
    bankShortName?: string;
    accountName?: string;
    accountNo?: string;
  }[];
  createdAt: string;
}

// PUT /api/auth/profile - Update current user's profile (name)
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
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

    const {
      name,
      bankId,
      bankName,
      bankShortName,
      accountName,
      accountNo
    } = await context.request.json() as {
      name?: string;
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

    // Get group and check it exists
    const group = await context.env.SPLITTER_KV.get<Group>('group', 'json');

    if (!group) {
      return Response.json(
        { success: false, error: 'Group not found' },
        { status: 404 }
      );
    }

    // Validate bank account fields if provided
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

    // Check if name already exists (case-insensitive, excluding current user)
    const nameExists = group.members.some(
      m => m.id !== session.memberId && m.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (nameExists) {
      return Response.json(
        { success: false, error: 'Name already taken' },
        { status: 400 }
      );
    }

    // Update the member's name and bank account
    let updatedMember: typeof group.members[0] | null = null;
    const updatedMembers = group.members.map(m => {
      if (m.id === session.memberId) {
        updatedMember = {
          ...m,
          name: trimmedName,
          ...(bankId !== undefined && { bankId }),
          ...(bankName !== undefined && { bankName }),
          ...(bankShortName !== undefined && { bankShortName }),
          ...(accountName !== undefined && { accountName }),
          ...(accountNo !== undefined && { accountNo }),
        };
        return updatedMember;
      }
      return m;
    });

    const updatedGroup = { ...group, members: updatedMembers };
    await context.env.SPLITTER_KV.put('group', JSON.stringify(updatedGroup));

    // Create new session with updated name
    const { token: newToken } = await createSession(
      context.env,
      session.memberId,
      trimmedName
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: updatedMember,
      }),
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
