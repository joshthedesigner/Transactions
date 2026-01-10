'use client';

import { useEffect, useState } from 'react';
import { checkDateRange } from '@/lib/actions/check-date-range';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckDateRangePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await checkDateRange();
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
              <p className="text-blue-800">Checking date ranges...</p>
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
          <h1 className="text-3xl font-bold mb-6">Date Range Analysis</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Dashboard Date Range</p>
                <p className="text-lg font-bold">
                  {data.dateRange.start} to {data.dateRange.end}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">All Approved Transactions</p>
                <p className="text-2xl font-bold">{formatCurrency(data.allTransactions.total)}</p>
                <p className="text-xs text-gray-500">{data.allTransactions.count} transactions</p>
                <p className="text-xs text-gray-500 mt-1">
                  Dates: {data.allTransactions.dateRange.min} to {data.allTransactions.dateRange.max}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">In Date Range</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.dateFiltered.total)}</p>
                <p className="text-xs text-gray-500">{data.dateFiltered.count} transactions</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Outside Date Range</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.outsideRange.total)}</p>
                <p className="text-xs text-gray-500">{data.outsideRange.count} transactions</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                <p className="font-semibold text-yellow-800 mb-2">Discrepancy Analysis</p>
                <p className="text-sm text-yellow-700">
                  All transactions: {formatCurrency(data.allTransactions.total)}<br/>
                  Minus date filtered: {formatCurrency(data.dateFiltered.total)}<br/>
                  = Outside range: {formatCurrency(data.discrepancy.allVsFiltered)}<br/>
                  Expected outside: {formatCurrency(data.discrepancy.expected)}
                </p>
              </div>
            </div>
          </div>

          {/* Transactions Outside Range */}
          {data.outsideRange.transactions.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">
                Transactions Outside Date Range ({data.outsideRange.count} total)
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Merchant</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {data.outsideRange.transactions.map((t: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          {t.date}
                          {new Date(t.date) < new Date(data.dateRange.start) && (
                            <span className="ml-2 text-xs text-red-600">(Before {data.dateRange.start})</span>
                          )}
                          {new Date(t.date) > new Date(data.dateRange.end) && (
                            <span className="ml-2 text-xs text-red-600">(After {data.dateRange.end})</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">{t.merchant}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                          {formatCurrency(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-sm font-semibold">Total</td>
                      <td className="px-4 py-3 text-sm font-semibold text-right">
                        {formatCurrency(data.outsideRange.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

