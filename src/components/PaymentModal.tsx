import { useState, useEffect, useCallback } from 'react';
import { Member } from '../types';
import { BANKS } from '../constants/banks';

interface PaymentModalProps {
  isOpen: boolean;
  recipient: Member;
  payer: Member;
  amount: number;
  currency: string;
  onClose: () => void;
}

export function PaymentModal({
  isOpen,
  recipient,
  payer,
  amount,
  currency,
  onClose,
}: PaymentModalProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generateQrUrl = useCallback(() => {
    const description = `Settlement: ${payer.name} → ${recipient.name}`;
    // Convert K to VND (1K = 1000 VND) for bank API
    const amountInVND = Math.round(amount * 1000);
    return `https://img.vietqr.io/image/${recipient.bankId}-${recipient.accountNo}-compact2.jpg?amount=${amountInVND}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(recipient.accountName!)}`;
  }, [recipient.bankId, recipient.accountNo, recipient.accountName, payer.name, recipient.name, amount]);

  // Generate QR URL when modal opens, reset when it closes
  useEffect(() => {
    if (isOpen && recipient.bankId && recipient.accountNo && recipient.accountName) {
      setLoading(true);
      setError(null);
      setQrUrl(generateQrUrl());
    } else {
      // Cleanup when modal closes
      setQrUrl(null);
      setError(null);
      setLoading(true);
    }
  }, [isOpen, recipient.bankId, recipient.accountNo, recipient.accountName, generateQrUrl]);

  const handleImageLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleImageError = () => {
    setLoading(false);
    setError('Unable to generate QR code. Please try again or use the banking app buttons below.');
  };

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    // Force re-render by updating URL with timestamp
    setQrUrl(`${generateQrUrl()}&t=${Date.now()}`);
  };

  const handleBankAppClick = (bankAppCode: string) => {
    if (!recipient.accountNo || !recipient.bankShortName || !recipient.accountName) {
      return;
    }

    const description = `Settlement: ${payer.name} → ${recipient.name}`;
    const bankAccount = `${recipient.accountNo}@${recipient.bankShortName.toLowerCase()}`;
    // Convert K to VND (1K = 1000 VND) for bank API
    const amountInVND = Math.round(amount * 1000);
    const deeplink = `https://dl.vietqr.io/pay?app=${bankAppCode}&ba=${bankAccount}&am=${amountInVND}&tn=${encodeURIComponent(description)}&bn=${encodeURIComponent(recipient.accountName)}`;

    window.location.href = deeplink;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-100">
              Pay {recipient.name}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200"
            >
              ✕
            </button>
          </div>


          {/* Payment Details */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-400">Amount</span>
              <span className="text-lg font-semibold text-gray-100">
                {amount.toLocaleString()} {currency}
              </span>
            </div>
            <div className="text-xs text-gray-400">
              Settlement: {payer.name} → {recipient.name}
            </div>
          </div>

          {/* QR Code Section */}
          {error && (
            <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4">
              <p className="text-sm text-red-300">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-2 text-sm text-cyan-400 hover:text-cyan-300"
              >
                Try again
              </button>
            </div>
          )}

          {qrUrl && (
            <div className="flex justify-center bg-white p-4 rounded mb-6">
              <img
                src={qrUrl}
                alt="Payment QR Code"
                className={`max-w-full h-auto ${loading ? 'hidden' : ''}`}
                onLoad={handleImageLoad}
                onError={handleImageError}
              />
              {loading && !error && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-600 border-t-cyan-600"></div>
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-500">or</span>
            </div>
          </div>

          {/* Bank App Buttons */}
          <div className="mb-6">
            <div className="text-sm font-medium text-gray-300 mb-3">
              Open banking app
            </div>
            <div className="grid grid-cols-3 gap-3">
              {BANKS.map((bank) => (
                <button
                  key={bank.id}
                  onClick={() => handleBankAppClick(bank.appCode)}
                  className="flex flex-col items-center justify-center p-3 border-2 border-gray-700 rounded-lg hover:border-cyan-600 hover:bg-gray-700/50 transition"
                >
                  <img
                    src={bank.logo}
                    alt={bank.name}
                    className="h-12 w-12 object-contain mb-1"
                  />
                  <div className="text-xs font-medium text-gray-400">{bank.shortName}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
            <p className="text-xs text-yellow-200">
              After completing the transfer, close this modal and click "Settle" to record the payment in the app.
            </p>
          </div>

          {/* Close Button */}
          <div className="mt-6">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
