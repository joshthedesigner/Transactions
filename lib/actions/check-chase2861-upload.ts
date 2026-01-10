'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Check if Chase2861 file was uploaded and if transactions exist
 */
export async function checkChase2861Upload() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Find all source files that might be Chase2861
  const { data: allSourceFiles } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  // Find Chase2861 files
  const chase2861Files = (allSourceFiles || []).filter(f => 
    f.filename.toLowerCase().includes('chase2861') ||
    f.filename.toLowerCase().includes('chase_2861')
  );

  // Check transactions for each Chase2861 file
  const results = await Promise.all(
    chase2861Files.map(async (file) => {
      const { data: transactions, count } = await supabase
        .from('transactions')
        .select('id, date, merchant_raw, amount, status', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('source_file_id', file.id);

      return {
        sourceFile: file,
        transactionCount: count || 0,
        transactions: transactions || [],
      };
    })
  );

  // Also check if transactions exist with Chase2861 in merchant or other fields
  const { data: allTransactions } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      merchant_raw,
      amount,
      status,
      source_file:source_files(id, filename)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(5000);

  // Find transactions that look like they're from Chase2861 (by date/merchant matching)
  const chase2861SampleTransactions = [
    { date: '2025-12-30', merchant: 'united 0164357686346', amount: -30.99 },
    { date: '2025-12-30', merchant: 'united 0164357686313', amount: -44.99 },
    { date: '2025-12-30', merchant: 'inah 630000mnhikio', amount: -11.18 },
  ];

  const foundSampleTransactions = chase2861SampleTransactions.map(sample => {
    const found = (allTransactions || []).find((t: any) => {
      const tDate = t.date;
      const tMerchant = (t.merchant_raw || '').toLowerCase();
      const tAmount = Number(t.amount);
      return tDate === sample.date &&
             tMerchant.includes(sample.merchant.toLowerCase().split(' ')[0]) &&
             Math.abs(tAmount - sample.amount) < 0.01;
    });
    return { sample, found: found ? true : false, transaction: found };
  });

  return {
    chase2861SourceFiles: results,
    totalChase2861Files: chase2861Files.length,
    allSourceFilesCount: allSourceFiles?.length || 0,
    allTransactionsCount: allTransactions?.length || 0,
    sampleTransactionsCheck: foundSampleTransactions,
    recentSourceFiles: allSourceFiles?.slice(0, 10) || [],
  };
}

