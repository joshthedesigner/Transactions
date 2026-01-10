'use client';

import { useEffect, useState } from 'react';
import { explainTransactionValues } from '@/lib/actions/explain-transaction-values';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function ExplainTransactionValuesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await explainTransactionValues();
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
              <p className="text-blue-800">Loading transaction examples...</p>
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
          <h1 className="text-3xl font-bold mb-6">Understanding Transaction Values</h1>

          {/* Concepts */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📚 Key Concepts</h2>
            <div className="space-y-4">
              {data.explanation.concepts.map((concept: any, idx: number) => (
                <div key={idx} className="bg-white rounded p-4">
                  <h3 className="font-semibold text-lg mb-2">{concept.concept}</h3>
                  <p className="text-gray-700 mb-2">{concept.description}</p>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {concept.examples.map((ex: string, exIdx: number) => (
                      <li key={exIdx}>{ex}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Examples</p>
                <p className="text-2xl font-bold">{data.summary.totalTransactions}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Negative Convention</p>
                <p className="text-2xl font-bold">{data.summary.negativeConvention}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Positive Convention</p>
                <p className="text-2xl font-bold">{data.summary.positiveConvention}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Spending</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalSpending)}</p>
              </div>
            </div>
          </div>

          {/* Examples by Convention */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Negative Convention */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">🔴 Negative Convention (Chase Files)</h2>
              <p className="text-sm text-gray-600 mb-4">
                Spending = Negative amounts | Credits = Positive amounts
              </p>
              <div className="space-y-3">
                {data.byConvention.negative.slice(0, 5).map((ex: any) => (
                  <div key={ex.id} className="p-3 bg-gray-50 rounded border-l-4 border-red-500">
                    <p className="font-medium text-sm">{ex.merchant}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold">Raw (DB):</span> {formatCurrency(ex.rawAmount)} | 
                      <span className="font-semibold"> Spending:</span> {formatCurrency(ex.spendingAmount)}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">{ex.explanation}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Positive Convention */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">🟢 Positive Convention (Activity File)</h2>
              <p className="text-sm text-gray-600 mb-4">
                Spending = Positive amounts | Credits = Negative amounts
              </p>
              <div className="space-y-3">
                {data.byConvention.positive.slice(0, 5).map((ex: any) => (
                  <div key={ex.id} className="p-3 bg-gray-50 rounded border-l-4 border-green-500">
                    <p className="font-medium text-sm">{ex.merchant}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-semibold">Raw (DB):</span> {formatCurrency(ex.rawAmount)} | 
                      <span className="font-semibold"> Spending:</span> {formatCurrency(ex.spendingAmount)}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">{ex.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All Examples */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">📋 All Transaction Examples</h2>
            <div className="space-y-2">
              {data.examples.map((ex: any) => (
                <div key={ex.id} className="p-3 border-b">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{ex.date} - {ex.merchant}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        File: {ex.filename} | Convention: {ex.convention}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">{ex.explanation}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm">
                        <span className="text-gray-500">Raw:</span> {formatCurrency(ex.rawAmount)}
                      </p>
                      <p className="text-sm font-semibold">
                        <span className="text-gray-500">Spending:</span> {formatCurrency(ex.spendingAmount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

