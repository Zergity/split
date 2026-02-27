import type { AuthEnv, NotifyPrefs } from '../types/auth';
import { KV_KEYS, DEFAULT_NOTIFY_PREFS } from '../types/auth';
import { getTokenFromCookies, verifySession } from '../utils/jwt';

export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const session = await verifySession(context.env, token);
  if (!session) return Response.json({ success: false, error: 'Session expired' }, { status: 401 });

  const prefs = await context.env.SPLITTER_KV.get<NotifyPrefs>(KV_KEYS.pushPrefs(session.memberId), 'json');
  return Response.json({ success: true, data: prefs ?? DEFAULT_NOTIFY_PREFS });
};

export const onRequestPatch: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const session = await verifySession(context.env, token);
  if (!session) return Response.json({ success: false, error: 'Session expired' }, { status: 401 });

  const updates = await context.request.json() as Partial<NotifyPrefs>;
  const existing = await context.env.SPLITTER_KV.get<NotifyPrefs>(KV_KEYS.pushPrefs(session.memberId), 'json') ?? DEFAULT_NOTIFY_PREFS;
  const updated: NotifyPrefs = { ...existing, ...updates };
  await context.env.SPLITTER_KV.put(KV_KEYS.pushPrefs(session.memberId), JSON.stringify(updated));

  return Response.json({ success: true, data: updated });
};
