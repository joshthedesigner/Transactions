'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

export type CalculationDiagnostic = {
  totalTransactions: number;
  approvedTransactions: number;
  pendingTransactions: number;
  rawAmountSum: number;
  calculatedSpendingSum: number;
  byFile: {
    filename: string;
    convention: string | null;
    transactionCount: number;
    rawSum: number;
    calculatedSum: number;
    sampleTransactions: {
      id: number;
      date: string;
      merchant: string;
      rawAmount: number;
      calculatedAmount: number;
      status: string;
    }[];
  }[];
  conventionIssues: {
    transactionsWithoutConvention: number;
    transactionsWithoutSourceFile: number;
  };
};

export async function diagnoseCalculation(): Promise<CalculationDiagnostic> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get ALL transactions with source file info
  const { data: allTransactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      merchant_normalized,
      amount,
      status,
      source_file_id,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .limit(100000);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const transactions = allTransactions || [];

  // Calculate metrics
  let approvedCount = 0;
  let pendingCount = 0;
  let rawSum = 0;
  let calculatedSum = 0;
  let transactionsWithoutConvention = 0;
  let transactionsWithoutSourceFile = 0;

  const fileMap = new Map<string, {
    convention: string | null;
    transactions: typeof transactions;
    rawSum: number;
    calculatedSum: number;
  }>();

  transactions.forEach((t) => {
    if (t.status === 'approved') approvedCount++;
    if (t.status === 'pending_review') pendingCount++;

    const rawAmount = Number(t.amount);
    rawSum += rawAmount;

    const sourceFile = (t as any).source_file;
    const convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    const filename = sourceFile?.filename || 'No Source File';

    if (!convention) {
      transactionsWithoutConvention++;
    }
    if (!sourceFile) {
      transactionsWithoutSourceFile++;
    }

    // Calculate spending amount using the same logic as dashboard
    const effectiveConvention = convention || 'negative';
    const spendingAmount = calculateSpendingAmount(rawAmount, effectiveConvention);
    
    // Only add to calculatedSum if approved (matching dashboard logic)
    if (t.status === 'approved') {
      calculatedSum += spendingAmount;
    }

    // Track by file
    if (!fileMap.has(filename)) {
      fileMap.set(filename, {
        convention,
        transactions: [],
        rawSum: 0,
        calculatedSum: 0,
      });
    }

    const fileData = fileMap.get(filename)!;
    fileData.transactions.push(t);
    fileData.rawSum += rawAmount;
    if (t.status === 'approved') {
      fileData.calculatedSum += spendingAmount;
    }
  });

  // Build by-file breakdown
  const byFile = Array.from(fileMap.entries()).map(([filename, data]) => ({
    filename,
    convention: data.convention,
    transactionCount: data.transactions.length,
    rawSum: data.rawSum,
    calculatedSum: data.calculatedSum,
    sampleTransactions: data.transactions.slice(0, 5).map((t) => {
      const rawAmount = Number(t.amount);
      const convention = data.convention || 'negative';
      const calculatedAmount = calculateSpendingAmount(rawAmount, convention);
      return {
        id: t.id,
        date: t.date,
        merchant: t.merchant_normalized,
        rawAmount,
        calculatedAmount,
        status: t.status,
      };
    }),
  }));

  return {
    totalTransactions: transactions.length,
    approvedTransactions: approvedCount,
    pendingTransactions: pendingCount,
    rawAmountSum: rawSum,
    calculatedSpendingSum: calculatedSum,
    byFile,
    conventionIssues: {
      transactionsWithoutConvention,
      transactionsWithoutSourceFile,
    },
  };
}

