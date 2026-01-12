import { useState, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import type { DashboardFilters } from '@/types/dashboard';
import { defaultDashboardFilters } from '@/types/dashboard';

/**
 * Simplified hook for managing dashboard filters
 * Single source of truth for all filter state
 * 
 * This hook eliminates race conditions by:
 * 1. Using a single filter state object
 * 2. Providing debounced filters for data fetching
 * 3. Simplifying state updates
 */
export function useDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilters>(defaultDashboardFilters);
  const debouncedFilters = useDebounce(filters, 400);
  
  // Update date range
  const updateDateRange = useCallback((start?: string, end?: string) => {
    setFilters(prev => ({ 
      ...prev, 
      dateRange: { start, end },
      currentPage: 0, // Reset to first page when filters change
    }));
  }, []);
  
  // Update categories - folder-based model
  // selectedCategories is a Map where:
  // - Key = primary category (folder name)
  // - Value = array of selected secondaries (items in folder)
  const updateCategories = useCallback((selectedCategories: Map<string, string[]>) => {
    setFilters(prev => ({
      ...prev,
      selectedCategories: new Map(selectedCategories), // Create new Map to ensure immutability
      currentPage: 0, // Reset to first page when filters change
    }));
  }, []);
  
  // Update merchants
  const updateMerchants = useCallback((merchants: string[]) => {
    setFilters(prev => ({ 
      ...prev, 
      merchants,
      currentPage: 0, // Reset to first page when filters change
    }));
  }, []);
  
  // Update time granularity
  const updateTimeGranularity = useCallback((granularity: 'monthly' | 'weekly') => {
    setFilters(prev => ({ ...prev, timeGranularity: granularity }));
  }, []);
  
  // Update time view mode
  const updateTimeViewMode = useCallback((mode: 'total' | 'byCategory') => {
    setFilters(prev => ({ ...prev, timeViewMode: mode }));
  }, []);
  
  // Update time metric type
  const updateTimeMetricType = useCallback((type: 'amount' | 'count') => {
    setFilters(prev => ({ ...prev, timeMetricType: type }));
  }, []);
  
  // Update category type
  const updateCategoryType = useCallback((type: 'primary' | 'secondary') => {
    setFilters(prev => ({ ...prev, categoryType: type }));
  }, []);
  
  // Update time category type
  const updateTimeCategoryType = useCallback((type: 'primary' | 'secondary') => {
    setFilters(prev => ({ ...prev, timeCategoryType: type }));
  }, []);
  
  // Update only spending filter
  const updateOnlySpending = useCallback((onlySpending: boolean) => {
    setFilters(prev => ({ 
      ...prev, 
      onlySpending,
      currentPage: 0, // Reset to first page when filters change
    }));
  }, []);
  
  // Update sort
  const updateSort = useCallback((column: string, direction: 'asc' | 'desc') => {
    setFilters(prev => ({ 
      ...prev, 
      sortColumn: column,
      sortDirection: direction,
    }));
  }, []);
  
  // Update current page
  const updateCurrentPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, currentPage: page }));
  }, []);
  
  // Reset all filters
  const resetFilters = useCallback(() => {
    setFilters(defaultDashboardFilters);
  }, []);
  
  return {
    // Current filter state (for UI display)
    filters,
    
    // Debounced filters (for data fetching - use this in loadData)
    debouncedFilters,
    
    // Update functions
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
    resetFilters,
    
    // Direct setter (use sparingly, prefer specific update functions)
    setFilters,
  };
}

