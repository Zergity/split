// Member of the group
export interface Member {
  id: string;
  name: string;
  // Optional bank account fields
  bankId?: string;
  bankName?: string;
  bankShortName?: string;
  accountName?: string;
  accountNo?: string;
}

// Bank information
export interface Bank {
  id: string;
  name: string;
  shortName: string;
  appCode: string;
  logo: string;
}

// The single expense group
export interface Group {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  createdAt: string;
}

// Split types
export type SplitType = 'equal' | 'exact' | 'percentage' | 'shares' | 'settlement';

// Individual split within an expense
export interface ExpenseSplit {
  memberId: string;
  value: number; // meaning depends on splitType
  amount: number; // calculated actual amount
  signedOff: boolean;
  signedAt?: string;
  previousAmount?: number; // stored when amount changes and needs re-sign-off
}

// Expense with sign-off tracking
export interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string; // member id
  createdBy: string; // member id who created the expense
  splitType: SplitType;
  splits: ExpenseSplit[];
  items?: ReceiptItem[]; // stored items for editing later
  discount?: number; // discount percentage (e.g., 10 for 10% off)
  tags?: string[]; // user-defined tags
  createdAt: string;
  receiptUrl?: string;   // URL to receipt image in R2
  receiptDate?: string;  // Date extracted from receipt
}

// Receipt line item extracted from OCR
export interface ReceiptItem {
  id: string;
  description: string;
  amount: number;
  memberId?: string; // assigned member
}

// Receipt OCR result
export interface ReceiptOCRResult {
  success: boolean;
  extracted: {
    items: ReceiptItem[];
    date?: string;
    merchant?: string;
    discount?: number; // discount percentage (e.g., 10 for 10% off)
    total?: number;
    confidence: number;
  };
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Balance calculation types
export interface MemberBalance {
  memberId: string;
  memberName: string;
  signedBalance: number; // balance from signed expenses
  pendingBalance: number; // balance from pending (unsigned) expenses
  balance: number; // total balance (signed + pending)
}

export interface Settlement {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

// Auth types
export interface SessionInfo {
  memberId: string;
  memberName: string;
  expiresAt: string;
}

export interface AuthState {
  authenticated: boolean;
  session: SessionInfo | null;
  loading: boolean;
}

export interface PasskeyInfo {
  id: string;
  createdAt: string;
  lastUsedAt?: string;
  friendlyName?: string;
}

export type AuthMode = 'login' | 'register';
