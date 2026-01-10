'use server';

import { createClient } from '@/lib/supabase/server';

export async function debugDatabase() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // Get all source files
  const { data: sourceFiles, error: sfError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  // Get all transactions with their source file info
  const { data: transactions, error: transError } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      merchant_raw,
      source_file_id,
      source_file:source_files(id, filename)
    `)
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(100);

  // Group transactions by source file
  const bySourceFile = new Map<number, {
    filename: string;
    count: number;
    total: number;
    sample: any[];
  }>();

  transactions?.forEach((t: any) => {
    const sourceFileId = t.source_file_id;
    const sourceFile = t.source_file;
    const filename = sourceFile?.filename || `Unknown (ID: ${sourceFileId})`;
    
    if (!bySourceFile.has(sourceFileId)) {
      bySourceFile.set(sourceFileId, {
        filename,
        count: 0,
        total: 0,
        sample: [],
      });
    }

    const fileData = bySourceFile.get(sourceFileId)!;
    fileData.count++;
    fileData.total += Math.abs(Number(t.amount));
    if (fileData.sample.length < 5) {
      fileData.sample.push({
        date: t.date,
        merchant: t.merchant_raw,
        amount: Number(t.amount),
      });
    }
  });

  return {
    sourceFiles: sourceFiles || [],
    totalTransactions: transactions?.length || 0,
    transactionsBySourceFile: Array.from(bySourceFile.entries()).map(([id, data]) => ({
      sourceFileId: id,
      ...data,
    })),
    sampleTransactions: transactions?.slice(0, 10) || [],
    errors: {
      sourceFiles: sfError?.message,
      transactions: transError?.message,
    },
  };
}




