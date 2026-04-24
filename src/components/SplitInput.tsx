import { useState } from 'react';
import { Member, SplitType } from '../types';
import { formatCurrency, roundNumber, sanitizeDecimalInput } from '../utils/balances';
import { useApp } from '../context/AppContext';

interface SplitValue {
  memberId: string;
  value: number;
  selected: boolean;
}

interface SplitInputProps {
  members: Member[];
  splitType: SplitType;
  splits: SplitValue[];
  totalAmount: number;
  currency: string;
  paidBy: string;
  onChange: (splits: SplitValue[]) => void;
  onAmountChange?: (amount: string) => void;
  amountValue?: string;
  showAmounts?: boolean;
}

export function SplitInput({
  members,
  splitType,
  splits,
  totalAmount,
  currency,
  paidBy,
  onChange,
  onAmountChange,
  amountValue = '',
  showAmounts = false,
}: SplitInputProps) {
  const { currentUser } = useApp();
  // Track which input is being edited and its text value
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const selectedSplits = splits.filter((s) => s.selected);
  const allSelected = selectedSplits.length === members.length;
  const noneSelected = selectedSplits.length === 0;

  const getCalculatedAmount = (split: SplitValue): number => {
    if (!split.selected) return 0;

    switch (splitType) {
      case 'exact':
        return split.value;
      case 'percentage':
        return (totalAmount * split.value) / 100;
      case 'shares': {
        const totalShares = selectedSplits.reduce((sum, s) => sum + s.value, 0);
        return totalShares > 0 ? (totalAmount * split.value) / totalShares : 0;
      }
      default:
        return split.value;
    }
  };

  const toggleMember = (memberId: string) => {
    onChange(
      splits.map((s) =>
        s.memberId === memberId
          ? { ...s, selected: !s.selected, value: s.value || 1 }
          : s
      )
    );
  };

  const selectAll = () => {
    onChange(
      splits.map((s) => ({ ...s, selected: true, value: s.value || 1 }))
    );
  };

  const deselectAll = () => {
    onChange(
      splits.map((s) => ({ ...s, selected: false }))
    );
  };

  // Find the remainder recipient: payer if selected, otherwise first selected
  const getRemainderRecipient = (): string | null => {
    const selected = splits.filter((s) => s.selected);
    if (selected.length === 0) return null;
    const payerSelected = selected.find((s) => s.memberId === paidBy);
    return payerSelected ? paidBy : selected[0].memberId;
  };

  const updateValue = (memberId: string, inputValue: string) => {
    // Accept both . and , as decimal separator
    const normalized = inputValue.replace(',', '.');
    const value = parseFloat(normalized) || 0;

    const remainderRecipient = getRemainderRecipient();

    // Calculate total for exact and percentage modes
    const getTargetTotal = () => {
      switch (splitType) {
        case 'exact':
          return totalAmount;
        case 'percentage':
          return 100;
        default:
          return 0; // shares don't need remainder calculation
      }
    };

    const targetTotal = getTargetTotal();

    if (targetTotal > 0 && remainderRecipient && memberId !== remainderRecipient) {
      // Calculate sum of all other participants except the remainder recipient
      const othersSum = splits
        .filter((s) => s.selected && s.memberId !== remainderRecipient && s.memberId !== memberId)
        .reduce((sum, s) => sum + s.value, 0);

      const remainder = Math.max(0, roundNumber(targetTotal - othersSum - value, 1));

      onChange(
        splits.map((s) => {
          if (s.memberId === memberId) {
            return { ...s, value: Math.max(0, value) };
          }
          if (s.memberId === remainderRecipient) {
            return { ...s, value: remainder };
          }
          return s;
        })
      );
    } else {
      onChange(
        splits.map((s) =>
          s.memberId === memberId ? { ...s, value: Math.max(0, value) } : s
        )
      );
    }
  };

  const formatInputValue = (value: number): string => {
    if (!value) return '';
    return roundNumber(value, 1).toString();
  };

  const handleFocus = (id: string, value: number) => {
    setEditingId(id);
    setEditingValue(value ? roundNumber(value, 1).toString() : '');
  };

  const handleBlur = (memberId: string) => {
    if (editingId === memberId) {
      updateValue(memberId, editingValue);
      setEditingId(null);
      setEditingValue('');
    }
  };

  const handleInputChange = (_memberId: string, value: string) => {
    // Allow digits, dots, and commas while editing
    const sanitized = value.replace(/[^0-9.,]/g, '');
    setEditingValue(sanitized);
  };

  return (
    <div className="space-y-4">
      {/* Compact chip selection - only show if NOT showing amounts */}
      {!showAmounts && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-500">
              {selectedSplits.length} of {members.length} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={allSelected}
                className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-gray-400"
              >
                All
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={deselectAll}
                disabled={noneSelected}
                className="text-xs text-cyan-400 hover:text-cyan-300 disabled:text-gray-400"
              >
                None
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((member) => {
              const split = splits.find((s) => s.memberId === member.id);
              if (!split) return null;

              const isYou = currentUser && member.id === currentUser.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => toggleMember(member.id)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                    split.selected
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {isYou ? <span className="text-yellow-400">[{member.name}]</span> : member.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Amounts section - only show if showAmounts is true */}
      {showAmounts && selectedSplits.length > 0 && (
        <div className="space-y-2">

          {/* Total amount input */}
          {onAmountChange && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-900/30 border border-cyan-600">
              <span className="flex-1 text-sm font-semibold text-cyan-100">
                Total
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="text" inputMode="decimal"
                  value={amountValue}
                  onChange={(e) => onAmountChange(sanitizeDecimalInput(e.target.value))}
                  placeholder="0"
                  className="w-20 bg-gray-700 border border-cyan-600 rounded px-2 py-1 text-right text-sm font-semibold text-gray-100"
                />
                <span className="text-xs text-cyan-300 w-4">
                  {currency}
                </span>
              </div>
            </div>
          )}

          {/* Individual split amounts */}
          {selectedSplits.map((split) => {
            const member = members.find((m) => m.id === split.memberId);
            if (!member) return null;

            const isEditing = editingId === member.id;
            const displayValue = isEditing ? editingValue : formatInputValue(split.value);
            const isPayer = member.id === paidBy;
            const isYou = currentUser && member.id === currentUser.id;

            return (
              <div
                key={member.id}
                className={`flex items-center gap-2 p-2 rounded-lg ${
                  isPayer ? 'bg-cyan-900/30 border border-cyan-700' : 'bg-gray-800'
                }`}
              >
                <span className="flex-1 text-sm font-medium truncate">
                  {isYou ? <span className="text-yellow-400">[{member.name}]</span> : member.name}
                  {isPayer && <span className="text-cyan-400 ml-1">(payer)</span>}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={displayValue}
                    onChange={(e) => handleInputChange(member.id, sanitizeDecimalInput(e.target.value))}
                    onFocus={() => handleFocus(member.id, split.value)}
                    onBlur={() => handleBlur(member.id)}
                    placeholder="0"
                    className="w-16 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-right text-sm text-gray-100"
                  />
                  <span className="text-xs text-gray-400 w-4">
                    {splitType === 'exact' ? currency : splitType === 'percentage' ? '%' : ''}
                  </span>
                </div>
                {splitType !== 'exact' && (
                  <span className="text-xs text-gray-400 w-14 text-right">
                    {formatCurrency(getCalculatedAmount(split), currency)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
