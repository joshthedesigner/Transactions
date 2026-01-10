'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function checkPendingTransactions() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all pending transactions
  const { data: pendingTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      merchant_raw,
      merchant_normalized,
      category_id,
      confidence_score,
      import_error_reason,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'pending_review')
    .order('date', { ascending: false });

  // Group by reason
  const byReason = {
    lowConfidence: [] as any[],
    noCategory: [] as any[],
    importError: [] as any[],
    other: [] as any[],
  };

  let totalAmount = 0;

  (pendingTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    
    if (spendingAmount > 0) {
      totalAmount += spendingAmount;
      
      const transaction = {
        id: t.id,
        date: t.date,
        merchant: t.merchant_raw,
        amount: spendingAmount,
        confidenceScore: t.confidence_score,
        categoryId: t.category_id,
        importErrorReason: t.import_error_reason,
      };

      if (t.import_error_reason) {
        byReason.importError.push(transaction);
      } else if (!t.category_id) {
        byReason.noCategory.push(transaction);
      } else if (t.confidence_score !== null && t.confidence_score < 0.75) {
        byReason.lowConfidence.push(transaction);
      } else {
        byReason.other.push(transaction);
      }
    }
  });

  return {
    total: {
      count: pendingTransactions?.length || 0,
      amount: totalAmount,
    },
    byReason: {
      lowConfidence: {
        count: byReason.lowConfidence.length,
        amount: byReason.lowConfidence.reduce((sum, t) => sum + t.amount, 0),
        transactions: byReason.lowConfidence.slice(0, 20),
      },
      noCategory: {
        count: byReason.noCategory.length,
        amount: byReason.noCategory.reduce((sum, t) => sum + t.amount, 0),
        transactions: byReason.noCategory.slice(0, 20),
      },
      importError: {
        count: byReason.importError.length,
        amount: byReason.importError.reduce((sum, t) => sum + t.amount, 0),
        transactions: byReason.importError.slice(0, 20),
      },
      other: {
        count: byReason.other.length,
        amount: byReason.other.reduce((sum, t) => sum + t.amount, 0),
        transactions: byReason.other.slice(0, 20),
      },
    },
  };
}

