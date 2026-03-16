import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ReceiptCapture } from '../components/ReceiptCapture';
import { ReceiptItems } from '../components/ReceiptItems';
import { ReceiptItem, ReceiptOCRResult, DiscountType } from '../types';
import { roundNumber, getTagColor, calculateDiscountAmount, calculateBillGoc } from '../utils/balances';

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
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [splitMode, setSplitMode] = useState<'items' | 'shares'>('items');
  const [memberShares, setMemberShares] = useState<Record<string, number>>({});

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

  const hasItems = items.length > 0;

  const totalShares = Object.values(memberShares).reduce((sum, s) => sum + s, 0);
  const allSharesEqual = totalShares > 0 && Object.values(memberShares).every(s => s === 1);

  const billGoc = useMemo(() => {
    if (splitMode !== 'items') return totalAmount;
    if (items.length > 0) {
      return roundNumber(items.reduce((sum, item) => sum + item.amount, 0), 2);
    }
    return calculateBillGoc(totalAmount, discount, discountType);
  }, [items, totalAmount, discount, discountType, splitMode]);

  const discountAmount = useMemo(() => {
    if (splitMode !== 'items') return 0;
    if (items.length > 0) {
      const bg = items.reduce((sum, item) => sum + item.amount, 0);
      if (!discount || discount <= 0) return 0;
      if (discountType === 'flat') return discount;
      return roundNumber(bg * (discount / 100), 2);
    }
    return calculateDiscountAmount(discount, discountType, totalAmount);
  }, [items, totalAmount, discount, discountType, splitMode]);

  const includedMemberIds = splitMode === 'items'
    ? new Set(items.filter(i => i.memberId).map(i => i.memberId!))
    : new Set(Object.keys(memberShares));

  const handleItemsChange = (newItems: ReceiptItem[]) => {
    const newBillGoc = newItems.reduce((sum, i) => sum + i.amount, 0);
    const newDiscountAmount = discountType === 'flat'
      ? (discount ?? 0)
      : newBillGoc * ((discount ?? 0) / 100);
    const newTotal = roundNumber(newBillGoc - newDiscountAmount, 2);
    setItems(newItems);
    setTotalAmount(Math.max(0, newTotal));
    if (newItems.length === 0) {
      setDiscount(undefined);
    }
  };

  const handleTotalChange = (value: string) => {
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0) {
      const newBillGoc = calculateBillGoc(parsed, discount, discountType);
      const currentBillGoc = items.reduce((sum, i) => sum + i.amount, 0);
      const diff = roundNumber(newBillGoc - currentBillGoc, 2);

      if (Math.abs(diff) > 0.001) {
        const payerItems = items.filter(i => i.memberId === paidBy);
        if (payerItems.length > 0) {
          const firstPayerItem = payerItems[0];
          const newItemAmount = roundNumber(firstPayerItem.amount + diff, 2);
          if (newItemAmount < 0) {
            setError('Adjustment would make item amount negative');
            return;
          }
          setItems(items.map(item =>
            item.id === firstPayerItem.id ? { ...item, amount: newItemAmount } : item
          ));
        } else if (items.length === 0 || paidBy) {
          const newItem: ReceiptItem = {
            id: crypto.randomUUID(),
            description: '',
            amount: newBillGoc,
            memberId: paidBy || undefined,
          };
          setItems(newItem.amount > 0 ? [newItem] : []);
        }
      }
      setTotalAmount(parsed);
    } else if (value === '' || value === '0') {
      setTotalAmount(0);
    }
  };

  const handleSplitModeChange = (mode: 'items' | 'shares') => {
    if (mode === splitMode) return;
    if (mode === 'shares' && hasItems) {
      if (!window.confirm('Switching to Shares mode will clear your items. Continue?')) return;
      setItems([]);
      setDiscount(undefined);
      setDiscountType('percentage');
      setReceiptDate(undefined);
    }
    if (mode === 'items' && Object.keys(memberShares).length > 0) {
      if (!window.confirm('Switching to Items mode will clear your shares. Continue?')) return;
      setMemberShares({});
    }
    setSplitMode(mode);
  };

  const handleReceiptProcessed = (result: ReceiptOCRResult) => {
    setSplitMode('items');
    setItems(result.extracted.items);

    if (result.extracted.discount && result.extracted.discount > 0) {
      setDiscount(result.extracted.discount);
      setDiscountType('percentage');
      const ocrBillGoc = result.extracted.items.reduce((sum, i) => sum + i.amount, 0);
      const ocrDiscountAmount = ocrBillGoc * (result.extracted.discount / 100);
      setTotalAmount(Math.max(0, roundNumber(ocrBillGoc - ocrDiscountAmount, 2)));
    } else {
      setDiscount(undefined);
      const ocrTotal = result.extracted.items.reduce((sum, i) => sum + i.amount, 0);
      setTotalAmount(ocrTotal);
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
    setTotalAmount(0);
  };

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

    if (selectedItemId) {
      handleItemsChange(items.map(item =>
        item.id === selectedItemId ? { ...item, memberId } : item
      ));
      setSelectedItemId(null);
      return;
    }

    const isIncluded = includedMemberIds.has(memberId);

    if (isIncluded) {
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

  if (!group) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) { setError('Description is required'); return; }
    if (!paidBy) { setError('Select who paid'); return; }
    if (!currentUser) { setError('Select your name first'); return; }

    if (splitMode === 'items') {
      if (totalAmount <= 0) { setError('Total amount must be greater than 0'); return; }
      if (items.length === 0) { setError('Add at least one item'); return; }
      if (discountType === 'flat' && discount && discount >= totalAmount) {
        setError('Flat discount must be less than total amount');
        return;
      }
    } else {
      if (totalAmount <= 0) { setError('Total amount must be greater than 0'); return; }
      if (Object.keys(memberShares).length === 0) { setError('Add at least one member'); return; }
    }

    setSubmitting(true);

    try {
      if (splitMode === 'items') {
        const splitBillGoc = items.reduce((sum, i) => sum + i.amount, 0);
        const splitDiscountAmount = discountType === 'flat'
          ? (discount ?? 0)
          : splitBillGoc * ((discount ?? 0) / 100);

        const memberTotals = new Map<string, number>();
        for (const item of items) {
          if (item.memberId && item.amount > 0) {
            const itemDiscount = splitBillGoc > 0
              ? roundNumber(splitDiscountAmount * item.amount / splitBillGoc, 2)
              : 0;
            const effectiveAmount = roundNumber(item.amount - itemDiscount, 2);
            const current = memberTotals.get(item.memberId) || 0;
            memberTotals.set(item.memberId, roundNumber(current + effectiveAmount, 2));
          }
        }

        if (paidBy && totalAmount > 0) {
          const currentItemsSum = Array.from(memberTotals.values()).reduce((sum, v) => sum + v, 0);
          const diff = roundNumber(totalAmount - currentItemsSum, 2);
          if (Math.abs(diff) > 0.001) {
            const payerCurrent = memberTotals.get(paidBy) || 0;
            memberTotals.set(paidBy, roundNumber(payerCurrent + diff, 2));
          }
        }

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
          items, discount,
          discountType: discount ? discountType : undefined,
          tags: tags.length > 0 ? tags : undefined, receiptDate,
        });
      } else {
        const splits = Object.entries(memberShares).map(([memberId, share]) => {
          const amount = roundNumber(totalAmount * share / totalShares, 2);
          const isAutoSignOff = memberId === paidBy || memberId === currentUser.id;
          return {
            memberId, value: share, amount,
            signedOff: isAutoSignOff,
            signedAt: isAutoSignOff ? new Date().toISOString() : undefined,
          };
        });
        await createExpense({
          description: description.trim(), amount: totalAmount, paidBy,
          createdBy: currentUser.id, splitType: 'shares', splits,
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

  return (
    <div className="pb-20">
      <h2 className="text-xl font-bold mb-6">Add Transaction</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        {/* Total */}
        <div>
          <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <span className="px-3 py-2 text-sm text-gray-500 border-r border-gray-700">Total</span>
            <input
              type="number"
              min="0"
              value={totalAmount || ''}
              onChange={(e) => {
                if (splitMode === 'shares') {
                  const parsed = parseFloat(e.target.value);
                  if (!isNaN(parsed) && parsed >= 0) {
                    setTotalAmount(parsed);
                  } else if (e.target.value === '' || e.target.value === '0') {
                    setTotalAmount(0);
                  }
                } else {
                  handleTotalChange(e.target.value);
                }
              }}
              placeholder="0"
              className="flex-1 bg-transparent px-3 py-2 text-right text-lg font-semibold text-gray-100"
            />
            <span className="px-3 py-2 text-sm text-gray-500">đ</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Số tiền thực trả</p>
        </div>

        {/* Discount - items mode only, hidden when total = 0 */}
        {splitMode === 'items' && totalAmount > 0 && (
          <div>
            <div className="flex items-center bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
              <span className="px-3 py-2 text-sm text-gray-500 border-r border-gray-700">Discount</span>
              <input
                type="number"
                min="0"
                value={
                  discount
                    ? discountType === 'flat'
                      ? discount / 1000
                      : discount
                    : ''
                }
                onChange={(e) => {
                  const raw = e.target.value ? parseFloat(e.target.value) : undefined;
                  if (discountType === 'flat') {
                    setDiscount(raw && raw > 0 ? raw * 1000 : undefined);
                  } else {
                    setDiscount(raw && raw > 0 && raw <= 100 ? raw : undefined);
                  }
                }}
                placeholder="0"
                className="flex-1 bg-transparent px-3 py-2 text-right text-lg font-semibold text-gray-100"
              />
              <select
                value={discountType}
                onChange={(e) => {
                  setDiscountType(e.target.value as DiscountType);
                  setDiscount(undefined);
                }}
                className="bg-gray-800 border-l border-gray-700 px-2 py-2 text-gray-100 text-sm"
              >
                <option value="percentage">%</option>
                <option value="flat">K</option>
              </select>
            </div>
            {discount && (
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">
                  Bill gốc: {billGoc.toLocaleString()}đ
                </span>
                <button
                  type="button"
                  onClick={() => setDiscount(undefined)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        )}

        {/* Split mode toggle */}
        <div className="flex bg-gray-800 rounded-lg p-0.5">
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

        {/* Split details */}
        {splitMode === 'items' ? (
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-300">Amounts</label>
              {includedMemberIds.size > 0 && (
                <button type="button" onClick={() => {
                  if (items.length === 0) return;
                  const rawTotal = items.reduce((sum, i) => sum + i.amount, 0);
                  const splitAmount = roundNumber(rawTotal / items.length, 2);
                  handleItemsChange(items.map(item => ({ ...item, amount: splitAmount })));
                }} className="text-sm text-cyan-400 hover:text-cyan-300">Split equally</button>
              )}
            </div>
            <ReceiptItems
              items={items}
              members={group.members}
              currency={group.currency}
              discountAmount={discountAmount}
              billGoc={billGoc}
              onChange={handleItemsChange}
              payerId={paidBy}
              selectedItemId={selectedItemId}
              onItemSelect={handleItemSelect}
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

            <div className="space-y-1">
              {Object.entries(memberShares).map(([memberId, share]) => {
                const member = group.members.find(m => m.id === memberId);
                if (!member) return null;
                const isYou = currentUser && memberId === currentUser.id;
                const percentage = totalShares > 0 ? roundNumber((share / totalShares) * 100) : 0;
                const memberAmount = totalShares > 0 ? roundNumber(totalAmount * share / totalShares, 2) : 0;

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

            {totalAmount > 0 && (
              <div className="mt-3 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-300">Total to split</span>
                  <span className="text-white">{totalAmount.toLocaleString()}đ</span>
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
          disabled={submitting || (splitMode === 'items' ? items.length === 0 : Object.keys(memberShares).length === 0 || totalAmount <= 0)}
          className="w-full bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Transaction'}
        </button>
      </form>
    </div>
  );
}
