import type { AuthEnv } from './types/auth';
import { requireGroup } from './utils/session';
import { getExpenses, saveExpenses, GroupRecord, findMember } from './utils/groups';
import { notifyMembers as notifyPush } from './utils/web-push';
import { notifyMembers as notifyTelegram, sendTelegramNotification } from './utils/telegram';

type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'settlement';

interface ExpenseSplit {
  memberId: string;
  value: number;
  amount: number;
  signedOff: boolean;
  signedAt?: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  createdBy?: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  createdAt: string;
  receiptUrl?: string;
  receiptDate?: string;
}

function getMemberName(group: GroupRecord, id: string): string {
  return findMember(group, id)?.name ?? id;
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('vi-VN')} ${currency}`;
}

// Resolve member ids to their user ids (for Telegram which is user-scoped).
// Members without a userId (unclaimed placeholders) are dropped.
function memberIdsToUserIds(group: GroupRecord, memberIds: string[]): string[] {
  const out: string[] = [];
  for (const id of memberIds) {
    const m = findMember(group, id);
    if (m?.userId) out.push(m.userId);
  }
  return out;
}

async function sendExpenseNotification(
  env: AuthEnv,
  group: GroupRecord,
  expense: Expense,
  action: 'added' | 'updated',
): Promise<void> {
  const involved = new Set<string>();
  for (const split of expense.splits) involved.add(split.memberId);
  involved.add(expense.paidBy);

  const creatorId = expense.createdBy ?? expense.paidBy;
  if (expense.createdBy) involved.delete(expense.createdBy);

  if (involved.size === 0) return;

  const currency = group.currency;
  const creatorName = getMemberName(group, creatorId);
  const involvedIds = [...involved];

  const isSettlement = expense.splitType === 'settlement';
  const title = isSettlement ? 'Settlement' : 'Expense';
  const body =
    action === 'added'
      ? isSettlement
        ? `${creatorName} recorded a settlement: ${expense.description}`
        : `${creatorName} added "${expense.description}" (${expense.amount})`
      : `${creatorName} updated "${expense.description}"`;

  try {
    await notifyPush(env, group, involvedIds, {
      title,
      body,
      url: `/edit/${expense.id}`,
      tag: `expense-${expense.id}`,
    }, isSettlement ? 'settlementRequest' : (action === 'added' ? 'newExpense' : 'expenseEdited'));
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }

  try {
    if (isSettlement) {
      const debtorSplit = expense.splits.find((s) => s.memberId !== expense.paidBy);
      if (debtorSplit) {
        const debtor = findMember(group, debtorSplit.memberId);
        if (debtor?.userId) {
          const payerName = getMemberName(group, expense.paidBy);
          const recipientName = debtor.name;
          await sendTelegramNotification(
            debtor.userId,
            'settlementRequest',
            `🤝 <b>Settlement request</b>\n\n<b>${payerName}</b> made a settlement payment to <b>${recipientName}</b>\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n📝 Note: ${expense.description}\n\nPlease confirm that you received the money.`,
            env,
            {
              inline_keyboard: [
                [
                  { text: '✅ Confirm receipt', callback_data: `settle_accept:${group.id}:${expense.id}` },
                  { text: '❌ Reject', callback_data: `settle_reject:${group.id}:${expense.id}` },
                ],
              ],
            },
          );
        }
      }
    } else {
      const payerName = getMemberName(group, expense.paidBy);
      const splitsDetail = expense.splits
        .map((s) => `  • ${getMemberName(group, s.memberId)}: ${formatAmount(s.amount, currency)}`)
        .join('\n');
      const userIds = memberIdsToUserIds(group, expense.splits.map((s) => s.memberId));
      const excludeUserId = findMember(group, creatorId)?.userId ?? '';
      await notifyTelegram(
        userIds,
        excludeUserId,
        'newExpense',
        `💸 <b>New expense</b>\n\n📌 ${expense.description}\n👤 Paid by: <b>${payerName}</b>\n💰 Total: <b>${formatAmount(expense.amount, currency)}</b>\n\n<b>Each member's share:</b>\n${splitsDetail}`,
        env,
        {
          inline_keyboard: [
            [{ text: '✅ Confirm', callback_data: `signoff:${group.id}:${expense.id}` }],
          ],
        },
      );
    }
  } catch (err) {
    console.error('Failed to send Telegram notifications:', err);
  }
}

export const onRequestGet: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const expenses = await getExpenses(context.env, ctx.group.id);
    return Response.json({ success: true, data: expenses });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to fetch expenses' },
      { status: 500 },
    );
  }
};

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const ctx = await requireGroup(context.env, context.request);
    if (ctx instanceof Response) return ctx;
    const { group } = ctx;

    const expense = (await context.request.json()) as Omit<Expense, 'id' | 'createdAt'>;
    const expenses = (await getExpenses(context.env, group.id)) as Expense[];

    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    expenses.push(newExpense);
    await saveExpenses(context.env, group.id, expenses);

    context.waitUntil(sendExpenseNotification(context.env, group, newExpense, 'added'));

    return Response.json({ success: true, data: newExpense });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to create expense' },
      { status: 500 },
    );
  }
};
