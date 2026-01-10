import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();

  // Count source files (with and without user filter)
  const { count: allFilesCount } = await supabase
    .from('source_files')
    .select('*', { count: 'exact', head: true });

  const { count: userFilesCount } = await supabase
    .from('source_files')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id || '');

  // Count transactions (with and without user filter)
  const { count: allTransactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true });

  const { count: userTransactionsCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user?.id || '');

  // Get recent files without user filter to see if any exist
  const { data: recentFiles } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, user_id')
    .order('uploaded_at', { ascending: false })
    .limit(10);

  return NextResponse.json({
    authenticated: !!user,
    userId: user?.id || null,
    database: {
      allSourceFiles: allFilesCount,
      userSourceFiles: userFilesCount,
      allTransactions: allTransactionsCount,
      userTransactions: userTransactionsCount,
    },
    recentFiles: recentFiles || [],
  });
}

