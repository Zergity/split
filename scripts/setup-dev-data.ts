/**
 * Development Data Setup Script
 * Run this to populate KV with sample data for testing
 *
 * Usage: npx tsx scripts/setup-dev-data.ts
 */

interface Member {
  id: string;
  name: string;
  bankId?: string;
  bankName?: string;
  bankShortName?: string;
  accountName?: string;
  accountNo?: string;
}

interface Group {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  createdAt: string;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  createdBy: string;
  splitType: 'equal' | 'exact' | 'percentage' | 'shares' | 'settlement';
  splits: Array<{
    memberId: string;
    value: number;
    amount: number;
    signedOff: boolean;
    signedAt?: string;
  }>;
  createdAt: string;
}

// Sample data
const sampleGroup: Group = {
  id: 'default',
  name: 'Dev Test Group',
  currency: 'K',
  members: [
    {
      id: 'user-1',
      name: 'Alice',
      bankId: '970436',
      bankName: 'Vietcombank',
      bankShortName: 'VCB',
      accountName: 'NGUYEN THI ALICE',
      accountNo: '1234567890'
    },
    {
      id: 'user-2',
      name: 'Bob',
      bankId: '970415',
      bankName: 'VietinBank',
      bankShortName: 'ICB',
      accountName: 'TRAN VAN BOB',
      accountNo: '9876543210'
    },
    {
      id: 'user-3',
      name: 'Charlie',
      // No bank account configured
    }
  ],
  createdAt: new Date().toISOString()
};

const sampleExpenses: Expense[] = [
  {
    id: 'exp-1',
    description: 'Lunch at restaurant',
    amount: 300000,
    paidBy: 'user-1',
    createdBy: 'user-1',
    splitType: 'equal',
    splits: [
      {
        memberId: 'user-1',
        value: 100000,
        amount: 100000,
        signedOff: true,
        signedAt: new Date().toISOString()
      },
      {
        memberId: 'user-2',
        value: 100000,
        amount: 100000,
        signedOff: true,
        signedAt: new Date().toISOString()
      },
      {
        memberId: 'user-3',
        value: 100000,
        amount: 100000,
        signedOff: false
      }
    ],
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
  },
  {
    id: 'exp-2',
    description: 'Coffee shop',
    amount: 150000,
    paidBy: 'user-2',
    createdBy: 'user-2',
    splitType: 'equal',
    splits: [
      {
        memberId: 'user-1',
        value: 50000,
        amount: 50000,
        signedOff: false
      },
      {
        memberId: 'user-2',
        value: 50000,
        amount: 50000,
        signedOff: true,
        signedAt: new Date().toISOString()
      },
      {
        memberId: 'user-3',
        value: 50000,
        amount: 50000,
        signedOff: true,
        signedAt: new Date().toISOString()
      }
    ],
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString() // 1 day ago
  },
  {
    id: 'exp-3',
    description: 'Taxi fare',
    amount: 80000,
    paidBy: 'user-3',
    createdBy: 'user-3',
    splitType: 'equal',
    splits: [
      {
        memberId: 'user-1',
        value: 40000,
        amount: 40000,
        signedOff: true,
        signedAt: new Date().toISOString()
      },
      {
        memberId: 'user-3',
        value: 40000,
        amount: 40000,
        signedOff: true,
        signedAt: new Date().toISOString()
      }
    ],
    createdAt: new Date().toISOString()
  }
];

// API call to set up data
async function setupDevData() {
  const baseUrl = 'http://localhost:8788';

  console.log('🚀 Setting up development data...\n');

  try {
    // 1. Set up group
    console.log('📦 Creating group with members...');
    const groupResponse = await fetch(`${baseUrl}/api/group`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleGroup)
    });

    if (!groupResponse.ok) {
      throw new Error(`Failed to create group: ${await groupResponse.text()}`);
    }

    console.log('✅ Group created with 3 members:');
    console.log('   - Alice (has bank account: VCB)');
    console.log('   - Bob (has bank account: ICB)');
    console.log('   - Charlie (no bank account)');

    // 2. Create expenses
    console.log('\n💰 Creating sample expenses...');
    for (const expense of sampleExpenses) {
      const expenseResponse = await fetch(`${baseUrl}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense)
      });

      if (!expenseResponse.ok) {
        console.warn(`⚠️  Failed to create expense: ${expense.description}`);
      } else {
        console.log(`✅ Created: ${expense.description} (${expense.amount.toLocaleString()}K)`);
      }
    }

    console.log('\n✨ Development data setup complete!\n');
    console.log('📊 Summary:');
    console.log('   - 3 members (2 with bank accounts)');
    console.log('   - 3 expenses with different states');
    console.log('   - Ready to test Bank Transfer feature!');
    console.log('\n🔗 Open: http://localhost:8788');
    console.log('\n💡 Tips:');
    console.log('   - Sign in as any member to test features');
    console.log('   - Check Balances page to see settlements');
    console.log('   - Click "Bank Transfer" for members with bank accounts');
    console.log('   - Edit profile to add/change bank info');

  } catch (error) {
    console.error('\n❌ Error setting up data:', error);
    console.log('\n💡 Make sure the dev server is running:');
    console.log('   npm run dev');
  }
}

// Run the setup
setupDevData();
