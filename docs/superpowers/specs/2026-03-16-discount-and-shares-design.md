# Discount Flat Amount & Shares Split Mode

## Overview

Two additions to the AddExpense form:

1. **Discount type toggle**: support flat amount (đ) alongside existing percentage (%)
2. **Shares split mode**: new tab in "Split between" section for splitting by share ratio instead of item assignment

Both features integrate into the existing form layout with minimal UI changes.

## 1. Discount Type Toggle

### Current State

- `Expense.discount` stores a percentage number (e.g., `10` for 10%)
- Discount field only visible when `hasItems` is true
- `handleDiscountChange()` recalculates item amounts based on percentage

### Changes

#### Type: `Expense`

Add `discountType` field:

```typescript
// in src/types/index.ts
export type DiscountType = 'percentage' | 'flat';

export interface Expense {
  // ... existing fields
  discount?: number;
  discountType?: DiscountType; // NEW — default 'percentage' for backward compat
}
```

#### UI: Discount field in AddExpense

Replace the current "Discount %" label + input with:

```
[input: number] [dropdown: % | đ]  "10% off all items"  Remove
```

- Dropdown `<select>` with two options: `%` (default) and `đ`
- When `%` selected: behavior identical to current (value = percentage)
- When `đ` selected: value = flat amount in currency. System converts to equivalent percentage for item recalculation: `equivalentPercent = (flatAmount / subtotal) * 100`
- Label changes accordingly: "10% off all items" or "100,000đ off"
- **Always visible** — remove the `hasItems` condition. In shares mode, discount is applied to the total before splitting.

#### Logic: `handleDiscountChange()`

When `discountType === 'flat'`:

1. Calculate subtotal from items (or manual total in shares mode)
2. Convert flat amount to percentage: `percentage = (flatAmount / subtotal) * 100`
3. Apply the same item recalculation logic as current percentage mode
4. Store both `discount` (the flat amount) and `discountType: 'flat'` in the expense

When `discountType === 'percentage'`:

- Identical to current behavior

#### Backward Compatibility

- Existing expenses without `discountType` default to `'percentage'`
- `calculateBalances()` doesn't need changes — it uses `split.amount` which is already the final calculated value

## 2. Shares Split Mode

### Current State

- `SplitType` includes `'shares'` but AddExpense always uses `'exact'` (item-based)
- `calculateSplits()` already handles `'shares'` type correctly
- `validateSplits()` already validates shares (totalShares > 0)

### Changes

#### UI: Tab toggle in "Split between" section

Add a tab toggle between "Items" and "Shares" below the "Split between" label:

```
Split between                    Clear all
[  Items  ] [ Shares ]       ← NEW tab toggle
[Dinh] [Huy] [Linh] [Mai]   ← existing member chips
Tap to add/remove from expense
```

- Default: "Items" (current behavior)
- When "Shares" selected:
  - Hide: Scan Receipt section, Amounts/ReceiptItems section, "Split equally" button
  - Show: Shares section (total input + member steppers + summary)
  - Member chips hint changes from "Drag to items..." to "Tap to add/remove from expense"

#### State: New state variables in AddExpense

```typescript
const [splitMode, setSplitMode] = useState<'items' | 'shares'>('items');
const [memberShares, setMemberShares] = useState<Map<string, number>>(new Map());
const [sharesTotalAmount, setSharesTotalAmount] = useState<number>(0);
```

#### UI: Shares section (replaces Amounts when in shares mode)

```
Shares                          All equal  (or "Total: 4 shares")
┌──────────────────────────────────────────┐
│ Total  │                    500,000  │ đ │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ [Dinh]     1/3 · 33%    133,333đ  [−] 1 [+] │
├──────────────────────────────────────────┤
│ Huy        1/3 · 33%    133,333đ  [−] 1 [+] │
├──────────────────────────────────────────┤
│ Linh       1/3 · 33%    133,333đ  [−] 1 [+] │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Subtotal                      500,000đ   │
│ Discount                     −100,000đ   │
│ ──────────────────────────────────────── │
│ Total to split                400,000đ   │
└──────────────────────────────────────────┘
```

**Stepper behavior:**

- Members added to expense (included) get default 1 share
- `+` button: increment share by 1
- `−` button: decrement share by 1, **disabled when share = 1** (minimum)
- To remove a member entirely: tap the member chip (existing behavior)

**Header label:**

- When all shares = 1: show *"All equal"* (italic, gray)
- When shares differ: show "Total: N shares"

**Amount calculation per member:**

```
effectiveTotal = sharesTotalAmount - discountAmount
memberAmount = effectiveTotal * (memberShare / totalShares)
```

Where `discountAmount` = flat amount directly, or `sharesTotalAmount * discount / 100` for percentage.

#### Submit: Creating the expense in shares mode

```typescript
// When splitMode === 'shares':
const splits = includedMembers.map(member => ({
  memberId: member.id,
  value: memberShares.get(member.id) || 1,
}));

const effectiveTotal = sharesTotalAmount - discountAmount;

const calculatedSplits = calculateSplits(effectiveTotal, 'shares', splits, paidBy);

// Auto sign-off for payer AND creator (existing pattern)
const finalSplits = calculatedSplits.map(s => ({
  ...s,
  signedOff: s.memberId === paidBy || s.memberId === currentUser?.id,
  signedAt: (s.memberId === paidBy || s.memberId === currentUser?.id)
    ? new Date().toISOString() : undefined,
}));

createExpense({
  description,
  amount: sharesTotalAmount, // original total before discount
  paidBy,
  splitType: 'shares',
  splits: finalSplits,
  // No items in shares mode
  discount: discountValue,
  discountType,
  tags,
  receiptDate,
});
```

#### Validation

- `sharesTotalAmount` must be > 0
- At least 1 included member
- Existing `validateSplits()` handles the rest (totalShares > 0)

## 3. Data Flow

### Items mode (enhanced)

```
User input → items + discount(% or đ) → handleDiscountChange() recalculates items
→ calculateMemberTotals() → exact splits → createExpense(splitType: 'exact')
```

### Shares mode (new)

```
User input → total + shares + discount(% or đ) → effectiveTotal = total - discount
→ calculateSplits(effectiveTotal, 'shares', splits) → createExpense(splitType: 'shares')
```

## 4. Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `DiscountType`, add `discountType` to `Expense` |
| `src/pages/AddExpense.tsx` | Tab toggle, shares UI, discount dropdown, conditional rendering |
| `src/pages/EditExpense.tsx` | Same discount dropdown, display shares if `splitType === 'shares'` |
| `src/utils/splits.ts` | No changes needed — already supports shares |
| `src/utils/balances.ts` | No changes needed — uses `split.amount` |

## 5. Edge Cases

- **Switching modes**: switching from Items to Shares clears items/receipt state; switching back clears shares state. Confirm if items exist.
- **Discount > total**: prevent discount from exceeding total (validate: effectiveTotal >= 0)
- **Flat discount with no total yet**: disable discount input until total is entered in shares mode
- **Editing existing shares expense**: EditExpense needs to detect `splitType === 'shares'` and show shares UI
- **Rounding**: use `roundNumber(amount, 2)` for storage, display with 1 decimal (existing pattern)
- **Zero shares impossible**: minimum share = 1, member removal via chip tap instead
