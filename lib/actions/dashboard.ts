'use server';

import { createClient } from '@/lib/supabase/server';

export type DashboardSummary = {
  totalTransactions: number;
  totalValue: number;
  fileCount: number;
  recentFiles: {
    filename: string;
    transactionCount: number;
    totalValue: number;
    uploadedAt: string;
  }[];
};

export type RecentTransaction = {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  category: string | null;
  sourceFile: string;
};

/**
 * Get dashboard summary with all key metrics
 * Uses transactions_v2 as the single source of truth
 */
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all spending transactions (exclude credits and payments)
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions_v2')
    .select(`
      id,
      amount_spending,
      source_filename,
      uploaded_at
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .limit(100000);

  if (transactionsError) {
    throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);
  }

  // Calculate total value and group by file
  let totalValue = 0;
  const fileMap = new Map<string, { count: number; value: number; uploadedAt: string }>();

  transactions?.forEach((transaction) => {
    const spendingAmount = Number(transaction.amount_spending);
    totalValue += spendingAmount;

    // Track by file
    const filename = transaction.source_filename || 'Unknown';
    const uploadedAt = transaction.uploaded_at || new Date().toISOString();
    
    if (!fileMap.has(filename)) {
      fileMap.set(filename, { count: 0, value: 0, uploadedAt });
    }
    
    const fileStats = fileMap.get(filename)!;
    fileStats.count += 1;
    fileStats.value += spendingAmount;
  });

  // Convert file map to array and sort by upload date
  const recentFiles = Array.from(fileMap.entries())
    .map(([filename, stats]) => ({
      filename,
      transactionCount: stats.count,
      totalValue: stats.value,
      uploadedAt: stats.uploadedAt,
    }))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 10); // Show last 10 files

  return {
    totalTransactions: transactions?.length || 0,
    totalValue,
    fileCount: fileMap.size,
    recentFiles,
  };
}

/**
 * Get recent transactions for display
 * Uses transactions_v2 as the single source of truth
 */
export async function getRecentTransactions(limit: number = 20): Promise<RecentTransaction[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('transactions_v2')
    .select(`
      id,
      transaction_date,
      merchant,
      amount_spending,
      category:categories(name),
      source_filename
    `)
    .eq('user_id', user.id)
    .gt('amount_spending', 0) // Only spending transactions
    .order('transaction_date', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return (data || []).map((t) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant,
    amount: Number(t.amount_spending),
    category: (t.category as any)?.name || null,
    sourceFile: t.source_filename || 'Unknown',
  }));
}

