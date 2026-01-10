'use client';

import { useEffect, useState } from 'react';
import { debugAmountCalculation } from '@/lib/actions/debug-amount-calculation';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DebugAmountCalculationPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await debugAmountCalculation();
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
              <p className="text-blue-800">Debugging amount calculation...</p>
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
          <h1 className="text-3xl font-bold mb-6">Amount Calculation Debug</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold">{data.summary.totalTransactions}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Raw Amount Total</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalRawAmount)}</p>
                <p className="text-xs text-gray-500">(Sum of all raw amounts)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Spending Amount Total</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.totalSpendingAmount)}</p>
                <p className="text-xs text-gray-500">(After convention calculation)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Difference</p>
                <p className={`text-2xl font-bold ${data.summary.difference > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.summary.difference)}
                </p>
                <p className="text-xs text-gray-500">(Credits excluded)</p>
              </div>
            </div>
          </div>

          {/* Issues */}
          {data.issues.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-yellow-800">⚠️ Potential Issues</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Null Convention</p>
                  <p className="text-xl font-bold">{data.issueCounts.nullConvention}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Possible Wrong Convention</p>
                  <p className="text-xl font-bold text-red-600">{data.issueCounts.possibleWrongConvention}</p>
                </div>
              </div>
              {data.issues.slice(0, 20).map((issue: any, idx: number) => (
                <div key={idx} className="mb-2 p-2 bg-white rounded text-sm">
                  <p className="font-semibold">{issue.type.replace(/_/g, ' ')}</p>
                  <p className="text-gray-600">{issue.issue}</p>
                  <p className="text-xs text-gray-500">
                    {issue.transaction.date} - {issue.transaction.merchant_raw} - {formatCurrency(issue.transaction.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* By File */}
          <div className="space-y-6">
            {data.byFile.map((file: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4">{file.filename}</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Convention</p>
                    <p className="font-bold">{file.convention || 'NULL'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Transactions</p>
                    <p className="font-bold">{file.transactionCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Raw Total</p>
                    <p className="font-bold">{formatCurrency(file.rawTotal)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Spending Total</p>
                    <p className="font-bold text-green-600">{formatCurrency(file.spendingTotal)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Difference</p>
                    <p className={`font-bold ${file.rawTotal - file.spendingTotal > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(file.rawTotal - file.spendingTotal)}
                    </p>
                  </div>
                </div>
                <div className="mb-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm font-semibold mb-2">Amount Distribution:</p>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Positive:</span>
                      <span className="font-bold ml-2">{file.positiveCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Negative:</span>
                      <span className="font-bold ml-2">{file.negativeCount}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Zero:</span>
                      <span className="font-bold ml-2">{file.zeroCount}</span>
                    </div>
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Date</th>
                        <th className="px-2 py-1 text-left">Merchant</th>
                        <th className="px-2 py-1 text-right">Raw Amount</th>
                        <th className="px-2 py-1 text-right">Spending</th>
                        <th className="px-2 py-1 text-center">Is Spending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {file.sampleTransactions.map((t: any, i: number) => (
                        <tr key={i} className={t.isSpending ? '' : 'bg-yellow-50'}>
                          <td className="px-2 py-1">{t.date}</td>
                          <td className="px-2 py-1">{t.merchant}</td>
                          <td className="px-2 py-1 text-right">{formatCurrency(t.rawAmount)}</td>
                          <td className="px-2 py-1 text-right font-medium">{formatCurrency(t.spendingAmount)}</td>
                          <td className="px-2 py-1 text-center">{t.isSpending ? '✓' : '✗'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

