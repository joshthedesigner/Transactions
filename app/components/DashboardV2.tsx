'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  getDashboardMetrics,
  getSpendingByCategory,
  getTopMerchants,
  getSpendingOverTime,
  getSpendingByCategoryOverTime,
  getRecentTransactions,
  getPaginatedTransactions,
  getAvailableCategories,
  getAvailableMerchants,
  type DashboardMetrics,
  type CategorySpending,
  type MerchantSpending,
  type TimeSeriesData,
  type CategoryTimeSeriesData,
  type TransactionRow,
  type DashboardFilters,
} from '@/lib/actions/dashboard-v2';

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042',
  '#8884d8', '#82ca9d', '#ffc658', '#ff7300',
  '#8dd1e1', '#d084d0', '#ffb347', '#87ceeb',
];

const CHART_COLORS = {
  primary: '#3b82f6',
  secondary: '#10b981',
  accent: '#f59e0b',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DashboardV2() {
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [categoryData, setCategoryData] = useState<CategorySpending[]>([]);
  const [merchantData, setMerchantData] = useState<MerchantSpending[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [categoryTimeSeriesData, setCategoryTimeSeriesData] = useState<CategoryTimeSeriesData[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>({
    onlySpending: true,
  });
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [merchantSearch, setMerchantSearch] = useState<string>('');
  const [timeGranularity, setTimeGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [timeViewMode, setTimeViewMode] = useState<'total' | 'byCategory'>('total');

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [paginatedTransactions, setPaginatedTransactions] = useState<TransactionRow[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;

  // ============================================================================
  // LOAD DATA
  // ============================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const activeFilters: DashboardFilters = {
        ...filters,
        startDate: dateRange.start,
        endDate: dateRange.end,
        category: selectedCategory || undefined,
        merchant: merchantSearch || undefined,
      };

      // Load all data in parallel
      const [
        metricsResult,
        categoryResult,
        merchantResult,
        timeSeriesResult,
        categoryTimeSeriesResult,
        recentResult,
        categoriesResult,
      ] = await Promise.all([
        getDashboardMetrics(activeFilters),
        getSpendingByCategory(activeFilters),
        getTopMerchants(20, activeFilters),
        getSpendingOverTime(timeGranularity, activeFilters),
        getSpendingByCategoryOverTime(timeGranularity, activeFilters),
        getRecentTransactions(50, activeFilters),
        getAvailableCategories(),
      ]);

      setMetrics(metricsResult);
      setCategoryData(categoryResult);
      setMerchantData(merchantResult);
      setTimeSeriesData(timeSeriesResult);
      setCategoryTimeSeriesData(categoryTimeSeriesResult);
      setRecentTransactions(recentResult);
      setAvailableCategories(categoriesResult);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [filters, dateRange, selectedCategory, merchantSearch, timeGranularity]);

  const loadPaginatedData = useCallback(async () => {
    try {
      const activeFilters: DashboardFilters = {
        ...filters,
        startDate: dateRange.start,
        endDate: dateRange.end,
        category: selectedCategory || undefined,
        merchant: merchantSearch || undefined,
      };

      const result = await getPaginatedTransactions(currentPage, pageSize, activeFilters);
      setPaginatedTransactions(result.transactions);
      setTotalTransactions(result.total);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Error loading paginated transactions:', e);
    }
  }, [filters, dateRange, selectedCategory, merchantSearch, currentPage]);

  // Load merchant suggestions for autocomplete
  const loadMerchantSuggestions = useCallback(async (search: string) => {
    if (search.length < 2) {
      setMerchantSuggestions([]);
      return;
    }
    try {
      const merchants = await getAvailableMerchants(search);
      setMerchantSuggestions(merchants.slice(0, 10)); // Limit to 10 for dropdown
    } catch (e) {
      console.error('Error loading merchants:', e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load paginated data when page changes
  useEffect(() => {
    loadPaginatedData();
  }, [loadPaginatedData]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value || undefined }));
    setCurrentPage(0); // Reset pagination
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(0);
  };

  const handleMerchantSearchChange = (search: string) => {
    setMerchantSearch(search);
    setCurrentPage(0);
    loadMerchantSuggestions(search);
  };

  const handleClearFilters = () => {
    setDateRange({});
    setSelectedCategory('');
    setMerchantSearch('');
    setCurrentPage(0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading && !metrics) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h2 className="text-red-800 font-semibold mb-2">Error Loading Dashboard</h2>
          <p className="text-red-600">{error}</p>
          <button
            onClick={loadData}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Transaction Dashboard</h1>
          <p className="text-gray-600">View your spending patterns and transaction insights</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={dateRange.start || ''}
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={dateRange.end || ''}
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            {/* Merchant Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Merchant
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={merchantSearch}
                  onChange={(e) => handleMerchantSearchChange(e.target.value)}
                  placeholder="Search merchants..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
                {merchantSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {merchantSuggestions.map((merchant) => (
                      <button
                        key={merchant}
                        onClick={() => {
                          setMerchantSearch(merchant);
                          setMerchantSuggestions([]);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                      >
                        {merchant}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filters.onlySpending !== false}
                onChange={(e) => setFilters(prev => ({ ...prev, onlySpending: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Only spending transactions</span>
            </label>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Time View:</label>
              <select
                value={timeGranularity}
                onChange={(e) => setTimeGranularity(e.target.value as 'monthly' | 'weekly')}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Spending</p>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(metrics.totalSpending)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
            <p className="text-3xl font-bold text-gray-900">{metrics.totalTransactions.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Categories</p>
            <p className="text-3xl font-bold text-gray-900">{metrics.categoriesCovered}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Avg Transaction</p>
            <p className="text-3xl font-bold text-gray-900">{formatCurrency(metrics.averageTransaction)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Uncategorized</p>
            <p className="text-3xl font-bold text-yellow-600">{metrics.uncategorizedCount.toLocaleString()}</p>
          </div>
        </div>

        {/* Spending Over Time - Full Width Line Chart */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Spending Over Time</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimeViewMode('total')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    timeViewMode === 'total'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Total
                </button>
                <button
                  onClick={() => setTimeViewMode('byCategory')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    timeViewMode === 'byCategory'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  By Category
                </button>
              </div>
            </div>
            {timeViewMode === 'total' ? (
              timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelStyle={{ color: '#374151' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      name="Total Spending"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  No data available
                </div>
              )
            ) : categoryTimeSeriesData.length > 0 ? (
              (() => {
                // Get all unique categories from the time series data (excluding 'period')
                const categories = categoryTimeSeriesData.length > 0
                  ? Object.keys(categoryTimeSeriesData[0]).filter(key => key !== 'period')
                  : [];
                // Limit to top 10 categories by total spending for readability
                const topCategories = categories
                  .map(cat => ({
                    name: cat,
                    total: categoryTimeSeriesData.reduce((sum, d) => sum + (Number(d[cat]) || 0), 0),
                  }))
                  .sort((a, b) => b.total - a.total)
                  .slice(0, 10)
                  .map(c => c.name);

                return (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={categoryTimeSeriesData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelStyle={{ color: '#374151' }}
                      />
                      <Legend />
                      {topCategories.map((cat, idx) => (
                        <Line
                          key={cat}
                          type="monotone"
                          dataKey={cat}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          name={cat}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                );
              })()
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>

        {/* Spending by Category and Top Merchants - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Spending by Category - Bar Chart */}
          <div className="bg-white rounded-lg shadow px-6 pt-6 pb-2">
            <h2 className="text-xl font-semibold mb-4">Spending by Category</h2>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={450}>
                <BarChart data={categoryData} margin={{ left: 10, right: 10, top: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
                    angle={-45}
                    textAnchor="end"
                    height={100}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis tickFormatter={(value) => `$${value.toLocaleString()}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ color: '#374151' }}
                  />
                  <Bar dataKey="total" fill={CHART_COLORS.primary} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[450px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>

          {/* Top Merchants */}
          <div className="bg-white rounded-lg shadow px-6 pt-6 pb-2">
            <h2 className="text-xl font-semibold mb-4">Top Merchants</h2>
            {merchantData.length > 0 ? (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {merchantData.map((merchant, idx) => (
                  <div
                    key={merchant.merchant}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{merchant.merchant}</p>
                      <p className="text-xs text-gray-600">
                        {merchant.count} transactions • Avg: {formatCurrency(merchant.average)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(merchant.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Transactions</h2>
            <div className="text-sm text-gray-600">
              Showing {paginatedTransactions.length} of {totalTransactions.toLocaleString()}
            </div>
          </div>
          {loading && paginatedTransactions.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : paginatedTransactions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Merchant
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Notes
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTransactions.map((transaction) => (
                      <tr key={transaction.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(transaction.date)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{transaction.merchant}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                          {formatCurrency(transaction.amount)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {transaction.category ? (
                            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                              {transaction.category}
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                              Uncategorized
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {transaction.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                  disabled={currentPage === 0}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {currentPage + 1} of {Math.ceil(totalTransactions / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  disabled={!hasMore}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              No transactions found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

