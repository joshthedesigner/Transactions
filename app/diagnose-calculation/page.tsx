'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/app/components/AppLayout';
import { diagnoseCalculation, CalculationDiagnostic } from '@/lib/actions/diagnose-calculation';

export default function DiagnoseCalculationPage() {
  const [diagnostic, setDiagnostic] = useState<CalculationDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiagnostic();
  }, []);

  const loadDiagnostic = async () => {
    try {
      setLoading(true);
      const data = await diagnoseCalculation();
      setDiagnostic(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-lg">Loading diagnostic...</div>
        </div>
      </AppLayout>
    );
  }

  if (error || !diagnostic) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 mb-2">Error</h2>
          <p className="text-red-700">{error || 'Failed to load diagnostic'}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Calculation Diagnostic</h1>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-gray-900">{diagnostic.totalTransactions}</p>
            <p className="text-sm text-gray-600 mt-1">
              Approved: {diagnostic.approvedTransactions} | Pending: {diagnostic.pendingTransactions}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Raw Amount Sum</p>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(diagnostic.rawAmountSum)}</p>
            <p className="text-xs text-gray-500 mt-1">(All transactions, as stored in DB)</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Calculated Spending (Approved)</p>
            <p className="text-3xl font-bold text-blue-900">{formatCurrency(diagnostic.calculatedSpendingSum)}</p>
            <p className="text-xs text-gray-500 mt-1">(After convention conversion, approved only)</p>
          </div>
        </div>

        {/* Convention Issues */}
        {(diagnostic.conventionIssues.transactionsWithoutConvention > 0 ||
          diagnostic.conventionIssues.transactionsWithoutSourceFile > 0) && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-800 mb-4">⚠️ Convention Issues Found</h2>
            <div className="space-y-2 text-yellow-700">
              {diagnostic.conventionIssues.transactionsWithoutConvention > 0 && (
                <p>
                  <strong>{diagnostic.conventionIssues.transactionsWithoutConvention}</strong> transaction(s) have no
                  amount convention stored (defaulting to 'negative')
                </p>
              )}
              {diagnostic.conventionIssues.transactionsWithoutSourceFile > 0 && (
                <p>
                  <strong>{diagnostic.conventionIssues.transactionsWithoutSourceFile}</strong> transaction(s) have no
                  source file linked
                </p>
              )}
            </div>
          </div>
        )}

        {/* By File Breakdown */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">Breakdown by File</h2>
          </div>
          <div className="p-6 space-y-6">
            {diagnostic.byFile.map((file, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-lg">{file.filename}</h3>
                    <p className="text-sm text-gray-600">
                      Convention: <span className="font-mono font-semibold">{file.convention || 'null (using "negative")'}</span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {file.transactionCount} transaction(s)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Raw Sum</p>
                    <p className="font-bold">{formatCurrency(file.rawSum)}</p>
                    <p className="text-sm text-gray-600 mt-2">Calculated Sum (Approved)</p>
                    <p className="font-bold text-blue-900">{formatCurrency(file.calculatedSum)}</p>
                  </div>
                </div>

                {/* Sample Transactions */}
                <div className="bg-gray-50 rounded p-3 mt-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Sample Transactions (first 5):</p>
                  <div className="space-y-2">
                    {file.sampleTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between text-xs">
                        <div className="flex-1">
                          <span className="font-mono text-gray-500">#{t.id}</span>
                          <span className="ml-2">{t.date}</span>
                          <span className="ml-2 font-medium">{t.merchant}</span>
                          <span
                            className={`ml-2 px-2 py-0.5 rounded text-xs ${
                              t.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-600">Raw: {formatCurrency(t.rawAmount)}</span>
                          <span className="font-semibold text-blue-900">
                            Calc: {formatCurrency(t.calculatedAmount)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-800 mb-4">What This Means</h2>
          <div className="space-y-2 text-blue-900">
            <p>
              <strong>Dashboard shows:</strong> {formatCurrency(diagnostic.calculatedSpendingSum)} (approved
              transactions only, after convention conversion)
            </p>
            <p>
              <strong>Upload flow showed:</strong> $91,180.01 (all uploaded transactions, calculated at upload time)
            </p>
            <p className="mt-4 font-semibold">
              Discrepancy: {formatCurrency(91180.01 - diagnostic.calculatedSpendingSum)}
            </p>
            <div className="mt-4 pt-4 border-t border-blue-300">
              <p className="font-semibold mb-2">Possible causes:</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Transactions marked as 'pending_review' instead of 'approved'</li>
                <li>Convention mismatch between upload and display</li>
                <li>Missing source file links (transactions without source_file_id)</li>
                <li>Database query not fetching all transactions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

