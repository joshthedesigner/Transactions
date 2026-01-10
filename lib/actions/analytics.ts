'use server';

import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

export type MonthlySpendByCategory = {
  month: string;
  category: string;
  amount: number;
};

export type TotalSpendOverTime = {
  month: string;
  total: number;
};

export type CategoryTrend = {
  month: string;
  amount: number;
};

/**
 * Get monthly spend by category (for stacked bar chart)
 * Uses transactions_v2 as the single source of truth
 */
export async function getMonthlySpendByCategory(
  startDate?: string,
  endDate?: string,
  categoryName?: string
): Promise<MonthlySpendByCategory[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select(`
      transaction_date,
      amount_spending,
      category
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .limit(100000);

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }

  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  if (categoryName) {
    query = query.eq('category', categoryName);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch analytics data: ${error.message}`);
  }

  // Group by month and category
  const grouped = new Map<string, Map<string, number>>();

  data?.forEach((transaction) => {
    const month = format(new Date(transaction.transaction_date), 'yyyy-MM');
    const categoryName = transaction.category || 'Uncategorized';
    const spendingAmount = Number(transaction.amount_spending);

    if (!grouped.has(month)) {
      grouped.set(month, new Map());
    }

    const categoryMap = grouped.get(month)!;
    const currentAmount = categoryMap.get(categoryName) || 0;
    categoryMap.set(categoryName, currentAmount + spendingAmount);
  });

  // Convert to array format
  const result: MonthlySpendByCategory[] = [];
  grouped.forEach((categoryMap, month) => {
    categoryMap.forEach((amount, category) => {
      result.push({
        month: format(new Date(`${month}-01`), 'MMM yyyy'),
        category,
        amount,
      });
    });
  });

  return result.sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Get total spend over time (for line chart)
 * Uses transactions_v2 as the single source of truth
 */
export async function getTotalSpendOverTime(
  startDate?: string,
  endDate?: string,
  categoryName?: string
): Promise<TotalSpendOverTime[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select(`
      transaction_date,
      amount_spending
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .limit(100000);

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }

  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  if (categoryName) {
    query = query.eq('category', categoryName);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch analytics data: ${error.message}`);
  }

  // Group by month
  const grouped = new Map<string, number>();

  data?.forEach((transaction) => {
    const month = format(new Date(transaction.transaction_date), 'yyyy-MM');
    const spendingAmount = Number(transaction.amount_spending);
    const currentTotal = grouped.get(month) || 0;
    grouped.set(month, currentTotal + spendingAmount);
  });

  // Convert to array format
  const result: TotalSpendOverTime[] = Array.from(grouped.entries())
    .map(([month, total]) => ({
      month: format(new Date(`${month}-01`), 'MMM yyyy'),
      total,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

/**
 * Get category trend data (for category detail view)
 * Uses transactions_v2 as the single source of truth
 */
export async function getCategoryTrend(
  categoryName: string,
  startDate?: string,
  endDate?: string
): Promise<CategoryTrend[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select(`
      transaction_date,
      amount_spending
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .eq('category', categoryName);

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }

  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch category trend: ${error.message}`);
  }

  // Group by month
  const grouped = new Map<string, number>();

  data?.forEach((transaction) => {
    const month = format(new Date(transaction.transaction_date), 'yyyy-MM');
    const spendingAmount = Number(transaction.amount_spending);
    const currentAmount = grouped.get(month) || 0;
    grouped.set(month, currentAmount + spendingAmount);
  });

  // Convert to array format
  const result: CategoryTrend[] = Array.from(grouped.entries())
    .map(([month, amount]) => ({
      month: format(new Date(`${month}-01`), 'MMM yyyy'),
      amount,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return result;
}

export type FilteredTransaction = {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  category: string | null;
  notes: string | null;
};

/**
 * Get filtered transactions for the transactions table
 * Uses transactions_v2 as the single source of truth
 */
export async function getFilteredTransactions(
  startDate?: string,
  endDate?: string,
  categoryName?: string,
  merchant?: string
): Promise<FilteredTransaction[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select(`
      id,
      transaction_date,
      merchant,
      amount_spending,
      category,
      notes
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .order('transaction_date', { ascending: false });

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }

  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  if (categoryName) {
    query = query.eq('category', categoryName);
  }

  if (merchant) {
    query = query.ilike('merchant', `%${merchant}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return (data || []).map((transaction) => ({
    id: transaction.id,
    date: transaction.transaction_date,
    merchant: transaction.merchant,
    amount: Number(transaction.amount_spending),
    category: transaction.category || null,
    notes: transaction.notes || null,
  }));
}

export type SummaryMetrics = {
  totalSpent: number;
  transactionCount: number;
  averageTransaction: number;
  topCategory: {
    name: string;
    amount: number;
  } | null;
};

/**
 * Get summary metrics based on filters
 * Uses transactions_v2 as the single source of truth
 */
export async function getSummaryMetrics(
  startDate?: string,
  endDate?: string,
  categoryName?: string,
  merchant?: string
): Promise<SummaryMetrics> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select(`
      amount_spending,
      category
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .limit(100000);

  if (startDate) {
    query = query.gte('transaction_date', startDate);
  }

  if (endDate) {
    query = query.lte('transaction_date', endDate);
  }

  if (categoryName) {
    query = query.eq('category', categoryName);
  }

  if (merchant) {
    query = query.ilike('merchant', `%${merchant}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch summary metrics: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return {
      totalSpent: 0,
      transactionCount: 0,
      averageTransaction: 0,
      topCategory: null,
    };
  }

  // Calculate totals directly from amount_spending
  const totalSpent = data.reduce((sum, t) => sum + Number(t.amount_spending), 0);
  const transactionCount = data.length;
  const averageTransaction = transactionCount > 0 ? totalSpent / transactionCount : 0;

  // Find top category
  const categoryTotals = new Map<string, number>();
  data.forEach((transaction) => {
    const categoryName = transaction.category || 'Uncategorized';
    const spendingAmount = Number(transaction.amount_spending);
    const currentTotal = categoryTotals.get(categoryName) || 0;
    categoryTotals.set(categoryName, currentTotal + spendingAmount);
  });

  let topCategory: { name: string; amount: number } | null = null;
  categoryTotals.forEach((amount, name) => {
    if (!topCategory || amount > topCategory.amount) {
      topCategory = { name, amount };
    }
  });

  return {
    totalSpent,
    transactionCount,
    averageTransaction,
    topCategory,
  };
}

/**
 * Get unique merchants for typeahead search
 * Uses transactions_v2 as the single source of truth
 */
export async function getUniqueMerchants(searchQuery?: string): Promise<string[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  let query = supabase
    .from('transactions_v2')
    .select('merchant')
    .eq('user_id', user.id)
    .not('merchant', 'is', null);

  if (searchQuery && searchQuery.length >= 3) {
    query = query.ilike('merchant', `%${searchQuery}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch merchants: ${error.message}`);
  }

  // Get unique merchants
  const uniqueMerchants = new Set<string>();
  data?.forEach((transaction) => {
    if (transaction.merchant) {
      uniqueMerchants.add(transaction.merchant);
    }
  });

  return Array.from(uniqueMerchants).sort();
}
