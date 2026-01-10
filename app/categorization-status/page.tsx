'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CategorizationStatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        // Fetch all transactions with pagination (Supabase limit is 1000)
        const pageSize = 1000;
        let page = 0;
        let hasMore = true;
        const allTransactions: any[] = [];

        while (hasMore) {
          const { data: pageData, error: pageError } = await supabase
            .from('transactions_v2')
            .select('id, category, source_filename, merchant, amount_spending')
            .eq('user_id', user.id)
            .gt('amount_spending', 0)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (pageError) {
            throw new Error(`Failed to fetch transactions: ${pageError.message}`);
          }

          if (!pageData || pageData.length === 0) {
            hasMore = false;
          } else {
            allTransactions.push(...pageData);
            
            // If we got less than pageSize, we're done
            if (pageData.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }

        // Get categorized vs uncategorized
        const categorized = allTransactions.filter(t => t.category);
        const uncategorized = allTransactions.filter(t => !t.category);

        // Group by source file
        const byFile = new Map<string, {
          filename: string;
          total: number;
          categorized: number;
          uncategorized: number;
          categories: Map<string, number>;
        }>();

        allTransactions.forEach((t) => {
          const filename = t.source_filename || 'Unknown';
          if (!byFile.has(filename)) {
            byFile.set(filename, {
              filename,
              total: 0,
              categorized: 0,
              uncategorized: 0,
              categories: new Map(),
            });
          }
          const fileData = byFile.get(filename)!;
          fileData.total++;
          if (t.category) {
            fileData.categorized++;
            const count = fileData.categories.get(t.category) || 0;
            fileData.categories.set(t.category, count + 1);
          } else {
            fileData.uncategorized++;
          }
        });

        // Group by category
        const byCategory = new Map<string, number>();
        categorized.forEach((t) => {
          const count = byCategory.get(t.category!) || 0;
          byCategory.set(t.category!, count + 1);
        });

        // Sample uncategorized transactions
        const sampleUncategorized = uncategorized.slice(0, 20);

        setData({
          summary: {
            total: allTransactions.length,
            categorized: categorized.length,
            uncategorized: uncategorized.length,
            coveragePercent: allTransactions.length > 0
              ? (categorized.length / allTransactions.length * 100).toFixed(1)
              : '0',
          },
          byFile: Array.from(byFile.values()).map(f => ({
            ...f,
            categories: Array.from(f.categories.entries()).map(([name, count]) => ({ name, count })),
          })),
          byCategory: Array.from(byCategory.entries()).map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
          sampleUncategorized,
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
              <p className="text-blue-800">Loading categorization status...</p>
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

  if (!data) {
    return null;
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-2">Categorization Performance</h1>
          <p className="text-gray-600 mb-6">
            View how well your transactions were automatically categorized.
          </p>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Overall Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-3xl font-bold">{data.summary.total.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Categorized</p>
                <p className="text-3xl font-bold text-green-600">{data.summary.categorized.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Uncategorized</p>
                <p className="text-3xl font-bold text-yellow-600">{data.summary.uncategorized.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Coverage</p>
                <p className="text-3xl font-bold">{data.summary.coveragePercent}%</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-green-600 h-4 rounded-full transition-all"
                  style={{ width: `${data.summary.coveragePercent}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* By Category */}
          {data.byCategory.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">📁 Transactions by Category</h2>
                {data.byCategory.some((cat: any) => cat.name === 'misc' && cat.count > 0) && (
                  <a
                    href="/analyze-misc"
                    className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-semibold"
                  >
                    🔍 Analyze Misc Category
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {data.byCategory.map((cat: any) => (
                  <div key={cat.name} className={`p-3 rounded ${
                    cat.name === 'misc' && cat.count > 0
                      ? 'bg-yellow-50 border-2 border-yellow-300'
                      : 'bg-gray-50'
                  }`}>
                    <p className="text-sm text-gray-600">{cat.name}</p>
                    <p className="text-2xl font-bold">{cat.count.toLocaleString()}</p>
                    {cat.name === 'misc' && cat.count > 0 && (
                      <p className="text-xs text-yellow-700 mt-1">Click "Analyze" above</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By File */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📄 Breakdown by File</h2>
            <div className="space-y-4">
              {data.byFile.map((file: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{file.filename}</p>
                      <p className="text-sm text-gray-600">
                        {file.categorized} categorized, {file.uncategorized} uncategorized
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Coverage</p>
                      <p className="text-xl font-bold">
                        {file.total > 0 ? ((file.categorized / file.total) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${file.total > 0 ? (file.categorized / file.total) * 100 : 0}%` }}
                    ></div>
                  </div>
                  {file.categories.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-600 mb-2">Categories in this file:</p>
                      <div className="flex flex-wrap gap-2">
                        {file.categories.map((cat: any) => (
                          <span
                            key={cat.name}
                            className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                          >
                            {cat.name} ({cat.count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Sample Uncategorized */}
          {data.sampleUncategorized.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">
                ⚠️ Sample Uncategorized Transactions ({data.summary.uncategorized} total)
              </h2>
              <p className="text-sm text-gray-600 mb-4">
                These transactions need manual categorization or can be categorized using the ML model.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Merchant</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Amount</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">File</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.sampleUncategorized.map((t: any) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">{t.merchant}</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">
                          {formatCurrency(Number(t.amount_spending))}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600">{t.source_filename}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.summary.uncategorized > 20 && (
                <p className="text-sm text-gray-600 mt-4">
                  Showing first 20 of {data.summary.uncategorized} uncategorized transactions
                </p>
              )}
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Next Steps:</strong> Use the{' '}
                  <a href="/categorize-amex" className="underline font-semibold">
                    Amex Categorization ML tool
                  </a>{' '}
                  to automatically categorize uncategorized transactions.
                </p>
              </div>
            </div>
          )}

          {data.summary.uncategorized === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-green-800 mb-2">✅ Perfect Categorization!</h2>
              <p className="text-green-700">
                All {data.summary.total} transactions have been categorized. Great job!
              </p>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

