'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Debug how amounts are being calculated - compare raw amounts vs spending amounts
 */
export async function debugAmountCalculation() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  const startDate = '2020-01-01';
  const endDate = new Date().toISOString().split('T')[0];

  // Get all approved transactions with source file info
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      merchant_raw,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false });

  if (!transactions) {
    throw new Error('No transactions found');
  }

  // Analyze by file
  const byFile = new Map<string, {
    filename: string;
    convention: AmountSignConvention | null;
    transactions: Array<{
      id: number;
      date: string;
      merchant: string;
      rawAmount: number;
      spendingAmount: number;
      isSpending: boolean;
    }>;
    rawTotal: number;
    spendingTotal: number;
    positiveCount: number;
    negativeCount: number;
    zeroCount: number;
  }>();

  let totalRaw = 0;
  let totalSpending = 0;
  const issues: Array<{
    type: string;
    transaction: any;
    issue: string;
  }> = [];

  transactions.forEach((t: any) => {
    const rawAmount = Number(t.amount);
    const sourceFile = t.source_file;
    let convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      convention = filename.includes('chase') ? 'negative' : 'positive';
    }

    const filename = sourceFile?.filename || 'unknown';
    if (!byFile.has(filename)) {
      byFile.set(filename, {
        filename,
        convention,
        transactions: [],
        rawTotal: 0,
        spendingTotal: 0,
        positiveCount: 0,
        negativeCount: 0,
        zeroCount: 0,
      });
    }

    const fileData = byFile.get(filename)!;
    
    // Track raw amount distribution
    if (rawAmount > 0) {
      fileData.positiveCount++;
    } else if (rawAmount < 0) {
      fileData.negativeCount++;
    } else {
      fileData.zeroCount++;
    }

    const spendingAmount = calculateSpendingAmount(rawAmount, convention);
    const isSpending = spendingAmount > 0;

    fileData.transactions.push({
      id: t.id,
      date: t.date,
      merchant: t.merchant_raw,
      rawAmount,
      spendingAmount,
      isSpending,
    });

    fileData.rawTotal += rawAmount;
    fileData.spendingTotal += spendingAmount;
    totalRaw += rawAmount;
    totalSpending += spendingAmount;

    // Check for potential issues
    if (!convention) {
      issues.push({
        type: 'null_convention',
        transaction: t,
        issue: 'No convention detected',
      });
    }

    // Check if convention might be wrong
    if (convention === 'negative' && rawAmount > 0 && Math.abs(rawAmount) > 10) {
      // Negative convention but positive amount - might be a credit
      issues.push({
        type: 'possible_wrong_convention',
        transaction: t,
        issue: `Negative convention but positive amount: ${rawAmount}. This would be excluded as a credit.`,
      });
    }

    if (convention === 'positive' && rawAmount < 0 && Math.abs(rawAmount) > 10) {
      // Positive convention but negative amount - might be a credit
      issues.push({
        type: 'possible_wrong_convention',
        transaction: t,
        issue: `Positive convention but negative amount: ${rawAmount}. This would be excluded as a credit.`,
      });
    }
  });

  return {
    summary: {
      totalTransactions: transactions.length,
      totalRawAmount: totalRaw,
      totalSpendingAmount: totalSpending,
      difference: totalRaw - totalSpending,
    },
    byFile: Array.from(byFile.values()).map(file => ({
      ...file,
      transactionCount: file.transactions.length,
      sampleTransactions: file.transactions.slice(0, 20),
    })),
    issues: issues.slice(0, 50),
    issueCounts: {
      nullConvention: issues.filter(i => i.type === 'null_convention').length,
      possibleWrongConvention: issues.filter(i => i.type === 'possible_wrong_convention').length,
    },
  };
}

