'use server';

import { createClient } from '@/lib/supabase/server';

export async function cleanupEmptyFiles() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all source files
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  if (filesError) {
    throw new Error(`Failed to fetch files: ${filesError.message}`);
  }

  // Get all transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('source_file_id')
    .eq('user_id', user.id);

  if (transactionsError) {
    throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);
  }

  // Find files with no transactions
  const emptyFileIds = sourceFiles
    ?.filter((file) => {
      const hasTransactions = transactions?.some((t) => t.source_file_id === file.id);
      return !hasTransactions;
    })
    .map((file) => file.id) || [];

  if (emptyFileIds.length === 0) {
    return {
      success: true,
      message: 'No empty files to clean up',
      deletedCount: 0,
    };
  }

  // Delete empty files
  const { error: deleteError } = await supabase
    .from('source_files')
    .delete()
    .in('id', emptyFileIds);

  if (deleteError) {
    throw new Error(`Failed to delete empty files: ${deleteError.message}`);
  }

  return {
    success: true,
    message: `Successfully deleted ${emptyFileIds.length} empty source files`,
    deletedCount: emptyFileIds.length,
  };
}

