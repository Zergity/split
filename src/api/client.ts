import { Group, Expense, ApiResponse, ReceiptOCRResult } from '../types';
import type { Member } from '../types';

const API_BASE = '/api';

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'API request failed');
  }

  return data.data as T;
}

// Group API
export async function getGroup(): Promise<Group> {
  return fetchApi<Group>('/group');
}

export async function updateGroup(updates: Partial<Group>): Promise<Group> {
  return fetchApi<Group>('/group', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// Expenses API
export async function getExpenses(): Promise<Expense[]> {
  return fetchApi<Expense[]>('/expenses');
}

export async function createExpense(
  expense: Omit<Expense, 'id' | 'createdAt'>
): Promise<Expense> {
  return fetchApi<Expense>('/expenses', {
    method: 'POST',
    body: JSON.stringify(expense),
  });
}

export async function updateExpense(
  id: string,
  updates: Partial<Expense>
): Promise<Expense> {
  return fetchApi<Expense>(`/expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await fetchApi<void>(`/expenses/${id}`, {
    method: 'DELETE',
  });
}

// Soft delete - mark expense with 'deleted' tag instead of actually deleting
export async function softDeleteExpense(
  expense: Expense
): Promise<Expense> {
  const tags = expense.tags || [];
  if (!tags.includes('deleted')) {
    return updateExpense(expense.id, {
      tags: [...tags, 'deleted'],
    });
  }
  return expense;
}


// Receipt processing
export async function processReceipt(file: File): Promise<ReceiptOCRResult> {
  const formData = new FormData();
  formData.append('receipt', file);

  const response = await fetch(`${API_BASE}/receipts/process`, {
    method: 'POST',
    body: formData,
  });

  const data: ApiResponse<{ extracted: ReceiptOCRResult['extracted'] }> = await response.json();

  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to process receipt');
  }

  return {
    success: true,
    extracted: data.data.extracted,
  };
}

// Sign-off helper
export async function signOffExpense(
  expense: Expense,
  memberId: string
): Promise<Expense> {
  const updatedSplits = expense.splits.map((split) => {
    if (split.memberId === memberId && !split.signedOff) {
      return {
        ...split,
        signedOff: true,
        signedAt: new Date().toISOString(),
        previousAmount: undefined, // Clear after signing off
      };
    }
    return split;
  });

  return updateExpense(expense.id, { splits: updatedSplits });
}

// Profile API
export async function updateProfile(updates: Partial<Member>): Promise<Member> {
  return fetchApi<Member>('/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

// Claim/unclaim expense item helper
export async function claimExpenseItem(
  expense: Expense,
  itemId: string,
  memberId: string,
  claim: boolean // true = claim, false = unclaim
): Promise<Expense> {
  if (!expense.items) {
    throw new Error('Expense has no items');
  }

  // Update the item's memberId
  const updatedItems = expense.items.map((item) => {
    if (item.id === itemId) {
      return {
        ...item,
        memberId: claim ? memberId : undefined,
      };
    }
    return item;
  });

  // Calculate splits from items
  // Sum amounts by member
  const memberAmounts = new Map<string, number>();
  let assignedTotal = 0;

  for (const item of updatedItems) {
    if (item.memberId) {
      const current = memberAmounts.get(item.memberId) || 0;
      memberAmounts.set(item.memberId, current + item.amount);
      assignedTotal += item.amount;
    }
  }

  // Payer takes the remainder (total - assigned items)
  const payerRemainder = expense.amount - assignedTotal;
  const payerAmount = memberAmounts.get(expense.paidBy) || 0;
  memberAmounts.set(expense.paidBy, payerAmount + payerRemainder);

  // Build new splits array
  // Both claim and unclaim auto-accept for the person taking action and the payer
  // Expenses with unassigned items go to "Incomplete" list
  const now = new Date().toISOString();
  const updatedSplits: typeof expense.splits = [];

  for (const [splitMemberId, amount] of memberAmounts.entries()) {
    // Skip members with 0 amount (unless they're the payer)
    if (amount === 0 && splitMemberId !== expense.paidBy) {
      continue;
    }

    const existingSplit = expense.splits.find((s) => s.memberId === splitMemberId);
    const isPayer = splitMemberId === expense.paidBy;
    const isClaimer = splitMemberId === memberId;

    // Auto-sign for the person taking action and the payer
    // Others keep their existing status
    let signedOff: boolean;
    let signedAt: string | undefined;

    if (isPayer || isClaimer) {
      signedOff = true;
      signedAt = now;
    } else if (existingSplit) {
      signedOff = existingSplit.signedOff;
      signedAt = existingSplit.signedAt;
    } else {
      signedOff = false;
    }

    updatedSplits.push({
      memberId: splitMemberId,
      value: amount,
      amount: amount,
      signedOff,
      signedAt,
    });
  }

  return updateExpense(expense.id, {
    items: updatedItems,
    splits: updatedSplits,
    splitType: 'exact',
  });
}
