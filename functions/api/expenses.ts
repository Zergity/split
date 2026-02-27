import type { AuthEnv } from './types/auth';
import { notifyMembers } from './utils/web-push';

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

interface Group {
  members: { id: string; name: string }[];
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
  if (expense.createdBy) {
    involved.delete(expense.createdBy);
  }

  if (involved.size === 0) return;

  // Look up names
  const group = await env.SPLITTER_KV.get<Group>('group', 'json');
  const creatorName =
    group?.members.find((m) => m.id === expense.createdBy)?.name || 'Someone';

  const isSettlement = expense.splitType === 'settlement';
  const title = isSettlement ? 'Settlement' : 'Expense';
  const body =
    action === 'added'
      ? isSettlement
        ? `${creatorName} recorded a settlement: ${expense.description}`
        : `${creatorName} added "${expense.description}" (${expense.amount})`
      : `${creatorName} updated "${expense.description}"`;

  try {
    await notifyMembers(env, [...involved], {
      title,
      body,
      url: `/edit/${expense.id}`,
      tag: `expense-${expense.id}`,
    });
  } catch (err) {
    console.error('Failed to send push notifications:', err);
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

    // Send push notifications (non-blocking)
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
