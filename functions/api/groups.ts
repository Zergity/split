import type { AuthEnv } from './types/auth';
import { requireSession } from './utils/session';
import { getMemberships, addMembership } from './utils/users';
import { createGroup, getGroup, GroupMember, findMember } from './utils/groups';

// GET /api/groups — list the caller's groups (id, name, memberCount).
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const authed = await requireSession(context.env, context.request);
    if (authed instanceof Response) return authed;

    const memberships = await getMemberships(context.env, authed.session.userId);
    const groups = await Promise.all(
      memberships.map((m) => getGroup(context.env, m.groupId).then((g) => ({ membership: m, group: g }))),
    );
    // The group record is authoritative: an entry in the user's membership
    // index is only valid if the member row still lives in `group.members`
    // (not in `removedMembers`, not missing). KV has no transactions, so the
    // index can drift out of sync when an admin removes someone; trust the
    // group and silently drop stale index entries here.
    const data = groups
      .filter((x): x is { membership: typeof x.membership; group: NonNullable<typeof x.group> } => {
        if (!x.group) return false;
        const m = findMember(x.group, x.membership.memberId);
        return !!m && !m.removedAt && m.userId === authed.session.userId;
      })
      .map(({ membership, group }) => ({
        id: group.id,
        name: group.name,
        memberId: membership.memberId,
        memberCount: group.members.length,
        isAdmin: group.admins.includes(membership.memberId),
      }));

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to list groups' },
      { status: 500 }
    );
  }
};

// POST /api/groups — create a new group. Caller becomes the first member
// (and the sole admin) of the new group.
export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const authed = await requireSession(context.env, context.request);
    if (authed instanceof Response) return authed;

    const { name, currency, displayName } = await context.request.json() as {
      name?: string;
      currency?: string;
      displayName?: string;
    };
    if (!name || !name.trim()) {
      return Response.json({ success: false, error: 'Group name is required' }, { status: 400 });
    }

    const memberId = crypto.randomUUID();
    const creator: GroupMember = {
      id: memberId,
      userId: authed.session.userId,
      name: (displayName?.trim() || authed.session.userName),
      joinedAt: new Date().toISOString(),
    };

    const group = await createGroup(context.env, {
      name: name.trim(),
      currency: (currency ?? 'K').trim() || 'K',
      creator,
    });

    await addMembership(context.env, authed.session.userId, {
      groupId: group.id,
      memberId,
      joinedAt: creator.joinedAt!,
    });

    return Response.json({ success: true, data: group });
  } catch (error) {
    console.error('Create group error:', error);
    return Response.json(
      { success: false, error: 'Failed to create group' },
      { status: 500 }
    );
  }
};
