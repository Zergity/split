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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const expenses = await getExpenses(context.env.SPLITTER_KV);
    return Response.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to fetch expenses' },
      { status: 500 }
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const expense = await context.request.json() as Omit<Expense, 'id' | 'createdAt'>;
    const expenses = await getExpenses(context.env.SPLITTER_KV);

    const newExpense: Expense = {
      ...expense,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    expenses.push(newExpense);
    await saveExpenses(context.env.SPLITTER_KV, expenses);

    // Send Telegram notifications
    const { notifyMembers, sendTelegramNotification } = await import('./utils/telegram');
    const isSettlement = newExpense.splitType === 'settlement';
    const creatorId = (newExpense as Expense & { createdBy?: string }).createdBy ?? newExpense.paidBy;

    const group = await context.env.SPLITTER_KV.get<Group>('group', 'json');
    const members = group?.members ?? [];
    const currency = group?.currency ?? '';

    if (isSettlement) {
      const debtorSplit = newExpense.splits.find((s) => s.memberId !== newExpense.paidBy);
      if (debtorSplit) {
        const payerName = getMemberName(members, newExpense.paidBy);
        const recipientName = getMemberName(members, debtorSplit.memberId);
        await sendTelegramNotification(
          debtorSplit.memberId,
          'settlementRequest',
          `🤝 <b>Settlement request</b>\n\n<b>${payerName}</b> made a settlement payment to <b>${recipientName}</b>\n💰 Amount: <b>${formatAmount(newExpense.amount, currency)}</b>\n📝 Note: ${newExpense.description}\n\nPlease confirm that you received the money.`,
          context.env,
          {
            inline_keyboard: [
              [
                { text: '✅ Confirm receipt', callback_data: `settle_accept:${newExpense.id}` },
                { text: '❌ Reject', callback_data: `settle_reject:${newExpense.id}` },
              ],
            ],
          },
        );
      }
    } else {
      const payerName = getMemberName(members, newExpense.paidBy);
      const splitsDetail = newExpense.splits
        .map((s) => `  • ${getMemberName(members, s.memberId)}: ${formatAmount(s.amount, currency)}`)
        .join('\n');
      const memberIds = newExpense.splits.map((s) => s.memberId);
      await notifyMembers(
        memberIds,
        creatorId,
        'newExpense',
        `💸 <b>New expense</b>\n\n📌 ${newExpense.description}\n👤 Paid by: <b>${payerName}</b>\n💰 Total: <b>${formatAmount(newExpense.amount, currency)}</b>\n\n<b>Each member's share:</b>\n${splitsDetail}`,
        context.env,
        {
          inline_keyboard: [
            [{ text: '✅ Confirm', callback_data: `signoff:${newExpense.id}` }],
          ],
        },
      );
    }

    return Response.json({
      success: true,
      data: newExpense,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to create expense' },
      { status: 500 }
    );
  }
};
