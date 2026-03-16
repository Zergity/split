import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ReceiptItems } from '../components/ReceiptItems';
import { ReceiptItem, DiscountType } from '../types';
import { roundNumber } from '../utils/balances';

export function EditExpense() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { group, expenses, currentUser, updateExpense } = useApp();

  const expense = expenses.find((e) => e.id === id);

  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [discount, setDiscount] = useState<number | undefined>(undefined);
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shares mode state
  const [splitMode, setSplitMode] = useState<'items' | 'shares'>('items');
  const [memberShares, setMemberShares] = useState<Record<string, number>>({});
  const [sharesTotalAmount, setSharesTotalAmount] = useState<number>(0);

  // Initialize form with existing expense data
  useEffect(() => {
    if (expense && group) {
      setDescription(expense.description);
      setPaidBy(expense.paidBy);
      setDiscount(expense.discount);
      setDiscountType(expense.discountType || 'percentage');

      if (expense.splitType === 'shares') {
        setSplitMode('shares');
        const shares: Record<string, number> = {};
        for (const split of expense.splits) {
          shares[split.memberId] = split.value;
        }
        setMemberShares(shares);
        setSharesTotalAmount(expense.amount);
      } else {
        setSplitMode('items');
        if (expense.items && expense.items.length > 0) {
          setItems(expense.items);
        } else {
          const convertedItems: ReceiptItem[] = expense.splits.map((split) => ({
            id: crypto.randomUUID(),
            description: '',
            amount: split.amount,
            memberId: split.memberId,
          }));
          setItems(convertedItems);
        }
      }
    }
  }, [expense, group]);

  // Payer can fully edit, creator can only assign unassigned items, participant can edit own items
  const isPayer = !!(currentUser && expense && currentUser.id === expense.paidBy);
  const isCreator = !!(currentUser && expense && currentUser.id === expense.createdBy);
  const isParticipant = !!(currentUser && expense && expense.items?.some(item => item.memberId === currentUser.id));
  const canEdit = isPayer || isCreator || isParticipant;
  const canOnlyAssign = isCreator && !isPayer;
  const canOnlyEditOwnItems = isParticipant && !isPayer && !isCreator;

  const discountedItems = useMemo(() => {
    if (!discount || items.length === 0) return items;

    const subtotal = items.reduce((sum, i) => sum + i.amount, 0);
    let discountPercent: number;

    if (discountType === 'flat') {
      discountPercent = subtotal > 0 ? (discount / subtotal) * 100 : 0;
    } else {
      discountPercent = discount;
    }

    return items.map(item => ({
      ...item,
      amount: roundNumber(item.amount * (1 - discountPercent / 100), 2),
    }));
  }, [items, discount, discountType]);

  // Calculate totals from items
  const itemsTotal = discountedItems.reduce((sum, i) => sum + i.amount, 0);
  const totalAmount = manualTotal !== null ? manualTotal : itemsTotal;

  // Shares computed values
  const totalShares = Object.values(memberShares).reduce((sum, s) => sum + s, 0);
  const allSharesEqual = totalShares > 0 && Object.values(memberShares).every(s => s === 1);

  const sharesDiscountAmount = useMemo(() => {
    if (!discount || sharesTotalAmount <= 0) return 0;
    if (discountType === 'flat') return discount;
    return roundNumber(sharesTotalAmount * discount / 100, 2);
  }, [discount, discountType, sharesTotalAmount]);

  const sharesEffectiveTotal = Math.max(0, sharesTotalAmount - sharesDiscountAmount);

  // Calculate which members are included
  const includedMemberIds = splitMode === 'items'
    ? new Set(discountedItems.filter(i => i.memberId).map(i => i.memberId!))
    : new Set(Object.keys(memberShares));

  // Calculate splits from items
  const calculateSplits = () => {
    const memberTotals = new Map<string, number>();
    for (const item of discountedItems) {
      if (item.memberId && item.amount > 0) {
        const current = memberTotals.get(item.memberId) || 0;
        memberTotals.set(item.memberId, roundNumber(current + item.amount, 2));
      }
    }

    // Payer takes the difference between total and assigned items sum
    if (paidBy && totalAmount > 0) {
      const currentItemsSum = Array.from(memberTotals.values()).reduce((sum, v) => sum + v, 0);
      const diff = roundNumber(totalAmount - currentItemsSum, 2);
      if (Math.abs(diff) > 0.001) {
        const payerCurrent = memberTotals.get(paidBy) || 0;
        memberTotals.set(paidBy, roundNumber(payerCurrent + diff, 2));
      }
    }

    return memberTotals;
  };

  const handleTotalChange = (value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      const currentSum = items.reduce((sum, i) => sum + i.amount, 0);
      const diff = roundNumber(parsed - currentSum, 2);

      if (Math.abs(diff) > 0.001 && items.length > 0) {
        const payerItem = items.find(i => i.memberId === paidBy);
        const targetItem = payerItem || items[0];
        const newAmount = roundNumber(targetItem.amount + diff, 2);
        setItems(items.map(item =>
          item.id === targetItem.id ? { ...item, amount: Math.max(0, newAmount) } : item
        ));
      }
      setManualTotal(null);
    } else if (value === '' || value === '0') {
      setManualTotal(null);
    }
  };

  const handleItemsChange = (newItems: ReceiptItem[]) => {
    setItems(newItems);
    setManualTotal(null);
  };

  const handleMemberTap = (memberId: string) => {
    if (splitMode === 'shares') {
      if (!isPayer) return;
      setMemberShares(prev => {
        const newShares = { ...prev };
        if (memberId in newShares) {
          delete newShares[memberId];
        } else {
          newShares[memberId] = 1;
        }
        return newShares;
      });
      return;
    }

    if (selectedItemId) {
      const selectedItem = items.find(i => i.id === selectedItemId);
      if (canOnlyAssign && selectedItem?.memberId) {
        setSelectedItemId(null);
        return;
      }
      handleItemsChange(items.map(item =>
        item.id === selectedItemId ? { ...item, memberId } : item
      ));
      setSelectedItemId(null);
      return;
    }

    const isIncluded = includedMemberIds.has(memberId);
    if (isIncluded) {
      if (canOnlyAssign) return;
      handleItemsChange(items.map(item =>
        item.memberId === memberId ? { ...item, memberId: undefined } : item
      ));
    } else {
      const unassignedItem = items.find(item => !item.memberId);
      if (unassignedItem) {
        handleItemsChange(items.map(item =>
          item.id === unassignedItem.id ? { ...item, memberId } : item
        ));
      } else {
        if (canOnlyAssign) return;
        const newItem: ReceiptItem = {
          id: crypto.randomUUID(),
          description: '',
          amount: 0,
          memberId,
        };
        handleItemsChange([...items, newItem]);
      }
    }
  };

  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(selectedItemId === itemId ? null : itemId);
  };

  const handleMemberDragStart = (e: React.DragEvent, memberId: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', memberId);
  };

  if (!group || !expense) {
    return (
      <div className="text-center py-8 text-gray-400">
        Transaction not found
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="text-center py-8 text-gray-400">
        You don't have permission to edit this transaction
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    if (!paidBy) {
      setError('Select who paid');
      return;
    }

    if (splitMode === 'items') {
      if (totalAmount <= 0) {
        setError('Total amount must be greater than 0');
        return;
      }
      if (items.length === 0) {
        setError('Add at least one item');
        return;
      }
    } else {
      if (sharesTotalAmount <= 0) {
        setError('Total amount must be greater than 0');
        return;
      }
      if (Object.keys(memberShares).length === 0) {
        setError('Add at least one member');
        return;
      }
      if (sharesEffectiveTotal < 0) {
        setError('Discount cannot exceed total amount');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (splitMode === 'items') {
        const memberTotals = calculateSplits();
        const oldSplitsMap = new Map(expense.splits.map((s) => [s.memberId, s]));

        const splits = Array.from(memberTotals.entries()).map(([memberId, amount]) => {
          const oldSplit = oldSplitsMap.get(memberId);

          if (memberId === paidBy) {
            return {
              memberId,
              value: amount,
              amount,
              signedOff: true,
              signedAt: new Date().toISOString(),
            };
          }

          if (!oldSplit || Math.abs(oldSplit.amount - amount) > 0.01) {
            return {
              memberId,
              value: amount,
              amount,
              signedOff: false,
              signedAt: undefined,
              previousAmount: oldSplit?.amount,
            };
          }

          return {
            memberId,
            value: amount,
            amount,
            signedOff: oldSplit.signedOff,
            signedAt: oldSplit.signedAt,
            previousAmount: oldSplit.previousAmount,
          };
        });

        await updateExpense(expense.id, {
          description: description.trim(),
          amount: totalAmount,
          paidBy,
          splitType: 'exact',
          splits,
          items: discountedItems,
          discount,
          discountType: discount ? discountType : undefined,
        });
      } else {
        const oldSplitsMap = new Map(expense.splits.map((s) => [s.memberId, s]));

        const splits = Object.entries(memberShares).map(([memberId, share]) => {
          const amount = roundNumber(sharesEffectiveTotal * share / totalShares, 2);
          const oldSplit = oldSplitsMap.get(memberId);

          if (memberId === paidBy) {
            return {
              memberId,
              value: share,
              amount,
              signedOff: true,
              signedAt: new Date().toISOString(),
            };
          }

          if (!oldSplit || Math.abs(oldSplit.amount - amount) > 0.01) {
            return {
              memberId,
              value: share,
              amount,
              signedOff: false,
              signedAt: undefined,
              previousAmount: oldSplit?.amount,
            };
          }

          return {
            memberId,
            value: share,
            amount,
            signedOff: oldSplit.signedOff,
            signedAt: oldSplit.signedAt,
            previousAmount: oldSplit.previousAmount,
          };
        });

        await updateExpense(expense.id, {
          description: description.trim(),
          amount: sharesTotalAmount,
          paidBy,
          splitType: 'shares',
          splits,
          discount: discount || undefined,
          discountType: discount ? discountType : undefined,
        });
      }

      navigate('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20">
      <h2 className="text-xl font-bold mb-6">
        Edit Transaction {isPayer ? '(as Payer)' : isCreator ? '(as Creator)' : '(as Participant)'}
      </h2>

      {canOnlyEditOwnItems ? (
        <div className="bg-blue-900/30 border border-blue-700 text-blue-200 px-4 py-3 rounded-lg mb-6 text-sm">
          You can edit the description of your own items.
        </div>
      ) : canOnlyAssign ? (
        <div className="bg-blue-900/30 border border-blue-700 text-blue-200 px-4 py-3 rounded-lg mb-6 text-sm">
          You can edit description and assign members to unassigned items.
        </div>
      ) : (
        <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-200 px-4 py-3 rounded-lg mb-6 text-sm">
          Changing amounts will require affected members to accept again.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this transaction for?"
            disabled={canOnlyAssign || canOnlyEditOwnItems}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Paid by
          </label>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            disabled={canOnlyAssign || canOnlyEditOwnItems}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 disabled:opacity-50"
          >
            <option value="">Select who paid</option>
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>

        {/* Split between - draggable members */}
        {!canOnlyEditOwnItems && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Split between
            </label>

            {/* Split mode toggle - payer only */}
            {isPayer && (
              <div className="flex bg-gray-800 rounded-lg p-0.5 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (splitMode === 'shares') {
                      if (!window.confirm('Switching to Items mode will clear your shares. Continue?')) return;
                      setMemberShares({});
                      setSharesTotalAmount(0);
                      setDiscount(undefined);
                      setDiscountType('percentage');
                      setSplitMode('items');
                    }
                  }}
                  className={`flex-1 text-center py-1.5 text-sm rounded-md transition-colors ${
                    splitMode === 'items'
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'text-gray-500'
                  }`}
                >
                  Items
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (splitMode === 'items') {
                      if (items.length > 0) {
                        if (!window.confirm('Switching to Shares mode will clear your items. Continue?')) return;
                      }
                      setItems([]);
                      setDiscount(undefined);
                      setDiscountType('percentage');
                      setManualTotal(null);
                      setSplitMode('shares');
                    }
                  }}
                  className={`flex-1 text-center py-1.5 text-sm rounded-md transition-colors ${
                    splitMode === 'shares'
                      ? 'bg-cyan-600 text-white font-semibold'
                      : 'text-gray-500'
                  }`}
                >
                  Shares
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {group.members.map((member) => {
                const isIncluded = includedMemberIds.has(member.id);
                const isYou = currentUser && member.id === currentUser.id;
                return (
                  <div
                    key={member.id}
                    draggable={splitMode === 'items'}
                    onClick={() => handleMemberTap(member.id)}
                    onDragStart={(e) => handleMemberDragStart(e, member.id)}
                    className={`px-3 py-1.5 rounded-full text-sm cursor-grab active:cursor-grabbing select-none transition-colors ${
                      isIncluded
                        ? 'bg-cyan-600 text-white hover:bg-red-500'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isYou ? <span className="text-yellow-400">[{member.name}]</span> : member.name}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {splitMode === 'items'
                ? 'Tap item then tap member, or drag member to item'
                : 'Tap to add/remove from expense'}
            </p>
          </div>
        )}

        {/* Discount - show when items exist or shares mode with amount */}
        {items.length > 0 && !canOnlyAssign && !canOnlyEditOwnItems && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Discount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step={discountType === 'percentage' ? '1' : '1000'}
                value={discount || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : undefined;
                  if (discountType === 'percentage') {
                    setDiscount(value && value > 0 && value <= 100 ? value : undefined);
                  } else {
                    setDiscount(value && value > 0 ? value : undefined);
                  }
                }}
                placeholder="0"
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
              />
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as DiscountType);
                  setDiscount(undefined);
                }}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-gray-100 text-sm"
              >
                <option value="percentage">%</option>
                <option value="flat">đ</option>
              </select>
              <span className="text-gray-400 text-sm">
                {discount
                  ? discountType === 'percentage'
                    ? `${discount}% off all items`
                    : `${discount.toLocaleString()}đ off`
                  : 'No discount'}
              </span>
              {discount && (
                <button
                  type="button"
                  onClick={() => setDiscount(undefined)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}

        {/* Shares discount - show in shares mode when amount set */}
        {splitMode === 'shares' && sharesTotalAmount > 0 && !canOnlyAssign && !canOnlyEditOwnItems && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Discount
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step={discountType === 'percentage' ? '1' : '1000'}
                value={discount || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : undefined;
                  if (discountType === 'percentage') {
                    setDiscount(value && value > 0 && value <= 100 ? value : undefined);
                  } else {
                    setDiscount(value && value > 0 ? value : undefined);
                  }
                }}
                placeholder="0"
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
              />
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as DiscountType);
                  setDiscount(undefined);
                }}
                className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-gray-100 text-sm"
              >
                <option value="percentage">%</option>
                <option value="flat">đ</option>
              </select>
              <span className="text-gray-400 text-sm">
                {discount
                  ? discountType === 'percentage'
                    ? `${discount}% off all items`
                    : `${discount.toLocaleString()}đ off`
                  : 'No discount'}
              </span>
              {discount && (
                <button
                  type="button"
                  onClick={() => setDiscount(undefined)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}

        {/* Amounts / Shares section */}
        {splitMode === 'items' ? (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Amounts
              </label>
              {!canOnlyAssign && !canOnlyEditOwnItems && includedMemberIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (discountedItems.length === 0) return;
                    const splitAmount = roundNumber(totalAmount / discountedItems.length, 2);
                    handleItemsChange(discountedItems.map(item => ({ ...item, amount: splitAmount })));
                  }}
                  className="text-sm text-cyan-400 hover:text-cyan-300"
                >
                  Split equally
                </button>
              )}
            </div>
            <ReceiptItems
              items={discountedItems}
              members={group.members}
              currency={group.currency}
              totalAmount={totalAmount}
              onTotalChange={handleTotalChange}
              onChange={handleItemsChange}
              payerId={paidBy}
              selectedItemId={selectedItemId}
              onItemSelect={handleItemSelect}
              assignOnly={canOnlyAssign || canOnlyEditOwnItems}
              editableItemIds={canOnlyEditOwnItems ? new Set(items.filter(i => i.memberId === currentUser?.id).map(i => i.id)) : undefined}
            />
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Shares</label>
              <span className="text-sm text-gray-500 italic">
                {allSharesEqual ? 'All equal' : `Total: ${totalShares} shares`}
              </span>
            </div>

            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-3">
              <span className="px-3 py-2 text-sm text-gray-500 border-r border-gray-700">Total</span>
              <input
                type="number"
                min="0"
                value={sharesTotalAmount || ''}
                onChange={(e) => setSharesTotalAmount(parseFloat(e.target.value) || 0)}
                disabled={!isPayer}
                placeholder="Enter total..."
                className="flex-1 bg-transparent px-3 py-2 text-right text-lg font-semibold text-gray-100 disabled:opacity-50"
              />
              <span className="px-3 py-2 text-sm text-gray-500">đ</span>
            </div>

            <div className="space-y-1">
              {Object.entries(memberShares).map(([memberId, share]) => {
                const member = group.members.find(m => m.id === memberId);
                if (!member) return null;
                const isYou = currentUser && memberId === currentUser.id;
                const percentage = totalShares > 0 ? roundNumber((share / totalShares) * 100) : 0;
                const memberAmount = totalShares > 0 ? roundNumber(sharesEffectiveTotal * share / totalShares, 2) : 0;

                return (
                  <div key={memberId} className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                    <div>
                      <span className="text-sm text-gray-100">
                        {isYou ? <span className="text-yellow-400">[{member.name}]</span> : member.name}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">{share}/{totalShares} · {percentage}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-400 font-medium">{memberAmount.toLocaleString()}đ</span>
                      {isPayer && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={share <= 1}
                            onClick={() => setMemberShares(prev => ({ ...prev, [memberId]: Math.max(1, prev[memberId] - 1) }))}
                            className="w-7 h-7 flex items-center justify-center bg-gray-700 rounded-md text-white disabled:opacity-40"
                          >−</button>
                          <span className="text-lg font-bold text-white min-w-[22px] text-center">{share}</span>
                          <button
                            type="button"
                            onClick={() => setMemberShares(prev => ({ ...prev, [memberId]: prev[memberId] + 1 }))}
                            className="w-7 h-7 flex items-center justify-center bg-cyan-600 rounded-md text-white"
                          >+</button>
                        </div>
                      )}
                      {!isPayer && (
                        <span className="text-lg font-bold text-white min-w-[22px] text-center">{share}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {sharesTotalAmount > 0 && (
              <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="text-gray-400">{sharesTotalAmount.toLocaleString()}đ</span>
                </div>
                {discount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Discount</span>
                    <span className="text-red-400">−{sharesDiscountAmount.toLocaleString()}đ</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold mt-1 pt-1 border-t border-gray-800">
                  <span className="text-gray-300">Total to split</span>
                  <span className="text-white">{sharesEffectiveTotal.toLocaleString()}đ</span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 bg-gray-700 text-gray-300 py-3 rounded-lg font-medium hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              (splitMode === 'items'
                ? items.length === 0
                : Object.keys(memberShares).length === 0 || sharesTotalAmount <= 0)
            }
            className="flex-1 bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
