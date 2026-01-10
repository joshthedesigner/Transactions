import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();

  // Get all source files
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention, user_id');

  if (filesError) {
    return NextResponse.json({ error: filesError.message }, { status: 500 });
  }

  // Get all transactions
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, source_file_id, status, amount');

  if (transactionsError) {
    return NextResponse.json({ error: transactionsError.message }, { status: 500 });
  }

  // Build breakdown for each file
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

  // Summary
  const filesWithApproved = fileBreakdown.filter((f) => f.approvedCount > 0);
  const totalApproved = transactions?.filter((t) => t.status === 'approved').length || 0;
  const totalPending = transactions?.filter((t) => t.status === 'pending_review').length || 0;

  return NextResponse.json({
    summary: {
      totalFilesInDB: sourceFiles?.length || 0,
      filesVisibleOnDashboard: filesWithApproved.length,
      filesHidden: (sourceFiles?.length || 0) - filesWithApproved.length,
      totalApprovedTransactions: totalApproved,
      totalPendingTransactions: totalPending,
      totalTransactions: totalApproved + totalPending,
    },
    files: fileBreakdown,
  });
}

