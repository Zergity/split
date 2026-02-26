import { Bot, webhookCallback } from 'grammy';
import {
  KV_KEYS,
  DEFAULT_NOTIFY_PREFS,
  TELEGRAM_CONNECT_TTL_SECONDS,
} from '../types/auth';
import type { TelegramData, TelegramConnectToken, NotifyPrefs } from '../types/auth';
import { editTelegramMessage, sendTelegramNotification } from '../utils/telegram';
import { getTokenFromCookies, verifySession } from '../utils/jwt';

interface Env {
  SPLITTER_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
}

// ── JWT helper ─────────────────────────────────────────────────────────────

async function getMemberIdFromJWT(request: Request, env: Env): Promise<string | null> {
  const token = getTokenFromCookies(request);
  if (!token) return null;
  const session = await verifySession(env, token);
  return session?.memberId ?? null;
}

// ── Route helpers ──────────────────────────────────────────────────────────

function getRoutePath(request: Request): string {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  return parts[parts.length - 1] ?? '';
}

// ── Handlers ───────────────────────────────────────────────────────────────

async function handleConnect(request: Request, env: Env): Promise<Response> {
  const memberId = await getMemberIdFromJWT(request, env);
  if (!memberId) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const token = crypto.randomUUID();
  const payload: TelegramConnectToken = {
    memberId,
    expiresAt: new Date(Date.now() + TELEGRAM_CONNECT_TTL_SECONDS * 1000).toISOString(),
  };
  await env.SPLITTER_KV.put(KV_KEYS.telegramConnect(token), JSON.stringify(payload), {
    expirationTtl: TELEGRAM_CONNECT_TTL_SECONDS,
  });

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
  const me = await res.json() as { result?: { username?: string } };
  const botUsername = me.result?.username ?? 'bot';

  return Response.json({
    success: true,
    data: { deepLink: `https://t.me/${botUsername}?start=${token}` },
  });
}

async function handleDisconnect(request: Request, env: Env): Promise<Response> {
  const memberId = await getMemberIdFromJWT(request, env);
  if (!memberId) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const data = await env.SPLITTER_KV.get<TelegramData>(KV_KEYS.telegram(memberId), 'json');
  if (data) await env.SPLITTER_KV.delete(KV_KEYS.telegramChatId(data.chatId));
  await env.SPLITTER_KV.delete(KV_KEYS.telegram(memberId));

  return Response.json({ success: true });
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const memberId = await getMemberIdFromJWT(request, env);
  if (!memberId) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const data = await env.SPLITTER_KV.get<TelegramData>(KV_KEYS.telegram(memberId), 'json');
  return Response.json({
    success: true,
    data: { connected: !!data, notifyPrefs: data?.notifyPrefs ?? null },
  });
}

async function handlePreferences(request: Request, env: Env): Promise<Response> {
  const memberId = await getMemberIdFromJWT(request, env);
  if (!memberId) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const updates = await request.json() as Partial<NotifyPrefs>;
  const data = await env.SPLITTER_KV.get<TelegramData>(KV_KEYS.telegram(memberId), 'json');
  if (!data) return Response.json({ success: false, error: 'Not connected' }, { status: 400 });

  const updated: TelegramData = {
    ...data,
    notifyPrefs: { ...DEFAULT_NOTIFY_PREFS, ...data.notifyPrefs, ...updates },
  };
  await env.SPLITTER_KV.put(KV_KEYS.telegram(memberId), JSON.stringify(updated));

  return Response.json({ success: true, data: { notifyPrefs: updated.notifyPrefs } });
}

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('Forbidden', { status: 403 });

  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  // /start {token} — connect flow
  bot.command('start', async (ctx) => {
    const token = ctx.match?.trim();
    if (!token) {
      await ctx.reply('Hello! Connect your account from the app settings.');
      return;
    }

    const connectData = await env.SPLITTER_KV.get<TelegramConnectToken>(
      KV_KEYS.telegramConnect(token), 'json',
    );
    if (!connectData || new Date(connectData.expiresAt) < new Date()) {
      await ctx.reply('❌ This link is expired or invalid. Please try again from the app.');
      return;
    }

    const chatId = String(ctx.chat.id);

    // Enforce 1:1 — if this Telegram account is already linked to another member, disconnect it first
    const existingMemberId = await env.SPLITTER_KV.get(KV_KEYS.telegramChatId(chatId));
    if (existingMemberId && existingMemberId !== connectData.memberId) {
      await env.SPLITTER_KV.delete(KV_KEYS.telegram(existingMemberId));
    }

    // Also clean up if this app account was previously linked to a different Telegram chat
    const existingData = await env.SPLITTER_KV.get<TelegramData>(KV_KEYS.telegram(connectData.memberId), 'json');
    if (existingData && existingData.chatId !== chatId) {
      await env.SPLITTER_KV.delete(KV_KEYS.telegramChatId(existingData.chatId));
    }

    const telegramData: TelegramData = {
      chatId,
      connectedAt: new Date().toISOString(),
      notifyPrefs: DEFAULT_NOTIFY_PREFS,
    };
    await env.SPLITTER_KV.put(KV_KEYS.telegram(connectData.memberId), JSON.stringify(telegramData));
    await env.SPLITTER_KV.put(KV_KEYS.telegramChatId(chatId), connectData.memberId);
    await env.SPLITTER_KV.delete(KV_KEYS.telegramConnect(token));

    const group = await env.SPLITTER_KV.get<{ members: Array<{ id: string; name: string }> }>('group', 'json');
    const memberName = group?.members.find((m) => m.id === connectData.memberId)?.name ?? connectData.memberId;

    await ctx.reply(`✅ Connected successfully! Notifications for <b>${memberName}</b> will be sent here.`, { parse_mode: 'HTML' });
  });

  // Callback query — button taps
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    const chatId = String(ctx.callbackQuery.from.id);
    const messageId = ctx.callbackQuery.message?.message_id;

    const memberId = await env.SPLITTER_KV.get(KV_KEYS.telegramChatId(chatId));
    if (!memberId) {
      await ctx.answerCallbackQuery({ text: 'Session expired. Please reconnect.' });
      return;
    }

    const [action, expenseId] = data.split(':');

    if (action === 'signoff') {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: [[
          { text: '✅ Confirm', callback_data: `yes_signoff:${expenseId}` },
          { text: '❌ Cancel', callback_data: `no:${expenseId}` },
        ]] },
      });
    } else if (action === 'yes_signoff') {
      await handleSignOff(ctx, memberId, expenseId, chatId, messageId, env);
    } else if (action === 'settle_accept') {
      await ctx.answerCallbackQuery();
      await ctx.editMessageReplyMarkup({
        reply_markup: { inline_keyboard: [[
          { text: '✅ Confirm receipt', callback_data: `yes_settle_accept:${expenseId}` },
          { text: '❌ Cancel', callback_data: `no:${expenseId}` },
        ]] },
      });
    } else if (action === 'yes_settle_accept') {
      await handleSettleAccept(ctx, memberId, expenseId, chatId, messageId, env);
    } else if (action === 'no') {
      await ctx.answerCallbackQuery({ text: 'Cancelled.' });
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
      await ctx.reply('❎ Cancelled.');
    } else if (action === 'settle_reject') {
      await ctx.answerCallbackQuery({ text: '❌ Rejected.' });
      await processRejection(memberId, expenseId, chatId, messageId, ctx, env);
    }
  });

  const handler = webhookCallback(bot, 'cloudflare-mod');
  return handler(request);
}

// ── Action processors ──────────────────────────────────────────────────────

type Expense = {
  id: string;
  paidBy: string;
  description: string;
  amount: number;
  splits: Array<{ memberId: string; amount: number; signedOff: boolean; signedAt?: string }>;
};

type Member = { id: string; name: string };
type Group = { currency: string; members: Member[] };

function getMemberName(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id;
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('vi-VN')} ${currency}`;
}

async function getGroupData(env: Env): Promise<{ members: Member[]; currency: string }> {
  const group = await env.SPLITTER_KV.get<Group>('group', 'json');
  return { members: group?.members ?? [], currency: group?.currency ?? '' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CallbackCtx = any;

async function handleSignOff(
  ctx: CallbackCtx,
  memberId: string,
  expenseId: string,
  chatId: string,
  messageId: number | undefined,
  env: Env,
): Promise<void> {
  const expenses = await env.SPLITTER_KV.get<Expense[]>('expenses', 'json') ?? [];
  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) { await ctx.answerCallbackQuery({ text: 'Expense not found.' }); return; }

  const split = expense.splits.find((s) => s.memberId === memberId);
  if (!split) { await ctx.answerCallbackQuery({ text: 'You are not part of this expense.' }); return; }

  split.signedOff = true;
  split.signedAt = new Date().toISOString();
  await env.SPLITTER_KV.put('expenses', JSON.stringify(expenses));

  const { members, currency } = await getGroupData(env);
  const payerName = getMemberName(members, expense.paidBy);
  const myName = getMemberName(members, memberId);
  const myShare = formatAmount(split.amount, currency);
  const totalConfirmed = expense.splits.filter((s) => s.signedOff).length;
  const totalSplits = expense.splits.length;

  await ctx.answerCallbackQuery({ text: '✅ Confirmed!' });
  if (messageId) await editTelegramMessage(
    chatId, messageId,
    `✅ <b>You confirmed this expense</b>\n\n📌 ${expense.description}\n👤 Paid by: <b>${payerName}</b>\n💰 Total: <b>${formatAmount(expense.amount, currency)}</b>\n💵 Your share: <b>${myShare}</b>\n\n✅ Confirmed: ${totalConfirmed}/${totalSplits} members`,
    env,
  );

  await sendTelegramNotification(
    expense.paidBy,
    'expenseEdited',
    `✅ <b>${myName}</b> confirmed expense\n\n📌 ${expense.description}\n💵 Their share: <b>${myShare}</b>\n\n✅ Confirmed: ${totalConfirmed}/${totalSplits} members`,
    env,
  );
}

async function handleSettleAccept(
  ctx: CallbackCtx,
  memberId: string,
  expenseId: string,
  chatId: string,
  messageId: number | undefined,
  env: Env,
): Promise<void> {
  const expenses = await env.SPLITTER_KV.get<Expense[]>('expenses', 'json') ?? [];
  const expense = expenses.find((e) => e.id === expenseId);
  if (!expense) { await ctx.answerCallbackQuery({ text: 'Settlement not found.' }); return; }

  const split = expense.splits.find((s) => s.memberId === memberId);
  console.log('[settle_accept] memberId:', memberId, 'splits:', expense.splits.map(s => s.memberId));
  if (!split) {
    await ctx.answerCallbackQuery({ text: 'You are not part of this settlement.' });
    return;
  }

  split.signedOff = true;
  split.signedAt = new Date().toISOString();
  await env.SPLITTER_KV.put('expenses', JSON.stringify(expenses));

  const { members, currency } = await getGroupData(env);
  const payerName = getMemberName(members, expense.paidBy);
  const receiverName = getMemberName(members, memberId);

  await ctx.answerCallbackQuery({ text: '✅ Receipt confirmed!' });
  if (messageId) await editTelegramMessage(
    chatId, messageId,
    `✅ <b>You confirmed receiving this payment</b>\n\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n👤 From: <b>${payerName}</b>\n📝 Note: ${expense.description}`,
    env,
  );

  await sendTelegramNotification(
    expense.paidBy,
    'settlementAccepted',
    `✅ <b>${receiverName}</b> confirmed receiving your payment\n\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n📝 Note: ${expense.description}`,
    env,
  );
}

async function processRejection(
  memberId: string,
  expenseId: string,
  chatId: string,
  messageId: number | undefined,
  ctx: CallbackCtx | null,
  env: Env,
): Promise<void> {
  const expenses = await env.SPLITTER_KV.get<Expense[]>('expenses', 'json') ?? [];
  const expense = expenses.find((e) => e.id === expenseId);

  const { members, currency } = await getGroupData(env);
  const rejecterName = getMemberName(members, memberId);

  if (ctx && messageId && expense) {
    const payerName = getMemberName(members, expense.paidBy);
    await editTelegramMessage(
      chatId, messageId,
      `❌ <b>You rejected this payment</b>\n\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n👤 From: <b>${payerName}</b>\n📝 Note: ${expense.description}`,
      env,
    );
  }

  if (expense) {
    await sendTelegramNotification(
      expense.paidBy,
      'settlementRejected',
      `❌ <b>${rejecterName}</b> rejected your payment\n\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n📝 Note: ${expense.description}`,
      env,
    );
  }
}

// ── Main router ────────────────────────────────────────────────────────────

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request } = context;
  const route = getRoutePath(request);

  if (route === 'connect' && request.method === 'POST') return handleConnect(request, context.env);
  if (route === 'disconnect' && request.method === 'DELETE') return handleDisconnect(request, context.env);
  if (route === 'status' && request.method === 'GET') return handleStatus(request, context.env);
  if (route === 'preferences' && request.method === 'PATCH') return handlePreferences(request, context.env);
  if (route === 'webhook' && request.method === 'POST') return handleWebhook(request, context.env);

  return Response.json({ success: false, error: 'Not found' }, { status: 404 });
};
