import { KV_KEYS, DEFAULT_NOTIFY_PREFS, DEBOUNCE_NOTIFY_TTL_SECONDS } from '../types/auth';
import type { NotifyPrefs, TelegramData } from '../types/auth';

interface TelegramEnv {
  SPLITTER_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
}

export type NotifyEvent = keyof NotifyPrefs;

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

/**
 * Send a Telegram notification to a member.
 * Silently skips if member has no Telegram connected or pref is disabled.
 */
export async function sendTelegramNotification(
  userId: string,
  event: NotifyEvent,
  text: string,
  env: TelegramEnv,
  inlineKeyboard?: InlineKeyboard,
): Promise<void> {
  const data = await env.SPLITTER_KV.get<TelegramData>(KV_KEYS.telegram(userId), 'json');
  if (!data) return;

  // Cross-check: verify this chatId still belongs to this userId (detect stale/duplicate entries)
  const ownerOfChat = await env.SPLITTER_KV.get(KV_KEYS.telegramChatId(data.chatId));
  if (ownerOfChat !== userId) {
    // Stale entry — clean up and skip
    await env.SPLITTER_KV.delete(KV_KEYS.telegram(userId));
    return;
  }

  const prefs = data.notifyPrefs ?? DEFAULT_NOTIFY_PREFS;
  if (!prefs[event]) return;

  const body: Record<string, unknown> = {
    chat_id: data.chatId,
    text,
    parse_mode: 'HTML',
  };
  if (inlineKeyboard) body.reply_markup = inlineKeyboard;

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 403) {
    // Bot was blocked — clean up connection
    await env.SPLITTER_KV.delete(KV_KEYS.telegramChatId(data.chatId));
    await env.SPLITTER_KV.delete(KV_KEYS.telegram(userId));
  }
}

/**
 * Notify multiple members, excluding the actor.
 */
export async function notifyMembers(
  userIds: string[],
  excludeUserId: string,
  event: NotifyEvent,
  text: string,
  env: TelegramEnv,
  inlineKeyboard?: InlineKeyboard,
): Promise<void> {
  const targets = userIds.filter((id) => id !== excludeUserId);
  await Promise.all(targets.map((id) => sendTelegramNotification(id, event, text, env, inlineKeyboard)));
}

/**
 * Debounced edit notification — skips if already sent within 30s.
 * Returns true if notification was sent.
 */
export async function sendDebouncedEditNotification(
  expenseId: string,
  userIds: string[],
  excludeUserId: string,
  text: string,
  env: TelegramEnv,
  inlineKeyboard?: InlineKeyboard,
): Promise<boolean> {
  const debounceKey = KV_KEYS.debounceNotify(expenseId);
  const existing = await env.SPLITTER_KV.get(debounceKey);
  if (existing) return false;

  await env.SPLITTER_KV.put(debounceKey, '1', { expirationTtl: DEBOUNCE_NOTIFY_TTL_SECONDS });
  await notifyMembers(userIds, excludeUserId, 'expenseEdited', text, env, inlineKeyboard);
  return true;
}

/**
 * Edit an existing Telegram message (removes inline buttons after action taken).
 */
export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  text: string,
  env: TelegramEnv,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } }),
  });
}
