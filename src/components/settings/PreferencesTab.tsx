import { useState, useEffect } from 'react';
import type { Member } from '../../types';
import { BANKS } from '../../constants/banks';
import { PasskeyList } from '../auth';

interface PreferencesTabProps {
  currentUser: Member | null;
  onSave: (updates: Partial<Member>) => Promise<void>;
}

export function PreferencesTab({ currentUser, onSave }: PreferencesTabProps) {
  const [bankId, setBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setBankId(currentUser.bankId || '');
      setAccountName(currentUser.accountName || '');
      setAccountNo(currentUser.accountNo || '');
      setError('');
    }
  }, [currentUser]);

  const handleAccountNameChange = (value: string) => {
    setAccountName(value.toUpperCase().replace(/[^A-Z\s]/g, ''));
  };

  const handleAccountNoChange = (value: string) => {
    setAccountNo(value.replace(/\D/g, ''));
  };

  const handleSave = async () => {
    setError('');
    const hasBankId = bankId.trim() !== '';
    const hasAccountName = accountName.trim() !== '';
    const hasAccountNo = accountNo.trim() !== '';
    const count = [hasBankId, hasAccountName, hasAccountNo].filter(Boolean).length;

    if (count > 0 && count < 3) {
      setError('Please fill in all bank account fields or leave them all empty');
      return;
    }

    setLoading(true);
    try {
      const updates: Partial<Member> = {};
      if (hasBankId && hasAccountName && hasAccountNo) {
        const selectedBank = BANKS.find((b) => b.id === bankId);
        if (selectedBank) {
          updates.bankId = bankId;
          updates.bankName = selectedBank.name;
          updates.bankShortName = selectedBank.shortName;
          updates.accountName = accountName.trim();
          updates.accountNo = accountNo.trim();
        }
      } else {
        updates.bankId = undefined;
        updates.bankName = undefined;
        updates.bankShortName = undefined;
        updates.accountName = undefined;
        updates.accountNo = undefined;
      }
      await onSave(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const selectedBank = BANKS.find((b) => b.id === bankId);

  return (
    <div className="p-6 space-y-6">
      {/* Bank Account */}
      <div>
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Bank Account</h3>
        <p className="text-xs text-gray-400 mb-4">Add your bank account to receive payments via VietQR</p>

        {error && (
          <div className="mb-4 bg-red-500/10 border border-red-500 text-red-400 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="pref-bank" className="block text-sm font-medium text-gray-300 mb-1.5">
              Bank
            </label>
            <div className="relative">
              <select
                id="pref-bank"
                value={bankId}
                onChange={(e) => setBankId(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                disabled={loading}
              >
                <option value="">Select a bank</option>
                {BANKS.map((bank) => (
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
            {selectedBank && (
              <div className="mt-2 flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg">
                <img src={selectedBank.logo} alt={selectedBank.name} className="w-10 h-10 object-contain" />
                <div>
                  <div className="font-medium text-white text-sm">{selectedBank.name}</div>
                  <div className="text-xs text-gray-400">{selectedBank.shortName}</div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pref-accountName" className="block text-sm font-medium text-gray-300 mb-1.5">
              Account Name
            </label>
            <input
              id="pref-accountName"
              type="text"
              value={accountName}
              onChange={(e) => handleAccountNameChange(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              placeholder="NGUYEN VAN A"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">Letters only, automatically converted to uppercase</p>
          </div>

          <div>
            <label htmlFor="pref-accountNo" className="block text-sm font-medium text-gray-300 mb-1.5">
              Account Number
            </label>
            <input
              id="pref-accountNo"
              type="text"
              value={accountNo}
              onChange={(e) => handleAccountNoChange(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1234567890"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">Numbers only</p>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium"
          >
            {loading ? 'Saving...' : saved ? '✓ Saved' : 'Save Bank Info'}
          </button>
        </div>
      </div>

      {/* Passkeys */}
      <div className="border-t border-gray-700 pt-6">
        <PasskeyList />
      </div>
    </div>
  );
}
