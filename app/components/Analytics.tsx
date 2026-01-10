'use client';

import { useEffect, useState } from 'react';
import UploadReviewFlow from './UploadReviewFlow';
import { useFlow } from '@/app/contexts/FlowContext';
import { getDashboardSummary, getRecentTransactions, DashboardSummary, RecentTransaction } from '@/lib/actions/dashboard';
import { format } from 'date-fns';

export default function Analytics() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const { isFlowOpen, closeFlow } = useFlow();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const [summaryData, transactionsData] = await Promise.all([
        getDashboardSummary(),
        getRecentTransactions(20),
      ]);
      setSummary(summaryData);
      setRecentTransactions(transactionsData);
    } catch (error) {
      console.error('Error loading dashboard:', error);
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

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg text-gray-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600 mb-2">Total Transactions</p>
          <p className="text-3xl font-bold text-gray-900">{summary?.totalTransactions.toLocaleString() || 0}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600 mb-2">Total Spending</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(summary?.totalValue || 0)}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600 mb-2">Files Uploaded</p>
          <p className="text-3xl font-bold text-gray-900">{summary?.fileCount || 0}</p>
        </div>
      </div>

      {/* Recent Files */}
      {summary && summary.recentFiles.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Recent Uploads</h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {summary.recentFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{file.filename}</p>
                    <p className="text-sm text-gray-600">
                      Uploaded {formatDate(file.uploadedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(file.totalValue)}</p>
                    <p className="text-sm text-gray-600">{file.transactionCount} transactions</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">Recent Transactions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Merchant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Source
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentTransactions.map((transaction) => (
                  <tr key={transaction.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(transaction.date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {transaction.merchant}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {transaction.category || 'Uncategorized'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 truncate max-w-xs">
                      {transaction.sourceFile}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right font-semibold">
                      {formatCurrency(transaction.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {summary && summary.totalTransactions === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No transactions yet</h3>
            <p className="text-gray-600 mb-6">
              Get started by uploading your first CSV or Excel file with transaction data.
            </p>
          </div>
        </div>
      )}

      {/* Upload/Review Flow Modal */}
      <UploadReviewFlow
        isOpen={isFlowOpen}
        onClose={() => {
          closeFlow();
          // Refresh dashboard when flow closes
          loadDashboard();
        }}
      />
    </div>
  );
}
