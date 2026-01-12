/**
 * Dashboard Filter Types
 * Single source of truth for all dashboard filters
 */

export type DashboardFilters = {
  // Date filters
  dateRange: {
    start?: string;
    end?: string;
  };
  
  // Category filters - folder-based model
  // Primary is just a folder/container for secondaries
  // Map key = primary category (folder name)
  // Map value = array of selected secondaries (items in folder)
  selectedCategories: Map<string, string[]>; // primary -> selected secondaries
  
  // Merchant filters
  merchants: string[];
  
  // View options (not filters, but affect data display)
  timeGranularity: 'monthly' | 'weekly';
  timeViewMode: 'total' | 'byCategory';
  timeMetricType: 'amount' | 'count';
  categoryType: 'primary' | 'secondary';
  timeCategoryType: 'primary' | 'secondary';
  
  // Table options
  onlySpending: boolean;
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  currentPage: number;
};

export const defaultDashboardFilters: DashboardFilters = {
  dateRange: {},
  selectedCategories: new Map(),
  merchants: [],
  timeGranularity: 'monthly',
  timeViewMode: 'total',
  timeMetricType: 'amount',
  categoryType: 'primary',
  timeCategoryType: 'primary',
  onlySpending: true,
  sortColumn: 'date',
  sortDirection: 'desc',
  currentPage: 0,
};

