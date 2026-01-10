'use client';

import { useEffect, useState } from 'react';
import { findDiscrepancyTransactions } from '@/lib/actions/find-discrepancy-transactions';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DiscrepancyTransactionsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'missing' | 'pending' | 'credit_mismatch' | 'all'>('all');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await findDiscrepancyTransactions();
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

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Loading discrepancy analysis...</p>
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const allTransactions = data.byFile.flatMap(file => [
    ...file.missingTransactions.map(t => ({ ...t, filename: file.filename, type: 'missing' as const })),
    ...file.pendingTransactions.map(t => ({ ...t, filename: file.filename, type: 'pending' as const })),
    ...file.creditMismatchTransactions.map(t => ({ ...t, filename: file.filename, type: 'credit_mismatch' as const })),
  ]);

  const filteredTransactions = allTransactions.filter(t => {
    if (selectedFile && t.filename !== selectedFile) return false;
    if (selectedStatus !== 'all' && t.status !== selectedStatus) return false;
    return true;
  });

  const filteredTotal = filteredTransactions.reduce((sum, t) => sum + t.csvAmount, 0);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Discrepancy Transactions Analysis</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Portal Total</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(68624.15)}</p>
                <p className="text-xs text-gray-500 mt-1">(Source of Truth)</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">CSV Total</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.totalCsvExpenses)}</p>
                <p className="text-xs text-gray-500 mt-1">
                  ({formatCurrency(data.summary.totalCsvExpenses - 68624.15)} extra)
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Approved</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.totalDbApproved)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(data.summary.totalDbPending)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Portal vs DB</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(68624.15 - data.summary.totalDbApproved - data.summary.totalDbPending)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Missing</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Missing from DB</p>
                  <p className="font-bold">{data.summary.missingCount} transactions</p>
                </div>
                <div>
                  <p className="text-gray-600">Pending (filtered)</p>
                  <p className="font-bold">{data.summary.pendingCount} transactions</p>
                </div>
                <div>
                  <p className="text-gray-600">Credit Mismatches</p>
                  <p className="font-bold">{data.summary.creditMismatchCount} transactions</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by File</label>
                <select
                  value={selectedFile || ''}
                  onChange={(e) => setSelectedFile(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="">All Files</option>
                  {data.byFile.map((file, idx) => (
                    <option key={idx} value={file.filename}>
                      {file.filename} ({formatCurrency(file.discrepancy)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="all">All Statuses</option>
                  <option value="missing">Missing from DB</option>
                  <option value="pending">Pending Review</option>
                  <option value="credit_mismatch">Credit Mismatch</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-gray-600">
                Showing {filteredTransactions.length} transactions totaling {formatCurrency(filteredTotal)}
              </p>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Merchant</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">CSV Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">DB Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTransactions.map((t, idx) => (
                    <tr key={idx} className={t.status === 'missing' ? 'bg-red-50' : t.status === 'pending' ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          t.status === 'missing' ? 'bg-red-100 text-red-800' :
                          t.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{t.date}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{t.merchant}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium">{formatCurrency(t.csvAmount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-500">
                        {t.dbAmount !== null ? formatCurrency(t.dbAmount) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{t.reason}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{t.filename}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-900">Total</td>
                    <td className="px-4 py-3 text-sm font-semibold text-right">{formatCurrency(filteredTotal)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* By File Breakdown */}
          <div className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold mb-4">By File Breakdown</h2>
            {data.byFile.map((file, idx) => (
              <div key={idx} className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-2">{file.filename}</h3>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">CSV Total</p>
                    <p className="font-bold">{formatCurrency(file.csvExpenseTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">DB Approved</p>
                    <p className="font-bold text-green-600">{formatCurrency(file.dbApprovedTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">DB Pending</p>
                    <p className="font-bold text-yellow-600">{formatCurrency(file.dbPendingTotal)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Discrepancy</p>
                    <p className="font-bold text-red-600">{formatCurrency(file.discrepancy)}</p>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Missing: {file.missingTransactions.length} | 
                  Pending: {file.pendingTransactions.length} | 
                  Credit Mismatch: {file.creditMismatchTransactions.length}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

