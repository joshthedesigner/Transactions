import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Get all source files
    const { data: sourceFiles, error: filesError } = await supabase
      .from('source_files')
      .select('id, filename')
      .eq('user_id', user.id);

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 });
    }

    // Get all transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('source_file_id')
      .eq('user_id', user.id);

    if (transactionsError) {
      return NextResponse.json({ error: transactionsError.message }, { status: 500 });
    }

    // Find files with no transactions
    const emptyFileIds = sourceFiles
      ?.filter((file) => {
        const hasTransactions = transactions?.some((t) => t.source_file_id === file.id);
        return !hasTransactions;
      })
      .map((file) => file.id) || [];

    if (emptyFileIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No empty files to clean up',
        deletedCount: 0,
      });
    }

    // Delete empty files
    const { error: deleteError } = await supabase
      .from('source_files')
      .delete()
      .in('id', emptyFileIds);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${emptyFileIds.length} empty source files`,
      deletedCount: emptyFileIds.length,
      beforeCount: sourceFiles?.length || 0,
      afterCount: (sourceFiles?.length || 0) - emptyFileIds.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

