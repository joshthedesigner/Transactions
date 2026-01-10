'use client';

import { useEffect, useState } from 'react';
import { checkPendingTransactions } from '@/lib/actions/check-pending-transactions';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckPendingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await checkPendingTransactions();
        setData(result);
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
              <p className="text-blue-800">Checking pending transactions...</p>
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
          <h1 className="text-3xl font-bold mb-6">Why Transactions Are Pending</h1>

          {/* Summary */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(data.total.amount)}
                </p>
                <p className="text-xs text-gray-500">{data.total.count} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Low Confidence</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.byReason.lowConfidence.amount)}
                </p>
                <p className="text-xs text-gray-500">{data.byReason.lowConfidence.count} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">No Category</p>
                <p className="text-xl font-bold">
                  {formatCurrency(data.byReason.noCategory.amount)}
                </p>
                <p className="text-xs text-gray-500">{data.byReason.noCategory.count} transactions</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-yellow-200">
              <p className="text-sm text-yellow-700">
                <strong>Why they're pending:</strong> Transactions are set to "pending_review" when the AI categorization 
                confidence score is below 75% (0.75), or when categorization fails. You can approve them in the Review Queue 
                to add them to your totals.
              </p>
            </div>
          </div>

          {/* By Reason */}
          <div className="space-y-6">
            {data.byReason.lowConfidence.count > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">
                  Low Confidence ({data.byReason.lowConfidence.count} transactions, {formatCurrency(data.byReason.lowConfidence.amount)})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  AI categorization confidence was below 75%. These have suggested categories but need your confirmation.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Merchant</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byReason.lowConfidence.transactions.map((t: any) => (
                        <tr key={t.id} className="border-b">
                          <td className="px-3 py-2">{t.date}</td>
                          <td className="px-3 py-2">{t.merchant}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(t.amount)}</td>
                          <td className="px-3 py-2 text-right">
                            {t.confidenceScore ? `${(t.confidenceScore * 100).toFixed(0)}%` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.byReason.noCategory.count > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">
                  No Category ({data.byReason.noCategory.count} transactions, {formatCurrency(data.byReason.noCategory.amount)})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  AI categorization failed or returned no category. These need manual categorization.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Merchant</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byReason.noCategory.transactions.map((t: any) => (
                        <tr key={t.id} className="border-b">
                          <td className="px-3 py-2">{t.date}</td>
                          <td className="px-3 py-2">{t.merchant}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.byReason.importError.count > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4 text-red-600">
                  Import Errors ({data.byReason.importError.count} transactions, {formatCurrency(data.byReason.importError.amount)})
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  These transactions failed to import properly and need fixing.
                </p>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-left">Merchant</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byReason.importError.transactions.map((t: any) => (
                        <tr key={t.id} className="border-b bg-red-50">
                          <td className="px-3 py-2">{t.date}</td>
                          <td className="px-3 py-2">{t.merchant}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(t.amount)}</td>
                          <td className="px-3 py-2 text-xs text-red-600 capitalize">
                            {t.importErrorReason?.replace(/_/g, ' ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold mb-2">How to Approve Pending Transactions</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Go to the <strong>Review Queue</strong> tab in your dashboard</li>
              <li>Review each transaction and its suggested category</li>
              <li>Click <strong>"Accept"</strong> to approve with the suggested category, or</li>
              <li>Select a different category and click <strong>"Change Category"</strong></li>
              <li>Once approved, transactions will be included in your dashboard totals</li>
            </ol>
            <div className="mt-4">
              <a
                href="/"
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Go to Review Queue
              </a>
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

