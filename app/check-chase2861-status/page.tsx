'use client';

import { useEffect, useState } from 'react';
import { checkChase2861Status } from '@/lib/actions/check-chase2861-status';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckChase2861StatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await checkChase2861Status();
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
              <p className="text-blue-800">Checking Chase2861 transaction status...</p>
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

  if (!data || data.error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">{data?.error || 'No data'}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Chase2861 Transaction Status</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold">{data.totalTransactions}</p>
              </div>
              <div className="bg-green-50 rounded p-3">
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-green-700">{data.summary.approvedCount}</p>
                <p className="text-sm text-green-600">{formatCurrency(data.summary.approvedTotal)}</p>
              </div>
              <div className="bg-yellow-50 rounded p-3">
                <p className="text-sm text-gray-600">Pending Review</p>
                <p className="text-2xl font-bold text-yellow-700">{data.summary.pendingCount}</p>
                <p className="text-sm text-yellow-600">{formatCurrency(data.summary.pendingTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Source File</p>
                <p className="text-sm font-medium">{data.sourceFile.filename}</p>
                <p className="text-xs text-gray-500">ID: {data.sourceFile.id}</p>
              </div>
            </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📋 Status Breakdown</h2>
            <div className="space-y-2">
              {Object.entries(data.statusBreakdown).map(([status, info]: [string, any]) => (
                <div key={status} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-semibold capitalize">{status.replace('_', ' ')}</p>
                    <p className="text-sm text-gray-600">{info.count} transactions</p>
                  </div>
                  <p className="text-lg font-bold">{formatCurrency(info.total)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Issue Alert */}
          {data.summary.pendingCount > 0 && (
            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-2 text-yellow-800">⚠️ Issue Found!</h2>
              <p className="text-lg mb-2">
                <strong>{data.summary.pendingCount} transactions</strong> ({formatCurrency(data.summary.pendingTotal)}) 
                are marked as <strong>pending_review</strong> instead of <strong>approved</strong>.
              </p>
              <p className="text-sm text-gray-700 mb-4">
                The dashboard only shows <strong>approved</strong> transactions, so these are not included in the total.
              </p>
              <p className="text-sm font-semibold text-gray-800">
                Solution: Go to the Review Queue and approve these transactions, or use the "Accept All" feature.
              </p>
            </div>
          )}

          {/* Approved Samples */}
          {data.approvedSamples.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">✅ Approved Transactions (Sample)</h2>
              <div className="space-y-2">
                {data.approvedSamples.map((t: any) => (
                  <div key={t.id} className="p-3 border-b">
                    <p className="font-medium">{t.date} - {t.merchant}</p>
                    <p className="text-sm text-gray-600">
                      Amount: {formatCurrency(t.amount)} → Spending: {formatCurrency(t.spendingAmount)}
                    </p>
                    {t.confidence !== null && (
                      <p className="text-xs text-gray-500">Confidence: {(t.confidence * 100).toFixed(0)}%</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Samples */}
          {data.pendingSamples.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">⏳ Pending Review Transactions (Sample)</h2>
              <div className="space-y-2">
                {data.pendingSamples.map((t: any) => (
                  <div key={t.id} className="p-3 border-b">
                    <p className="font-medium">{t.date} - {t.merchant}</p>
                    <p className="text-sm text-gray-600">
                      Amount: {formatCurrency(t.amount)} → Spending: {formatCurrency(t.spendingAmount)}
                    </p>
                    {t.confidence !== null && (
                      <p className="text-xs text-gray-500">Confidence: {(t.confidence * 100).toFixed(0)}%</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

