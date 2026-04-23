import type { AuthEnv } from '../types/auth';
import { requireGroupAdmin } from '../utils/session';
import { saveGroup, GroupMember } from '../utils/groups';
import { getMemberships, addMembership, getUser } from '../utils/users';

// POST /api/groups/members — admin adds a known friend to the active group.
// Friendship is verified server-side: the caller and target must already share
// at least one group. This is the shortcut that skips invite links.
//
// Idempotent: adding a user who's already a member returns a 400 rather than
// creating a duplicate row.
export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroupAdmin(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { session, group } = ctx;

    const { userId, displayName } = await context.request.json() as {
      userId?: string;
      displayName?: string;
    };
    if (!userId) {
      return Response.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    // Friendship gate: caller and target share a group.
    const [callerMemberships, targetMemberships] = await Promise.all([
      getMemberships(context.env, session.userId),
      getMemberships(context.env, userId),
    ]);
    const callerGroups = new Set(callerMemberships.map((m) => m.groupId));
    const isFriend = targetMemberships.some((m) => callerGroups.has(m.groupId));
    if (!isFriend) {
      return Response.json(
        { success: false, error: 'You can only add users who share a group with you' },
        { status: 403 }
      );
    }

    // Already in target group?
    if (group.members.some((m) => m.userId === userId)) {
      return Response.json(
        { success: false, error: 'User is already a member of this group' },
        { status: 400 }
      );
    }

    // Resolve a display name: prefer caller's override, fall back to user's
    // canonical name, then disambiguate against existing member names.
    const user = await getUser(context.env, userId);
    const baseName = (displayName?.trim() || user?.name || 'New member').trim();
    const taken = new Set(group.members.map((m) => m.name.toLowerCase()));
    let unique = baseName;
    let suffix = 2;
    while (taken.has(unique.toLowerCase())) {
      unique = `${baseName} ${suffix++}`;
    }

    const now = new Date().toISOString();
    const newMember: GroupMember = {
      id: crypto.randomUUID(),
      userId,
      name: unique,
      joinedAt: now,
    };
    group.members.push(newMember);
    await saveGroup(context.env, group);
    await addMembership(context.env, userId, {
      groupId: group.id,
      memberId: newMember.id,
      joinedAt: now,
    });

    return Response.json({ success: true, data: group });
  } catch (error) {
    console.error('Add friend error:', error);
    return Response.json(
      { success: false, error: 'Failed to add member' },
      { status: 500 }
    );
  }
};
