import type { AuthEnv } from '../types/auth';
import { requireGroupAdmin } from '../utils/session';
import { saveGroup } from '../utils/groups';

// PUT /api/groups/admins — promote or demote group admins. Admin-only.
// Body: { memberId: string, admin: boolean }
//   { admin: true }  -> add memberId to admins (must be an active member)
//   { admin: false } -> remove memberId from admins (last admin cannot be demoted)
//
// To transfer ownership cleanly: PUT { memberId: <other>, admin: true } then
// PUT { memberId: <self>, admin: false }.
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroupAdmin(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { group } = ctx;

    const { memberId, admin } = await context.request.json() as {
      memberId: string;
      admin: boolean;
    };
    if (!memberId || typeof admin !== 'boolean') {
      return Response.json(
        { success: false, error: 'memberId and admin are required' },
        { status: 400 }
      );
    }

    const isActive = group.members.some((m) => m.id === memberId);
    if (!isActive) {
      return Response.json(
        { success: false, error: 'Member is not active in this group' },
        { status: 400 }
      );
    }

    const currentlyAdmin = group.admins.includes(memberId);
    if (admin === currentlyAdmin) {
      return Response.json({ success: true, data: group });
    }

    let admins = group.admins;
    if (admin) {
      admins = [...admins, memberId];
    } else {
      if (group.admins.length <= 1) {
        return Response.json(
          { success: false, error: 'Cannot remove the last admin' },
          { status: 400 }
        );
      }
      admins = admins.filter((id) => id !== memberId);
    }

    const updated = { ...group, admins };
    await saveGroup(context.env, updated);
    return Response.json({ success: true, data: updated });
  } catch (error) {
    console.error('Update admins error:', error);
    return Response.json(
      { success: false, error: 'Failed to update admins' },
      { status: 500 }
    );
  }
};
