import { useState, useEffect } from 'react';
import type { Member } from '../types';
import { BANKS } from '../constants/banks';

interface ProfileModalProps {
  isOpen: boolean;
  currentUser: Member | null;
  onClose: () => void;
  onSave: (updates: Partial<Member>) => Promise<void>;
}

export function ProfileModal({ isOpen, currentUser, onClose, onSave }: ProfileModalProps) {
  const [name, setName] = useState('');
  const [bankId, setBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Load current user data when modal opens
  useEffect(() => {
    if (isOpen && currentUser) {
      setName(currentUser.name);
      setBankId(currentUser.bankId || '');
      setAccountName(currentUser.accountName || '');
      setAccountNo(currentUser.accountNo || '');
      setError('');
    }
  }, [isOpen, currentUser]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleAccountNameChange = (value: string) => {
    // Auto-uppercase and remove non-letters
    const cleaned = value.toUpperCase().replace(/[^A-Z\s]/g, '');
    setAccountName(cleaned);
  };

  const handleAccountNoChange = (value: string) => {
    // Only allow digits
    const cleaned = value.replace(/\D/g, '');
    setAccountNo(cleaned);
  };

  const handleSave = async () => {
    setError('');

    // Validate name
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    // Validate bank fields: either all filled or all empty
    const hasBankId = bankId.trim() !== '';
    const hasAccountName = accountName.trim() !== '';
    const hasAccountNo = accountNo.trim() !== '';
    const bankFieldsCount = [hasBankId, hasAccountName, hasAccountNo].filter(Boolean).length;

    if (bankFieldsCount > 0 && bankFieldsCount < 3) {
      setError('Please fill in all bank account fields or leave them all empty');
      return;
    }

    setLoading(true);

    try {
      const updates: Partial<Member> = {
        name: name.trim(),
      };

      if (hasBankId && hasAccountName && hasAccountNo) {
        const selectedBank = BANKS.find(b => b.id === bankId);
        if (selectedBank) {
          updates.bankId = bankId;
          updates.bankName = selectedBank.name;
          updates.bankShortName = selectedBank.shortName;
          updates.accountName = accountName.trim();
          updates.accountNo = accountNo.trim();
        }
      } else {
        // Clear bank info if not all fields provided
        updates.bankId = undefined;
        updates.bankName = undefined;
        updates.bankShortName = undefined;
        updates.accountName = undefined;
        updates.accountNo = undefined;
      }

      await onSave(updates);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const selectedBank = BANKS.find(b => b.id === bankId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto border border-gray-700"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Name field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Your name"
              disabled={loading}
            />
          </div>

          {/* Bank Account Section */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Bank Account (Optional)</h3>
            <p className="text-sm text-gray-400 mb-4">
              Add your bank account to receive payments via VietQR
            </p>

            {/* Bank selection */}
            <div className="mb-4">
              <label htmlFor="bank" className="block text-sm font-medium text-gray-300 mb-2">
                Bank
              </label>
              <div className="relative">
                <select
                  id="bank"
                  value={bankId}
                  onChange={(e) => setBankId(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  disabled={loading}
                >
                  <option value="">Select a bank</option>
                  {BANKS.map(bank => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name} ({bank.shortName})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              {/* Bank logo preview */}
              {selectedBank && (
                <div className="mt-3 flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
                  <img
                    src={selectedBank.logo}
                    alt={selectedBank.name}
                    className="w-12 h-12 object-contain"
                  />
                  <div>
                    <div className="font-medium text-white">{selectedBank.name}</div>
                    <div className="text-sm text-gray-400">{selectedBank.shortName}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Account name */}
            <div className="mb-4">
              <label htmlFor="accountName" className="block text-sm font-medium text-gray-300 mb-2">
                Account Name
              </label>
              <input
                id="accountName"
                type="text"
                value={accountName}
                onChange={(e) => handleAccountNameChange(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                placeholder="NGUYEN VAN A"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-400">
                Letters only, automatically converted to uppercase
              </p>
            </div>

            {/* Account number */}
            <div>
              <label htmlFor="accountNo" className="block text-sm font-medium text-gray-300 mb-2">
                Account Number
              </label>
              <input
                id="accountNo"
                type="text"
                value={accountNo}
                onChange={(e) => handleAccountNoChange(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="1234567890"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-400">
                Numbers only
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
