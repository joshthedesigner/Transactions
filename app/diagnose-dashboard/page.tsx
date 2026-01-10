'use client';

import { useEffect, useState } from 'react';
import { diagnoseDashboardDiscrepancy } from '@/lib/actions/diagnose-dashboard-discrepancy';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DiagnoseDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await diagnoseDashboardDiscrepancy();
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
              <p className="text-blue-800">Loading dashboard discrepancy analysis...</p>
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
          <h1 className="text-3xl font-bold mb-6">Dashboard Discrepancy Analysis</h1>

          {/* Missing Files Warning */}
          {data.missingFiles && data.missingFiles.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-red-800">⚠️ MISSING FILES DETECTED</h2>
              <p className="text-lg font-bold text-red-600 mb-4">
                {data.missingFiles.length} file(s) not uploaded: {formatCurrency(data.missingFilesTotal)}
              </p>
              <div className="space-y-2 mb-4">
                {data.missingFiles.map((file: any, idx: number) => (
                  <div key={idx} className="bg-white p-3 rounded border border-red-200">
                    <p className="font-semibold">{file.filename}</p>
                    <p className="text-sm text-gray-600">Expected: {formatCurrency(file.expectedTotal)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-700">
                <strong>This explains {formatCurrency(data.missingFilesTotal)} of the discrepancy!</strong>
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600">CSV Files Total</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(data.csvTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Uploaded Files</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.uploadedFilesTotal || data.csvTotal)}</p>
                <p className="text-xs text-gray-500">
                  {data.expectedFiles?.length - (data.missingFiles?.length || 0)} of {data.expectedFiles?.length} files
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Portal Total</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(data.portalTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Dashboard Shows</p>
                <p className="text-2xl font-bold">{formatCurrency(data.dashboardShows)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB All Spending</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(data.database.allSpendingTotal + data.database.allPendingTotal)}
                </p>
              </div>
            </div>
          </div>

          {/* File Upload Status */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📁 File Upload Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2 text-green-700">✅ Expected Files (4)</h3>
                <div className="space-y-1 text-sm">
                  {data.expectedFiles?.map((file: any, idx: number) => {
                    const isUploaded = !data.missingFiles?.some((m: any) => m.filename === file.filename);
                    return (
                      <div key={idx} className={`p-2 rounded ${isUploaded ? 'bg-green-50' : 'bg-red-50'}`}>
                        <span className={isUploaded ? 'text-green-700' : 'text-red-700'}>
                          {isUploaded ? '✓' : '✗'} {file.filename}
                        </span>
                        <span className="text-gray-500 ml-2">({formatCurrency(file.total)})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">📤 Uploaded Files ({data.sourceFiles?.length || 0})</h3>
                <div className="space-y-1 text-sm">
                  {data.sourceFiles && data.sourceFiles.length > 0 ? (
                    data.sourceFiles.map((file: any) => (
                      <div key={file.id} className="p-2 rounded bg-gray-50">
                        <span className="font-medium">{file.filename}</span>
                        <span className="text-gray-500 ml-2">
                          (Convention: {file.amount_sign_convention || 'null'})
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500">No files uploaded</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Breakdown</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600 mb-2">Database Totals</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Approved Spending:</span>
                      <span className="font-semibold">{formatCurrency(data.database.allSpendingTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending Spending:</span>
                      <span className="font-semibold text-yellow-600">
                        {formatCurrency(data.database.allPendingTotal)} ({data.database.allPendingCount} transactions)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Credits:</span>
                      <span className="font-semibold text-blue-600">
                        {formatCurrency(data.database.allCreditTotal)} ({data.database.allCreditCount} transactions)
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Total:</span>
                      <span className="font-bold">
                        {formatCurrency(data.database.allSpendingTotal + data.database.allPendingTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded">
                  <p className="text-sm text-gray-600 mb-2">Dashboard Filters</p>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Approved Only:</span>
                      <span className="font-semibold">{formatCurrency(data.dashboard.approvedSpendingTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date Filtered:</span>
                      <span className="font-semibold">{formatCurrency(data.dashboard.dateFilteredTotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Outside Date Range:</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(data.discrepancies.filteredByDate)} ({data.outsideDateRange.count} transactions)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                <h3 className="font-semibold text-yellow-800 mb-2">What's Being Filtered Out</h3>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Pending Transactions:</span>
                    <span className="font-semibold text-yellow-600">
                      {formatCurrency(data.discrepancies.filteredByStatus)} ({data.database.allPendingCount} transactions)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Outside Date Range:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(data.discrepancies.filteredByDate)} ({data.outsideDateRange.count} transactions)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missing from DB:</span>
                    <span className="font-semibold text-red-600">
                      {formatCurrency(data.discrepancies.missingFromDB)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-yellow-300">
                    <span className="font-semibold">Total Missing:</span>
                    <span className="font-bold text-red-600">
                      {formatCurrency(data.discrepancies.totalMissingFromDashboard)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Outside Date Range */}
          {data.outsideDateRange.transactions.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">
                Transactions Outside Date Range ({data.outsideDateRange.count} total)
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
                    {data.outsideDateRange.transactions.map((t: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 whitespace-nowrap text-sm">{t.date}</td>
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
                        {formatCurrency(data.outsideDateRange.total)}
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

