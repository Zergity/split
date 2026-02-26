interface Env {
  SPLITTER_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
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

type SplitType = 'equal' | 'exact' | 'percentage' | 'shares';

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

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const id = context.params.id as string;
    const updates = await context.request.json() as Partial<Expense>;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const index = expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      return Response.json(
        { success: false, error: 'Expense not found' },
        { status: 404 }
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
      { status: 500 }
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const id = context.params.id as string;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const index = expenses.findIndex((e) => e.id === id);
    if (index === -1) {
      return Response.json(
        { success: false, error: 'Expense not found' },
        { status: 404 }
      );
    }

    const deletedExpense = expenses[index];
    expenses.splice(index, 1);
    await saveExpenses(context.env.SPLITTER_KV, expenses);

    // Fire-and-forget: Telegram must NOT block the response
    context.waitUntil((async () => {
      try {
        const { notifyMembers } = await import('../utils/telegram');
        const memberIds = deletedExpense.splits.map((s) => s.memberId);
        const deletorId = context.request.headers.get('X-Member-Id') ?? deletedExpense.paidBy;

        const groupDel = await context.env.SPLITTER_KV.get<Group>('group', 'json');
        const membersDel = groupDel?.members ?? [];
        const currencyDel = groupDel?.currency ?? '';
        const deletorName = getMemberName(membersDel, deletorId);

        await notifyMembers(
          memberIds,
          deletorId,
          'expenseDeleted',
          `🗑️ <b>Expense deleted</b>\n\n📌 ${deletedExpense.description}\n💰 Total: <b>${formatAmount(deletedExpense.amount, currencyDel)}</b>\n🙍 Deleted by: <b>${deletorName}</b>`,
          context.env,
        );
      } catch {
        // Telegram failure must not affect the API response
      }
    })());

    return Response.json({
      success: true,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to delete expense' },
      { status: 500 }
    );
  }
};
