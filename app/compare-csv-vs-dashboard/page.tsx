'use client';

import { useEffect, useState } from 'react';
import { compareCsvVsDashboard } from '@/lib/actions/compare-csv-vs-dashboard';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CompareCsvVsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await compareCsvVsDashboard();
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
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Comparing CSV files with database and dashboard...</p>
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
          <h1 className="text-3xl font-bold mb-6">CSV vs Database vs Dashboard Comparison</h1>

          {/* Summary Totals */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary Totals</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">CSV Files Total</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(data.csvTotals.total)}</p>
                <p className="text-xs text-gray-500">{data.csvTotals.transactionCount} transactions</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Database (All)</p>
                <p className="text-2xl font-bold">{formatCurrency(data.databaseTotals.all.total)}</p>
                <p className="text-xs text-gray-500">{data.databaseTotals.all.count} transactions</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Database (Approved)</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.databaseTotals.approved.total)}</p>
                <p className="text-xs text-gray-500">{data.databaseTotals.approved.count} transactions</p>
              </div>
              <div className="bg-white p-4 rounded">
                <p className="text-sm text-gray-600">Dashboard Shows</p>
                <p className="text-2xl font-bold text-purple-600">{formatCurrency(data.dashboardMetrics.totalSpent)}</p>
                <p className="text-xs text-gray-500">{data.dashboardMetrics.transactionCount} transactions</p>
              </div>
            </div>
          </div>

          {/* Discrepancies */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-yellow-800">⚠️ Discrepancies</h2>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">CSV vs Database (All):</span>
                <span className={`font-bold ${Math.abs(data.discrepancies.csvVsDbAll) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.discrepancies.csvVsDbAll)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">CSV vs Database (Approved):</span>
                <span className={`font-bold ${Math.abs(data.discrepancies.csvVsDbApproved) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.discrepancies.csvVsDbApproved)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">CSV vs Dashboard:</span>
                <span className={`font-bold ${Math.abs(data.discrepancies.csvVsDashboard) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.discrepancies.csvVsDashboard)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Database (Approved) vs Dashboard:</span>
                <span className={`font-bold ${Math.abs(data.discrepancies.dbApprovedVsDashboard) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(data.discrepancies.dbApprovedVsDashboard)}
                </span>
              </div>
            </div>
          </div>

          {/* Pending Transactions */}
          {data.databaseTotals.pending.total > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-orange-800">⏳ Pending Transactions</h2>
              <p className="text-lg">
                <span className="font-bold">{formatCurrency(data.databaseTotals.pending.total)}</span>
                {' '}in {data.databaseTotals.pending.count} transactions are pending review
              </p>
              <p className="text-sm text-gray-600 mt-2">
                These are not included in the dashboard total until approved.
              </p>
            </div>
          )}

          {/* Date Range Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📅 Date Range Information</h2>
            <div className="space-y-2">
              <div>
                <span className="font-medium">Dashboard Date Range:</span>
                <span className="ml-2">{data.dashboardMetrics.dateRange.start} to {data.dashboardMetrics.dateRange.end}</span>
              </div>
              <div>
                <span className="font-medium">Database Date Range:</span>
                <span className="ml-2">
                  {data.dateInfo.minDateInDb || 'N/A'} to {data.dateInfo.maxDateInDb || 'N/A'}
                </span>
              </div>
              {data.dateInfo.outsideDateRangeCount > 0 && (
                <div className="text-yellow-600">
                  <span className="font-medium">Transactions outside dashboard range:</span>
                  <span className="ml-2">{data.dateInfo.outsideDateRangeCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* By File Breakdown */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📁 Breakdown by File</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">Filename</th>
                    <th className="px-4 py-2 text-right">CSV Total</th>
                    <th className="px-4 py-2 text-right">DB All</th>
                    <th className="px-4 py-2 text-right">DB Approved</th>
                    <th className="px-4 py-2 text-right">DB Pending</th>
                    <th className="px-4 py-2 text-right">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.csvTotals.byFile.map((csvFile: any, idx: number) => {
                    const dbFile = data.databaseTotals.byFile.find((f: any) => 
                      f.filename === csvFile.filename || 
                      f.filename.includes(csvFile.filename.split('_')[0])
                    );
                    const diff = csvFile.csvTotal - (dbFile?.allTotal || 0);
                    return (
                      <tr key={idx} className="border-b">
                        <td className="px-4 py-2">{csvFile.filename}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(csvFile.csvTotal)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(dbFile?.allTotal || 0)}</td>
                        <td className="px-4 py-2 text-right text-green-600">{formatCurrency(dbFile?.approvedTotal || 0)}</td>
                        <td className="px-4 py-2 text-right text-yellow-600">{formatCurrency(dbFile?.pendingTotal || 0)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${Math.abs(diff) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

