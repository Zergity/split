import type { AuthEnv, NotificationRecord } from './types/auth';
import { KV_KEYS } from './types/auth';
import { requireGroup } from './utils/session';

// GET /api/notifications — notifications for (current user, active group).
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  const ctx = await requireGroup(context.env, context.request);
  if (ctx instanceof Response) return ctx;
  const key = KV_KEYS.notifications(ctx.session.userId, ctx.group.id);
  const notifications = (await context.env.SPLITTER_KV.get<NotificationRecord[]>(key, 'json')) || [];
  return Response.json({ success: true, data: notifications });
};

// PUT /api/notifications — mark all read for (current user, active group).
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  const ctx = await requireGroup(context.env, context.request);
  if (ctx instanceof Response) return ctx;
  const key = KV_KEYS.notifications(ctx.session.userId, ctx.group.id);
  const notifications = (await context.env.SPLITTER_KV.get<NotificationRecord[]>(key, 'json')) || [];
  const updated = notifications.map((n) => ({ ...n, read: true }));
  await context.env.SPLITTER_KV.put(key, JSON.stringify(updated));
  return Response.json({ success: true, data: updated });
};
