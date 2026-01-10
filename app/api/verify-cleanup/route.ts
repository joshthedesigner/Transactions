import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false });
  }

  // Get all source files
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  // Get all transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('source_file_id')
    .eq('user_id', user.id);

  // Build breakdown
  const fileBreakdown = sourceFiles?.map((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    return {
      filename: file.filename,
      transactionCount: fileTransactions.length,
      isEmpty: fileTransactions.length === 0,
    };
  }) || [];

  const emptyFiles = fileBreakdown.filter((f) => f.isEmpty);
  const nonEmptyFiles = fileBreakdown.filter((f) => !f.isEmpty);

  return NextResponse.json({
    authenticated: true,
    totalFiles: sourceFiles?.length || 0,
    emptyFiles: emptyFiles.length,
    nonEmptyFiles: nonEmptyFiles.length,
    files: nonEmptyFiles,
    remainingEmptyFiles: emptyFiles,
  });
}

