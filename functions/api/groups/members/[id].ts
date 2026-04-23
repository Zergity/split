import type { AuthEnv } from '../../types/auth';
import { requireGroup } from '../../utils/session';
import { softRemoveMember, findMember } from '../../utils/groups';
import { removeMembership } from '../../utils/users';

// DELETE /api/groups/members/:id
// Admins can remove anyone; any member can remove themselves (leave the group).
// Soft-remove: entry moves to removedMembers so existing expenses still resolve
// names. Cannot remove the last admin.
export const onRequestDelete: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { group, member: caller } = ctx;
    const memberId = context.params.id as string;

    const isSelf = memberId === caller.id;
    const isCallerAdmin = group.admins.includes(caller.id);
    if (!isSelf && !isCallerAdmin) {
      return Response.json(
        { success: false, error: 'Only admins can remove other members' },
        { status: 403 }
      );
    }

    const target = findMember(group, memberId);
    if (!target || target.removedAt) {
      return Response.json({ success: false, error: 'Member not found' }, { status: 404 });
    }

    const wasAdmin = group.admins.includes(memberId);
    if (wasAdmin && group.admins.length <= 1) {
      return Response.json(
        { success: false, error: 'Cannot remove the last admin — promote someone else first' },
        { status: 400 }
      );
    }

    const updated = await softRemoveMember(context.env, group, memberId);

    if (target.userId) {
      await removeMembership(context.env, target.userId, group.id);
    }

    return Response.json({ success: true, data: updated });
  } catch (error) {
    console.error('Remove member error:', error);
    return Response.json(
      { success: false, error: 'Failed to remove member' },
      { status: 500 }
    );
  }
};
