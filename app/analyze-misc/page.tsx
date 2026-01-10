'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function AnalyzeMiscPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        
        if (authError || !user) {
          throw new Error('Not authenticated');
        }

        // Fetch all misc transactions with pagination (Supabase limit is 1000)
        const pageSize = 1000;
        let page = 0;
        let hasMore = true;
        const miscTransactions: any[] = [];

        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from('transactions_v2')
            .select('id, category, source_filename, merchant, amount_spending, transaction_date, notes')
            .eq('user_id', user.id)
            .ilike('category', 'misc') // Case-insensitive match for "Misc", "misc", "MISC", etc.
            .gt('amount_spending', 0)
            .order('amount_spending', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (pageError) {
            throw new Error(`Failed to fetch transactions: ${pageError.message}`);
          }

          if (!pageData || pageData.length === 0) {
            hasMore = false;
          } else {
            miscTransactions.push(...pageData);
            
            // If we got less than pageSize, we're done
            if (pageData.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }

        if (miscTransactions.length === 0) {
          setData({ transactions: [], merchants: [], summary: null });
          setLoading(false);
          return;
        }

        // Group by merchant
        const merchantMap = new Map<string, {
          name: string;
          count: number;
          totalAmount: number;
          transactions: any[];
          files: Set<string>;
        }>();

        miscTransactions.forEach((t) => {
          const merchant = t.merchant || 'Unknown';
          if (!merchantMap.has(merchant)) {
            merchantMap.set(merchant, {
              name: merchant,
              count: 0,
              totalAmount: 0,
              transactions: [],
              files: new Set(),
            });
          }
          const merchantData = merchantMap.get(merchant)!;
          merchantData.count++;
          merchantData.totalAmount += Number(t.amount_spending);
          merchantData.transactions.push(t);
          if (t.source_filename) {
            merchantData.files.add(t.source_filename);
          }
        });

        // Sort merchants by count
        const merchants = Array.from(merchantMap.values())
          .sort((a, b) => b.count - a.count);

        // Group by file
        const fileMap = new Map<string, number>();
        miscTransactions.forEach((t) => {
          const file = t.source_filename || 'Unknown';
          fileMap.set(file, (fileMap.get(file) || 0) + 1);
        });

        // Amount distribution
        const amountRanges = {
          small: miscTransactions.filter(t => Number(t.amount_spending) < 50).length,
          medium: miscTransactions.filter(t => Number(t.amount_spending) >= 50 && Number(t.amount_spending) < 200).length,
          large: miscTransactions.filter(t => Number(t.amount_spending) >= 200).length,
        };

        setData({
          transactions: miscTransactions,
          merchants,
          byFile: Array.from(fileMap.entries()).map(([file, count]) => ({ file, count }))
            .sort((a, b) => b.count - a.count),
          summary: {
            total: miscTransactions.length,
            totalAmount: miscTransactions.reduce((sum, t) => sum + Number(t.amount_spending), 0),
            uniqueMerchants: merchantMap.size,
            amountRanges,
          },
        });
      } catch (e) {
        console.error('Error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Analyzing misc category transactions...</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (!data || !data.summary || data.summary.total === 0) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800 font-semibold">✅ No transactions in misc category!</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  const selectedMerchantData = selectedMerchant
    ? data.merchants.find((m: any) => m.name === selectedMerchant)
    : null;

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-2">🔍 Analyzing "Misc" Category</h1>
          <p className="text-gray-600 mb-6">
            Investigating {data.summary.total.toLocaleString()} transactions to identify patterns and improve categorization.
          </p>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-3xl font-bold">{data.summary.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Amount</p>
                <p className="text-3xl font-bold">{formatCurrency(data.summary.totalAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Unique Merchants</p>
                <p className="text-3xl font-bold">{data.summary.uniqueMerchants.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg per Transaction</p>
                <p className="text-3xl font-bold">
                  {formatCurrency(data.summary.totalAmount / data.summary.total)}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">Amount Distribution</p>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs text-gray-600">&lt; $50</p>
                  <p className="text-xl font-bold">{data.summary.amountRanges.small}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs text-gray-600">$50 - $200</p>
                  <p className="text-xl font-bold">{data.summary.amountRanges.medium}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <p className="text-xs text-gray-600">&gt; $200</p>
                  <p className="text-xl font-bold">{data.summary.amountRanges.large}</p>
                </div>
              </div>
            </div>
          </div>

          {/* By File */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📄 Misc Transactions by File</h2>
            <div className="space-y-2">
              {data.byFile.map((file: any) => (
                <div key={file.file} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <span className="font-mono text-sm">{file.file}</span>
                  <span className="font-bold">{file.count} transactions</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Merchants */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🏪 Top Merchants in Misc Category</h2>
            <p className="text-sm text-gray-600 mb-4">
              Click on a merchant to see all its transactions
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {data.merchants.slice(0, 50).map((merchant: any) => (
                <div
                  key={merchant.name}
                  onClick={() => setSelectedMerchant(merchant.name)}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors ${
                    selectedMerchant === merchant.name ? 'bg-blue-100 border-blue-400' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">{merchant.name}</p>
                      <p className="text-sm text-gray-600">
                        {merchant.count} transactions • {formatCurrency(merchant.totalAmount)} total
                        • {merchant.files.size} file{merchant.files.size !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Avg</p>
                      <p className="font-bold">
                        {formatCurrency(merchant.totalAmount / merchant.count)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {data.merchants.length > 50 && (
              <p className="text-sm text-gray-600 mt-4">
                Showing top 50 of {data.merchants.length} merchants
              </p>
            )}
          </div>

          {/* Selected Merchant Details */}
          {selectedMerchantData && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  Transactions for: {selectedMerchantData.name}
                </h2>
                <button
                  onClick={() => setSelectedMerchant(null)}
                  className="px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 rounded"
                >
                  Close
                </button>
              </div>
              <div className="mb-4 p-4 bg-gray-50 rounded">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Transactions</p>
                    <p className="text-2xl font-bold">{selectedMerchantData.count}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold">{formatCurrency(selectedMerchantData.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Average</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(selectedMerchantData.totalAmount / selectedMerchantData.count)}
                    </p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Files:</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedMerchantData.files).map((file: string) => (
                      <span key={file} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">File</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {selectedMerchantData.transactions
                      .sort((a: any, b: any) => 
                        new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
                      )
                      .map((t: any) => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm text-gray-900">
                            {new Date(t.transaction_date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right font-semibold">
                            {formatCurrency(Number(t.amount_spending))}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600 font-mono text-xs">
                            {t.source_filename}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-600">
                            {t.notes || '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-yellow-800 mb-2">💡 Recommendations</h2>
            <ul className="list-disc list-inside space-y-2 text-yellow-800">
              <li>
                Look for merchants that appear frequently - they might need specific category rules
              </li>
              <li>
                Check if merchants have patterns (e.g., all from same file, similar amounts)
              </li>
              <li>
                Consider creating merchant rules for top merchants to auto-categorize future transactions
              </li>
              <li>
                Review the Review Queue to manually categorize patterns you identify
              </li>
            </ul>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

