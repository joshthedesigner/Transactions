'use server';

import { createClient } from '@/lib/supabase/server';
import { calculateSpendingAmount, AmountSignConvention } from '@/lib/utils/amount-calculator';

/**
 * Explain how transaction values work in the database
 */
export async function explainTransactionValues() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get sample transactions from different files
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      merchant_raw,
      amount,
      status,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .order('date', { ascending: false })
    .limit(20);

  const examples = (transactions || []).map((t: any) => {
    const rawAmount = Number(t.amount);
    const sourceFile = t.source_file;
    const convention = (sourceFile?.amount_sign_convention || null) as AmountSignConvention | null;
    
    // Determine convention if null
    let actualConvention: AmountSignConvention = convention || 'negative';
    if (!convention) {
      const filename = (sourceFile?.filename || '').toLowerCase();
      actualConvention = filename.includes('chase') ? 'negative' : 'positive';
    }

    const spendingAmount = calculateSpendingAmount(rawAmount, actualConvention);
    const isSpending = spendingAmount > 0;

    return {
      id: t.id,
      date: t.date,
      merchant: t.merchant_raw,
      rawAmount,
      convention: actualConvention,
      spendingAmount,
      isSpending,
      filename: sourceFile?.filename || 'unknown',
      explanation: getExplanation(rawAmount, actualConvention, spendingAmount),
    };
  });

  // Group by convention
  const byConvention = {
    negative: examples.filter(e => e.convention === 'negative'),
    positive: examples.filter(e => e.convention === 'positive'),
  };

  return {
    explanation: {
      title: 'How Transaction Values Work',
      concepts: [
        {
          concept: 'Raw Amount (Stored in DB)',
          description: 'The amount field stores the EXACT value from the CSV file, including the sign (+ or -).',
          examples: [
            'Chase file: -$50.00 (negative = spending)',
            'Activity file: $50.00 (positive = spending)',
          ],
        },
        {
          concept: 'Sign Convention',
          description: 'Different banks use different conventions for representing spending vs credits.',
          examples: [
            'Negative Convention (Chase): Spending = negative, Credits = positive',
            'Positive Convention (Activity): Spending = positive, Credits = negative',
          ],
        },
        {
          concept: 'Spending Amount (Calculated)',
          description: 'The spending amount is calculated from the raw amount based on the convention. This is what shows in the dashboard.',
          examples: [
            'Chase: -$50.00 → Spending: $50.00',
            'Activity: $50.00 → Spending: $50.00',
            'Chase: $50.00 → Spending: $0.00 (credit, excluded)',
            'Activity: -$50.00 → Spending: $0.00 (credit, excluded)',
          ],
        },
      ],
    },
    examples,
    byConvention,
    summary: {
      totalTransactions: examples.length,
      negativeConvention: byConvention.negative.length,
      positiveConvention: byConvention.positive.length,
      totalSpending: examples.reduce((sum, e) => sum + e.spendingAmount, 0),
    },
  };
}

function getExplanation(rawAmount: number, convention: AmountSignConvention, spendingAmount: number): string {
  if (convention === 'negative') {
    if (rawAmount < 0) {
      return `Negative amount (-$${Math.abs(rawAmount).toFixed(2)}) = SPENDING → Dashboard shows $${spendingAmount.toFixed(2)}`;
    } else {
      return `Positive amount ($${rawAmount.toFixed(2)}) = CREDIT → Dashboard shows $0.00 (excluded)`;
    }
  } else {
    if (rawAmount > 0) {
      return `Positive amount ($${rawAmount.toFixed(2)}) = SPENDING → Dashboard shows $${spendingAmount.toFixed(2)}`;
    } else {
      return `Negative amount (-$${Math.abs(rawAmount).toFixed(2)}) = CREDIT → Dashboard shows $0.00 (excluded)`;
    }
  }
}

