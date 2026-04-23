import type { AuthEnv, NotifyPrefs } from '../types/auth';
import { KV_KEYS, DEFAULT_NOTIFY_PREFS } from '../types/auth';
import { requireGroup } from '../utils/session';

// Prefs are per (userId, groupId) — users can mute one group without affecting others.
export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  const ctx = await requireGroup(context.env, context.request);
  if (ctx instanceof Response) return ctx;
  const prefs = await context.env.SPLITTER_KV.get<NotifyPrefs>(
    KV_KEYS.pushPrefs(ctx.session.userId, ctx.group.id),
    'json',
  );
  return Response.json({ success: true, data: prefs ?? DEFAULT_NOTIFY_PREFS });
};

export const onRequestPatch: PagesFunction<AuthEnv> = async (context) => {
  const ctx = await requireGroup(context.env, context.request);
  if (ctx instanceof Response) return ctx;

  const updates = await context.request.json() as Partial<NotifyPrefs>;
  const key = KV_KEYS.pushPrefs(ctx.session.userId, ctx.group.id);
  const existing = await context.env.SPLITTER_KV.get<NotifyPrefs>(key, 'json') ?? DEFAULT_NOTIFY_PREFS;
  const updated: NotifyPrefs = { ...existing, ...updates };
  await context.env.SPLITTER_KV.put(key, JSON.stringify(updated));

  return Response.json({ success: true, data: updated });
};
