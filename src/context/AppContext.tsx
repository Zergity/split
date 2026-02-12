import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { Group, Expense, Member } from '../types';
import * as api from '../api/client';

interface AppContextType {
  group: Group | null;
  expenses: Expense[];
  currentUser: Member | null;
  loading: boolean;
  error: string | null;
  setCurrentUser: (user: Member | null) => void;
  refreshData: () => Promise<void>;
  addMember: (name: string) => Promise<Member | null>;
  removeMember: (id: string) => Promise<void>;
  updateGroupSettings: (name: string, currency: string) => Promise<void>;
  updateProfile: (updates: Partial<Member>) => Promise<void>;
  createExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<void>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (expense: Expense) => Promise<void>;
  signOffExpense: (expense: Expense) => Promise<void>;
  claimExpenseItem: (expenseId: string, itemId: string, claim: boolean) => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currentUser, setCurrentUserState] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setCurrentUser = useCallback((user: Member | null) => {
    setCurrentUserState(user);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      const [groupData, expensesData] = await Promise.all([
        api.getGroup(),
        api.getExpenses(),
      ]);
      setGroup(groupData);
      setExpenses(expensesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  const addMember = useCallback(
    async (name: string): Promise<Member | null> => {
      if (!group) return null;
      const trimmedName = name.trim();
      const newMember: Member = {
        id: crypto.randomUUID(),
        name: trimmedName,
      };
      // Backend will deduplicate - if name exists, duplicates are removed
      // and only the first occurrence is kept
      const updated = await api.updateGroup({
        members: [...group.members, newMember],
      });
      setGroup(updated);

      // Find the member in the updated group (may be the existing one if deduplicated)
      const addedMember = updated.members.find(
        (m) => m.name.toLowerCase() === trimmedName.toLowerCase()
      );
      return addedMember || null;
    },
    [group]
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (!group) return;
      const updated = await api.updateGroup({
        members: group.members.filter((m) => m.id !== id),
      });
      setGroup(updated);
    },
    [group]
  );

  const updateGroupSettings = useCallback(
    async (name: string, currency: string) => {
      const updated = await api.updateGroup({ name, currency });
      setGroup(updated);
    },
    []
  );

  const updateProfile = useCallback(
    async (updates: Partial<Member>) => {
      const updated = await api.updateProfile(updates);
      // Update group members list
      if (group) {
        const updatedMembers = group.members.map((m) =>
          m.id === updated.id ? updated : m
        );
        setGroup({ ...group, members: updatedMembers });
      }
      // Update current user
      if (currentUser && currentUser.id === updated.id) {
        setCurrentUser(updated);
      }
    },
    [group, currentUser, setCurrentUser]
  );

  const createExpense = useCallback(
    async (expense: Omit<Expense, 'id' | 'createdAt'>) => {
      const created = await api.createExpense(expense);
      setExpenses((prev) => [...prev, created]);
    },
    []
  );

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Expense>) => {
      const updated = await api.updateExpense(id, updates);
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    },
    []
  );

  const deleteExpense = useCallback(async (expense: Expense) => {
    const updated = await api.softDeleteExpense(expense);
    setExpenses((prev) =>
      prev.map((e) => (e.id === expense.id ? updated : e))
    );
  }, []);

  const signOffExpense = useCallback(
    async (expense: Expense) => {
      if (!currentUser) return;
      const updated = await api.signOffExpense(expense, currentUser.id);
      setExpenses((prev) =>
        prev.map((e) => (e.id === expense.id ? updated : e))
      );
    },
    [currentUser]
  );

  const claimExpenseItem = useCallback(
    async (expenseId: string, itemId: string, claim: boolean) => {
      if (!currentUser) return;
      const expense = expenses.find((e) => e.id === expenseId);
      if (!expense) return;
      const updated = await api.claimExpenseItem(expense, itemId, currentUser.id, claim);
      setExpenses((prev) =>
        prev.map((e) => (e.id === expenseId ? updated : e))
      );
    },
    [currentUser, expenses]
  );

  // Initial load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Update current user if member list changes (e.g., member removed)
  useEffect(() => {
    if (currentUser && group) {
      const memberExists = group.members.some((m) => m.id === currentUser.id);
      if (!memberExists) {
        setCurrentUser(null);
      }
    }
  }, [group, currentUser, setCurrentUser]);

  return (
    <AppContext.Provider
      value={{
        group,
        expenses,
        currentUser,
        loading,
        error,
        setCurrentUser,
        refreshData,
        addMember,
        removeMember,
        updateGroupSettings,
        updateProfile,
        createExpense,
        updateExpense,
        deleteExpense,
        signOffExpense,
        claimExpenseItem,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
