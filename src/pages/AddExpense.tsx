import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ReceiptCapture } from '../components/ReceiptCapture';
import { ReceiptItems } from '../components/ReceiptItems';
import { ReceiptItem, ReceiptOCRResult } from '../types';
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
  const [manualTotal, setManualTotal] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

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

  // Calculate totals from items, or use manual total if set
  const itemsTotal = items.reduce((sum, i) => sum + i.amount, 0);
  const totalAmount = manualTotal !== null ? manualTotal : itemsTotal;

  // Calculate which members are included (have at least one item assigned)
  const includedMemberIds = new Set(items.filter(i => i.memberId).map(i => i.memberId!));

  // Calculate splits from items, payer takes the rest
  const calculateSplits = () => {
    const memberTotals = new Map<string, number>();
    for (const item of items) {
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

  const handleReceiptProcessed = (result: ReceiptOCRResult) => {
    // Store items without discount applied - discount will be applied via handleDiscountChange
    setItems(result.extracted.items);

    // Set discount (will trigger recalculation if > 0)
    if (result.extracted.discount && result.extracted.discount > 0) {
      handleDiscountChange(result.extracted.discount, result.extracted.items);
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

  // Handle discount change - recalculate all item amounts
  const handleDiscountChange = (newDiscount: number | undefined, currentItems?: ReceiptItem[]) => {
    const itemsToUpdate = currentItems || items;
    const oldDiscount = discount || 0;
    const newDiscountValue = newDiscount || 0;

    if (itemsToUpdate.length === 0) {
      setDiscount(newDiscount);
      return;
    }

    // Reverse old discount and apply new discount
    const updatedItems = itemsToUpdate.map(item => {
      // Reverse old discount to get original amount
      const originalAmount = oldDiscount > 0
        ? item.amount / (1 - oldDiscount / 100)
        : item.amount;

      // Apply new discount
      const newAmount = newDiscountValue > 0
        ? originalAmount * (1 - newDiscountValue / 100)
        : originalAmount;

      return {
        ...item,
        amount: roundNumber(newAmount, 2),
      };
    });

    setItems(updatedItems);
    setDiscount(newDiscount && newDiscount > 0 ? newDiscount : undefined);
  };

  const handleReceiptError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleClearReceipt = () => {
    setItems([]);
    setDiscount(undefined);
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

  // Handle member tap - assign to selected item, or toggle inclusion
  const handleMemberTap = (memberId: string) => {
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

    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    if (totalAmount <= 0) {
      setError('Total amount must be greater than 0');
      return;
    }

    if (!paidBy) {
      setError('Select who paid');
      return;
    }

    if (!currentUser) {
      setError('Select your name first');
      return;
    }

    if (items.length === 0) {
      setError('Add at least one item');
      return;
    }

    setSubmitting(true);

    try {
      // Build splits from item assignments
      // Auto sign-off for payer and creator
      const memberTotals = calculateSplits();
      const splits = Array.from(memberTotals.entries()).map(([memberId, amount]) => ({
        memberId,
        value: amount,
        amount: amount,
        signedOff: memberId === paidBy || memberId === currentUser.id,
        signedAt: (memberId === paidBy || memberId === currentUser.id) ? new Date().toISOString() : undefined,
      }));

      await createExpense({
        description: description.trim(),
        amount: totalAmount,
        paidBy,
        createdBy: currentUser.id,
        splitType: 'exact',
        splits,
        items, // Store items for later editing
        discount, // Store discount percentage
        tags: tags.length > 0 ? tags : undefined,
        receiptDate,
      });

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
        {/* Receipt capture - always show */}
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
            Drag to items or "+ Add item" below
          </p>
        </div>

        {/* Discount - show when items exist */}
        {hasItems && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Discount %
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={discount || ''}
                onChange={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : undefined;
                  handleDiscountChange(value && value > 0 && value <= 100 ? value : undefined);
                }}
                placeholder="0"
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
              />
              <span className="text-gray-400 text-sm">
                {discount ? `${discount}% off all items` : 'No discount'}
              </span>
              {discount && (
                <button
                  type="button"
                  onClick={() => handleDiscountChange(undefined)}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}

        {/* Amounts section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-300">
              Amounts
            </label>
            {includedMemberIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  // Split total equally among all existing items
                  if (items.length === 0) return;
                  const splitAmount = roundNumber(totalAmount / items.length, 2);
                  const newItems = items.map(item => ({
                    ...item,
                    amount: splitAmount,
                  }));
                  handleItemsChange(newItems);
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300"
              >
                Split equally
              </button>
            )}
          </div>
          <ReceiptItems
            items={items}
            members={group.members}
            currency={group.currency}
            totalAmount={totalAmount}
            onTotalChange={handleTotalChange}
            onChange={handleItemsChange}
            payerId={paidBy}
            selectedItemId={selectedItemId}
            onItemSelect={handleItemSelect}
          />
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || items.length === 0}
          className="w-full bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add Transaction'}
        </button>
      </form>
    </div>
  );
}
