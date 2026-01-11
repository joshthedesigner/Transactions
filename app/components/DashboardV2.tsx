'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

// ============================================================================
// DEBOUNCE HOOK
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
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
  updateTransactionSecondaryCategory,
  bulkUpdateTransactionCategories,
  bulkUpdateTransactionSecondaryCategories,
  getAllCategories,
  getAvailableSecondaryCategories,
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
  
  // Per-section loading states
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [categoryDataLoading, setCategoryDataLoading] = useState(true);
  const [merchantDataLoading, setMerchantDataLoading] = useState(true);
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(true);
  const [categoryTimeSeriesLoading, setCategoryTimeSeriesLoading] = useState(true);
  const [recentTransactionsLoading, setRecentTransactionsLoading] = useState(true);
  const [paginatedTransactionsLoading, setPaginatedTransactionsLoading] = useState(false);
  
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [categoryData, setCategoryData] = useState<CategorySpending[]>([]);
  const [merchantData, setMerchantData] = useState<MerchantSpending[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [categoryTimeSeriesData, setCategoryTimeSeriesData] = useState<CategoryTimeSeriesData[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<TransactionRow[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [merchantSuggestions, setMerchantSuggestions] = useState<string[]>([]);
  
  // Track if categories have been loaded (don't reload on filter changes)
  const categoriesLoadedRef = useRef(false);
  const secondaryCategoriesLoadedRef = useRef(false);
  
  // Track date input values at focus time to prevent browser auto-fill from triggering filters
  // Store the value when input is focused, only apply filter on blur if value changed
  const dateInputValueOnFocus = useRef<{start?: string, end?: string}>({});

  // Filters
  const [filters, setFilters] = useState<DashboardFilters>({
    onlySpending: true,
  });
  // Separate display state (for visual feedback) from filter state (for actual filtering)
  const [dateRangeDisplay, setDateRangeDisplay] = useState<{ start?: string; end?: string }>({});
  const [dateRangeFilter, setDateRangeFilter] = useState<{ start?: string; end?: string }>({});
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pendingSelectedCategories, setPendingSelectedCategories] = useState<string[]>([]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSecondaryCategories, setSelectedSecondaryCategories] = useState<string[]>([]);
  const [pendingSelectedSecondaryCategories, setPendingSelectedSecondaryCategories] = useState<string[]>([]);
  const [secondaryCategoryDropdownOpen, setSecondaryCategoryDropdownOpen] = useState(false);
  const secondaryCategoryDropdownRef = useRef<HTMLDivElement>(null);
  const [availableSecondaryCategories, setAvailableSecondaryCategories] = useState<string[]>([]);
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [merchantInputValue, setMerchantInputValue] = useState<string>('');
  const merchantDropdownRef = useRef<HTMLDivElement>(null);
  
  // Debounced filter values for data loading (must be after all state declarations)
  // Only debounce the filter state, not the display state
  const debouncedDateRange = useDebounce(dateRangeFilter, 400);
  const debouncedSelectedCategories = useDebounce(selectedCategories, 400);
  const debouncedSelectedSecondaryCategories = useDebounce(selectedSecondaryCategories, 400);
  const debouncedSelectedMerchants = useDebounce(selectedMerchants, 400);
  const [timeGranularity, setTimeGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [timeViewMode, setTimeViewMode] = useState<'total' | 'byCategory'>('total');
  const [timeMetricType, setTimeMetricType] = useState<'amount' | 'count'>('amount');
  const [categoryType, setCategoryType] = useState<'primary' | 'secondary'>('primary');
  const [timeCategoryType, setTimeCategoryType] = useState<'primary' | 'secondary'>('primary');

  // Pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [paginatedTransactions, setPaginatedTransactions] = useState<TransactionRow[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 25;
  
  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set());
  const [editedCategories, setEditedCategories] = useState<Map<number, string | null>>(new Map());
  const [editedSecondaryCategories, setEditedSecondaryCategories] = useState<Map<number, string | null>>(new Map());
  const [allCategories, setAllCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkEditCategory, setBulkEditCategory] = useState<string>('');
  const [bulkEditSecondaryCategory, setBulkEditSecondaryCategory] = useState<string | null>(null);
  const [bulkEditSecondaryCategoryIsNew, setBulkEditSecondaryCategoryIsNew] = useState(false);
  const [secondaryTagModalOpen, setSecondaryTagModalOpen] = useState(false);
  const [secondaryTagModalTransactionId, setSecondaryTagModalTransactionId] = useState<number | null>(null);
  const [secondaryTagModalNewTag, setSecondaryTagModalNewTag] = useState<string>('');
  const [secondaryTagModalSelectedTag, setSecondaryTagModalSelectedTag] = useState<string>('');
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
      
      // Set per-section loading states
      setMetricsLoading(true);
      setCategoryDataLoading(true);
      setMerchantDataLoading(true);
      setTimeSeriesLoading(true);
      setCategoryTimeSeriesLoading(true);
      setRecentTransactionsLoading(true);

      const activeFilters: DashboardFilters = {
        ...filters,
        startDate: debouncedDateRange.start,
        endDate: debouncedDateRange.end,
        categories: debouncedSelectedCategories.length > 0 ? debouncedSelectedCategories : undefined,
        secondaryCategories: debouncedSelectedSecondaryCategories.length > 0 ? debouncedSelectedSecondaryCategories : undefined,
        merchants: debouncedSelectedMerchants.length > 0 ? debouncedSelectedMerchants : undefined,
      };

      // Load filter-dependent data in parallel
      const dataPromises = [
        getDashboardMetrics(activeFilters).then(result => {
          setMetrics(result);
          setMetricsLoading(false);
          return result;
        }),
        getSpendingByCategory(activeFilters, categoryType).then(result => {
          setCategoryData(result);
          setCategoryDataLoading(false);
          return result;
        }),
        getTopMerchants(20, activeFilters).then(result => {
          setMerchantData(result);
          setMerchantDataLoading(false);
          return result;
        }),
        getSpendingOverTime(timeGranularity, activeFilters).then(result => {
          setTimeSeriesData(result);
          setTimeSeriesLoading(false);
          return result;
        }),
        getSpendingByCategoryOverTime(timeGranularity, activeFilters, timeMetricType, timeCategoryType).then(result => {
          setCategoryTimeSeriesData(result);
          setCategoryTimeSeriesLoading(false);
          return result;
        }),
        getRecentTransactions(50, activeFilters).then(result => {
          setRecentTransactions(result);
          setRecentTransactionsLoading(false);
          return result;
        }),
      ];

      // Load category lists only if not already loaded (they don't depend on filters)
      const categoryPromises: Promise<any>[] = [];
      if (!categoriesLoadedRef.current) {
        categoryPromises.push(
          getAvailableCategories().then(result => {
            setAvailableCategories(result);
            categoriesLoadedRef.current = true;
            return result;
          })
        );
      }
      if (!secondaryCategoriesLoadedRef.current) {
        categoryPromises.push(
          getAvailableSecondaryCategories().then(result => {
            setAvailableSecondaryCategories(result);
            secondaryCategoriesLoadedRef.current = true;
            return result;
          })
        );
      }

      // Wait for all promises
      await Promise.all([...dataPromises, ...categoryPromises]);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data');
      // Reset loading states on error
      setMetricsLoading(false);
      setCategoryDataLoading(false);
      setMerchantDataLoading(false);
      setTimeSeriesLoading(false);
      setCategoryTimeSeriesLoading(false);
      setRecentTransactionsLoading(false);
    } finally {
      setLoading(false);
    }
  }, [filters, debouncedDateRange, debouncedSelectedCategories, debouncedSelectedSecondaryCategories, debouncedSelectedMerchants, timeGranularity, timeViewMode, timeMetricType, categoryType, timeCategoryType]);

  const loadPaginatedData = useCallback(async () => {
    try {
      setPaginatedTransactionsLoading(true);
      const activeFilters: DashboardFilters = {
        startDate: debouncedDateRange.start,
        endDate: debouncedDateRange.end,
        categories: debouncedSelectedCategories.length > 0 ? debouncedSelectedCategories : undefined,
        secondaryCategories: debouncedSelectedSecondaryCategories.length > 0 ? debouncedSelectedSecondaryCategories : undefined,
        merchants: debouncedSelectedMerchants.length > 0 ? debouncedSelectedMerchants : undefined,
        onlySpending: false, // Show all transactions (including credits/payments) in the table
      };

      const result = await getPaginatedTransactions(currentPage, pageSize, activeFilters, sortColumn, sortDirection);
      setPaginatedTransactions(result.transactions);
      setTotalTransactions(result.total);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Error loading paginated transactions:', e);
    } finally {
      setPaginatedTransactionsLoading(false);
    }
  }, [filters, debouncedDateRange, debouncedSelectedCategories, debouncedSelectedSecondaryCategories, debouncedSelectedMerchants, currentPage, sortColumn, sortDirection]);

  // Debounced merchant input for suggestions
  const debouncedMerchantInput = useDebounce(merchantInputValue, 250);
  
  // Load merchant suggestions for autocomplete (debounced)
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
  
  // Load suggestions when debounced input changes
  useEffect(() => {
    loadMerchantSuggestions(debouncedMerchantInput);
  }, [debouncedMerchantInput, loadMerchantSuggestions]);

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
        secondaryCategoryDropdownRef.current &&
        !secondaryCategoryDropdownRef.current.contains(event.target as Node)
      ) {
        setSecondaryCategoryDropdownOpen(false);
      }
      if (
        actionDropdownRef.current &&
        !actionDropdownRef.current.contains(event.target as Node)
      ) {
        setActionDropdownOpen(false);
      }
      if (
        merchantDropdownRef.current &&
        !merchantDropdownRef.current.contains(event.target as Node)
      ) {
        setMerchantSuggestions([]);
      }
    };

    if (categoryDropdownOpen || secondaryCategoryDropdownOpen || actionDropdownOpen || merchantSuggestions.length > 0) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryDropdownOpen, secondaryCategoryDropdownOpen, actionDropdownOpen, merchantSuggestions.length]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  // Handle date input focus - store current value to compare on blur
  const handleDateRangeFocus = (field: 'start' | 'end') => {
    // Store the display value when user focuses the input
    // This is what we'll compare against on blur
    dateInputValueOnFocus.current[field] = dateRangeDisplay[field] || '';
  };

  // Handle date input blur - only apply filter if value actually changed
  const handleDateRangeBlur = (field: 'start' | 'end', value: string) => {
    const valueOnFocus = dateInputValueOnFocus.current[field] || '';
    const newValue = value || '';
    
    // Only update filter state if value changed from when user focused the input
    // This prevents browser auto-fill from triggering filters
    if (newValue !== valueOnFocus) {
      const currentFilterValue = dateRangeFilter[field];
      const finalValue = newValue || undefined;
      
      if (finalValue && finalValue !== currentFilterValue) {
        // User selected a new date - update filter state (triggers data load via debounce)
        setDateRangeFilter(prev => ({ ...prev, [field]: finalValue }));
        setCurrentPage(0); // Reset pagination
        // Clear transactions to show loading state (will be debounced)
        setPaginatedTransactions([]);
      } else if (!finalValue && currentFilterValue) {
        // User cleared the date - update filter state
        setDateRangeFilter(prev => ({ ...prev, [field]: undefined }));
        setCurrentPage(0);
        setPaginatedTransactions([]);
      }
    }
    // If value didn't change, do nothing - prevents auto-fill triggers
  };

  // Handle date input change - update display value only (for visual feedback)
  // This does NOT trigger data load - filter state only updates on blur
  const handleDateRangeChange = (field: 'start' | 'end', value: string) => {
    // Update display state immediately for visual feedback
    // This does NOT trigger debounce or data load
    const newValue = value || undefined;
    const currentDisplayValue = dateRangeDisplay[field];
    
    // Only update display value if it's different (prevents unnecessary re-renders)
    if (newValue !== currentDisplayValue) {
      setDateRangeDisplay(prev => ({ ...prev, [field]: newValue }));
    }
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
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleResetCategoryFilter = () => {
    setPendingSelectedCategories([]);
    setSelectedCategories([]);
    setCurrentPage(0);
    setCategoryDropdownOpen(false);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleMerchantInputChange = (value: string) => {
    setMerchantInputValue(value);
    // Suggestions will load automatically via debounced effect
  };

  const handleMerchantSelect = (merchant: string) => {
    if (!selectedMerchants.includes(merchant)) {
      setSelectedMerchants(prev => [...prev, merchant]);
    }
    setMerchantInputValue('');
    setMerchantSuggestions([]);
    setCurrentPage(0);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleMerchantRemove = (merchant: string) => {
    setSelectedMerchants(prev => prev.filter(m => m !== merchant));
    setCurrentPage(0);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleClearMerchantInput = () => {
    setMerchantInputValue('');
    setMerchantSuggestions([]);
  };

  const handleClearFilters = () => {
    setDateRangeDisplay({});
    setDateRangeFilter({});
    setSelectedCategories([]);
    setPendingSelectedCategories([]);
    setSelectedSecondaryCategories([]);
    setPendingSelectedSecondaryCategories([]);
    setSelectedMerchants([]);
    setMerchantInputValue('');
    setCurrentPage(0);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
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

  const handleEnterBulkEditMode = async () => {
    if (selectedTransactionIds.size === 0) {
      setSaveMessage({ type: 'error', text: 'Please select at least one transaction' });
      setTimeout(() => setSaveMessage(null), 3000);
      setActionDropdownOpen(false);
      return;
    }
    
    // Ensure secondary categories are loaded
    if (availableSecondaryCategories.length === 0) {
      try {
        const secondaryCategories = await getAvailableSecondaryCategories();
        setAvailableSecondaryCategories(secondaryCategories);
      } catch (e) {
        console.error('Error loading secondary categories:', e);
      }
    }
    
    // Get selected transactions from current page
    const selectedTransactions = paginatedTransactions.filter(t => 
      selectedTransactionIds.has(t.id)
    );
    
    // Check for common primary category
    const primaryCategories = new Set(
      selectedTransactions.map(t => t.category).filter(Boolean)
    );
    const commonPrimaryCategory = primaryCategories.size === 1 
      ? Array.from(primaryCategories)[0] 
      : '';
    
    // Check for common secondary category
    const secondaryCategories = new Set(
      selectedTransactions.map(t => t.secondaryCategory).filter(Boolean)
    );
    const commonSecondaryCategory = secondaryCategories.size === 1 
      ? Array.from(secondaryCategories)[0] 
      : null;
    
    // Pre-populate fields
    setBulkEditCategory(commonPrimaryCategory);
    setBulkEditSecondaryCategory(commonSecondaryCategory);
    setBulkEditSecondaryCategoryIsNew(false);
    
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
    if (editedCategories.size === 0 && editedSecondaryCategories.size === 0) {
      setSaveMessage({ type: 'error', text: 'No changes to save' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const updates: Promise<void>[] = [];
      
      // Update primary categories
      Array.from(editedCategories.entries()).forEach(([id, category]) => {
        updates.push(updateTransactionCategory(id, category));
      });
      
      // Update secondary categories
      Array.from(editedSecondaryCategories.entries()).forEach(([id, secondaryCategory]) => {
        updates.push(updateTransactionSecondaryCategory(id, secondaryCategory));
      });

      await Promise.all(updates);

      const totalUpdates = editedCategories.size + editedSecondaryCategories.size;
      setSaveMessage({ type: 'success', text: `Successfully updated ${totalUpdates} transaction(s)` });
      setIsEditMode(false);
      setEditedCategories(new Map());
      setEditedSecondaryCategories(new Map());
      setSelectedTransactionIds(new Set());
      
      // Reload data and refresh secondary categories list
      await loadPaginatedData();
      const secondaryCategories = await getAvailableSecondaryCategories();
      setAvailableSecondaryCategories(secondaryCategories);
      
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
    setEditedSecondaryCategories(new Map());
    setCancelConfirmModalOpen(false);
  };

  // Secondary category modal handlers
  const handleOpenSecondaryTagModal = (transactionId: number, currentSecondaryCategory: string | null) => {
    setSecondaryTagModalTransactionId(transactionId);
    setSecondaryTagModalSelectedTag(currentSecondaryCategory ? currentSecondaryCategory : 'no_category');
    setSecondaryTagModalNewTag('');
    setSecondaryTagModalOpen(true);
  };

  const handleAddSecondaryTag = () => {
    if (!secondaryTagModalTransactionId) return;

    const tagToSave = secondaryTagModalSelectedTag === 'create_new' 
      ? secondaryTagModalNewTag.trim()
      : secondaryTagModalSelectedTag === 'no_category'
      ? null
      : secondaryTagModalSelectedTag || null;

    if (secondaryTagModalSelectedTag === 'create_new' && !secondaryTagModalNewTag.trim()) {
      return; // Don't allow adding empty tag
    }

    // If creating a new category, add it to availableSecondaryCategories immediately
    if (secondaryTagModalSelectedTag === 'create_new' && tagToSave) {
      setAvailableSecondaryCategories(prev => {
        if (!prev.includes(tagToSave)) {
          return [...prev, tagToSave].sort();
        }
        return prev;
      });
    }

    // Update local state (will be saved when table Save button is clicked)
    setEditedSecondaryCategories(prev => {
      const newMap = new Map(prev);
      newMap.set(secondaryTagModalTransactionId, tagToSave);
      return newMap;
    });
    
    setSecondaryTagModalOpen(false);
    setSecondaryTagModalTransactionId(null);
    setSecondaryTagModalSelectedTag('');
    setSecondaryTagModalNewTag('');
  };

  // Secondary category filter handlers
  const handleSecondaryCategoryToggle = (category: string) => {
    setPendingSelectedSecondaryCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  const handleSelectAllSecondaryCategories = () => {
    const allOptions = ['__OTHER__', ...availableSecondaryCategories];
    if (pendingSelectedSecondaryCategories.length === allOptions.length) {
      setPendingSelectedSecondaryCategories([]);
    } else {
      setPendingSelectedSecondaryCategories([...allOptions]);
    }
  };

  const handleApplySecondaryCategoryFilter = () => {
    setSelectedSecondaryCategories(pendingSelectedSecondaryCategories);
    setCurrentPage(0);
    setSecondaryCategoryDropdownOpen(false);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleResetSecondaryCategoryFilter = () => {
    setPendingSelectedSecondaryCategories([]);
    setSelectedSecondaryCategories([]);
    setCurrentPage(0);
    setSecondaryCategoryDropdownOpen(false);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleBulkEditSave = async (category: string, secondaryCategory: string | null = null) => {
    if (selectedTransactionIds.size === 0) {
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setBulkEditModalOpen(false);

    try {
      const updates: Promise<{ success: boolean; updated: number; error?: string }>[] = [];
      
      // Update primary category
      if (category) {
        updates.push(bulkUpdateTransactionCategories(
          Array.from(selectedTransactionIds),
          category
        ));
      }
      
      // Update secondary category
      updates.push(bulkUpdateTransactionSecondaryCategories(
        Array.from(selectedTransactionIds),
        secondaryCategory
      ));

      const results = await Promise.all(updates);
      const allSuccess = results.every(r => r.success);
      const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);

      if (allSuccess) {
        setSaveMessage({ 
          type: 'success', 
          text: `Successfully updated ${totalUpdated} transaction(s)` 
        });
        setSelectedTransactionIds(new Set());
        
        // Reload data and refresh secondary categories list
        await loadPaginatedData();
        const secondaryCategories = await getAvailableSecondaryCategories();
        setAvailableSecondaryCategories(secondaryCategories);
        
        // Reset bulk edit state
        setBulkEditCategory('');
        setBulkEditSecondaryCategory(null);
        setBulkEditSecondaryCategoryIsNew(false);
        
        setTimeout(() => setSaveMessage(null), 3000);
      } else {
        const error = results.find(r => !r.success)?.error || 'Failed to update transactions';
        setSaveMessage({ type: 'error', text: error });
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

  // Determine if page is in initial loading state
  // Use loading state directly - it's only false when ALL data has finished loading
  const isInitialLoading = loading;
  
  // Show full loading screen only on initial load (when no metrics exist yet)
  if (loading && !metrics && metricsLoading) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Filters Sub-Nav */}
      <div className="sticky top-16 z-30 w-full bg-white border-b border-gray-200 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date Range */}
            <div className="w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={dateRangeDisplay.start || ''}
                onFocus={() => handleDateRangeFocus('start')}
                onBlur={(e) => handleDateRangeBlur('start', e.target.value)}
                onChange={(e) => handleDateRangeChange('start', e.target.value)}
                disabled={isInitialLoading}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={dateRangeDisplay.end || ''}
                onFocus={() => handleDateRangeFocus('end')}
                onBlur={(e) => handleDateRangeBlur('end', e.target.value)}
                onChange={(e) => handleDateRangeChange('end', e.target.value)}
                disabled={isInitialLoading}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            {/* Category Filter - Multi-select */}
            <div className="relative w-[200px]" ref={categoryDropdownRef}>
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
                disabled={isInitialLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="absolute z-40 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg flex flex-col max-h-96">
                  <div className="p-2 border-b border-gray-200 flex-shrink-0">
                    <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={pendingSelectedCategories.length === availableCategories.length && availableCategories.length > 0}
                        onChange={handleSelectAllCategories}
                        disabled={isInitialLoading}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
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
                          disabled={isInitialLoading}
                          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <span className="text-sm text-gray-700">{cat}</span>
                      </label>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
                    <button
                      onClick={handleResetCategoryFilter}
                      disabled={isInitialLoading}
                      className="flex-1 px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleApplyCategoryFilter}
                      disabled={isInitialLoading}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Filter
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Secondary Category Filter - Multi-select */}
            <div className="relative w-[200px]" ref={secondaryCategoryDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secondary Categories
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!secondaryCategoryDropdownOpen) {
                    // Initialize pending selections with current selections when opening
                    setPendingSelectedSecondaryCategories(selectedSecondaryCategories);
                  }
                  setSecondaryCategoryDropdownOpen(!secondaryCategoryDropdownOpen);
                }}
                disabled={isInitialLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 bg-white text-left flex items-center justify-between disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-gray-700">
                  {selectedSecondaryCategories.length === 0
                    ? 'All Categories'
                    : selectedSecondaryCategories.length === 1
                    ? selectedSecondaryCategories[0] === '__OTHER__' ? 'Other' : selectedSecondaryCategories[0]
                    : `${selectedSecondaryCategories.length} selected`}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    secondaryCategoryDropdownOpen ? 'transform rotate-180' : ''
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
              {secondaryCategoryDropdownOpen && (
                <div className="absolute z-40 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg flex flex-col max-h-96">
                  <div className="p-2 border-b border-gray-200 flex-shrink-0">
                    <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={pendingSelectedSecondaryCategories.length === (1 + availableSecondaryCategories.length) && (availableSecondaryCategories.length > 0 || pendingSelectedSecondaryCategories.includes('__OTHER__'))}
                        onChange={handleSelectAllSecondaryCategories}
                        disabled={isInitialLoading}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Select All
                      </span>
                    </label>
                  </div>
                  <div className="p-2 overflow-y-auto flex-1 min-h-0">
                    <label
                      className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={pendingSelectedSecondaryCategories.includes('__OTHER__')}
                        onChange={() => handleSecondaryCategoryToggle('__OTHER__')}
                        disabled={isInitialLoading}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-700">Other</span>
                    </label>
                    {availableSecondaryCategories.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={pendingSelectedSecondaryCategories.includes(tag)}
                          onChange={() => handleSecondaryCategoryToggle(tag)}
                          disabled={isInitialLoading}
                          className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <span className="text-sm text-gray-700">{tag}</span>
                      </label>
                    ))}
                  </div>
                  <div className="p-2 border-t border-gray-200 flex items-center justify-between gap-2 flex-shrink-0">
                    <button
                      onClick={handleResetSecondaryCategoryFilter}
                      disabled={isInitialLoading}
                      className="flex-1 px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleApplySecondaryCategoryFilter}
                      disabled={isInitialLoading}
                      className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Filter
                    </button>
                  </div>
                </div>
              )}
            </div>
            {/* Merchant Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Merchant
              </label>
              <div className="relative" ref={merchantDropdownRef}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border border-gray-300 rounded-md focus-within:ring-blue-500 focus-within:border-blue-500 bg-white min-h-[42px]">
                  {/* Merchant Pills */}
                  {selectedMerchants.map((merchant) => (
                    <span
                      key={merchant}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                    >
                      <span>{merchant}</span>
                      <button
                        type="button"
                        onClick={() => handleMerchantRemove(merchant)}
                        disabled={isInitialLoading}
                        className="hover:text-blue-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Remove ${merchant}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                  {/* Input Field */}
                  <input
                    type="text"
                    value={merchantInputValue}
                    onChange={(e) => handleMerchantInputChange(e.target.value)}
                    placeholder={selectedMerchants.length === 0 ? "Search merchants..." : ""}
                    disabled={isInitialLoading}
                    className="flex-1 min-w-[120px] border-0 outline-none focus:ring-0 p-0 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {/* Clear Button */}
                  {merchantInputValue.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearMerchantInput}
                      disabled={isInitialLoading}
                      className="text-gray-400 hover:text-gray-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Clear search"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {/* Typeahead Dropdown */}
                {merchantSuggestions.length > 0 && (
                  <div className="absolute z-40 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {merchantSuggestions
                      .filter(merchant => !selectedMerchants.includes(merchant))
                      .map((merchant) => (
                        <button
                          key={merchant}
                          type="button"
                          onClick={() => handleMerchantSelect(merchant)}
                          disabled={isInitialLoading}
                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {merchant}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
            {/* Time View Filter */}
            <div className="w-auto">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time View
              </label>
              <div className="relative">
                <select
                  value={timeGranularity}
                  onChange={(e) => setTimeGranularity(e.target.value as 'monthly' | 'weekly')}
                  disabled={isInitialLoading}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white appearance-none text-left disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg
                    className="w-5 h-5 text-gray-400"
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
                </div>
              </div>
            </div>
            {/* Clear Filters Button */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 invisible">
                Clear
              </label>
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Spending</p>
            {metricsLoading ? (
              <div className="h-9 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(metrics?.totalSpending || 0)}</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
            {metricsLoading ? (
              <div className="h-9 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <p className="text-3xl font-bold text-gray-900">{(metrics?.totalTransactions || 0).toLocaleString()}</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Categories</p>
            {metricsLoading ? (
              <div className="h-9 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <p className="text-3xl font-bold text-gray-900">{metrics?.categoriesCovered || 0}</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Avg Transaction</p>
            {metricsLoading ? (
              <div className="h-9 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <p className="text-3xl font-bold text-gray-900">{formatCurrency(metrics?.averageTransaction || 0)}</p>
            )}
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-600 mb-1">Uncategorized</p>
            {metricsLoading ? (
              <div className="h-9 bg-gray-200 animate-pulse rounded"></div>
            ) : (
              <p className="text-3xl font-bold text-yellow-600">{(metrics?.uncategorizedCount || 0).toLocaleString()}</p>
            )}
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
                  disabled={isInitialLoading}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="amount">$ Amount</option>
                  <option value="count"># Transactions</option>
                </select>
                <select
                  value={timeViewMode}
                  onChange={(e) => setTimeViewMode(e.target.value as 'total' | 'byCategory')}
                  disabled={isInitialLoading}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="total">Total</option>
                  <option value="byCategory">By Category</option>
                </select>
                <select
                  value={timeCategoryType}
                  onChange={(e) => setTimeCategoryType(e.target.value as 'primary' | 'secondary')}
                  disabled={isInitialLoading}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="primary">Primary Categories</option>
                  <option value="secondary">Secondary Categories</option>
                </select>
              </div>
            </div>
            {timeSeriesLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading chart data...</p>
                </div>
              </div>
            ) : (timeViewMode === 'total' && timeCategoryType === 'primary') ? (
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
            ) : (timeViewMode === 'byCategory' || timeCategoryType === 'secondary') ? (
              categoryTimeSeriesLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">Loading chart data...</p>
                  </div>
                </div>
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
              )
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Spending by Category</h2>
              <select
                value={categoryType}
                onChange={(e) => setCategoryType(e.target.value as 'primary' | 'secondary')}
                disabled={isInitialLoading}
                className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="primary">Primary Categories</option>
                <option value="secondary">Secondary Categories</option>
              </select>
            </div>
            {categoryDataLoading ? (
              <div className="flex-1 min-h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading chart data...</p>
                </div>
              </div>
            ) : categoryData.length > 0 ? (
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
            {merchantDataLoading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-500">Loading merchant data...</p>
                </div>
              </div>
            ) : merchantData.length > 0 ? (
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
                    disabled={isInitialLoading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium flex items-center gap-1 disabled:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                        disabled={isInitialLoading}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={handleEnterBulkEditMode}
                        disabled={isInitialLoading}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                    disabled={isSaving || isInitialLoading}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isInitialLoading || (editedCategories.size === 0 && editedSecondaryCategories.size === 0)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
          {paginatedTransactionsLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Loading transactions...</p>
              </div>
            </div>
          ) : paginatedTransactions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 table-auto">
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
                          disabled={isInitialLoading}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </th>
                      <th
                        onClick={() => !isInitialLoading && handleSort('date')}
                        className={`px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none ${
                          isInitialLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                        }`}
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
                        onClick={() => !isInitialLoading && handleSort('merchant')}
                        className={`px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none ${
                          isInitialLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                        }`}
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
                        onClick={() => !isInitialLoading && handleSort('amount')}
                        className={`px-4 md:px-6 lg:px-8 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider select-none ${
                          isInitialLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                        }`}
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
                        onClick={() => !isInitialLoading && handleSort('category')}
                        className={`px-4 md:px-6 lg:px-8 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider select-none ${
                          isInitialLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-gray-100'
                        }`}
                        style={{ minWidth: '200px' }}
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
                        style={{ minWidth: '120px' }}
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
                      
                      const editedSecondaryCategory = editedSecondaryCategories.get(transaction.id);
                      const displaySecondaryCategory = editedSecondaryCategory !== undefined
                        ? editedSecondaryCategory
                        : transaction.secondaryCategory;
                      
                      // Collect all secondary categories including newly created ones from editedSecondaryCategories
                      // Make sure to include the current transaction's secondary category if it exists
                      const allSecondaryCategories = new Set([
                        ...availableSecondaryCategories,
                        ...Array.from(editedSecondaryCategories.values()).filter(Boolean),
                        ...(displaySecondaryCategory ? [displaySecondaryCategory] : [])
                      ]);
                      
                      return (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={selectedTransactionIds.has(transaction.id)}
                              onChange={() => handleToggleTransaction(transaction.id)}
                              disabled={isInitialLoading}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm text-gray-900 overflow-hidden text-ellipsis">{transaction.merchant}</td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-right">
                            {formatCurrency(transaction.amount)}
                          </td>
                          <td className="px-4 md:px-6 lg:px-8 py-3 align-middle whitespace-nowrap" style={{ minWidth: '200px' }}>
                            <div className="flex items-center gap-1.5">
                              {isEditMode ? (
                                <>
                                  <select
                                    value={displayCategory || ''}
                                    onChange={(e) => handleCategoryChange(transaction.id, e.target.value || null)}
                                    disabled={isInitialLoading}
                                    className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ width: '140px' }}
                                  >
                                    <option value="">Uncategorized</option>
                                    {allCategories.map((cat) => (
                                      <option key={cat.id} value={cat.name}>
                                        {cat.name}
                                      </option>
                                    ))}
                                  </select>
                                  {(displaySecondaryCategory || editedSecondaryCategory !== undefined) ? (
                                    <select
                                      value={displaySecondaryCategory ?? ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        setEditedSecondaryCategories(prev => {
                                          const newMap = new Map(prev);
                                          newMap.set(transaction.id, value === '' ? null : value);
                                          return newMap;
                                        });
                                      }}
                                      disabled={isInitialLoading}
                                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                                      style={{ width: '140px' }}
                                    >
                                      <option value="">No secondary category</option>
                                      {Array.from(allSecondaryCategories).sort().map((tag) => (
                                        <option key={tag} value={tag}>
                                          {tag}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <button
                                      onClick={() => handleOpenSecondaryTagModal(transaction.id, null)}
                                      disabled={isInitialLoading}
                                      className="inline-flex items-center justify-center px-1.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded border border-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                                      title="Add secondary category"
                                    >
                                      +
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {displayCategory ? (
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                                      {displayCategory}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                      Uncategorized
                                    </span>
                                  )}
                                  {displaySecondaryCategory && (
                                    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                                      {displaySecondaryCategory}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
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
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secondary Category
              </label>
              <select
                value={bulkEditSecondaryCategoryIsNew ? 'create_new' : (bulkEditSecondaryCategory || 'no_category')}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === 'create_new') {
                    setBulkEditSecondaryCategoryIsNew(true);
                    setBulkEditSecondaryCategory('');
                  } else if (value === 'no_category') {
                    setBulkEditSecondaryCategoryIsNew(false);
                    setBulkEditSecondaryCategory(null);
                  } else {
                    setBulkEditSecondaryCategoryIsNew(false);
                    setBulkEditSecondaryCategory(value);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="no_category">No secondary category</option>
                {availableSecondaryCategories.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
                <option value="create_new">Create new...</option>
              </select>
              {bulkEditSecondaryCategoryIsNew && (
                <input
                  type="text"
                  value={bulkEditSecondaryCategory || ''}
                  onChange={(e) => setBulkEditSecondaryCategory(e.target.value || null)}
                  placeholder="Enter new tag name"
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBulkEditModalOpen(false);
                  setBulkEditCategory('');
                  setBulkEditSecondaryCategory(null);
                  setBulkEditSecondaryCategoryIsNew(false);
                }}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (bulkEditCategory) {
                    const secondaryCat = bulkEditSecondaryCategoryIsNew 
                      ? (bulkEditSecondaryCategory || null)
                      : bulkEditSecondaryCategory;
                    handleBulkEditSave(bulkEditCategory, secondaryCat);
                  }
                }}
                disabled={isSaving || !bulkEditCategory || (bulkEditSecondaryCategoryIsNew && !bulkEditSecondaryCategory)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secondary Category Modal */}
      {secondaryTagModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add Secondary Category</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secondary Category
              </label>
              <select
                value={secondaryTagModalSelectedTag}
                onChange={(e) => {
                  setSecondaryTagModalSelectedTag(e.target.value);
                  if (e.target.value !== 'create_new') {
                    setSecondaryTagModalNewTag('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="no_category">No secondary category</option>
                {availableSecondaryCategories.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
                <option value="create_new">Create new...</option>
              </select>
              {secondaryTagModalSelectedTag === 'create_new' && (
                <input
                  type="text"
                  value={secondaryTagModalNewTag}
                  onChange={(e) => setSecondaryTagModalNewTag(e.target.value)}
                  placeholder="Enter new tag name"
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setSecondaryTagModalOpen(false);
                  setSecondaryTagModalTransactionId(null);
                  setSecondaryTagModalSelectedTag('');
                  setSecondaryTagModalNewTag('');
                }}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSecondaryTag}
                disabled={secondaryTagModalSelectedTag === 'create_new' && !secondaryTagModalNewTag.trim()}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
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

