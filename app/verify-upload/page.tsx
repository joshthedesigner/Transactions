'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function VerifyUploadPage() {
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

        // Get ALL transactions from transactions_v2 (no limit for accurate totals)
        const { data: transactions, error: transError } = await supabase
          .from('transactions_v2')
          .select(`
            id,
            source_filename,
            transaction_date,
            merchant,
            amount_spending,
            amount_raw,
            amount_convention,
            is_credit,
            is_payment,
            uploaded_at
          `)
          .eq('user_id', user.id)
          .order('uploaded_at', { ascending: false })
          .limit(50000); // High limit to get all transactions

        if (transError) {
          throw new Error(`Failed to fetch transactions: ${transError.message}`);
        }

        // Calculate totals
        const totalTransactions = transactions?.length || 0;
        const totalSpending = transactions?.reduce((sum, t) => sum + Number(t.amount_spending || 0), 0) || 0;
        const spendingTransactions = transactions?.filter(t => Number(t.amount_spending) > 0) || [];
        const spendingCount = spendingTransactions.length;
        const spendingTotal = spendingTransactions.reduce((sum, t) => sum + Number(t.amount_spending), 0);

        // Group by file
        const byFile = new Map<string, {
          filename: string;
          count: number;
          spendingCount: number;
          totalSpending: number;
          uploadedAt: string;
        }>();

        transactions?.forEach((t) => {
          const filename = t.source_filename || 'Unknown';
          if (!byFile.has(filename)) {
            byFile.set(filename, {
              filename,
              count: 0,
              spendingCount: 0,
              totalSpending: 0,
              uploadedAt: t.uploaded_at,
            });
          }
          const fileData = byFile.get(filename)!;
          fileData.count++;
          if (Number(t.amount_spending) > 0) {
            fileData.spendingCount++;
            fileData.totalSpending += Number(t.amount_spending);
          }
        });

        setData({
          user: {
            id: user.id,
            email: user.email,
          },
          summary: {
            totalTransactions,
            totalSpending,
            spendingCount,
            spendingTotal,
          },
          byFile: Array.from(byFile.values()).sort((a, b) => 
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          ),
          recentTransactions: transactions?.slice(0, 20) || [],
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
              <p className="text-blue-800">Verifying upload...</p>
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
        <h1 className="text-3xl font-bold mb-2">Upload Verification</h1>
        <p className="text-gray-600 mb-6">
          Verifying transactions_v2 upload status for: <strong>{data.user.email}</strong>
        </p>

        {/* Summary */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">✅ Upload Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold">{data.summary.totalTransactions}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Spending Transactions</p>
              <p className="text-2xl font-bold text-green-600">{data.summary.spendingCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Spending</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.spendingTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Files Uploaded</p>
              <p className="text-2xl font-bold">{data.byFile.length}</p>
            </div>
          </div>
        </div>

        {/* Critical Query Result */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">🔍 Critical Query Result</h2>
          <p className="text-sm text-gray-700 mb-2">
            This matches the validation query from the documentation:
          </p>
          <div className="bg-white rounded p-4">
            <code className="text-sm">
              SELECT COUNT(*) as transaction_count, SUM(amount_spending) as total_spending<br/>
              FROM transactions_v2<br/>
              WHERE user_id = '{data.user.id}'<br/>
              &nbsp;&nbsp;AND amount_spending &gt; 0;
            </code>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Transaction Count</p>
              <p className="text-xl font-bold">{data.summary.spendingCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Spending</p>
              <p className="text-xl font-bold">{formatCurrency(data.summary.spendingTotal)}</p>
            </div>
          </div>
        </div>

        {/* By File */}
        {data.byFile.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📁 Files Uploaded</h2>
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
                      <p className="text-sm text-gray-600">{file.spendingCount} spending transactions</p>
                      <p className="text-lg font-bold">{formatCurrency(file.totalSpending)}</p>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Total rows: {file.count} (includes credits/payments)
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Transactions */}
        {data.recentTransactions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">📋 Recent Transactions (Sample)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Merchant</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount Raw</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Spending</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Convention</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.recentTransactions.map((t: any) => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {new Date(t.transaction_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t.merchant}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {formatCurrency(Number(t.amount_raw))}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-right">
                        {formatCurrency(Number(t.amount_spending))}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.amount_convention}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {t.is_credit && 'Credit '}
                        {t.is_payment && 'Payment'}
                        {!t.is_credit && !t.is_payment && 'Spending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {data.summary.totalTransactions === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">⚠️ No Transactions Found</h2>
            <p className="text-gray-700">
              No transactions found in transactions_v2. This could mean:
            </p>
            <ul className="list-disc list-inside mt-2 text-gray-700">
              <li>The upload hasn't completed yet</li>
              <li>The upload failed (check the upload page for errors)</li>
              <li>You're logged in as a different user</li>
            </ul>
          </div>
        )}
      </div>
      </AppLayout>
    </FlowProvider>
  );
}

