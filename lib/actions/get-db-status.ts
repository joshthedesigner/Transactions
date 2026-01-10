'use server';

import { createClient } from '@/lib/supabase/server';

export async function getDbStatus() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Get all source files
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  if (filesError) {
    return { error: filesError.message };
  }

  // Get all transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, source_file_id, status, amount')
    .eq('user_id', user.id);

  if (transactionsError) {
    return { error: transactionsError.message };
  }

  // Build breakdown
  const fileBreakdown = sourceFiles?.map((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    const approved = fileTransactions.filter((t) => t.status === 'approved');
    const pending = fileTransactions.filter((t) => t.status === 'pending_review');

    return {
      id: file.id,
      filename: file.filename,
      convention: file.amount_sign_convention,
      uploadedAt: file.uploaded_at,
      totalTransactions: fileTransactions.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      visibleOnDashboard: approved.length > 0,
    };
  }) || [];

  const totalApproved = transactions?.filter((t) => t.status === 'approved').length || 0;
  const totalPending = transactions?.filter((t) => t.status === 'pending_review').length || 0;
  const filesWithApproved = fileBreakdown.filter((f) => f.approvedCount > 0);

  return {
    summary: {
      totalFiles: sourceFiles?.length || 0,
      filesVisible: filesWithApproved.length,
      filesHidden: (sourceFiles?.length || 0) - filesWithApproved.length,
      totalTransactions: transactions?.length || 0,
      approvedTransactions: totalApproved,
      pendingTransactions: totalPending,
    },
    files: fileBreakdown,
  };
}

