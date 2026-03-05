import type { AuthEnv } from './types/auth';
import { notifyMembers } from './utils/web-push';
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

async function getExpenses(kv: KVNamespace): Promise<Expense[]> {
  const expenses = await kv.get<Expense[]>('expenses', 'json');
  return expenses || [];
}

async function saveExpenses(kv: KVNamespace, expenses: Expense[]): Promise<void> {
  await kv.put('expenses', JSON.stringify(expenses));
}

interface Member {
  id: string;
  name: string;
}

interface Group {
  currency: string;
  members: Member[];
}

function getMemberName(members: Member[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id;
}

function formatAmount(amount: number, currency: string): string {
  return `${amount.toLocaleString('vi-VN')} ${currency}`;
}

async function sendExpenseNotification(
  env: AuthEnv,
  expense: Expense,
  action: 'added' | 'updated',
): Promise<void> {
  // Determine involved members
  const involved = new Set<string>();
  for (const split of expense.splits) {
    involved.add(split.memberId);
  }
  involved.add(expense.paidBy);

  // Exclude the creator
  const creatorId = expense.createdBy ?? expense.paidBy;
  if (expense.createdBy) {
    involved.delete(expense.createdBy);
  }

  if (involved.size === 0) return;

  const group = await env.SPLITTER_KV.get<Group>('group', 'json');
  const members = group?.members ?? [];
  const currency = group?.currency ?? '';
  const creatorName = getMemberName(members, creatorId);
  const involvedIds = [...involved];

  const isSettlement = expense.splitType === 'settlement';
  const title = isSettlement ? 'Settlement' : 'Expense';
  const body =
    action === 'added'
      ? isSettlement
        ? `${creatorName} recorded a settlement: ${expense.description}`
        : `${creatorName} added "${expense.description}" (${expense.amount})`
      : `${creatorName} updated "${expense.description}"`;

  // Web push + in-app notification history
  try {
    await notifyMembers(env, involvedIds, {
      title,
      body,
      url: `/edit/${expense.id}`,
      tag: `expense-${expense.id}`,
    }, isSettlement ? 'settlementRequest' : (action === 'added' ? 'newExpense' : 'expenseEdited'));
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }

  // Telegram notifications
  try {
    if (isSettlement) {
      const debtorSplit = expense.splits.find((s) => s.memberId !== expense.paidBy);
      if (debtorSplit) {
        const payerName = getMemberName(members, expense.paidBy);
        const recipientName = getMemberName(members, debtorSplit.memberId);
        await sendTelegramNotification(
          debtorSplit.memberId,
          'settlementRequest',
          `🤝 <b>Settlement request</b>\n\n<b>${payerName}</b> made a settlement payment to <b>${recipientName}</b>\n💰 Amount: <b>${formatAmount(expense.amount, currency)}</b>\n📝 Note: ${expense.description}\n\nPlease confirm that you received the money.`,
          env,
          {
            inline_keyboard: [
              [
                { text: '✅ Confirm receipt', callback_data: `settle_accept:${expense.id}` },
                { text: '❌ Reject', callback_data: `settle_reject:${expense.id}` },
              ],
            ],
          },
        );
      }
    } else {
      const payerName = getMemberName(members, expense.paidBy);
      const splitsDetail = expense.splits
        .map((s) => `  • ${getMemberName(members, s.memberId)}: ${formatAmount(s.amount, currency)}`)
        .join('\n');
      const memberIds = expense.splits.map((s) => s.memberId);
      await notifyTelegram(
        memberIds,
        creatorId,
        'newExpense',
        `💸 <b>New expense</b>\n\n📌 ${expense.description}\n👤 Paid by: <b>${payerName}</b>\n💰 Total: <b>${formatAmount(expense.amount, currency)}</b>\n\n<b>Each member's share:</b>\n${splitsDetail}`,
        env,
        {
          inline_keyboard: [
            [{ text: '✅ Confirm', callback_data: `signoff:${expense.id}` }],
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
    const expenses = await getExpenses(context.env.SPLITTER_KV);
    return Response.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to fetch expenses' },
      { status: 500 },
    );
  }
};

export const onRequestPost: PagesFunction<AuthEnv> = async (context) => {
  try {
    const expense = (await context.request.json()) as Omit<Expense, 'id' | 'createdAt'>;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    expenses.push(newExpense);
    await saveExpenses(context.env.SPLITTER_KV, expenses);

    context.waitUntil(sendExpenseNotification(context.env, newExpense, 'added'));

    return Response.json({
      success: true,
      data: newExpense,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to create expense' },
      { status: 500 },
    );
  }
};
