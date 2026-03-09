import { Link } from 'react-router-dom';
import { MemberBalance, Settlement } from '../types';
import { formatCurrency } from '../utils/balances';

interface BalanceCardProps {
  balance: MemberBalance;
  currency: string;
  isCurrentUser?: boolean;
  suggestedSettlement?: Settlement;
}

export function BalanceCard({
  balance,
  currency,
  isCurrentUser = false,
  suggestedSettlement,
}: BalanceCardProps) {
  const signedPositive = balance.signedBalance > 0.01;
  const signedNegative = balance.signedBalance < -0.01;
  const signedSettled = !signedPositive && !signedNegative;

  const hasPendingBalance = Math.abs(balance.pendingBalance) > 0.01;

  return (
    <div
      className={`p-4 rounded-lg border ${
        isCurrentUser ? 'border-yellow-500 bg-yellow-900/20' : 'border-gray-700 bg-gray-800'
      }`}
    >
      <div className="flex justify-between items-center">
        <span className="font-medium flex items-center gap-1.5">
          {balance.memberName}
          {isCurrentUser && (
            <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded px-1 py-0.5 flex-shrink-0">you</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            <span
              className={
                signedPositive
                  ? 'text-green-400'
                  : signedNegative
                  ? 'text-red-400'
                  : 'text-gray-400'
              }
            >
              {signedPositive && '+'}
              {formatCurrency(balance.signedBalance, currency)}
            </span>
            {hasPendingBalance && (
              <span className={`ml-1 opacity-50 ${balance.pendingBalance > 0 ? 'text-green-500' : 'text-red-400'}`}>
                ({balance.pendingBalance > 0 ? '+' : ''}{formatCurrency(balance.pendingBalance, currency)})
              </span>
            )}
          </span>
          {signedNegative && !hasPendingBalance && (
            <Link
              to={suggestedSettlement
                ? `/settle?from=${balance.memberId}&to=${suggestedSettlement.to}&amount=${suggestedSettlement.amount}`
                : `/settle?from=${balance.memberId}`
              }
              className="text-sm bg-cyan-600 text-white px-3 py-1 rounded hover:bg-cyan-700"
            >
              Settle
            </Link>
          )}
          {hasPendingBalance && (
            <Link
              to="/pending"
              className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
            >
              Pending
            </Link>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {signedPositive && 'is owed money'}
        {signedNegative && 'owes money'}
        {signedSettled && 'is settled up'}
      </p>
    </div>
  );
}
