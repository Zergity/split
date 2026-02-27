import type { AuthEnv, NotificationRecord } from './types/auth';
import { KV_KEYS } from './types/auth';
import { getTokenFromCookies, verifySession } from './utils/jwt';

// GET /api/notifications — list notifications for current user
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const session = await verifySession(context.env, token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }

  const key = KV_KEYS.notifications(session.memberId);
  const notifications = (await context.env.SPLITTER_KV.get<NotificationRecord[]>(key, 'json')) || [];

  return Response.json({ success: true, data: notifications });
};

// PUT /api/notifications — mark all as read
export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const session = await verifySession(context.env, token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }

  const key = KV_KEYS.notifications(session.memberId);
  const notifications = (await context.env.SPLITTER_KV.get<NotificationRecord[]>(key, 'json')) || [];
  const updated = notifications.map((n) => ({ ...n, read: true }));
  await context.env.SPLITTER_KV.put(key, JSON.stringify(updated));

  return Response.json({ success: true, data: updated });
};
