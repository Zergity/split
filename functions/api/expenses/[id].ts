import type { AuthEnv } from '../types/auth';
import { getTokenFromCookies, verifySession } from '../utils/jwt';
import { notifyMembers } from '../utils/web-push';
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

interface Group {
  members: { id: string; name: string }[];
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

  // Exclude the editor
  if (editorId) {
    involved.delete(editorId);
  }

  if (involved.size === 0) return;

  const group = await env.SPLITTER_KV.get<Group>('group', 'json');
  const editorName =
    (editorId && group?.members.find((m) => m.id === editorId)?.name) || 'Someone';

  const title = action === 'removed' ? 'Expense Removed' : 'Expense Updated';
  const body = action === 'removed'
    ? `${editorName} removed "${expense.description}"`
    : `${editorName} updated "${expense.description}"`;

  try {
    await notifyMembers(env, [...involved], {
      title,
      body,
      url: action === 'removed' ? '/expenses' : `/edit/${expense.id}`,
      tag: `expense-${expense.id}`,
    });
  } catch (err) {
    console.error('Failed to send push notifications:', err);
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

    await saveExpenses(context.env.SPLITTER_KV, expenses);

    // Get editor from session (best-effort, don't fail if not authenticated)
    let editorId: string | null = null;
    const token = getTokenFromCookies(context.request);
    if (token) {
      const session = await verifySession(context.env, token);
      if (session) editorId = session.memberId;
    }

    const isDeleted = expenses[index].tags?.includes('deleted');
    context.waitUntil(sendEditNotification(context.env, expenses[index], editorId, isDeleted ? 'removed' : 'updated'));

    return Response.json({
      success: true,
      data: expenses[index],
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

    expenses.splice(index, 1);
    await saveExpenses(context.env.SPLITTER_KV, expenses);

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
