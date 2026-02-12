#!/bin/bash

# Development Data Setup Script
# Populates KV with sample data for testing

BASE_URL="http://localhost:8788"

# Cross-platform date function for relative dates
# Usage: relative_date <days_ago>
relative_date() {
  local days_ago=$1
  if date -v -1d > /dev/null 2>&1; then
    # macOS
    date -u -v-${days_ago}d +"%Y-%m-%dT%H:%M:%S.000Z"
  else
    # Linux (GNU date)
    date -u -d "${days_ago} days ago" +"%Y-%m-%dT%H:%M:%S.000Z"
  fi
}

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
TWO_DAYS_AGO=$(relative_date 2)
ONE_DAY_AGO=$(relative_date 1)

echo "🚀 Setting up development data..."
echo ""

# Check if server is running
if ! curl -s "$BASE_URL" > /dev/null 2>&1; then
    echo "❌ Error: Dev server is not running!"
    echo ""
    echo "Please start the server first:"
    echo "  npm run dev"
    echo ""
    exit 1
fi

# 1. Create group with members
echo "📦 Creating group with members..."

GROUP_DATA='{
  "id": "default",
  "name": "Dev Test Group",
  "currency": "K",
  "members": [
    {
      "id": "user-1",
      "name": "Alice",
      "bankId": "970436",
      "bankName": "Vietcombank",
      "bankShortName": "VCB",
      "accountName": "NGUYEN THI ALICE",
      "accountNo": "1234567890"
    },
    {
      "id": "user-2",
      "name": "Bob",
      "bankId": "970415",
      "bankName": "VietinBank",
      "bankShortName": "ICB",
      "accountName": "TRAN VAN BOB",
      "accountNo": "9876543210"
    },
    {
      "id": "user-3",
      "name": "Charlie"
    }
  ],
  "createdAt": "'"$NOW"'"
}'

curl -s -X PUT "$BASE_URL/api/group" \
  -H "Content-Type: application/json" \
  -d "$GROUP_DATA" > /dev/null

echo "✅ Group created with 3 members:"
echo "   - Alice (has bank account: VCB)"
echo "   - Bob (has bank account: ICB)"
echo "   - Charlie (no bank account)"
echo ""

# 2. Create sample expenses
echo "💰 Creating sample expenses..."

# Expense 1: Lunch
EXPENSE1='{
  "id": "exp-1",
  "description": "Lunch at restaurant",
  "amount": 300000,
  "paidBy": "user-1",
  "createdBy": "user-1",
  "splitType": "equal",
  "splits": [
    {
      "memberId": "user-1",
      "value": 100000,
      "amount": 100000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    },
    {
      "memberId": "user-2",
      "value": 100000,
      "amount": 100000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    },
    {
      "memberId": "user-3",
      "value": 100000,
      "amount": 100000,
      "signedOff": false
    }
  ],
  "createdAt": "'"$TWO_DAYS_AGO"'"
}'

curl -s -X POST "$BASE_URL/api/expenses" \
  -H "Content-Type: application/json" \
  -d "$EXPENSE1" > /dev/null

echo "✅ Created: Lunch at restaurant (300,000K)"

# Expense 2: Coffee
EXPENSE2='{
  "id": "exp-2",
  "description": "Coffee shop",
  "amount": 150000,
  "paidBy": "user-2",
  "createdBy": "user-2",
  "splitType": "equal",
  "splits": [
    {
      "memberId": "user-1",
      "value": 50000,
      "amount": 50000,
      "signedOff": false
    },
    {
      "memberId": "user-2",
      "value": 50000,
      "amount": 50000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    },
    {
      "memberId": "user-3",
      "value": 50000,
      "amount": 50000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    }
  ],
  "createdAt": "'"$ONE_DAY_AGO"'"
}'

curl -s -X POST "$BASE_URL/api/expenses" \
  -H "Content-Type: application/json" \
  -d "$EXPENSE2" > /dev/null

echo "✅ Created: Coffee shop (150,000K)"

# Expense 3: Taxi
EXPENSE3='{
  "id": "exp-3",
  "description": "Taxi fare",
  "amount": 80000,
  "paidBy": "user-3",
  "createdBy": "user-3",
  "splitType": "equal",
  "splits": [
    {
      "memberId": "user-1",
      "value": 40000,
      "amount": 40000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    },
    {
      "memberId": "user-3",
      "value": 40000,
      "amount": 40000,
      "signedOff": true,
      "signedAt": "'"$NOW"'"
    }
  ],
  "createdAt": "'"$NOW"'"
}'

curl -s -X POST "$BASE_URL/api/expenses" \
  -H "Content-Type: application/json" \
  -d "$EXPENSE3" > /dev/null

echo "✅ Created: Taxi fare (80,000K)"

echo ""
echo "✨ Development data setup complete!"
echo ""
echo "📊 Summary:"
echo "   - 3 members (2 with bank accounts configured)"
echo "   - 3 expenses with different states"
echo "   - Ready to test Bank Transfer feature!"
echo ""
echo "🔗 Open: $BASE_URL"
echo ""
echo "💡 Tips:"
echo "   - Sign in as Alice, Bob, or Charlie"
echo "   - Go to Balances page to see settlements"
echo "   - Click 'Bank Transfer' for Alice or Bob (have bank accounts)"
echo "   - 'Bank Transfer' will be disabled for Charlie (no bank account)"
echo "   - Edit profile to add/change bank info"
echo ""
