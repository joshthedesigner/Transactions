'use server';

import { createClient } from '@/lib/supabase/server';

export type FilesDiagnostic = {
  totalFilesInDatabase: number;
  filesWithApprovedTransactions: number;
  filesWithOnlyPendingTransactions: number;
  allFiles: {
    id: number;
    filename: string;
    uploadedAt: string;
    convention: string | null;
    totalTransactions: number;
    approvedTransactions: number;
    pendingTransactions: number;
  }[];
};

export async function diagnoseFiles(): Promise<FilesDiagnostic> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all source files
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  if (filesError) {
    throw new Error(`Failed to fetch source files: ${filesError.message}`);
  }

  // Get all transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, source_file_id, status')
    .eq('user_id', user.id);

  if (transactionsError) {
    throw new Error(`Failed to fetch transactions: ${transactionsError.message}`);
  }

  // Build file stats
  const allFiles = (sourceFiles || []).map((file) => {
    const fileTransactions = (transactions || []).filter((t) => t.source_file_id === file.id);
    const approvedCount = fileTransactions.filter((t) => t.status === 'approved').length;
    const pendingCount = fileTransactions.filter((t) => t.status === 'pending_review').length;

    return {
      id: file.id,
      filename: file.filename,
      uploadedAt: file.uploaded_at,
      convention: file.amount_sign_convention,
      totalTransactions: fileTransactions.length,
      approvedTransactions: approvedCount,
      pendingTransactions: pendingCount,
    };
  });

  const filesWithApproved = allFiles.filter((f) => f.approvedTransactions > 0).length;
  const filesWithOnlyPending = allFiles.filter(
    (f) => f.totalTransactions > 0 && f.approvedTransactions === 0
  ).length;

  return {
    totalFilesInDatabase: allFiles.length,
    filesWithApprovedTransactions: filesWithApproved,
    filesWithOnlyPendingTransactions: filesWithOnlyPending,
    allFiles,
  };
}

