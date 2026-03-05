# Design: Shares Split Mode for Expenses

**Date:** 2026-03-02
**Status:** Approved
**Feature:** Add "shares" (phần) split option alongside existing "items" split

---

## 1. Architecture & State

### State Management
- `splitMode: 'items' | 'shares'` — controls which UI mode is shown
- `sharesMap: Record<memberId, number>` — member → number of shares (0 = excluded)
- Reuse existing `totalAmount` state

### Type Changes
- No changes needed in `src/types/index.ts`
- `splitType: 'shares'` already exists
- `ExpenseSplit.value` will store shares count when splitType === 'shares'

---

## 2. UI Components

### Split Type Selector
- Dropdown placed between "Paid by" and split section
- Options:
  - "Items (theo hóa đơn)" — current behavior
  - "Shares (theo phần)" — new

### Shares Table (when splitMode = 'shares')
**Layout:**
```
┌─────────────────────────────────────────┐
│ Total: [_______________] VND             │
├──────────────┬──────────┬───────────────┤
│ Member       │  Shares  │ Amount        │
├──────────────┼──────────┼───────────────┤
│ [+] An       │  [  1  ] │  100.000đ    │
│ [+] Bình     │  [  1  ] │  100.000đ    │
│ [ ] Cường    │    -     │  0đ          │
├──────────────┴──────────┴───────────────┤
│ Tổng: 2 phần = 200.000đ                │
└─────────────────────────────────────────┘
```

**Behaviors:**
- Click **[+]** to include member (shares default = 1)
- Click **[ ]** to exclude member
- Shares input: integer ≥ 1 only
- Clear shares (set to 0) → exclude member
- Amount column: auto-calculated live, format by currency

---

## 3. Data Flow

### Calculation Formula
```typescript
totalShares = sum(sharesMap.values())
rawAmount = totalAmount * shares / totalShares
shareAmount = round(rawAmount, 2)

residual = round(totalAmount - sum(shareAmounts), 2)
if (residual !== 0) {
  // Priority 1: payer (if payer is in shares list)
  // Priority 2: first participant in shares list (stable order)
  residualRecipient = payerInShares ? payerId : firstParticipantId
  shareAmounts[residualRecipient] += residual
}
// Final invariant: ΣshareAmounts === totalAmount
```

### Validation Rules
| Condition | Error Message |
|-----------|---------------|
| totalAmount ≤ 0 | "Total amount must be greater than 0" (existing) |
| totalShares = 0 | "Chọn ít nhất 1 người tham gia" |
| description empty | "Description is required" (existing) |
| paidBy empty | "Select who paid" (existing) |

### Submit Payload
```typescript
await createExpense({
  description,
  amount: totalAmount,
  paidBy,
  createdBy: currentUser.id,
  splitType: 'shares',
  splits: membersWithShares.map(({ memberId, shares, amount }) => ({
    memberId,
    value: shares,       // stores shares count
    amount,              // calculated amount
    signedOff: memberId === paidBy || memberId === currentUser.id,
    signedAt: (memberId === paidBy || memberId === currentUser.id)
      ? new Date().toISOString() : undefined,
  })),
})
```

---

## 4. Edge Cases & Error Handling

### Mode Switching
- When switching Items ↔ Shares: show confirmation dialog
  > "Switching will clear current split. Continue?"
- If confirm: reset split data and change mode

### Edit Expense
- If original splitType = 'shares': populate sharesMap from splits[].value
- If original splitType = 'exact' and user switches to shares: reset + confirm

### Edge Cases
1. **Only 1 member has shares** — valid, warn "Only 1 person paying?"
2. **Payer not in shares list** — valid (payer paid but not eating)
3. **Rounding residual** — auto-adjust payer's amount when payer is in shares list; otherwise auto-adjust the first shares participant (stable order), no error shown

---

## 5. Testing Checklist

- [ ] Create shares expense (2:1:1) → verify amounts
- [ ] Edit shares expense → verify loads correctly
- [ ] Switch Items ↔ Shares → verify reset + warning
- [ ] Submit with Σshares = 0 → verify error
- [ ] Payer not in split → verify allowed
- [ ] Sign-off flow → verify payer/creator auto-sign
- [ ] Mobile responsive → table scrolls horizontally if needed

---

## 6. Files to Modify

1. `src/pages/AddExpense.tsx` — add splitMode, sharesMap, SharesTable component
2. `src/pages/EditExpense.tsx` — same changes for edit mode
3. Optional: `src/components/SharesTable.tsx` — extract reusable component if code grows

---

## 7. Related Context

- Current expense split workflow uses `splitType: 'exact'` with item-based assignments
- This feature adds `splitType: 'shares'` as a cleaner alternative for simple splits
- Does NOT replace items mode — users can choose based on receipt complexity
