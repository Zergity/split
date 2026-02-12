import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, roundNumber } from '../utils/balances';
import { PaymentModal } from '../components/PaymentModal';

export function AddSettlement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { group, currentUser, createExpense } = useApp();

  const [fromMemberId, setFromMemberId] = useState(searchParams.get('from') || '');
  const [toMemberId, setToMemberId] = useState(searchParams.get('to') || '');
  const [amount, setAmount] = useState(searchParams.get('amount') || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Set default from member to current user if not specified
  useEffect(() => {
    if (!fromMemberId && currentUser) {
      setFromMemberId(currentUser.id);
    }
  }, [currentUser, fromMemberId]);

  if (!group) return null;

  const fromMember = group.members.find((m) => m.id === fromMemberId);
  const toMember = group.members.find((m) => m.id === toMemberId);
  const parsedAmount = parseFloat(amount) || 0;

  const hasBankAccountInfo = (memberId: string): boolean => {
    const member = group.members.find(m => m.id === memberId);
    return !!(member?.bankId && member?.accountNo && member?.accountName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromMemberId) {
      setError('Select who is paying');
      return;
    }

    if (!toMemberId) {
      setError('Select who is receiving');
      return;
    }

    if (fromMemberId === toMemberId) {
      setError('Payer and recipient must be different');
      return;
    }

    if (parsedAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    if (!currentUser) {
      setError('Select your name first');
      return;
    }

    setSubmitting(true);

    try {
      const roundedAmount = roundNumber(parsedAmount, 2);

      // Create settlement as a special expense
      // The payer (from) pays the recipient (to)
      // Recipient needs to sign off to confirm receipt
      await createExpense({
        description: `Settlement: ${fromMember?.name} → ${toMember?.name}`,
        amount: roundedAmount,
        paidBy: fromMemberId,
        createdBy: currentUser.id,
        splitType: 'settlement',
        splits: [
          {
            memberId: toMemberId,
            value: roundedAmount,
            amount: roundedAmount,
            // Auto sign-off for payer and creator
            signedOff: toMemberId === fromMemberId || toMemberId === currentUser.id,
            signedAt: (toMemberId === fromMemberId || toMemberId === currentUser.id)
              ? new Date().toISOString()
              : undefined,
          },
        ],
      });

      navigate('/balances');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create settlement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmountChange = (value: string) => {
    // Allow numbers with optional decimal
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value);
    }
  };

  return (
    <div className="pb-20">
      <h2 className="text-xl font-bold mb-6">Record Settlement</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Who is paying?
          </label>
          <select
            value={fromMemberId}
            onChange={(e) => setFromMemberId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
          >
            <option value="">Select payer</option>
            {group.members.map((member) => (
              <option key={member.id} value={member.id}>
                {currentUser && member.id === currentUser.id ? `[${member.name}]` : member.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Who is receiving?
          </label>
          <select
            value={toMemberId}
            onChange={(e) => setToMemberId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100"
          >
            <option value="">Select recipient</option>
            {group.members
              .filter((m) => m.id !== fromMemberId)
              .map((member) => (
                <option key={member.id} value={member.id}>
                  {currentUser && member.id === currentUser.id ? `[${member.name}]` : member.name}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Amount ({group.currency})
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            placeholder="0"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-xl"
          />
          {parsedAmount > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {formatCurrency(parsedAmount, group.currency)}
            </p>
          )}
        </div>

        {fromMember && toMember && parsedAmount > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <p className="text-sm text-gray-400 mb-2">Summary</p>
            <p className="text-lg">
              <span className={currentUser && fromMember.id === currentUser.id ? 'text-yellow-400' : ''}>
                {currentUser && fromMember.id === currentUser.id ? `[${fromMember.name}]` : fromMember.name}
              </span>
              <span className="text-gray-500 mx-2">pays</span>
              <span className={currentUser && toMember.id === currentUser.id ? 'text-yellow-400' : ''}>
                {currentUser && toMember.id === currentUser.id ? `[${toMember.name}]` : toMember.name}
              </span>
              <span className="font-semibold ml-2">
                {formatCurrency(parsedAmount, group.currency)}
              </span>
            </p>
            {currentUser && toMember.id !== currentUser.id && toMember.id !== fromMemberId && (
              <p className="text-xs text-yellow-400 mt-2">
                {toMember.name} will need to accept to confirm receipt
              </p>
            )}

            {/* Bank Transfer Button */}
            {hasBankAccountInfo(toMemberId) && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="mt-4 w-full bg-gray-700 text-white py-2 rounded-lg font-medium hover:bg-gray-600"
              >
                Pay via Bank Transfer (VietQR)
              </button>
            )}
            {!hasBankAccountInfo(toMemberId) && (
              <p className="text-xs text-gray-500 mt-3">
                {toMember.name} hasn't set up bank account for VietQR transfers
              </p>
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
          disabled={submitting || !fromMemberId || !toMemberId || parsedAmount <= 0}
          className="w-full bg-cyan-600 text-white py-3 rounded-lg font-medium hover:bg-cyan-700 disabled:opacity-50"
        >
          {submitting ? 'Recording...' : 'Record Settlement'}
        </button>
      </form>

      {/* Payment Modal */}
      {showPaymentModal && fromMember && toMember && parsedAmount > 0 && (
        <PaymentModal
          isOpen={showPaymentModal}
          recipient={toMember}
          payer={fromMember}
          amount={parsedAmount}
          currency={group.currency}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  );
}
