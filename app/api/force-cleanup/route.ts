import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Authentication required',
        authenticated: false 
      }, { status: 401 });
    }

    // Step 1: Get all files
    const { data: allFiles, error: filesError } = await supabase
      .from('source_files')
      .select('id, filename')
      .eq('user_id', user.id);

    if (filesError) {
      return NextResponse.json({ error: filesError.message }, { status: 500 });
    }

    // Step 2: Get all transactions
    const { data: allTransactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('source_file_id')
      .eq('user_id', user.id);

    if (transactionsError) {
      return NextResponse.json({ error: transactionsError.message }, { status: 500 });
    }

    // Step 3: Find empty file IDs
    const emptyFileIds = [];
    for (const file of allFiles || []) {
      const hasTransactions = allTransactions?.some(t => t.source_file_id === file.id);
      if (!hasTransactions) {
        emptyFileIds.push(file.id);
      }
    }

    const beforeCount = allFiles?.length || 0;

    if (emptyFileIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No empty files to delete',
        beforeCount,
        afterCount: beforeCount,
        deletedCount: 0,
      });
    }

    // Step 4: Delete empty files
    const { error: deleteError } = await supabase
      .from('source_files')
      .delete()
      .in('id', emptyFileIds);

    if (deleteError) {
      return NextResponse.json({ 
        error: deleteError.message,
        attemptedToDelete: emptyFileIds.length 
      }, { status: 500 });
    }

    // Step 5: Verify
    const { data: filesAfter } = await supabase
      .from('source_files')
      .select('id')
      .eq('user_id', user.id);

    const afterCount = filesAfter?.length || 0;

    return NextResponse.json({
      success: true,
      message: `Deleted ${emptyFileIds.length} empty files`,
      beforeCount,
      afterCount,
      deletedCount: emptyFileIds.length,
      emptyFileIdsDeleted: emptyFileIds,
    });

  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

