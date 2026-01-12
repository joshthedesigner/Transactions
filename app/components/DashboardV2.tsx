'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useDashboardFilters } from '@/hooks/useDashboardFilters';
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
  getCategoriesWithSecondaries,
  getSecondaryCategoriesForPrimary,
  ensureSecondaryCategoryMapping,
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

// Constant for "Miscellaneous" secondary category (transactions with null secondary_category)
// Internal value is '__OTHER__' for backend compatibility, but displayed as "Miscellaneous"
const OTHER_SECONDARY = '__OTHER__' as const;

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
  const categoryMappingsLoadedRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  
  // Track date input values at focus time to prevent browser auto-fill from triggering filters
  // Store the value when input is focused, only apply filter on blur if value changed
  const dateInputValueOnFocus = useRef<{start?: string, end?: string}>({});

  // ============================================================================
  // FILTER STATE MANAGEMENT (Simplified - Single Source of Truth)
  // ============================================================================
  const {
    filters: filterState,
    debouncedFilters,
    updateDateRange,
    updateCategories,
    updateMerchants,
    updateTimeGranularity,
    updateTimeViewMode,
    updateTimeMetricType,
    updateCategoryType,
    updateTimeCategoryType,
    updateOnlySpending,
    updateSort,
    updateCurrentPage,
  } = useDashboardFilters();

  // Separate display state for date inputs (for immediate UI feedback, doesn't trigger filters)
  // This prevents browser auto-fill from triggering data loads
  const [dateRangeDisplay, setDateRangeDisplay] = useState<{ start?: string; end?: string }>(() => ({
    start: filterState.dateRange.start,
    end: filterState.dateRange.end,
  }));

  // Pending state for category dropdown (UI-only, not applied until "Apply" is clicked)
  // Folder-based model: Map where key = primary (folder), value = selected secondaries (items)
  const [pendingSelectedCategories, setPendingSelectedCategories] = useState<Map<string, string[]>>(new Map());
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  
  // Map of primary category -> array of available secondary categories
  const [categoryMappings, setCategoryMappings] = useState<Map<string, string[]>>(new Map());
  const [merchantInputValue, setMerchantInputValue] = useState<string>('');
  const merchantDropdownRef = useRef<HTMLDivElement>(null);

  // Pagination
  const [paginatedTransactions, setPaginatedTransactions] = useState<TransactionRow[]>([]);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 25;

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
  const [secondaryTagModalPrimaryCategory, setSecondaryTagModalPrimaryCategory] = useState<string | null>(null);
  const [secondaryTagModalAvailableSecondaries, setSecondaryTagModalAvailableSecondaries] = useState<string[]>([]);
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

      // Convert folder-based Map to object for API (from debouncedFilters - single source of truth)
      // Only include folders that have items (non-empty arrays)
      const categorySecondaryMapObj: { [key: string]: string[] } = {};
      debouncedFilters.selectedCategories.forEach((secondaries, primary) => {
        if (secondaries.length > 0) {
          categorySecondaryMapObj[primary] = secondaries;
        }
      });

      // Build active filters - simplified: only use categorySecondaryMap
      // Empty folders are excluded (no transactions for that primary)
      // No folders = no filter (show all transactions)
      const activeFilters: DashboardFilters = {
        startDate: debouncedFilters.dateRange.start,
        endDate: debouncedFilters.dateRange.end,
        categorySecondaryMap: Object.keys(categorySecondaryMapObj).length > 0 ? categorySecondaryMapObj : undefined,
        merchants: debouncedFilters.merchants.length > 0 ? debouncedFilters.merchants : undefined,
        onlySpending: debouncedFilters.onlySpending,
      };

      // Debug: Log filters being applied
      console.log('=== FRONTEND: Building active filters ===');
      console.log('selectedCategories:', Array.from(debouncedFilters.selectedCategories.entries()));
      console.log('categorySecondaryMapObj:', categorySecondaryMapObj);
      console.log('activeFilters:', JSON.stringify(activeFilters, null, 2));

      // Load filter-dependent data in parallel
      const dataPromises = [
        getDashboardMetrics(activeFilters).then(result => {
          console.log('=== FRONTEND: Metrics received ===');
          console.log('Total spending:', result.totalSpending);
          console.log('Total transactions:', result.totalTransactions);
          console.log('Categories covered:', result.categoriesCovered);
          console.log('Filters sent:', JSON.stringify(activeFilters, null, 2));
          setMetrics(result);
          setMetricsLoading(false);
          return result;
        }).catch(error => {
          console.error('Error getting metrics:', error);
          console.error('Error details:', error.message, error.stack);
          setMetricsLoading(false);
          throw error;
        }),
        getSpendingByCategory(activeFilters, debouncedFilters.categoryType).then(result => {
          setCategoryData(result);
          setCategoryDataLoading(false);
          return result;
        }),
        getTopMerchants(20, activeFilters).then(result => {
          setMerchantData(result);
          setMerchantDataLoading(false);
          return result;
        }),
        getSpendingOverTime(debouncedFilters.timeGranularity, activeFilters).then(result => {
          setTimeSeriesData(result);
          setTimeSeriesLoading(false);
          return result;
        }),
        getSpendingByCategoryOverTime(debouncedFilters.timeGranularity, activeFilters, debouncedFilters.timeMetricType, debouncedFilters.timeCategoryType).then(result => {
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
      // Load category mappings only if not already loaded (they don't depend on filters)
      if (!categoryMappingsLoadedRef.current) {
        categoryPromises.push(
          getCategoriesWithSecondaries()
            .then(result => {
              setCategoryMappings(result);
              categoryMappingsLoadedRef.current = true;
              return result;
            })
            .catch(error => {
              console.error('getCategoriesWithSecondaries failed in loadData:', error);
              setCategoryMappings(new Map());
              categoryMappingsLoadedRef.current = true; // Mark as loaded even on error to prevent retry loop
              return new Map();
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
  }, [debouncedFilters]); // Single dependency! No more race conditions!

  const loadPaginatedData = useCallback(async () => {
    try {
      setPaginatedTransactionsLoading(true);
      
      // Convert folder-based Map to object for API
      // Only include folders that have items (non-empty arrays)
      const categorySecondaryMapObj: { [key: string]: string[] } = {};
      debouncedFilters.selectedCategories.forEach((secondaries, primary) => {
        if (secondaries.length > 0) {
          categorySecondaryMapObj[primary] = secondaries;
        }
      });
      
      // Build active filters - simplified: only use categorySecondaryMap
      const activeFilters: DashboardFilters = {
        startDate: debouncedFilters.dateRange.start,
        endDate: debouncedFilters.dateRange.end,
        categorySecondaryMap: Object.keys(categorySecondaryMapObj).length > 0 ? categorySecondaryMapObj : undefined,
        merchants: debouncedFilters.merchants.length > 0 ? debouncedFilters.merchants : undefined,
        onlySpending: false, // Show all transactions (including credits/payments) in the table
      };

      const result = await getPaginatedTransactions(
        debouncedFilters.currentPage, 
        pageSize, 
        activeFilters, 
        debouncedFilters.sortColumn, 
        debouncedFilters.sortDirection
      );
      setPaginatedTransactions(result.transactions);
      setTotalTransactions(result.total);
      setHasMore(result.hasMore);
    } catch (e) {
      console.error('Error loading paginated transactions:', e);
    } finally {
      setPaginatedTransactionsLoading(false);
    }
  }, [debouncedFilters, pageSize]); // Simplified dependencies!

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

  // Initial load and when filters change
  // Simplified: Just watch debouncedFilters - no complex comparison logic needed!
  useEffect(() => {
    if (!initialLoadDoneRef.current) {
      initialLoadDoneRef.current = true;
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters]); // Single dependency - debouncedFilters changes when filters change

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
      if (
        merchantDropdownRef.current &&
        !merchantDropdownRef.current.contains(event.target as Node)
      ) {
        setMerchantSuggestions([]);
      }
    };

    if (categoryDropdownOpen || actionDropdownOpen || merchantSuggestions.length > 0) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [categoryDropdownOpen, actionDropdownOpen, merchantSuggestions.length]);

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
      const currentFilterValue = filterState.dateRange[field];
      const finalValue = newValue || undefined;
      
      if (finalValue && finalValue !== currentFilterValue) {
        // User selected a new date - update filter state (triggers data load via debounce)
        updateDateRange(
          field === 'start' ? finalValue : filterState.dateRange.start,
          field === 'end' ? finalValue : filterState.dateRange.end
        );
        // Clear transactions to show loading state (will be debounced)
        setPaginatedTransactions([]);
      } else if (!finalValue && currentFilterValue) {
        // User cleared the date - update filter state
        updateDateRange(
          field === 'start' ? undefined : filterState.dateRange.start,
          field === 'end' ? undefined : filterState.dateRange.end
        );
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

  // Toggle primary category - folder-based model
  // When checked, auto-check all secondaries in the folder (including "Other")
  // When unchecked, remove the entire folder
  const handleCategoryToggle = (category: string) => {
    setPendingSelectedCategories(prev => {
      const newMap = new Map(prev);
      if (newMap.has(category)) {
        // Unchecking: remove the entire folder
        newMap.delete(category);
      } else {
        // Checking: add folder with all items (all secondaries + "Other")
        const secondaries = categoryMappings.get(category) || [];
        newMap.set(category, [...secondaries, OTHER_SECONDARY]);
      }
      return newMap;
    });
  };

  // Toggle secondary category - folder-based model
  // Add/remove item from folder
  const handleSecondaryCategoryToggle = (primaryCategory: string, secondaryCategory: string) => {
    setPendingSelectedCategories(prev => {
      const newMap = new Map(prev);
      const currentSecondaries = newMap.get(primaryCategory) || [];
      
      if (currentSecondaries.includes(secondaryCategory)) {
        // Unchecking: remove item from folder
        const updated = currentSecondaries.filter(s => s !== secondaryCategory);
        if (updated.length === 0) {
          // Empty folder: remove it entirely (or keep empty? User wants: remove)
          newMap.delete(primaryCategory);
        } else {
          newMap.set(primaryCategory, updated);
        }
      } else {
        // Checking: add item to folder
        // Ensure folder exists first
        if (!newMap.has(primaryCategory)) {
          newMap.set(primaryCategory, []);
        }
        newMap.set(primaryCategory, [...currentSecondaries, secondaryCategory]);
      }
      
      return newMap;
    });
  };

  const handleSelectAllCategories = () => {
    if (pendingSelectedCategories.size === availableCategories.length) {
      // Deselect all: remove all folders
      setPendingSelectedCategories(new Map());
    } else {
      // Select all: add all folders with all their items
      const allFolders = new Map<string, string[]>();
      availableCategories.forEach(primary => {
        const secondaries = categoryMappings.get(primary) || [];
        allFolders.set(primary, [...secondaries, OTHER_SECONDARY]);
      });
      setPendingSelectedCategories(allFolders);
    }
  };

  const handleApplyCategoryFilter = () => {
    // Apply pending filters to the main filter state
    // This will automatically trigger loadData via useEffect watching debouncedFilters
    updateCategories(new Map(pendingSelectedCategories));
    setCategoryDropdownOpen(false);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
    // No need to manually call loadData - useEffect will handle it!
  };

  const handleResetCategoryFilter = () => {
    setPendingSelectedCategories(new Map());
    // Reset categories in filter state
    updateCategories(new Map());
    setCategoryDropdownOpen(false);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleMerchantInputChange = (value: string) => {
    setMerchantInputValue(value);
    // Suggestions will load automatically via debounced effect
  };

  const handleMerchantSelect = (merchant: string) => {
    const currentMerchants = filterState.merchants;
    if (!currentMerchants.includes(merchant)) {
      updateMerchants([...currentMerchants, merchant]);
    }
    setMerchantInputValue('');
    setMerchantSuggestions([]);
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleMerchantRemove = (merchant: string) => {
    const currentMerchants = filterState.merchants;
    updateMerchants(currentMerchants.filter(m => m !== merchant));
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleClearMerchantInput = () => {
    setMerchantInputValue('');
    setMerchantSuggestions([]);
  };

  const handleClearFilters = () => {
    // Reset all filters using the hook
    updateDateRange(undefined, undefined);
    updateCategories(new Map());
    updateMerchants([]);
    setPendingSelectedCategories(new Map());
    setMerchantInputValue('');
    // Clear transactions to show loading state
    setPaginatedTransactions([]);
  };

  const handleSort = (column: string) => {
    if (filterState.sortColumn === column) {
      // Toggle direction if same column
      updateSort(column, filterState.sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to descending
      updateSort(column, 'desc');
    }
    updateCurrentPage(0); // Reset to first page when sorting changes
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
    
    // Category mappings should already be loaded, but ensure they're up to date
    if (categoryMappings.size === 0) {
      try {
        console.log('Loading category mappings because size is 0...');
        const mappings = await getCategoriesWithSecondaries();
        console.log('Category mappings loaded:', mappings);
        setCategoryMappings(mappings);
      } catch (e) {
        console.error('Error loading category mappings:', e);
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
    setBulkEditCategory(commonPrimaryCategory || '');
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

  // Helper: Check if transaction would be visible with current filter
  const wouldTransactionBeVisible = useCallback((
    primary: string | null,
    secondary: string | null,
    filter: Map<string, string[]>
  ): boolean => {
    // No filter = show all = visible
    if (filter.size === 0) return true;
    
    // No primary = uncategorized = not visible (unless explicitly filtered)
    if (!primary) return false;
    
    // Check if primary is in filter
    const selectedSecondaries = filter.get(primary);
    if (!selectedSecondaries) return false; // Primary not selected
    
    // Check if secondary matches (or is "Other")
    const secondaryToCheck = secondary || OTHER_SECONDARY;
    return selectedSecondaries.includes(secondaryToCheck);
  }, []);

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
      
      // Update secondary categories and create mappings
      Array.from(editedSecondaryCategories.entries()).forEach(([id, secondaryCategory]) => {
        // Get the transaction's primary category (from edited or current)
        const transaction = paginatedTransactions.find(t => t.id === id);
        const primaryCategory = editedCategories.get(id) ?? transaction?.category ?? null;
        
        // Create mapping if secondary category is being set and primary category exists
        if (secondaryCategory && primaryCategory) {
          updates.push(
            ensureSecondaryCategoryMapping(primaryCategory, secondaryCategory).then(() => {
              // Update the transaction's secondary category
              return updateTransactionSecondaryCategory(id, secondaryCategory, primaryCategory);
            })
          );
        } else {
          updates.push(updateTransactionSecondaryCategory(id, secondaryCategory, primaryCategory));
        }
      });

      await Promise.all(updates);

      // AUTO-UPDATE FILTER: Add saved categories to filter if they would be hidden
      const hasActiveFilters = debouncedFilters.selectedCategories.size > 0;
      const combosToAdd = new Map<string, string[]>();

      if (hasActiveFilters) {
        // Check each saved secondary category
        Array.from(editedSecondaryCategories.entries()).forEach(([id, secondaryCategory]) => {
          const transaction = paginatedTransactions.find(t => t.id === id);
          const primaryCategory = editedCategories.get(id) ?? transaction?.category ?? null;
          
          if (primaryCategory && secondaryCategory) {
            const wouldBeVisible = wouldTransactionBeVisible(
              primaryCategory,
              secondaryCategory,
              debouncedFilters.selectedCategories
            );
            
            if (!wouldBeVisible) {
              // Need to add this combo to filter
              const existing = combosToAdd.get(primaryCategory) || [];
              const secondaryToAdd = secondaryCategory;
              if (!existing.includes(secondaryToAdd)) {
                combosToAdd.set(primaryCategory, [...existing, secondaryToAdd]);
              }
            }
          } else if (primaryCategory && !secondaryCategory) {
            // Secondary category removed (set to null) - check if "Other" is needed
            const wouldBeVisible = wouldTransactionBeVisible(
              primaryCategory,
              null,
              debouncedFilters.selectedCategories
            );
            
            if (!wouldBeVisible) {
              const existing = combosToAdd.get(primaryCategory) || [];
              if (!existing.includes(OTHER_SECONDARY)) {
                combosToAdd.set(primaryCategory, [...existing, OTHER_SECONDARY]);
              }
            }
          }
        });
        
        // Also check primary category changes
        Array.from(editedCategories.entries()).forEach(([id, primaryCategory]) => {
          if (primaryCategory) {
            const transaction = paginatedTransactions.find(t => t.id === id);
            const secondaryCategory = editedSecondaryCategories.get(id) ?? transaction?.secondaryCategory ?? null;
            
            const wouldBeVisible = wouldTransactionBeVisible(
              primaryCategory,
              secondaryCategory,
              debouncedFilters.selectedCategories
            );
            
            if (!wouldBeVisible) {
              const existing = combosToAdd.get(primaryCategory) || [];
              const secondaryToAdd = secondaryCategory || OTHER_SECONDARY;
              if (!existing.includes(secondaryToAdd)) {
                combosToAdd.set(primaryCategory, [...existing, secondaryToAdd]);
              }
            }
          }
        });
        
        // Auto-update filter if needed
        if (combosToAdd.size > 0) {
          const updatedFilter = new Map(debouncedFilters.selectedCategories);
          combosToAdd.forEach((secondaries, primary) => {
            const existing = updatedFilter.get(primary) || [];
            const merged = [...new Set([...existing, ...secondaries])];
            updatedFilter.set(primary, merged);
          });
          updateCategories(updatedFilter);
        }
      }

      const totalUpdates = editedCategories.size + editedSecondaryCategories.size;
      setSaveMessage({ type: 'success', text: `Successfully updated ${totalUpdates} transaction(s)` });
      setIsEditMode(false);
      setEditedCategories(new Map());
      setEditedSecondaryCategories(new Map());
      setSelectedTransactionIds(new Set());
      
      // Reload data and refresh category mappings
      await loadPaginatedData();
      console.log('Reloading category mappings after bulk edit...');
      const mappings = await getCategoriesWithSecondaries();
      console.log('Category mappings reloaded:', mappings);
      setCategoryMappings(mappings);
      
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
  const handleOpenSecondaryTagModal = async (transactionId: number, currentSecondaryCategory: string | null, primaryCategory: string | null) => {
    setSecondaryTagModalTransactionId(transactionId);
    setSecondaryTagModalPrimaryCategory(primaryCategory);
    setSecondaryTagModalSelectedTag(currentSecondaryCategory ? currentSecondaryCategory : 'no_category');
    setSecondaryTagModalNewTag('');
    
    // Load secondaries for this primary category
    if (primaryCategory) {
      try {
        const secondaries = await getSecondaryCategoriesForPrimary(primaryCategory);
        setSecondaryTagModalAvailableSecondaries(secondaries);
      } catch (e) {
        console.error('Error loading secondary categories:', e);
        setSecondaryTagModalAvailableSecondaries([]);
      }
    } else {
      setSecondaryTagModalAvailableSecondaries([]);
    }
    
    setSecondaryTagModalOpen(true);
  };

  const handleAddSecondaryTag = () => {
    if (!secondaryTagModalTransactionId || !secondaryTagModalPrimaryCategory) return;

    const tagToSave = secondaryTagModalSelectedTag === 'create_new' 
      ? secondaryTagModalNewTag.trim()
      : secondaryTagModalSelectedTag === 'no_category'
      ? null
      : secondaryTagModalSelectedTag || null;

    if (secondaryTagModalSelectedTag === 'create_new' && !secondaryTagModalNewTag.trim()) {
      return; // Don't allow adding empty tag
    }

    // If creating a new category, add it to the modal's available secondaries and update category mappings
    if (secondaryTagModalSelectedTag === 'create_new' && tagToSave) {
      setSecondaryTagModalAvailableSecondaries(prev => {
        if (!prev.includes(tagToSave)) {
          return [...prev, tagToSave].sort();
        }
        return prev;
      });
      // Update category mappings state
      setCategoryMappings(prev => {
        const newMap = new Map(prev);
        const secondaries = newMap.get(secondaryTagModalPrimaryCategory) || [];
        if (!secondaries.includes(tagToSave)) {
          newMap.set(secondaryTagModalPrimaryCategory, [...secondaries, tagToSave].sort());
        }
        return newMap;
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
    setSecondaryTagModalPrimaryCategory(null);
    setSecondaryTagModalAvailableSecondaries([]);
    setSecondaryTagModalSelectedTag('');
    setSecondaryTagModalNewTag('');
  };

  // Secondary category filter handlers
  // Old secondary category handlers removed - now handled by nested category handlers

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
        // AUTO-UPDATE FILTER: Add saved categories to filter if they would be hidden
        const hasActiveFilters = debouncedFilters.selectedCategories.size > 0;
        const combosToAdd = new Map<string, string[]>();

        if (hasActiveFilters && category && secondaryCategory) {
          // Bulk edit applies same category to all selected transactions
          // Check if this combo would be visible
          const wouldBeVisible = wouldTransactionBeVisible(
            category,
            secondaryCategory,
            debouncedFilters.selectedCategories
          );
          
          if (!wouldBeVisible) {
            const existing = combosToAdd.get(category) || [];
            const secondaryToAdd = secondaryCategory;
            if (!existing.includes(secondaryToAdd)) {
              combosToAdd.set(category, [...existing, secondaryToAdd]);
            }
          }
        } else if (hasActiveFilters && category && !secondaryCategory) {
          // Primary category only - check if "Other" is needed
          const wouldBeVisible = wouldTransactionBeVisible(
            category,
            null,
            debouncedFilters.selectedCategories
          );
          
          if (!wouldBeVisible) {
            const existing = combosToAdd.get(category) || [];
            if (!existing.includes(OTHER_SECONDARY)) {
              combosToAdd.set(category, [...existing, OTHER_SECONDARY]);
            }
          }
        }
        
        // Auto-update filter if needed
        if (combosToAdd.size > 0) {
          const updatedFilter = new Map(debouncedFilters.selectedCategories);
          combosToAdd.forEach((secondaries, primary) => {
            const existing = updatedFilter.get(primary) || [];
            const merged = [...new Set([...existing, ...secondaries])];
            updatedFilter.set(primary, merged);
          });
          updateCategories(updatedFilter);
        }

        setSaveMessage({ 
          type: 'success', 
          text: `Successfully updated ${totalUpdated} transaction(s)` 
        });
        setSelectedTransactionIds(new Set());
        
        // Reload data and refresh category mappings
        await loadPaginatedData();
        const mappings = await getCategoriesWithSecondaries();
        setCategoryMappings(mappings);
        
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
            onClick={() => loadData()}
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
            {/* Category Filter - Nested (Primary with Secondary) */}
            <div className="relative w-[250px]" ref={categoryDropdownRef}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Categories
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!categoryDropdownOpen) {
                    // Initialize pending selections with current selections when opening
                    setPendingSelectedCategories(new Map(filterState.selectedCategories));
                  }
                  setCategoryDropdownOpen(!categoryDropdownOpen);
                }}
                disabled={isInitialLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white text-left flex items-center justify-between disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-gray-700">
                  {filterState.selectedCategories.size === 0
                    ? 'All Categories'
                    : filterState.selectedCategories.size === 1
                    ? Array.from(filterState.selectedCategories.keys())[0]
                    : `${filterState.selectedCategories.size} selected`}
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
                        checked={pendingSelectedCategories.size === availableCategories.length && availableCategories.length > 0}
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
                    {availableCategories.map((primaryCat) => {
                      const isPrimarySelected = pendingSelectedCategories.has(primaryCat);
                      const secondaries = categoryMappings.get(primaryCat) || [];
                      const selectedSecondaries = pendingSelectedCategories.get(primaryCat) || [];
                      const hasSecondaries = secondaries.length > 0;
                      
                      return (
                        <div key={primaryCat} className="mb-1">
                          {/* Primary Category */}
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                              type="checkbox"
                              checked={isPrimarySelected}
                              onChange={() => handleCategoryToggle(primaryCat)}
                              disabled={isInitialLoading}
                              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                            />
                            <span className="text-sm font-medium text-gray-700">{primaryCat}</span>
                          </label>
                          {/* Secondary Categories (nested, only show if primary is selected) */}
                          {isPrimarySelected && (
                            <div className="ml-6 mt-1 space-y-1">
                              {hasSecondaries && secondaries.map((secondaryCat) => (
                                <label
                                  key={secondaryCat}
                                  className="flex items-center cursor-pointer hover:bg-gray-50 p-1.5 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedSecondaries.includes(secondaryCat)}
                                    onChange={() => handleSecondaryCategoryToggle(primaryCat, secondaryCat)}
                                    disabled={isInitialLoading}
                                    className="mr-2 h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                  />
                                  <span className="text-xs text-gray-600">{secondaryCat}</span>
                                </label>
                              ))}
                              {/* "Miscellaneous" option for transactions with null secondary_category */}
                              <label className="flex items-center cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                                <input
                                  type="checkbox"
                                  checked={selectedSecondaries.includes(OTHER_SECONDARY)}
                                  onChange={() => handleSecondaryCategoryToggle(primaryCat, OTHER_SECONDARY)}
                                  disabled={isInitialLoading}
                                  className="mr-2 h-3.5 w-3.5 text-green-600 focus:ring-green-500 border-gray-300 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                <span className="text-xs text-gray-600 italic">Miscellaneous</span>
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
            {/* Merchant Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Merchant
              </label>
              <div className="relative" ref={merchantDropdownRef}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border border-gray-300 rounded-md focus-within:ring-blue-500 focus-within:border-blue-500 bg-white min-h-[42px]">
                  {/* Merchant Pills */}
                  {filterState.merchants.map((merchant: string) => (
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
                    placeholder={filterState.merchants.length === 0 ? "Search merchants..." : ""}
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
                      .filter(merchant => !filterState.merchants.includes(merchant))
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
                  value={filterState.timeGranularity}
                  onChange={(e) => updateTimeGranularity(e.target.value as 'monthly' | 'weekly')}
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
                  value={filterState.timeMetricType}
                  onChange={(e) => updateTimeMetricType(e.target.value as 'amount' | 'count')}
                  disabled={isInitialLoading}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="amount">$ Amount</option>
                  <option value="count"># Transactions</option>
                </select>
                <select
                  value={filterState.timeViewMode}
                  onChange={(e) => updateTimeViewMode(e.target.value as 'total' | 'byCategory')}
                  disabled={isInitialLoading}
                  className="px-3 py-1 text-sm rounded-md border border-gray-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="total">Total</option>
                  <option value="byCategory">By Category</option>
                </select>
                <select
                  value={filterState.timeCategoryType}
                  onChange={(e) => updateTimeCategoryType(e.target.value as 'primary' | 'secondary')}
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
            ) : (filterState.timeViewMode === 'total' && filterState.timeCategoryType === 'primary') ? (
              timeSeriesData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={timeSeriesData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis 
                      tickFormatter={(value) => 
                        filterState.timeMetricType === 'amount' 
                          ? `$${value.toLocaleString()}` 
                          : value.toLocaleString()
                      } 
                    />
                    <Tooltip
                      formatter={(value: number) => 
                        filterState.timeMetricType === 'amount' 
                          ? formatCurrency(value)
                          : `${value.toLocaleString()} transactions`
                      }
                      labelStyle={{ color: '#374151' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey={filterState.timeMetricType === 'amount' ? 'total' : 'count'}
                      stroke={CHART_COLORS.primary}
                      strokeWidth={2}
                      name={filterState.timeMetricType === 'amount' ? 'Total Spending' : 'Transaction Count'}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-500">
                  No data available
                </div>
              )
            ) : (filterState.timeViewMode === 'byCategory' || filterState.timeCategoryType === 'secondary') ? (
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
                            filterState.timeMetricType === 'amount' 
                              ? `$${value.toLocaleString()}` 
                              : value.toLocaleString()
                          } 
                        />
                        <Tooltip
                          formatter={(value: number) => 
                            filterState.timeMetricType === 'amount' 
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
                value={filterState.categoryType}
                onChange={(e) => updateCategoryType(e.target.value as 'primary' | 'secondary')}
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
                            {filterState.sortColumn === 'date' && (
                              <span className="text-blue-600">
                                {filterState.sortDirection === 'asc' ? '↑' : '↓'}
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
                            {filterState.sortColumn === 'merchant' && (
                              <span className="text-blue-600">
                                {filterState.sortDirection === 'asc' ? '↑' : '↓'}
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
                            {filterState.sortColumn === 'amount' && (
                              <span className="text-blue-600">
                                {filterState.sortDirection === 'asc' ? '↑' : '↓'}
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
                            {filterState.sortColumn === 'category' && (
                              <span className="text-blue-600">
                                {filterState.sortDirection === 'asc' ? '↑' : '↓'}
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
                      
                      // Get secondary categories for this transaction's primary category
                      // Use edited category if available, otherwise use transaction's category
                      const transactionPrimaryCategory = displayCategory;
                      const allSecondaryCategories = transactionPrimaryCategory
                        ? (categoryMappings.get(transactionPrimaryCategory) || [])
                        : [];
                      
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
                                      onClick={() => handleOpenSecondaryTagModal(transaction.id, null, displayCategory)}
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
                  onClick={() => updateCurrentPage(Math.max(0, filterState.currentPage - 1))}
                  disabled={filterState.currentPage === 0}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {filterState.currentPage + 1} of {Math.ceil(totalTransactions / pageSize)}
                </span>
                <button
                  onClick={() => updateCurrentPage(filterState.currentPage + 1)}
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
                {bulkEditCategory && categoryMappings.get(bulkEditCategory)?.map((tag) => (
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
                {secondaryTagModalAvailableSecondaries.map((tag) => (
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

