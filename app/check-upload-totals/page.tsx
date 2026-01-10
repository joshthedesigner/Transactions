'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckUploadTotalsPage() {
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

        // Get spending transactions - need to paginate to get ALL
        let spendingCount = 0;
        let spendingTotal = 0;
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: spendingData, error: spendingError } = await supabase
            .from('transactions_v2')
            .select('amount_spending')
            .eq('user_id', user.id)
            .gt('amount_spending', 0)
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (spendingError) {
            throw new Error(`Failed to fetch spending transactions: ${spendingError.message}`);
          }

          if (!spendingData || spendingData.length === 0) {
            hasMore = false;
          } else {
            spendingCount += spendingData.length;
            spendingTotal += spendingData.reduce((sum, t) => sum + Number(t.amount_spending || 0), 0);
            
            // If we got less than pageSize, we're done
            if (spendingData.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }

        // Get all transactions count
        const { count: totalCount, error: totalError } = await supabase
          .from('transactions_v2')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (totalError) {
          throw new Error(`Failed to get total count: ${totalError.message}`);
        }

        // Get breakdown by file - paginate to get ALL
        const byFile = new Map<string, {
          filename: string;
          totalCount: number;
          spendingCount: number;
          totalSpending: number;
          uploadedAt: string;
        }>();

        page = 0;
        hasMore = true;

        while (hasMore) {
          const { data: fileData, error: fileError } = await supabase
            .from('transactions_v2')
            .select(`
              source_filename,
              uploaded_at,
              amount_spending
            `)
            .eq('user_id', user.id)
            .order('uploaded_at', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (fileError) {
            throw new Error(`Failed to fetch file data: ${fileError.message}`);
          }

          if (!fileData || fileData.length === 0) {
            hasMore = false;
          } else {
            fileData.forEach((t) => {
              const filename = t.source_filename || 'Unknown';
              if (!byFile.has(filename)) {
                byFile.set(filename, {
                  filename,
                  totalCount: 0,
                  spendingCount: 0,
                  totalSpending: 0,
                  uploadedAt: t.uploaded_at,
                });
              }
              const fileInfo = byFile.get(filename)!;
              fileInfo.totalCount++;
              if (Number(t.amount_spending) > 0) {
                fileInfo.spendingCount++;
                fileInfo.totalSpending += Number(t.amount_spending);
              }
            });

            if (fileData.length < pageSize) {
              hasMore = false;
            } else {
              page++;
            }
          }
        }

        setData({
          user: {
            id: user.id,
            email: user.email,
          },
          summary: {
            totalTransactions: totalCount || 0,
            spendingCount,
            spendingTotal,
          },
          byFile: Array.from(byFile.values()).sort((a, b) => 
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          ),
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Calculating accurate totals...</p>
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
          <h1 className="text-3xl font-bold mb-2">Accurate Upload Totals</h1>
          <p className="text-gray-600 mb-6">
            Complete database totals (no limits) for: <strong>{data.user.email}</strong>
          </p>

          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Complete Database Totals</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions (All)</p>
                <p className="text-3xl font-bold">{data.summary.totalTransactions.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Includes credits/payments</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Spending Transactions</p>
                <p className="text-3xl font-bold text-green-600">{data.summary.spendingCount.toLocaleString()}</p>
                <p className="text-xs text-gray-500">amount_spending &gt; 0</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Spending</p>
                <p className="text-3xl font-bold text-green-600">{formatCurrency(data.summary.spendingTotal)}</p>
                <p className="text-xs text-gray-500">Sum of amount_spending</p>
              </div>
            </div>
          </div>

          {/* Critical Query */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔍 Critical Query Result</h2>
            <div className="bg-white rounded p-4 mb-4">
              <code className="text-sm">
                SELECT COUNT(*) as transaction_count, SUM(amount_spending) as total_spending<br/>
                FROM transactions_v2<br/>
                WHERE user_id = '{data.user.id}'<br/>
                &nbsp;&nbsp;AND amount_spending &gt; 0;
              </code>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Transaction Count</p>
                <p className="text-2xl font-bold">{data.summary.spendingCount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Spending</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.spendingTotal)}</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-sm text-yellow-800">
                <strong>Compare this to your upload result message.</strong> These numbers should match exactly.
              </p>
            </div>
          </div>

          {/* By File */}
          {data.byFile.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">📁 Breakdown by File</h2>
              <div className="space-y-3">
                {data.byFile.map((file: any, idx: number) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold">{file.filename}</p>
                        <p className="text-xs text-gray-500">
                          Uploaded: {formatDate(file.uploadedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">{file.spendingCount.toLocaleString()} spending</p>
                        <p className="text-lg font-bold">{formatCurrency(file.totalSpending)}</p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-600">
                      Total rows: {file.totalCount.toLocaleString()} (includes {file.totalCount - file.spendingCount} credits/payments)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comparison Note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">💡 What to Compare</h2>
            <p className="text-gray-700 mb-2">
              When you uploaded, you should have seen a message like:
            </p>
            <div className="bg-white rounded p-3 mb-4">
              <code className="text-sm">
                "Successfully uploaded X file(s). Y transactions, $Z total."
              </code>
            </div>
            <p className="text-gray-700 mb-2">
              Compare:
            </p>
            <ul className="list-disc list-inside text-gray-700 space-y-1">
              <li><strong>Y transactions</strong> should match <strong>Spending Transactions</strong> above</li>
              <li><strong>$Z total</strong> should match <strong>Total Spending</strong> above</li>
            </ul>
            <p className="text-sm text-gray-600 mt-4">
              If they don't match, there may have been an issue during upload or some transactions were filtered out.
            </p>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

