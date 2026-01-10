'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Delete all transactions for the current user
 * Useful for testing/resetting
 */
export async function clearAllTransactions(): Promise<{ success: boolean; message: string; deletedCount?: number }> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return {
        success: false,
        message: 'You must be logged in to clear transactions',
      };
    }

    // Get count before deletion
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Delete all transactions for this user
    const { error: deleteError } = await supabase
      .from('transactions')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return {
        success: false,
        message: `Failed to delete transactions: ${deleteError.message}`,
      };
    }

    return {
      success: true,
      message: `Successfully deleted ${count || 0} transaction(s)`,
      deletedCount: count || 0,
    };
  } catch (error) {
    console.error('Error clearing transactions:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}




