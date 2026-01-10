'use client';

import { useEffect, useState } from 'react';
import { diagnoseImportFailures } from '@/lib/actions/diagnose-import-failures';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DiagnoseImportFailuresPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await diagnoseImportFailures();
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
              <p className="text-blue-800">Analyzing import failures...</p>
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

  const allFailures = data.byFile.flatMap((file: any) => 
    file.failures.map((f: any) => ({ ...f, filename: file.filename }))
  );

  const filteredFailures = selectedReason
    ? allFailures.filter((f: any) => f.reason === selectedReason)
    : allFailures;

  const filteredTotal = filteredFailures.reduce((sum: number, f: any) => sum + (f.csvAmount || 0), 0);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Why Transactions Weren't Imported</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Total Failures</p>
                <p className="text-2xl font-bold">{data.summary.totalFailures}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Spending Failures</p>
                <p className="text-2xl font-bold text-red-600">{data.summary.spendingFailures}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Missing Amount</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.totalMissingAmount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Expected Missing</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(5334.09)}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-blue-200">
              <h3 className="font-semibold mb-2">Failures by Reason</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(data.summary.totalsByReason).map(([reason, total]) => (
                  <div key={reason} className="bg-white p-3 rounded">
                    <p className="text-xs text-gray-600 capitalize">{reason.replace(/_/g, ' ')}</p>
                    <p className="text-lg font-bold">{formatCurrency(total as number)}</p>
                    <p className="text-xs text-gray-500">
                      {data.byFile.reduce((sum: number, f: any) => 
                        sum + (f.failuresByReason[reason]?.length || 0), 0
                      )} transactions
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filter */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Reason</label>
            <select
              value={selectedReason || ''}
              onChange={(e) => setSelectedReason(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">All Reasons</option>
              {Object.keys(data.summary.totalsByReason).map(reason => (
                <option key={reason} value={reason}>
                  {reason.replace(/_/g, ' ')} ({formatCurrency(data.summary.totalsByReason[reason] as number)})
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-600">
              Showing {filteredFailures.length} failures totaling {formatCurrency(filteredTotal)}
            </p>
          </div>

          {/* Failures Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Merchant</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFailures.map((f: any, idx: number) => (
                    <tr key={idx} className={f.csvAmount ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          f.reason === 'date_parse' || f.reason === 'amount_parse' ? 'bg-red-100 text-red-800' :
                          f.reason === 'payment' || f.reason === 'credit_card_payment' ? 'bg-gray-100 text-gray-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {f.reason.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">{f.date || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">{f.merchant || 'N/A'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">
                        {f.csvAmount ? formatCurrency(f.csvAmount) : f.amount || 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{f.error}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{f.filename}</td>
                    </tr>
                  ))}
                </tbody>
                {filteredFailures.length > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-sm font-semibold">Total</td>
                      <td className="px-4 py-3 text-sm font-semibold text-right">
                        {formatCurrency(filteredTotal)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* By File Breakdown */}
          <div className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">By File Breakdown</h2>
            {data.byFile.map((file: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2">{file.filename}</h3>
                <div className="grid grid-cols-3 gap-4 text-sm mb-2">
                  <div>
                    <p className="text-gray-600">Total Rows</p>
                    <p className="font-bold">{file.totalRows}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Successfully Imported</p>
                    <p className="font-bold text-green-600">{file.successfullyNormalized}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Failed</p>
                    <p className="font-bold text-red-600">{file.totalFailures}</p>
                  </div>
                </div>
                {Object.keys(file.totalsByReason).length > 0 && (
                  <div className="mt-2 text-xs">
                    <p className="font-semibold mb-1">Failures by reason:</p>
                    {Object.entries(file.totalsByReason).map(([reason, total]) => (
                      <div key={reason} className="flex justify-between">
                        <span className="capitalize">{reason.replace(/_/g, ' ')}:</span>
                        <span className="font-semibold">
                          {file.failuresByReason[reason].length} transactions = {formatCurrency(total as number)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

