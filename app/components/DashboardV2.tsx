'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  updateTransactionCategory,
  bulkUpdateTransactionCategories,
  getAllCategories,
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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pendingSelectedCategories, setPendingSelectedCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [merchantSearch, setMerchantSearch] = useState<string>('');
  const [timeGranularity, setTimeGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [timeViewMode, setTimeViewMode] = useState<'total' | 'byCategory'>('total');
  const [timeMetricType, setTimeMetricType] = useState<'amount' | 'count'>('amount');

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [paginatedTransactions, setPaginatedTransactions] = useState<TransactionRow[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 50;
  
  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set());
  const [editedCategories, setEditedCategories] = useState<Map<number, string | null>>(new Map());
  const [allCategories, setAllCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkEditCategory, setBulkEditCategory] = useState<string>('');
  const [cancelConfirmModalOpen, setCancelConfirmModalOpen] = useState(false);
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const actionDropdownRef = useRef<HTMLDivElement>(null);

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
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
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
        getSpendingByCategoryOverTime(timeGranularity, activeFilters, timeMetricType),
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
  }, [filters, dateRange, selectedCategories, merchantSearch, timeGranularity, timeMetricType]);

  const loadPaginatedData = useCallback(async () => {
    try {
      const activeFilters: DashboardFilters = {
        startDate: dateRange.start,
        endDate: dateRange.end,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        merchant: merchantSearch || undefined,
        onlySpending: false, // Show all transactions (including credits/payments) in the table
      };

      const result = await getPaginatedTransactions(currentPage, pageSize, activeFilters, sortColumn, sortDirection);
      setPaginatedTransactions(result.transactions);
      setTotalTransactions(result.total);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Error loading paginated transactions:', e);
    }
  }, [filters, dateRange, selectedCategories, merchantSearch, currentPage, sortColumn, sortDirection]);

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

  // Load all categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await getAllCategories();
        setAllCategories(categories);
      } catch (e) {
        console.error('Error loading categories:', e);
      }
    };
    loadCategories();
  }, []);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setCategoryDropdownOpen(false);
      }
      if (
        actionDropdownRef.current &&
        !actionDropdownRef.current.contains(event.target as Node)
      ) {
        setActionDropdownOpen(false);
      }
    };

    if (categoryDropdownOpen || actionDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryDropdownOpen, actionDropdownOpen]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value || undefined }));
    setCurrentPage(0); // Reset pagination
  };

  const handleCategoryToggle = (category: string) => {
    setPendingSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleSelectAllCategories = () => {
    if (pendingSelectedCategories.length === availableCategories.length) {
      setPendingSelectedCategories([]);
    } else {
      setPendingSelectedCategories([...availableCategories]);
    }
  };

  const handleApplyCategoryFilter = () => {
    setSelectedCategories(pendingSelectedCategories);
    setCurrentPage(0);
    setCategoryDropdownOpen(false);
  };

  const handleResetCategoryFilter = () => {
    setPendingSelectedCategories([]);
    setSelectedCategories([]);
    setCurrentPage(0);
    setCategoryDropdownOpen(false);
  };

  const handleMerchantSearchChange = (search: string) => {
    setMerchantSearch(search);
    setCurrentPage(0);
    loadMerchantSuggestions(search);
  };

  const handleClearFilters = () => {
    setDateRange({});
    setSelectedCategories([]);
    setPendingSelectedCategories([]);
    setMerchantSearch('');
    setCurrentPage(0);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to descending
      setSortColumn(column);
      setSortDirection('desc');
    }
    setCurrentPage(0); // Reset to first page when sorting changes
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
  // EDIT MODE HANDLERS
  // ============================================================================

  const handleToggleSelectAll = () => {
    if (selectedTransactionIds.size === paginatedTransactions.length) {
      setSelectedTransactionIds(new Set());
    } else {
      setSelectedTransactionIds(new Set(paginatedTransactions.map(t => t.id)));
    }
  };

  const handleToggleTransaction = (transactionId: number) => {
    setSelectedTransactionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

  const handleEnterEditMode = () => {
    setIsEditMode(true);
    setEditedCategories(new Map());
    setActionDropdownOpen(false);
  };

  const handleEnterBulkEditMode = () => {
    if (selectedTransactionIds.size === 0) {
      setSaveMessage({ type: 'error', text: 'Please select at least one transaction' });
      setTimeout(() => setSaveMessage(null), 3000);
      setActionDropdownOpen(false);
      return;
    }
    setBulkEditCategory('');
    setBulkEditModalOpen(true);
    setActionDropdownOpen(false);
  };

  const handleCategoryChange = (transactionId: number, category: string | null) => {
    setEditedCategories(prev => {
      const newMap = new Map(prev);
      newMap.set(transactionId, category);
      return newMap;
    });
  };

  const handleSave = async () => {
    if (editedCategories.size === 0) {
      setSaveMessage({ type: 'error', text: 'No changes to save' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updates = Array.from(editedCategories.entries()).map(([id, category]) =>
        updateTransactionCategory(id, category)
      );

      await Promise.all(updates);

      setSaveMessage({ type: 'success', text: `Successfully updated ${editedCategories.size} transaction(s)` });
      setIsEditMode(false);
      setEditedCategories(new Map());
      setSelectedTransactionIds(new Set());
      
      // Reload data
      await loadPaginatedData();
      
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save changes' 
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setCancelConfirmModalOpen(true);
  };

  const handleConfirmCancel = () => {
    setIsEditMode(false);
    setEditedCategories(new Map());
    setCancelConfirmModalOpen(false);
  };

  const handleBulkEditSave = async (category: string) => {
    if (selectedTransactionIds.size === 0) {
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setBulkEditModalOpen(false);

    try {
      const result = await bulkUpdateTransactionCategories(
        Array.from(selectedTransactionIds),
        category
      );

      if (result.success) {
        setSaveMessage({ 
          type: 'success', 
          text: `Successfully updated ${result.updated} transaction(s)` 
        });
        setSelectedTransactionIds(new Set());
        
        // Reload data
        await loadPaginatedData();
        
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        setSaveMessage({ type: 'error', text: result.error || 'Failed to update transactions' });
        setTimeout(() => setSaveMessage(null), 5000);
      }
    } catch (error) {
      setSaveMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to save changes' 
      });
      setTimeout(() => setSaveMessage(null), 5000);
    } finally {
      setIsSaving(false);
    }
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
            {/* Category Filter - Multi-select */}
            <div className="relative" ref={categoryDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categories
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!categoryDropdownOpen) {
                    // Initialize pending selections with current selections when opening
                    setPendingSelectedCategories(selectedCategories);
                  }
                  setCategoryDropdownOpen(!categoryDropdownOpen);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between"
              >
                <span className="text-gray-700">
                  {selectedCategories.length === 0
                    ? 'All Categories'
                    : selectedCategories.length === 1
                    ? selectedCategories[0]
                    : `${selectedCategories.length} selected`}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    categoryDropdownOpen ? 'transform rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
              {categoryDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg flex flex-col max-h-96">
                  <div className="p-2 border-b border-gray-200 flex-shrink-0">
                    <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={pendingSelectedCategories.length === availableCategories.length && availableCategories.length > 0}
                        onChange={handleSelectAllCategories}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Select All
                      </span>
                    </label>
                  </div>
                  <div className="p-2 overflow-y-auto flex-1 min-h-0">
                    {availableCategories.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={pendingSelectedCategories.includes(cat)}
                          onChange={() => handleCategoryToggle(cat)}
                          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700">{cat}</span>
                      </label>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
                    <button
                      onClick={handleResetCategoryFilter}
                      className="flex-1 px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleApplyCategoryFilter}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Show results
                    </button>
                  </div>
                </div>
              )}
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
                <select
                  value={timeMetricType}
                  onChange={(e) => setTimeMetricType(e.target.value as 'amount' | 'count')}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="amount">$ Amount</option>
                  <option value="count"># Transactions</option>
                </select>
                <select
                  value={timeViewMode}
                  onChange={(e) => setTimeViewMode(e.target.value as 'total' | 'byCategory')}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="total">Total</option>
                  <option value="byCategory">By Category</option>
                </select>
              </div>
            </div>
            {timeViewMode === 'total' ? (
              timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis 
                      tickFormatter={(value) => 
                        timeMetricType === 'amount' 
                          ? `$${value.toLocaleString()}` 
                          : value.toLocaleString()
                      } 
                    />
                    <Tooltip
                      formatter={(value: number) => 
                        timeMetricType === 'amount' 
                          ? formatCurrency(value)
                          : `${value.toLocaleString()} transactions`
                      }
                      labelStyle={{ color: '#374151' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={timeMetricType === 'amount' ? 'total' : 'count'}
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      name={timeMetricType === 'amount' ? 'Total Spending' : 'Transaction Count'}
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
                // Limit to top 10 categories by total spending/transactions for readability
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
                      <YAxis 
                        tickFormatter={(value) => 
                          timeMetricType === 'amount' 
                            ? `$${value.toLocaleString()}` 
                            : value.toLocaleString()
                        } 
                      />
                      <Tooltip
                        formatter={(value: number) => 
                          timeMetricType === 'amount' 
                            ? formatCurrency(value)
                            : `${value.toLocaleString()} transactions`
                        }
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
          <div className="bg-white rounded-lg shadow px-6 pt-6 pb-2 flex flex-col h-full">
            <h2 className="text-xl font-semibold mb-4">Spending by Category</h2>
            {categoryData.length > 0 ? (
              <div className="flex-1 min-h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} margin={{ left: 0, right: 10, top: 5, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="category"
                    angle={-45}
                    textAnchor="end"
                    height={80}
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
              </div>
            ) : (
              <div className="flex-1 min-h-[400px] flex items-center justify-center text-gray-500">
                No data available
              </div>
            )}
          </div>

          {/* Top Merchants */}
          <div className="bg-white rounded-lg shadow px-6 pt-6 pb-2 flex flex-col h-full">
            <h2 className="text-xl font-semibold mb-4">Top Merchants</h2>
            {merchantData.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-[400px]">
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

        {/* All Transactions Table */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">All Transactions</h2>
            <div className="flex items-center gap-4">
              {!isEditMode ? (
                <div className="relative" ref={actionDropdownRef}>
                  <button
                    onClick={() => setActionDropdownOpen(!actionDropdownOpen)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-1"
                  >
                    Edit Categories
                    <svg
                      className={`w-4 h-4 transition-transform ${actionDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {actionDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-10 border border-gray-200">
                      <button
                        onClick={handleEnterEditMode}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handleEnterBulkEditMode}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        Bulk Edit
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || editedCategories.size === 0}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
          {loading && paginatedTransactions.length === 0 ? (
            <div className="h-64 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : paginatedTransactions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full divide-y divide-gray-200 table-fixed">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        className="px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        style={{ width: '5%' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTransactionIds.size === paginatedTransactions.length && paginatedTransactions.length > 0}
                          onChange={handleToggleSelectAll}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th
                        onClick={() => handleSort('date')}
                        className="px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        style={{ width: '12%' }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="flex-1">Date</span>
                          <span className="w-4 text-center flex-shrink-0">
                            {sortColumn === 'date' && (
                              <span className="text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('merchant')}
                        className="px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        style={{ width: '35%' }}
                      >
                        <div className="flex items-center gap-1 w-full">
                          <span className="flex-1">Merchant</span>
                          <span className="w-4 text-center flex-shrink-0">
                            {sortColumn === 'merchant' && (
                              <span className="text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('amount')}
                        className="px-4 md:px-6 lg:px-8 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        style={{ width: '15%' }}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span className="flex-1 text-right">Amount</span>
                          <span className="w-4 text-center flex-shrink-0">
                            {sortColumn === 'amount' && (
                              <span className="text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={() => handleSort('category')}
                        className="px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                        style={{ width: '20%' }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="flex-1">Category</span>
                          <span className="w-4 text-center flex-shrink-0">
                            {sortColumn === 'category' && (
                              <span className="text-blue-600">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </span>
                        </div>
                      </th>
                      <th
                        className="px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                        style={{ width: '20%' }}
                      >
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTransactions.map((transaction) => {
                      const editedCategory = editedCategories.get(transaction.id);
                      const displayCategory = editedCategory !== undefined 
                        ? editedCategory 
                        : transaction.category;
                      
                      return (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedTransactionIds.has(transaction.id)}
                              onChange={() => handleToggleTransaction(transaction.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm text-gray-900 overflow-hidden text-ellipsis">{transaction.merchant}</td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                            {formatCurrency(transaction.amount)}
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap">
                            {isEditMode ? (
                              <select
                                value={displayCategory || ''}
                                onChange={(e) => handleCategoryChange(transaction.id, e.target.value || null)}
                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">Uncategorized</option>
                                {allCategories.map((cat) => (
                                  <option key={cat.id} value={cat.name}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              displayCategory ? (
                                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                  {displayCategory}
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                  Uncategorized
                                </span>
                              )
                            )}
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm text-gray-600">
                            {transaction.sourceFilename ? (
                              <span className="text-xs">
                                {transaction.sourceFilename.startsWith('Chase') ? 'Chase' :
                                 transaction.sourceFilename.startsWith('Amex') ? 'Amex' :
                                 transaction.sourceFilename}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
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

      {/* Bulk Edit Modal */}
      {bulkEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Bulk Edit Categories</h3>
            <p className="text-sm text-gray-600 mb-4">
              Updating {selectedTransactionIds.size} transaction(s)
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={bulkEditCategory}
                onChange={(e) => setBulkEditCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select a category</option>
                {allCategories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBulkEditModalOpen(false);
                  setBulkEditCategory('');
                }}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (bulkEditCategory) {
                    handleBulkEditSave(bulkEditCategory);
                  }
                }}
                disabled={isSaving || !bulkEditCategory}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirmModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Cancel Changes?</h3>
            <p className="text-sm text-gray-600 mb-4">
              You have unsaved changes. Are you sure you want to cancel? All changes will be lost.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancelConfirmModalOpen(false)}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Keep Editing
              </button>
              <button
                onClick={handleConfirmCancel}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Cancel Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {saveMessage && (
        <div className="fixed bottom-4 left-4 z-50 animate-in slide-in-from-bottom-5">
          <div className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 min-w-[300px] ${
            saveMessage.type === 'success' 
              ? 'bg-green-600 text-white' 
              : 'bg-red-600 text-white'
          }`}>
            {saveMessage.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span className="flex-1 text-sm font-medium">{saveMessage.text}</span>
            <button
              onClick={() => setSaveMessage(null)}
              className="text-white hover:text-gray-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

