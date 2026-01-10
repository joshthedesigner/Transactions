'use client';

import { useEffect, useState } from 'react';
import { getRawDbTotals } from '@/lib/actions/raw-db-totals';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function RawDbTotalsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await getRawDbTotals();
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
              <p className="text-blue-800">Loading raw database totals...</p>
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
          <h1 className="text-3xl font-bold mb-6">Raw Database Totals</h1>
          <p className="text-gray-600 mb-6">
            These are the ACTUAL values stored in the database - no calculations, no conversions, just raw sums.
          </p>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Raw Totals (As Stored in DB)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold">{data.summary.totalTransactions}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Raw Total (Sum of All)</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.rawTotal)}</p>
                <p className="text-xs text-gray-500">Positive + Negative</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Positive Amounts Only</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.rawPositiveTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Negative Amounts Only</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.rawNegativeTotal)}</p>
              </div>
            </div>
            {data.summary.dateRange && (
              <div className="mt-4 pt-4 border-t border-blue-300">
                <p className="text-sm">
                  <strong>Date Range:</strong> {data.summary.dateRange.min} to {data.summary.dateRange.max}
                </p>
              </div>
            )}
          </div>

          {/* By Status */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📋 By Status</h2>
            <div className="space-y-3">
              {data.byStatus.map((item: any) => (
                <div key={item.status} className="p-4 bg-gray-50 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold capitalize">{item.status}</p>
                    <p className="text-lg font-bold">{formatCurrency(item.rawTotal)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Count: {item.count}</p>
                    </div>
                    <div>
                      <p className="text-green-600">Positive: {formatCurrency(item.positiveTotal)}</p>
                    </div>
                    <div>
                      <p className="text-red-600">Negative: {formatCurrency(item.negativeTotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By File */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📁 By File</h2>
            <div className="space-y-3">
              {data.byFile
                .sort((a: any, b: any) => b.rawTotal - a.rawTotal)
                .map((item: any) => (
                <div key={item.filename} className="p-4 bg-gray-50 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold">{item.filename}</p>
                      <p className="text-xs text-gray-500">Convention: {item.convention || 'null'}</p>
                    </div>
                    <p className="text-lg font-bold">{formatCurrency(item.rawTotal)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Count: {item.count}</p>
                    </div>
                    <div>
                      <p className="text-green-600">Positive: {formatCurrency(item.positiveTotal)}</p>
                    </div>
                    <div>
                      <p className="text-red-600">Negative: {formatCurrency(item.negativeTotal)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Samples */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Positive Samples */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">🟢 Positive Amounts (Sample)</h2>
              <div className="space-y-2">
                {data.samples.positive.map((t: any) => (
                  <div key={t.id} className="p-2 border-b">
                    <p className="text-sm font-medium">{t.date} - {t.merchant}</p>
                    <p className="text-xs text-gray-600">
                      Amount: {formatCurrency(t.amount)} | Status: {t.status} | File: {t.filename}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Negative Samples */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">🔴 Negative Amounts (Sample)</h2>
              <div className="space-y-2">
                {data.samples.negative.map((t: any) => (
                  <div key={t.id} className="p-2 border-b">
                    <p className="text-sm font-medium">{t.date} - {t.merchant}</p>
                    <p className="text-xs text-gray-600">
                      Amount: {formatCurrency(t.amount)} | Status: {t.status} | File: {t.filename}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

