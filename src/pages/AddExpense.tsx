import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ReceiptCapture } from '../components/ReceiptCapture';
import { ReceiptItems } from '../components/ReceiptItems';
import { ReceiptItem, ReceiptOCRResult, DiscountType } from '../types';
import { roundNumber, getTagColor } from '../utils/balances';

export function AddExpense() {
  const navigate = useNavigate();
  const { group, currentUser, createExpense, expenses } = useApp();

  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState(currentUser?.id || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | undefined>(undefined);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [discount, setDiscount] = useState<number | undefined>(undefined);
  const [discountType, setDiscountType] = useState<DiscountType>('percentage');
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Task 4: shares mode state
  const [splitMode, setSplitMode] = useState<'items' | 'shares'>('items');
  const [memberShares, setMemberShares] = useState<Record<string, number>>({});
  const [sharesTotalAmount, setSharesTotalAmount] = useState<number>(0);

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  const tagSuggestions = useMemo(() => {
    const freq = new Map<string, number>();
    expenses.forEach(e =>
      e.tags?.filter(t => t !== 'deleted').forEach(t =>
        freq.set(t, (freq.get(t) || 0) + 1)
      )
    );
    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [expenses]);

  const filteredSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const input = tagInput.toLowerCase().trim();
    return tagSuggestions.filter(tag => tag.startsWith(input) && !tags.includes(tag));
  }, [tagInput, tagSuggestions, tags]);

  const showCreateOption = tagInput.trim() && filteredSuggestions.length === 0;

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

  // Calculate totals from items, or use manual total if set
  const itemsTotal = discountedItems.reduce((sum, i) => sum + i.amount, 0);
  const totalAmount = manualTotal !== null ? manualTotal : itemsTotal;

  // Task 4: shares computed values
  const totalShares = Object.values(memberShares).reduce((sum, s) => sum + s, 0);
  const allSharesEqual = totalShares > 0 && Object.values(memberShares).every(s => s === 1);

  const sharesDiscountAmount = useMemo(() => {
    if (!discount || sharesTotalAmount <= 0) return 0;
    if (discountType === 'flat') return discount;
    return roundNumber(sharesTotalAmount * discount / 100, 2);
  }, [discount, discountType, sharesTotalAmount]);

  const sharesEffectiveTotal = Math.max(0, sharesTotalAmount - sharesDiscountAmount);

  // Task 4: Calculate which members are included
  const includedMemberIds = splitMode === 'items'
    ? new Set(discountedItems.filter(i => i.memberId).map(i => i.memberId!))
    : new Set(Object.keys(memberShares));

  // Calculate splits from items, payer takes the rest
  const calculateSplits = () => {
    const memberTotals = new Map<string, number>();
    for (const item of discountedItems) {
      if (item.memberId && item.amount > 0) {
        const current = memberTotals.get(item.memberId) || 0;
        memberTotals.set(item.memberId, roundNumber(current + item.amount, 2));
      }
    }

    // Payer takes the difference between total and items sum
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

  // Task 4: mode switch handler
  const handleSplitModeChange = (mode: 'items' | 'shares') => {
    if (mode === splitMode) return;
    if (mode === 'shares' && hasItems) {
      if (!window.confirm('Switching to Shares mode will clear your items. Continue?')) return;
      setItems([]);
      setDiscount(undefined);
      setDiscountType('percentage');
      setManualTotal(null);
      setReceiptDate(undefined);
    }
    if (mode === 'items' && Object.keys(memberShares).length > 0) {
      if (!window.confirm('Switching to Items mode will clear your shares. Continue?')) return;
      setMemberShares({});
      setSharesTotalAmount(0);
      setDiscount(undefined);
      setDiscountType('percentage');
    }
    setSplitMode(mode);
  };

  const handleReceiptProcessed = (result: ReceiptOCRResult) => {
    setItems(result.extracted.items);

    if (result.extracted.discount && result.extracted.discount > 0) {
      setDiscount(result.extracted.discount);
      setDiscountType('percentage'); // OCR always returns percentage
    } else {
      setDiscount(undefined);
    }

    if (result.extracted.merchant) {
      setDescription(result.extracted.merchant);
    }
    if (result.extracted.date) {
      setReceiptDate(result.extracted.date);
    }
  };

  const handleReceiptError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleClearReceipt = () => {
    setItems([]);
    setDiscount(undefined);
    setDiscountType('percentage');
    setReceiptDate(undefined);
    setDescription('');
    setManualTotal(null);
  };

  const handleTotalChange = (value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      // Calculate the difference between new total and current items sum
      const currentSum = items.reduce((sum, i) => sum + i.amount, 0);
      const diff = roundNumber(parsed - currentSum, 2);

      if (Math.abs(diff) > 0.001 && items.length > 0) {
        // Find payer's item or first item to adjust
        const payerItem = items.find(i => i.memberId === paidBy);
        const targetItem = payerItem || items[0];

        // Update the target item's amount
        const newAmount = roundNumber(targetItem.amount + diff, 2);
        setItems(items.map(item =>
          item.id === targetItem.id ? { ...item, amount: Math.max(0, newAmount) } : item
        ));
      }
      setManualTotal(null); // Reset since we adjusted items
    } else if (value === '' || value === '0') {
      setManualTotal(null);
    }
  };

  // Handle items change - also reset manualTotal so total auto-updates
  const handleItemsChange = (newItems: ReceiptItem[]) => {
    setItems(newItems);
    setManualTotal(null); // Reset so total = sum of items
  };

  // Task 4: Handle member tap - shares mode or items mode
  const handleMemberTap = (memberId: string) => {
    if (splitMode === 'shares') {
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

    // If an item is selected, assign this member to it
    if (selectedItemId) {
      handleItemsChange(items.map(item =>
        item.id === selectedItemId ? { ...item, memberId } : item
      ));
      setSelectedItemId(null);
      return;
    }

    const isIncluded = includedMemberIds.has(memberId);

    if (isIncluded) {
      // Remove all assignments for this member
      handleItemsChange(items.map(item =>
        item.memberId === memberId ? { ...item, memberId: undefined } : item
      ));
    } else {
      // Find first unassigned item
      const unassignedItem = items.find(item => !item.memberId);
      if (unassignedItem) {
        // Assign to first unassigned item
        handleItemsChange(items.map(item =>
          item.id === unassignedItem.id ? { ...item, memberId } : item
        ));
      } else {
        // Create new item for this member
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

  // Handle item selection for assignment
  const handleItemSelect = (itemId: string) => {
    setSelectedItemId(selectedItemId === itemId ? null : itemId);
  };

  // Drag handlers for members
  const handleMemberDragStart = (e: React.DragEvent, memberId: string) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', memberId);
  };

  if (!group) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) { setError('Description is required'); return; }
    if (!paidBy) { setError('Select who paid'); return; }
    if (!currentUser) { setError('Select your name first'); return; }

    if (splitMode === 'items') {
      if (totalAmount <= 0) { setError('Total amount must be greater than 0'); return; }
      if (discountedItems.length === 0) { setError('Add at least one item'); return; }
    } else {
      if (sharesTotalAmount <= 0) { setError('Total amount must be greater than 0'); return; }
      if (Object.keys(memberShares).length === 0) { setError('Add at least one member'); return; }
      if (sharesEffectiveTotal < 0) { setError('Discount cannot exceed total amount'); return; }
    }

    setSubmitting(true);

    try {
      if (splitMode === 'items') {
        const memberTotals = calculateSplits();
        const splits = Array.from(memberTotals.entries()).map(([memberId, amount]) => ({
          memberId,
          value: amount,
          amount,
          signedOff: memberId === paidBy || memberId === currentUser.id,
          signedAt: (memberId === paidBy || memberId === currentUser.id) ? new Date().toISOString() : undefined,
        }));
        await createExpense({
          description: description.trim(), amount: totalAmount, paidBy,
          createdBy: currentUser.id, splitType: 'exact', splits,
          items: discountedItems, discount,
          discountType: discount ? discountType : undefined,
          tags: tags.length > 0 ? tags : undefined, receiptDate,
        });
      } else {
        const splits = Object.entries(memberShares).map(([memberId, share]) => {
          const amount = roundNumber(sharesEffectiveTotal * share / totalShares, 2);
          const isAutoSignOff = memberId === paidBy || memberId === currentUser.id;
          return {
            memberId, value: share, amount,
            signedOff: isAutoSignOff,
            signedAt: isAutoSignOff ? new Date().toISOString() : undefined,
          };
        });
        await createExpense({
          description: description.trim(), amount: sharesTotalAmount, paidBy,
          createdBy: currentUser.id, splitType: 'shares', splits,
          discount: discount || undefined,
          discountType: discount ? discountType : undefined,
          tags: tags.length > 0 ? tags : undefined, receiptDate,
        });
      }
      navigate('/expenses');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense');
    } finally {
      setSubmitting(false);
    }
  };

  const hasItems = items.length > 0;

  return (
    <div className="pb-20">
      <h2 className="text-xl font-bold mb-6">Add Transaction</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Receipt capture - items mode only */}
        {splitMode === 'items' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Scan Receipt (optional)
            </label>
            <ReceiptCapture
              onProcessed={handleReceiptProcessed}
              onError={handleReceiptError}
              disabled={hasItems}
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was this transaction for?"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Tags (optional)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => {
              const color = getTagColor(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setTags(tags.filter((t) => t !== tag))}
                  className={`text-xs px-2 py-1 rounded-full ${color.bg} ${color.text} hover:bg-red-900 hover:text-red-300`}
                >
                  {tag} ×
                </button>
              );
            })}
            <div ref={dropdownRef} className="relative flex items-center gap-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setTagInput(value);
                  setShowSuggestions(value.trim().length >= 1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
                      setTags([...tags, tagInput.trim().toLowerCase()]);
                      setTagInput('');
                      setShowSuggestions(false);
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  }
                }}
                placeholder="add tag"
                className="w-24 text-sm bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (tagInput.trim() && !tags.includes(tagInput.trim().toLowerCase())) {
                    setTags([...tags, tagInput.trim().toLowerCase()]);
                    setTagInput('');
                    setShowSuggestions(false);
                  }
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                +
              </button>

              {showSuggestions && (filteredSuggestions.length > 0 || showCreateOption) && (
                <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] max-h-[200px] overflow-y-auto">
                  {filteredSuggestions.map((tag) => {
                    const color = getTagColor(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setTags([...tags, tag]);
                          setTagInput('');
                          setShowSuggestions(false);
                        }}
                        className="w-full px-3 py-2 text-sm text-left hover:bg-gray-700 flex items-center gap-2"
                      >
                        <span className={`px-2 py-0.5 rounded-full text-xs ${color.bg} ${color.text}`}>
                          {tag}
                        </span>
                      </button>
                    );
                  })}
                  {showCreateOption && (
                    <div className="px-3 py-2 text-sm text-gray-500 italic">
                      Press Enter to add "{tagInput.trim()}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Paid by
          </label>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
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
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Split between
            </label>
            {hasItems && (
              <button
                type="button"
                onClick={handleClearReceipt}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Task 4: Split mode toggle */}
          <div className="flex bg-gray-800 rounded-lg p-0.5 mb-3">
            <button
              type="button"
              onClick={() => handleSplitModeChange('items')}
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
              onClick={() => handleSplitModeChange('shares')}
              className={`flex-1 text-center py-1.5 text-sm rounded-md transition-colors ${
                splitMode === 'shares'
                  ? 'bg-cyan-600 text-white font-semibold'
                  : 'text-gray-500'
              }`}
            >
              Shares
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {group.members.map((member) => {
              const isIncluded = includedMemberIds.has(member.id);
              const isYou = currentUser && member.id === currentUser.id;
              return (
                <div
                  key={member.id}
                  draggable
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
              ? 'Drag to items or "+ Add item" below'
              : 'Tap to add/remove from expense'}
          </p>
        </div>

        {/* Task 3: Discount - show when items exist or shares mode active */}
        {(hasItems || manualTotal !== null || (splitMode === 'shares' && sharesTotalAmount > 0)) && (
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

        {/* Task 5: Amounts / Shares section */}
        {splitMode === 'items' ? (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Amounts</label>
              {includedMemberIds.size > 0 && (
                <button type="button" onClick={() => {
                  if (discountedItems.length === 0) return;
                  const splitAmount = roundNumber(totalAmount / discountedItems.length, 2);
                  handleItemsChange(discountedItems.map(item => ({ ...item, amount: splitAmount })));
                }} className="text-sm text-cyan-400 hover:text-cyan-300">Split equally</button>
              )}
            </div>
            <ReceiptItems items={discountedItems} members={group.members} currency={group.currency}
              totalAmount={totalAmount} onTotalChange={handleTotalChange} onChange={handleItemsChange}
              payerId={paidBy} selectedItemId={selectedItemId} onItemSelect={handleItemSelect} />
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Shares</label>
              <span className="text-sm text-gray-500 italic">
                {allSharesEqual ? 'All equal' : `Total: ${totalShares} shares`}
              </span>
            </div>

            {/* Total amount input */}
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mb-3">
              <span className="px-3 py-2 text-sm text-gray-500 border-r border-gray-700">Total</span>
              <input type="number" min="0" value={sharesTotalAmount || ''}
                onChange={(e) => setSharesTotalAmount(parseFloat(e.target.value) || 0)}
                placeholder="Enter total..."
                className="flex-1 bg-transparent px-3 py-2 text-right text-lg font-semibold text-gray-100" />
              <span className="px-3 py-2 text-sm text-gray-500">đ</span>
            </div>

            {/* Member shares stepper */}
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
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={share <= 1}
                          onClick={() => setMemberShares(prev => ({ ...prev, [memberId]: Math.max(1, prev[memberId] - 1) }))}
                          className="w-7 h-7 flex items-center justify-center bg-gray-700 rounded-md text-white disabled:opacity-40">−</button>
                        <span className="text-lg font-bold text-white min-w-[22px] text-center">{share}</span>
                        <button type="button"
                          onClick={() => setMemberShares(prev => ({ ...prev, [memberId]: prev[memberId] + 1 }))}
                          className="w-7 h-7 flex items-center justify-center bg-cyan-600 rounded-md text-white">+</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
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

        <button
          type="submit"
          disabled={submitting || (splitMode === 'items' ? discountedItems.length === 0 : Object.keys(memberShares).length === 0 || sharesTotalAmount <= 0)}
          className="w-full bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Transaction'}
        </button>
      </form>
    </div>
  );
}
