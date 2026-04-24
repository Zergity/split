import type { AuthEnv } from '../types/auth';
import { requireGroup, requireGroupAdmin } from '../utils/session';
import { createInvite, listGroupInvites } from '../utils/invites';

// GET /api/groups/invites — list invites for the active group.
// Any group member can view invite links (they're permanent; sharing is fine).
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const invites = await listGroupInvites(context.env, ctx.group.id);
    return Response.json({ success: true, data: invites });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to list invites' },
      { status: 500 }
    );
  }
};

// POST /api/groups/invites — create a permanent invite code (admin only).
export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroupAdmin(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const body = (await context.request.json().catch(() => ({}))) as { note?: string };
    const invite = await createInvite(context.env, {
      groupId: ctx.group.id,
      createdBy: ctx.member.id,
      note: body.note,
    });
    return Response.json({ success: true, data: invite });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to create invite' },
      { status: 500 }
    );
  }
};
