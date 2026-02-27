import type { AuthEnv, PushSubscriptionRecord } from '../types/auth';
import { KV_KEYS } from '../types/auth';
import { getTokenFromCookies, verifySession } from '../utils/jwt';

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const session = await verifySession(context.env, token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }

  const { subscription } = (await context.request.json()) as {
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return Response.json({ success: false, error: 'Invalid subscription' }, { status: 400 });
  }

  const key = KV_KEYS.pushSubscriptions(session.memberId);
  const existing =
    (await context.env.SPLITTER_KV.get<PushSubscriptionRecord[]>(key, 'json')) || [];

  // Deduplicate by endpoint
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push({
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    createdAt: new Date().toISOString(),
    userAgent: context.request.headers.get('User-Agent') || undefined,
  });

  await context.env.SPLITTER_KV.put(key, JSON.stringify(filtered));

  return Response.json({ success: true });
};

export const onRequestDelete: PagesFunction<AuthEnv> = async (context) => {
  const token = getTokenFromCookies(context.request);
  if (!token) {
    return Response.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const session = await verifySession(context.env, token);
  if (!session) {
    return Response.json({ success: false, error: 'Session expired' }, { status: 401 });
  }

  const { endpoint } = (await context.request.json()) as { endpoint: string };
  if (!endpoint) {
    return Response.json({ success: false, error: 'endpoint is required' }, { status: 400 });
  }

  const key = KV_KEYS.pushSubscriptions(session.memberId);
  const existing =
    (await context.env.SPLITTER_KV.get<PushSubscriptionRecord[]>(key, 'json')) || [];
  const filtered = existing.filter((s) => s.endpoint !== endpoint);
  await context.env.SPLITTER_KV.put(key, JSON.stringify(filtered));

  return Response.json({ success: true });
};
