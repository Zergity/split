import type { AuthEnv } from './types/auth';
import { requireGroup } from './utils/session';
import { saveGroup, GroupRecord } from './utils/groups';

// GET /api/group — return the active group (scoped by X-Group-Id header).
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    return Response.json({ success: true, data: ctx.group });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
};

function findDuplicateName(members: GroupRecord['members']): string | null {
  const seen = new Set<string>();
  for (const m of members) {
    const lowerName = m.name.toLowerCase();
    if (seen.has(lowerName)) return m.name;
    seen.add(lowerName);
  }
  return null;
}

// PUT /api/group — update the active group. Settings (name, currency) require
// admin. Adding placeholder members is permitted for any group member (the
// pre-create flow — adding a friend who will sign up later).
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { group, member } = ctx;

    const updates = await context.request.json() as Partial<{
      name: string;
      currency: string;
      members: GroupRecord['members'];
    }>;

    const settingsTouched = updates.name !== undefined || updates.currency !== undefined;
    const isAdminCaller = group.admins.includes(member.id);
    if (settingsTouched && !isAdminCaller) {
      return Response.json(
        { success: false, error: 'Only admins can change group settings' },
        { status: 403 }
      );
    }

    let members = group.members;
    if (updates.members) {
      // Non-admins can only add new placeholder members (pre-create flow),
      // never rename/remove existing ones. Admins use dedicated endpoints
      // for removal and admin management — this endpoint is the ergonomic
      // "add member by name" path.
      const existingById = new Map(group.members.map((m) => [m.id, m]));
      for (const incoming of updates.members) {
        const prior = existingById.get(incoming.id);
        if (prior && !isAdminCaller && prior.name !== incoming.name) {
          return Response.json(
            { success: false, error: 'Only admins can rename existing members' },
            { status: 403 }
          );
        }
      }

      // Detect real removals (present in old, absent in new) — require admin.
      const newIds = new Set(updates.members.map((m) => m.id));
      const removedBySave = group.members.some((m) => !newIds.has(m.id));
      if (removedBySave && !isAdminCaller) {
        return Response.json(
          { success: false, error: 'Only admins can remove members' },
          { status: 403 }
        );
      }

      const duplicateName = findDuplicateName(updates.members);
      if (duplicateName) {
        return Response.json(
          { success: false, error: `Name "${duplicateName}" already exists` },
          { status: 400 }
        );
      }
      members = updates.members;
    }

    const updated: GroupRecord = {
      ...group,
      name: updates.name ?? group.name,
      currency: updates.currency ?? group.currency,
      members,
    };
    await saveGroup(context.env, updated);

    return Response.json({ success: true, data: updated });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to update group' },
      { status: 500 }
    );
  }
};
