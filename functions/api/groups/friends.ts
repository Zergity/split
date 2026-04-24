import type { AuthEnv } from '../types/auth';
import { requireGroupAdmin } from '../utils/session';
import { getGroup } from '../utils/groups';
import { getMemberships } from '../utils/users';

// GET /api/groups/friends — candidates for direct-add.
//
// Returns users who share any group with the caller (and aren't already in the
// active target group). The "shared group" gate prevents a fresh user from
// being enumerated or added without the admin having any prior connection to
// them — friendship is implicit, established by common group membership.
//
// Admin-only because only admins call the companion POST /api/groups/members
// endpoint that consumes this list.
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroupAdmin(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { session, group: target } = ctx;

    // userIds that should NOT appear (already in target group, or the caller).
    const excluded = new Set<string>();
    excluded.add(session.userId);
    for (const m of target.members) if (m.userId) excluded.add(m.userId);

    const memberships = await getMemberships(context.env, session.userId);

    interface Candidate {
      userId: string;
      name: string;
      groupNames: string[];
    }
    const map = new Map<string, Candidate>();

    const otherGroups = await Promise.all(
      memberships
        .filter((mem) => mem.groupId !== target.id)
        .map((mem) => getGroup(context.env, mem.groupId)),
    );

    for (const g of otherGroups) {
      if (!g) continue;
      for (const member of g.members) {
        if (!member.userId || excluded.has(member.userId)) continue;
        const existing = map.get(member.userId);
        if (existing) {
          existing.groupNames.push(g.name);
        } else {
          map.set(member.userId, {
            userId: member.userId,
            name: member.name,
            groupNames: [g.name],
          });
        }
      }
    }

    const data = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return Response.json({ success: true, data });
  } catch (error) {
    console.error('List friends error:', error);
    return Response.json(
      { success: false, error: 'Failed to list friends' },
      { status: 500 }
    );
  }
};
