import type { AuthEnv } from '../types/auth';
import { getTokenFromCookies, verifySession } from '../utils/jwt';
import { notifyMembers } from '../utils/web-push';
import { notifyMembers as notifyTelegram, sendDebouncedEditNotification } from '../utils/telegram';

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
  tags?: string[];
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

async function sendEditNotification(
  env: AuthEnv,
  expense: Expense,
  editorId: string | null,
  action: 'updated' | 'removed',
): Promise<void> {
  const involved = new Set<string>();
  for (const split of expense.splits) {
    involved.add(split.memberId);
  }
  involved.add(expense.paidBy);

  if (editorId) {
    involved.delete(editorId);
  }

  if (involved.size === 0) return;

  const group = await env.SPLITTER_KV.get<Group>('group', 'json');
  const members = group?.members ?? [];
  const currency = group?.currency ?? '';
  const editorName = editorId ? getMemberName(members, editorId) : 'Someone';
  const involvedIds = [...involved];

  const title = action === 'removed' ? 'Expense Removed' : 'Expense Updated';
  const body = action === 'removed'
    ? `${editorName} removed "${expense.description}"`
    : `${editorName} updated "${expense.description}"`;

  // Web push + in-app notification history
  try {
    await notifyMembers(env, involvedIds, {
      title,
      body,
      url: action === 'removed' ? '/expenses' : `/edit/${expense.id}`,
      tag: `expense-${expense.id}`,
    }, action === 'removed' ? 'expenseDeleted' : 'expenseEdited');
  } catch (err) {
    console.error('Failed to send push notifications:', err);
  }

  // Telegram notifications
  try {
    if (action === 'updated') {
      const payerName = getMemberName(members, expense.paidBy);
      const splitsDetail = expense.splits
        .map((s) => `  • ${getMemberName(members, s.memberId)}: ${formatAmount(s.amount, currency)}`)
        .join('\n');
      await sendDebouncedEditNotification(
        expense.id,
        expense.splits.map((s) => s.memberId),
        editorId ?? expense.paidBy,
        `✏️ <b>Expense updated</b>\n\n📌 ${expense.description}\n👤 Paid by: <b>${payerName}</b>\n✍️ Edited by: <b>${editorName}</b>\n💰 Total: <b>${formatAmount(expense.amount, currency)}</b>\n\n<b>Each member's share:</b>\n${splitsDetail}\n\n⚠️ Please confirm again.`,
        env,
        {
          inline_keyboard: [
            [{ text: '✅ Confirm again', callback_data: `signoff:${expense.id}` }],
          ],
        },
      );
    } else {
      const memberIds = expense.splits.map((s) => s.memberId);
      await notifyTelegram(
        memberIds,
        editorId ?? expense.paidBy,
        'expenseDeleted',
        `🗑️ <b>Expense deleted</b>\n\n📌 ${expense.description}\n💰 Total: <b>${formatAmount(expense.amount, currency)}</b>\n🙍 Deleted by: <b>${editorName}</b>`,
        env,
      );
    }
  } catch (err) {
    console.error('Failed to send Telegram notifications:', err);
  }
}

export const onRequestPut: PagesFunction<AuthEnv> = async (context) => {
  try {
    const id = context.params.id as string;
    const updates = (await context.request.json()) as Partial<Expense>;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const index = expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      return Response.json(
        { success: false, error: 'Expense not found' },
        { status: 404 },
      );
    }

    expenses[index] = {
      ...expenses[index],
      ...updates,
      id: expenses[index].id,
      createdAt: expenses[index].createdAt,
    };

    const updatedExpense = expenses[index];
    await saveExpenses(context.env.SPLITTER_KV, expenses);

    // Fire-and-forget: Telegram notification must NOT block the response.
    // If Telegram fails, the KV save already succeeded — don't penalize the user.
    context.waitUntil((async () => {
      try {
        const { sendDebouncedEditNotification } = await import('../utils/telegram');
        const memberIds = updatedExpense.splits.map((s) => s.memberId);
        const editorId = (updates as Partial<Expense> & { editedBy?: string }).editedBy ?? updatedExpense.paidBy;

        const group = await context.env.SPLITTER_KV.get<Group>('group', 'json');
        const members = group?.members ?? [];
        const currency = group?.currency ?? '';
        const payerName = getMemberName(members, updatedExpense.paidBy);
        const editorName = getMemberName(members, editorId);
        const splitsDetail = updatedExpense.splits
          .map((s) => `  • ${getMemberName(members, s.memberId)}: ${formatAmount(s.amount, currency)}`)
          .join('\n');

        await sendDebouncedEditNotification(
          updatedExpense.id,
          memberIds,
          editorId,
          `✏️ <b>Expense updated</b>\n\n📌 ${updatedExpense.description}\n👤 Paid by: <b>${payerName}</b>\n✍️ Edited by: <b>${editorName}</b>\n💰 Total: <b>${formatAmount(updatedExpense.amount, currency)}</b>\n\n<b>Each member's share:</b>\n${splitsDetail}\n\n⚠️ Please confirm again.`,
          context.env,
          {
            inline_keyboard: [
              [{ text: '✅ Confirm again', callback_data: `signoff:${updatedExpense.id}` }],
            ],
          },
        );
      } catch {
        // Telegram failure must not affect the API response
      }
    })());

    return Response.json({
      success: true,
      data: updatedExpense,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to update expense' },
      { status: 500 },
    );
  }
};

export const onRequestDelete: PagesFunction<AuthEnv> = async (context) => {
  try {
    const id = context.params.id as string;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const index = expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      return Response.json(
        { success: false, error: 'Expense not found' },
        { status: 404 },
      );
    }

    const deletedExpense = expenses[index];
    expenses.splice(index, 1);
    await saveExpenses(context.env.SPLITTER_KV, expenses);

    // Send notifications for hard delete
    let deletorId: string | null = null;
    const token = getTokenFromCookies(context.request);
    if (token) {
      const session = await verifySession(context.env, token);
      if (session) deletorId = session.memberId;
    }
    context.waitUntil(sendEditNotification(context.env, deletedExpense, deletorId, 'removed'));

    return Response.json({
      success: true,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to delete expense' },
      { status: 500 },
    );
  }
};
