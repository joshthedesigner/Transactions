'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export async function checkDateRange() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const today = new Date().toISOString().split('T')[0];
  const startDate = '2020-01-01';

  // Get all approved transactions
  const { data: allTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved');

  // Get transactions in date range (what dashboard shows)
  const { data: dateFilteredTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', today);

  // Calculate totals
  let allTotal = 0;
  let dateFilteredTotal = 0;
  const outsideRange: Array<{ date: string; amount: number; merchant: string }> = [];

  (allTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      allTotal += spendingAmount;
      
      const transactionDate = new Date(t.date);
      const start = new Date(startDate);
      const end = new Date(today);
      
      if (transactionDate < start || transactionDate > end) {
        outsideRange.push({
          date: t.date,
          amount: spendingAmount,
          merchant: (t as any).merchant_raw || 'Unknown',
        });
      }
    }
  });

  (dateFilteredTransactions || []).forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    if (spendingAmount > 0) {
      dateFilteredTotal += spendingAmount;
    }
  });

  const outsideRangeTotal = outsideRange.reduce((sum, t) => sum + t.amount, 0);

  // Get date range of all transactions
  const dates = (allTransactions || []).map(t => t.date).sort();
  const minDate = dates[0] || null;
  const maxDate = dates[dates.length - 1] || null;

  return {
    dateRange: {
      start: startDate,
      end: today,
    },
    allTransactions: {
      count: allTransactions?.length || 0,
      total: allTotal,
      dateRange: {
        min: minDate,
        max: maxDate,
      },
    },
    dateFiltered: {
      count: dateFilteredTransactions?.length || 0,
      total: dateFilteredTotal,
    },
    outsideRange: {
      count: outsideRange.length,
      total: outsideRangeTotal,
      transactions: outsideRange.slice(0, 50),
    },
    discrepancy: {
      allVsFiltered: allTotal - dateFilteredTotal,
      expected: outsideRangeTotal,
    },
  };
}

