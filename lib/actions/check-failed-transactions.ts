'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Check if there are any failed transactions waiting for review
 */
export async function checkFailedTransactions(): Promise<{
  hasFailed: boolean;
  count: number;
  error?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return { hasFailed: false, count: 0, error: 'Not authenticated' };
  }

  try {
    // First check if the columns exist by trying to query them
    const { data, error } = await supabase
      .from('transactions')
      .select('id, import_error_reason')
      .eq('user_id', user.id)
      .eq('status', 'pending_review')
      .not('import_error_reason', 'is', null)
      .limit(1);

    if (error) {
      // Check if it's a column doesn't exist error
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        return {
          hasFailed: false,
          count: 0,
          error: 'Migration not run: import_error columns do not exist. Please run the migration first.',
        };
      }
      return { hasFailed: false, count: 0, error: error.message };
    }

    // Get actual count
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending_review')
      .not('import_error_reason', 'is', null);

    return {
      hasFailed: (count || 0) > 0,
      count: count || 0,
    };
  } catch (error) {
    return {
      hasFailed: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

