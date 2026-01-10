'use client';

import { useEffect, useState } from 'react';
import { TransactionWithCategory, Category } from '@/lib/types/database';
import {
  getReviewQueue,
  getCategories,
  acceptTransaction,
  changeTransactionCategory,
  bulkApplyCategory,
  acceptAllTransactions,
} from '@/lib/actions/review-queue';
import { format } from 'date-fns';

interface ReviewQueueProps {
  onComplete?: () => void;
  autoRefresh?: boolean;
  failedOnly?: boolean; // If true, only show transactions that failed import
}

export default function ReviewQueue({ onComplete, autoRefresh = false, failedOnly = false }: ReviewQueueProps) {
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<number | null>(null);
  const [newCategoryId, setNewCategoryId] = useState<number | null>(null);
  const [bulkMerchant, setBulkMerchant] = useState<string | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  // Auto-refresh when autoRefresh prop changes to true
  useEffect(() => {
    if (autoRefresh) {
      loadData();
    }
  }, [autoRefresh]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [transactionsData, categoriesData] = await Promise.all([
        getReviewQueue(failedOnly),
        getCategories(),
      ]);
      setTransactions(transactionsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error loading review queue:', error);
      alert(error instanceof Error ? error.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (transactionId: number) => {
    try {
      await acceptTransaction(transactionId);
      const [transactionsData] = await Promise.all([getReviewQueue(failedOnly)]);
      setTransactions(transactionsData);
      
      if (transactionsData.length === 0 && onComplete) {
        setTimeout(() => {
          onComplete();
        }, 500);
      } else {
        alert('Transaction approved!');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to accept transaction');
    }
  };

  const handleAcceptAll = async () => {
    if (!confirm(`Are you sure you want to accept all ${transactions.length} transaction(s)?`)) {
      return;
    }

    try {
      const count = await acceptAllTransactions(failedOnly);
      const [transactionsData] = await Promise.all([getReviewQueue(failedOnly)]);
      setTransactions(transactionsData);
      
      alert(`Successfully approved ${count} transaction(s)!`);
      
      if (transactionsData.length === 0 && onComplete) {
        setTimeout(() => {
          onComplete();
        }, 500);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to accept all transactions');
    }
  };

  const handleChangeCategory = async (transactionId: number) => {
    if (!newCategoryId) return;

    try {
      await changeTransactionCategory(transactionId, newCategoryId);
      const [transactionsData] = await Promise.all([getReviewQueue(failedOnly)]);
      setTransactions(transactionsData);
      setSelectedTransaction(null);
      setNewCategoryId(null);
      
      if (transactionsData.length === 0 && onComplete) {
        setTimeout(() => {
          onComplete();
        }, 500);
      } else {
        alert('Category updated and transaction approved!');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update category');
    }
  };

  const handleBulkApply = async () => {
    if (!bulkMerchant || !bulkCategoryId) return;

    try {
      const count = await bulkApplyCategory(bulkMerchant, bulkCategoryId);
      const [transactionsData] = await Promise.all([getReviewQueue(failedOnly)]);
      setTransactions(transactionsData);
      setBulkMerchant(null);
      setBulkCategoryId(null);
      
      if (transactionsData.length === 0 && onComplete) {
        setTimeout(() => {
          onComplete();
        }, 500);
      } else {
        alert(`Applied category to ${count} transaction(s)!`);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to bulk apply category');
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatConfidence = (score: number | null) => {
    if (score === null) return 'N/A';
    return `${(score * 100).toFixed(0)}%`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center">Loading review queue...</div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4">Review Queue</h2>
        <p className="text-gray-600">No transactions pending review. Great job!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {failedOnly ? 'Fix Failed Transactions' : 'Review Queue'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {transactions.length} transaction(s) {failedOnly ? 'failed import and need fixing' : 'pending review'}
            </p>
            {failedOnly && (
              <p className="text-sm text-yellow-600 mt-2">
                These transactions failed to import. Please fix the errors and approve them to add them to your database.
              </p>
            )}
          </div>
          {transactions.length > 0 && (
            <button
              onClick={handleAcceptAll}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium transition-colors"
            >
              Accept All ({transactions.length})
            </button>
          )}
        </div>
      </div>

      <div className="divide-y">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="p-6 hover:bg-gray-50">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-4 mb-2">
                  <h3 className="font-semibold text-lg">{transaction.merchant || transaction.merchant_raw}</h3>
                  <span className="text-sm text-gray-500">
                    {format(new Date(transaction.date || transaction.transaction_date), 'MMM d, yyyy')}
                  </span>
                  <span className="text-lg font-bold">
                    {formatAmount(transaction.amount || transaction.amount_spending || 0)}
                  </span>
                </div>

                {(transaction as any).import_error_reason && (
                  <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-md">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-red-600 font-semibold">Import Error:</span>
                      <span className="text-red-800 capitalize">
                        {(transaction as any).import_error_reason?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {(transaction as any).import_error_message && (
                      <p className="text-sm text-red-700">
                        {(transaction as any).import_error_message}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <div>
                    <span className="font-medium">Suggested:</span>{' '}
                    {transaction.category?.name || 'None'}
                  </div>
                  {transaction.confidence_score !== null && (
                    <div>
                      <span className="font-medium">Confidence:</span>{' '}
                      <span
                        className={
                          (transaction.confidence_score || 0) >= 0.75
                            ? 'text-green-600'
                            : (transaction.confidence_score || 0) >= 0.5
                            ? 'text-yellow-600'
                            : 'text-red-600'
                        }
                      >
                        {formatConfidence(transaction.confidence_score)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Merchant:</span>{' '}
                    <span className="text-gray-500">{transaction.merchant || transaction.merchant_normalized}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleAccept(transaction.id)}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium"
                >
                  Accept
                </button>
                <button
                  onClick={() => {
                    setSelectedTransaction(transaction.id);
                    setNewCategoryId(transaction.category_id || null);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                >
                  Change Category
                </button>
                <button
                  onClick={() => {
                    setBulkMerchant(transaction.merchant || transaction.merchant_normalized);
                    setBulkCategoryId(transaction.category_id || null);
                  }}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium"
                >
                  Bulk Apply
                </button>
              </div>
            </div>

            {selectedTransaction === transaction.id && (
              <div className="mt-4 p-4 bg-blue-50 rounded-md">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select new category:
                </label>
                <div className="flex items-center space-x-2">
                  <select
                    value={newCategoryId || ''}
                    onChange={(e) => setNewCategoryId(Number(e.target.value))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleChangeCategory(transaction.id)}
                    disabled={!newCategoryId}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setSelectedTransaction(null);
                      setNewCategoryId(null);
                    }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {bulkMerchant && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Bulk Apply Category</h3>
            <p className="text-gray-600 mb-4">
              Apply the selected category to all pending transactions from{' '}
              <span className="font-medium">{bulkMerchant}</span>?
            </p>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Category:
            </label>
            <select
              value={bulkCategoryId || ''}
              onChange={(e) => setBulkCategoryId(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            >
              <option value="">Select category...</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setBulkMerchant(null);
                  setBulkCategoryId(null);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkApply}
                disabled={!bulkCategoryId}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply to All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

