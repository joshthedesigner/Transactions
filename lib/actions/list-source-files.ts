'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * List all source files (CSV files) that have been uploaded
 */
export async function listSourceFiles() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all source files with transaction counts and totals
  const { data: sourceFiles, error: sourceFilesError } = await supabase
    .from('source_files')
    .select(`
      id,
      filename,
      uploaded_at,
      amount_sign_convention
    `)
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  if (sourceFilesError) {
    throw new Error(`Failed to fetch source files: ${sourceFilesError.message}`);
  }

  // Get transaction counts and totals for each source file
  const filesWithStats = await Promise.all(
    (sourceFiles || []).map(async (file) => {
      // Count all transactions from this file
      const { count: totalCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source_file_id', file.id);

      // Count approved transactions
      const { count: approvedCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source_file_id', file.id)
        .eq('status', 'approved');

      // Count pending transactions
      const { count: pendingCount } = await supabase
        .from('transactions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source_file_id', file.id)
        .eq('status', 'pending_review');

      // Get total amount (raw sum)
      const { data: transactions } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', user.id)
        .eq('source_file_id', file.id);

      const totalAmount = transactions?.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) || 0;

      return {
        ...file,
        totalTransactions: totalCount || 0,
        approvedTransactions: approvedCount || 0,
        pendingTransactions: pendingCount || 0,
        totalAmount,
      };
    })
  );

  return {
    files: filesWithStats,
    totalFiles: filesWithStats.length,
    totalTransactions: filesWithStats.reduce((sum, f) => sum + f.totalTransactions, 0),
    totalApproved: filesWithStats.reduce((sum, f) => sum + f.approvedTransactions, 0),
    totalPending: filesWithStats.reduce((sum, f) => sum + f.pendingTransactions, 0),
  };
}

