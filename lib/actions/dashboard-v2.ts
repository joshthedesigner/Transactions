'use server';

import { createClient } from '@/lib/supabase/server';

// ============================================================================
// TYPES
// ============================================================================

export type DashboardMetrics = {
  totalSpending: number;
  totalTransactions: number;
  categoriesCovered: number;
  averageTransaction: number;
  uncategorizedCount: number;
};

export type CategorySpending = {
  category: string;
  total: number;
  count: number;
  percentage: number;
};

export type MerchantSpending = {
  merchant: string;
  total: number;
  count: number;
  average: number;
};

export type TimeSeriesData = {
  period: string; // 'YYYY-MM' for monthly, 'YYYY-WW' for weekly
  total: number;
  count: number;
};

export type CategoryTimeSeriesData = {
  period: string;
  [category: string]: string | number; // Dynamic category keys with amounts or counts
};

export type TransactionRow = {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  category: string | null;
  secondaryCategory: string | null;
  notes: string | null;
  sourceFilename: string | null;
};

export type DashboardFilters = {
  startDate?: string;
  endDate?: string;
  category?: string; // Single category (deprecated, use categories)
  categories?: string[]; // Multiple categories
  secondaryCategories?: string[]; // Multiple secondary categories (deprecated, use categorySecondaryMap)
  categorySecondaryMap?: { [primary: string]: string[] }; // Map of primary category -> array of selected secondary categories
  merchant?: string; // Single merchant (deprecated, use merchants)
  merchants?: string[]; // Multiple merchants (OR logic)
  onlySpending?: boolean; // Default true
};

// ============================================================================
// HELPER: Get user ID
// ============================================================================

async function getUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Not authenticated');
  }
  return user.id;
}

// ============================================================================
// HELPER: Paginate through all results
// ============================================================================

async function paginateQuery<T>(
  queryBuilder: any,
  pageSize: number = 1000
): Promise<T[]> {
  const results: T[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      results.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return results;
}

// ============================================================================
// HELPER: Get transactions using RPC function when categorySecondaryMap is provided
// ============================================================================

async function getTransactionsWithRPC(
  supabase: any,
  userId: string,
  filters: DashboardFilters
): Promise<any[]> {
  console.log('=== BACKEND: Using RPC function for category filter ===');
  console.log('categorySecondaryMap:', JSON.stringify(filters.categorySecondaryMap, null, 2));
  
  const { data, error } = await supabase.rpc('filter_transactions_by_categories', {
    p_user_id: userId,
    p_category_map: filters.categorySecondaryMap,
    p_only_spending: filters.onlySpending !== false,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
  });

  if (error) {
    console.error('RPC function error:', error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const transactions = data || [];
  console.log('RPC returned', transactions.length, 'transactions');
  return transactions;
}

// ============================================================================
// HELPER: Apply merchant filters in memory (for RPC results)
// ============================================================================

function applyMerchantFilter(
  transactions: any[],
  filters: DashboardFilters
): any[] {
  // No merchant filter
  if (!filters.merchants || filters.merchants.length === 0) {
    if (!filters.merchant) {
      return transactions;
    }
    // Legacy single merchant support (partial match)
    const merchantLower = filters.merchant.toLowerCase();
    return transactions.filter(t => {
      const tMerchant = t.merchant?.toLowerCase() || '';
      return tMerchant.includes(merchantLower);
    });
  }
  
  // Multiple merchants: OR logic with case-insensitive match
  // Matches the logic in buildBaseQuery (lines 268-278)
  const merchantLower = filters.merchants.map(m => m.toLowerCase());
  return transactions.filter(t => {
    const tMerchant = t.merchant?.toLowerCase() || '';
    // Check if transaction merchant matches any of the filter merchants
    return merchantLower.some(m => tMerchant.includes(m));
  });
}

// ============================================================================
// HELPER: Build base query with filters
// ============================================================================

function buildBaseQuery(supabase: any, userId: string, filters: DashboardFilters = {}) {
  // BEST PRACTICE: Start with immutable base query
  let query = supabase
    .from('transactions_v2')
    .select('*')
    .eq('user_id', userId);

  // SIMPLE APPROACH: Use OR with proper format - one condition per primary+secondary combo
  // Check if categorySecondaryMap was explicitly provided (even if empty)
  if (filters.categorySecondaryMap !== undefined) {
    console.log('=== BACKEND: Using categorySecondaryMap filter ===');
    console.log('categorySecondaryMap received:', JSON.stringify(filters.categorySecondaryMap, null, 2));
    
    // Build simple OR conditions: one per primary+secondary combination
    const conditions: string[] = [];
    
    for (const [primary, secondaries] of Object.entries(filters.categorySecondaryMap)) {
      console.log(`  Processing primary "${primary}" with secondaries:`, secondaries);
      
      const hasOther = secondaries.includes('__OTHER__');
      const otherSecondaries = secondaries.filter(s => s !== '__OTHER__');
      
      // Add condition for each secondary: category=primary,secondary_category=secondary
      for (const secondary of otherSecondaries) {
        conditions.push(`category.eq.${primary},secondary_category.eq.${secondary}`);
      }
      
      // Add condition for "Other": category=primary,secondary_category.is.null
      if (hasOther) {
        conditions.push(`category.eq.${primary},secondary_category.is.null`);
      }
    }
    
    if (conditions.length > 0) {
      // Apply OR filter - simple comma-separated conditions
      const orClause = conditions.join(',');
      console.log('=== BACKEND: Applying OR clause ===');
      console.log('OR clause:', orClause);
      console.log('Number of conditions:', conditions.length);
      query = query.or(orClause);
      console.log('OR filter applied');
    } else {
      // No valid conditions - return empty result
      console.log('No valid conditions - returning empty result');
      query = query.eq('id', -1);
    }
  } else if (filters.categories && filters.categories.length > 0) {
    // Fallback: Only primary categories selected (no nested structure)
    if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
      // Both primary and secondary selected: filter for exact combinations
      // Build OR conditions for each valid primary+secondary combination
      const hasOther = filters.secondaryCategories.includes('__OTHER__');
      const otherSecondaries = filters.secondaryCategories.filter(c => c !== '__OTHER__');
      
      const conditions: string[] = [];
      
      // For each primary category, check if it has selected secondaries
      for (const primary of filters.categories) {
        if (otherSecondaries.length > 0) {
          // Primary with specific secondaries: category = primary AND secondary_category IN secondaries
          for (const secondary of otherSecondaries) {
            // Quote the secondary value to handle spaces and special characters
            const quotedSecondary = `"${secondary}"`;
            conditions.push(`category.eq.${primary},secondary_category.eq.${quotedSecondary}`);
          }
        }
        if (hasOther) {
          // Primary with no secondary: category = primary AND secondary_category IS NULL
          conditions.push(`category.eq.${primary},secondary_category.is.null`);
        }
      }
      
      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
      }
    } else {
      // Only primary categories selected: show all transactions with those primaries
      query = query.in('category', filters.categories);
    }
  } else if (filters.category) {
    // Legacy single category support
    if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
      // Single primary with secondaries
      const hasOther = filters.secondaryCategories.includes('__OTHER__');
      const otherSecondaries = filters.secondaryCategories.filter(c => c !== '__OTHER__');
      
      const conditions: string[] = [];
      if (otherSecondaries.length > 0) {
        for (const secondary of otherSecondaries) {
          // Quote the secondary value to handle spaces and special characters
          const quotedSecondary = `"${secondary}"`;
          conditions.push(`category.eq.${filters.category},secondary_category.eq.${quotedSecondary}`);
        }
      }
      if (hasOther) {
        conditions.push(`category.eq.${filters.category},secondary_category.is.null`);
      }
      
      if (conditions.length > 0) {
        query = query.or(conditions.join(','));
      }
    } else {
      query = query.eq('category', filters.category);
    }
  } else if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
    // Only secondary categories selected (no primary): show all transactions with those secondaries
    // This is the fallback case when no primary is selected
    const hasOther = filters.secondaryCategories.includes('__OTHER__');
    const otherCategories = filters.secondaryCategories.filter(c => c !== '__OTHER__');
    
    if (hasOther && otherCategories.length > 0) {
      query = query.or(`secondary_category.is.null,secondary_category.in.(${otherCategories.map(c => `"${c}"`).join(',')})`);
    } else if (hasOther) {
      query = query.is('secondary_category', null);
    } else {
      query = query.in('secondary_category', otherCategories);
    }
  }

  // Merchant filter
  // Support both single merchant (legacy) and multiple merchants (OR logic)
  if (filters.merchants && filters.merchants.length > 0) {
    // Multiple merchants: use OR logic with exact match (since these are selected from typeahead)
    if (filters.merchants.length === 1) {
      query = query.ilike('merchant', filters.merchants[0]);
    } else {
      // For multiple merchants, use OR with exact match
      const merchantConditions = filters.merchants
        .map(m => `merchant.ilike.${m}`)
        .join(',');
      query = query.or(merchantConditions);
    }
  } else if (filters.merchant) {
    // Legacy single merchant support (partial match for backward compatibility)
    query = query.ilike('merchant', `%${filters.merchant}%`);
  }

  return query;
}

// ============================================================================
// 1. KEY METRICS
// ============================================================================

export async function getDashboardMetrics(
  filters: DashboardFilters = {}
): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const userId = await getUserId();

  let transactions: any[];

  // BEST PRACTICE: Use RPC function for complex category filters
  // Supabase's .or() has known limitations with complex AND conditions
  if (filters.categorySecondaryMap !== undefined && Object.keys(filters.categorySecondaryMap).length > 0) {
    console.log('=== BACKEND: Using RPC function for category filter ===');
    console.log('categorySecondaryMap:', JSON.stringify(filters.categorySecondaryMap, null, 2));
    
    const { data, error } = await supabase.rpc('filter_transactions_by_categories', {
      p_user_id: userId,
      p_category_map: filters.categorySecondaryMap,
      p_only_spending: filters.onlySpending !== false,
      p_start_date: filters.startDate || null,
      p_end_date: filters.endDate || null,
    });

    if (error) {
      console.error('RPC function error:', error);
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    transactions = data || [];
    console.log('RPC returned', transactions.length, 'transactions');
    
    // Apply merchant filters in memory (RPC function doesn't support merchant filtering)
    transactions = applyMerchantFilter(transactions, filters);
    console.log('After merchant filter:', transactions.length, 'transactions');
  } else {
    // Use standard query builder for simple filters
    const baseQuery = buildBaseQuery(supabase, userId, filters);
    transactions = await paginateQuery<any>(baseQuery);
  }
  
  // Debug: Count transactions by category to verify filter is working
  const categoryCounts = new Map<string, number>();
  const categoryAmounts = new Map<string, number>();
  transactions.forEach(t => {
    const cat = t.category || 'Uncategorized';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    categoryAmounts.set(cat, (categoryAmounts.get(cat) || 0) + Number(t.amount_spending || 0));
  });

  // Calculate metrics
  const totalSpending = transactions.reduce(
    (sum, t) => sum + Number(t.amount_spending || 0),
    0
  );
  
  // Log to server console (terminal) - CHECK YOUR TERMINAL WHERE NEXT.JS IS RUNNING
  console.log('=== getDashboardMetrics ===');
  console.log('Filters received:', JSON.stringify(filters, null, 2));
  console.log('Transactions returned:', transactions.length);
  console.log('Total spending:', totalSpending);
  console.log('Category counts:', Object.fromEntries(categoryCounts));
  console.log('Category amounts:', Object.fromEntries(categoryAmounts));
  console.log('Sample transactions (first 10):', transactions.slice(0, 10).map(t => ({
    id: t.id,
    category: t.category,
    secondary_category: t.secondary_category,
    amount: t.amount_spending
  })));
  
  // If filter is applied but showing wrong categories, log warning
  if (filters.categorySecondaryMap && Object.keys(filters.categorySecondaryMap).length > 0) {
    const expectedCategories = Object.keys(filters.categorySecondaryMap);
    const actualCategories = Array.from(categoryCounts.keys());
    if (actualCategories.length !== expectedCategories.length || !expectedCategories.every(cat => actualCategories.includes(cat))) {
      console.error('⚠️ FILTER MISMATCH!');
      console.error('Expected categories:', expectedCategories);
      console.error('Actual categories:', actualCategories);
      console.error('This suggests the OR clause is not working correctly!');
    }
  }
  
  // Also log to a way that might show in browser (via error or return)
  // We'll return this in the metrics object temporarily for debugging
  const totalTransactions = transactions.length;
  const uncategorizedCount = transactions.filter(t => !t.category).length;

  // Get unique categories
  const uniqueCategories = new Set(
    transactions
      .map(t => t.category)
      .filter((cat): cat is string => cat !== null && cat !== undefined)
  );
  const categoriesCovered = uniqueCategories.size;

  const averageTransaction = totalTransactions > 0
    ? totalSpending / totalTransactions
    : 0;

  return {
    totalSpending,
    totalTransactions,
    categoriesCovered,
    averageTransaction,
    uncategorizedCount,
  };
}

// ============================================================================
// 2. SPENDING BY CATEGORY
// ============================================================================

export async function getSpendingByCategory(
  filters: DashboardFilters = {},
  categoryType: 'primary' | 'secondary' = 'primary'
): Promise<CategorySpending[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  let transactions: any[];
  
  // Use RPC function for complex category filters
  if (filters.categorySecondaryMap !== undefined && Object.keys(filters.categorySecondaryMap).length > 0) {
    transactions = await getTransactionsWithRPC(supabase, userId, filters);
    
    // Apply merchant filters in memory (RPC function doesn't support merchant filtering)
    transactions = applyMerchantFilter(transactions, filters);
  } else {
    const baseQuery = buildBaseQuery(supabase, userId, filters);
    transactions = await paginateQuery<any>(baseQuery);
  }

  // Group by category
  const categoryMap = new Map<string, { total: number; count: number }>();

  transactions.forEach((t) => {
    let category: string;
    if (categoryType === 'secondary') {
      category = t.secondary_category || 'Miscellaneous';
    } else {
      category = t.category || 'Uncategorized';
    }
    const amount = Number(t.amount_spending || 0);

    if (!categoryMap.has(category)) {
      categoryMap.set(category, { total: 0, count: 0 });
    }

    const stats = categoryMap.get(category)!;
    stats.total += amount;
    stats.count += 1;
  });

  // Calculate total for percentage
  const grandTotal = Array.from(categoryMap.values()).reduce(
    (sum, stats) => sum + stats.total,
    0
  );

  // Convert to array and calculate percentages
  const result: CategorySpending[] = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      total: stats.total,
      count: stats.count,
      percentage: grandTotal > 0 ? (stats.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total); // Sort by total descending

  return result;
}

// ============================================================================
// 3. TOP MERCHANTS
// ============================================================================

export async function getTopMerchants(
  limit: number = 20,
  filters: DashboardFilters = {}
): Promise<MerchantSpending[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const baseQuery = buildBaseQuery(supabase, userId, filters);
  const transactions = await paginateQuery<any>(baseQuery);

  // Group by merchant
  const merchantMap = new Map<string, { total: number; count: number }>();

  transactions.forEach((t) => {
    const merchant = t.merchant || 'Unknown';
    const amount = Number(t.amount_spending || 0);

    if (!merchantMap.has(merchant)) {
      merchantMap.set(merchant, { total: 0, count: 0 });
    }

    const stats = merchantMap.get(merchant)!;
    stats.total += amount;
    stats.count += 1;
  });

  // Convert to array, calculate averages, and sort
  const result: MerchantSpending[] = Array.from(merchantMap.entries())
    .map(([merchant, stats]) => ({
      merchant,
      total: stats.total,
      count: stats.count,
      average: stats.count > 0 ? stats.total / stats.count : 0,
    }))
    .sort((a, b) => b.total - a.total) // Sort by total descending
    .slice(0, limit);

  return result;
}

// ============================================================================
// 4. TIME SERIES (MONTHLY OR WEEKLY)
// ============================================================================

export async function getSpendingOverTime(
  granularity: 'monthly' | 'weekly' = 'monthly',
  filters: DashboardFilters = {}
): Promise<TimeSeriesData[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const baseQuery = buildBaseQuery(supabase, userId, filters);
  const transactions = await paginateQuery<any>(baseQuery);

  // Group by period
  const periodMap = new Map<string, { total: number; count: number }>();

  transactions.forEach((t) => {
    const date = new Date(t.transaction_date);
    let period: string;

    if (granularity === 'monthly') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      period = `${year}-${month}`;
    } else {
      // Weekly: Use start of week date (Sunday) formatted as MM/DD/YY
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - dayOfWeek); // Go back to Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const month = String(startOfWeek.getMonth() + 1).padStart(2, '0');
      const day = String(startOfWeek.getDate()).padStart(2, '0');
      const year = String(startOfWeek.getFullYear()).slice(-2);
      period = `${month}/${day}/${year}`;
    }

    if (!periodMap.has(period)) {
      periodMap.set(period, { total: 0, count: 0 });
    }

    const stats = periodMap.get(period)!;
    stats.total += Number(t.amount_spending || 0);
    stats.count += 1;
  });

  // Convert to array and sort by period
  const result: TimeSeriesData[] = Array.from(periodMap.entries())
    .map(([period, stats]) => ({
      period,
      total: stats.total,
      count: stats.count,
    }))
    .sort((a, b) => {
      // For monthly format (YYYY-MM), use string comparison
      if (a.period.includes('-') && b.period.includes('-')) {
        return a.period.localeCompare(b.period);
      }
      // For weekly format (MM/DD/YY), convert to date for proper sorting
      const parseDate = (dateStr: string): Date => {
        const [month, day, yearStr] = dateStr.split('/');
        const year = parseInt(yearStr);
        // Assume years 00-50 are 2000-2050, years 51-99 are 1951-1999
        const fullYear = year <= 50 ? 2000 + year : 1900 + year;
        return new Date(fullYear, parseInt(month) - 1, parseInt(day));
      };
      return parseDate(a.period).getTime() - parseDate(b.period).getTime();
    });

  return result;
}

// ============================================================================
// 4B. SPENDING BY CATEGORY OVER TIME
// ============================================================================

export async function getSpendingByCategoryOverTime(
  granularity: 'monthly' | 'weekly' = 'monthly',
  filters: DashboardFilters = {},
  metricType: 'amount' | 'count' = 'amount',
  categoryType: 'primary' | 'secondary' = 'primary'
): Promise<CategoryTimeSeriesData[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const baseQuery = buildBaseQuery(supabase, userId, filters);
  const transactions = await paginateQuery<any>(baseQuery);

  // Group by period and category
  const periodMap = new Map<string, Map<string, { amount: number; count: number }>>();

  transactions.forEach((t) => {
    const date = new Date(t.transaction_date);
    let period: string;

    if (granularity === 'monthly') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      period = `${year}-${month}`;
    } else {
      // Weekly: Use start of week date (Sunday) formatted as MM/DD/YY
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - dayOfWeek); // Go back to Sunday
      startOfWeek.setHours(0, 0, 0, 0);
      
      const month = String(startOfWeek.getMonth() + 1).padStart(2, '0');
      const day = String(startOfWeek.getDate()).padStart(2, '0');
      const year = String(startOfWeek.getFullYear()).slice(-2);
      period = `${month}/${day}/${year}`;
    }

    let category: string;
    if (categoryType === 'secondary') {
      category = t.secondary_category || 'Miscellaneous';
    } else {
      category = t.category || 'Uncategorized';
    }
    const amount = Number(t.amount_spending || 0);

    if (!periodMap.has(period)) {
      periodMap.set(period, new Map());
    }

    const categoryMap = periodMap.get(period)!;
    const current = categoryMap.get(category) || { amount: 0, count: 0 };
    categoryMap.set(category, {
      amount: current.amount + amount,
      count: current.count + 1,
    });
  });

  // Get all unique categories across all periods
  const allCategories = new Set<string>();
  periodMap.forEach((categoryMap) => {
    categoryMap.forEach((_, category) => {
      allCategories.add(category);
    });
  });

  // Convert to array format with all categories as keys
  const result: CategoryTimeSeriesData[] = Array.from(periodMap.entries())
    .map(([period, categoryMap]) => {
      const data: CategoryTimeSeriesData = { period };
      allCategories.forEach((category) => {
        const stats = categoryMap.get(category) || { amount: 0, count: 0 };
        data[category] = metricType === 'amount' ? stats.amount : stats.count;
      });
      return data;
    })
    .sort((a, b) => {
      // For monthly format (YYYY-MM), use string comparison
      if (a.period.includes('-') && b.period.includes('-')) {
        return a.period.localeCompare(b.period);
      }
      // For weekly format (MM/DD/YY), convert to date for proper sorting
      const parseDate = (dateStr: string): Date => {
        const [month, day, yearStr] = dateStr.split('/');
        const year = parseInt(yearStr);
        // Assume years 00-50 are 2000-2050, years 51-99 are 1951-1999
        const fullYear = year <= 50 ? 2000 + year : 1900 + year;
        return new Date(fullYear, parseInt(month) - 1, parseInt(day));
      };
      return parseDate(a.period).getTime() - parseDate(b.period).getTime();
    });

  return result;
}

// ============================================================================
// 5. RECENT TRANSACTIONS
// ============================================================================

export async function getRecentTransactions(
  limit: number = 50,
  filters: DashboardFilters = {}
): Promise<TransactionRow[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  let transactions: any[];
  
  // Use RPC function for complex category filters
  if (filters.categorySecondaryMap !== undefined && Object.keys(filters.categorySecondaryMap).length > 0) {
    transactions = await getTransactionsWithRPC(supabase, userId, filters);
    
    // Apply merchant filters in memory (RPC function doesn't support merchant filtering)
    transactions = applyMerchantFilter(transactions, filters);
    
    // Sort and limit in memory
    transactions = transactions
      .sort((a, b) => {
        const dateDiff = new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
        return dateDiff !== 0 ? dateDiff : b.id - a.id;
      })
      .slice(0, limit);
  } else {
    const baseQuery = buildBaseQuery(supabase, userId, filters);
    const { data, error } = await baseQuery
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    
    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }
    transactions = data || [];
  }

  return transactions.map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant || 'Unknown',
    amount: Number(t.amount_spending || 0),
    category: t.category || null,
    secondaryCategory: t.secondary_category || null,
    notes: t.notes || null,
    sourceFilename: t.source_filename || null,
  }));
}

// ============================================================================
// 6. PAGINATED TRANSACTIONS (for tables)
// ============================================================================

export async function getPaginatedTransactions(
  page: number = 0,
  pageSize: number = 50,
  filters: DashboardFilters = {},
  sortColumn: string = 'transaction_date',
  sortDirection: 'asc' | 'desc' = 'desc'
): Promise<{
  transactions: TransactionRow[];
  total: number;
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const userId = await getUserId();

  // BEST PRACTICE: Use RPC function for complex category filters
  if (filters.categorySecondaryMap !== undefined && Object.keys(filters.categorySecondaryMap).length > 0) {
    let allTransactions: any[];
    // Use RPC function - get all transactions, then paginate/sort in memory
    allTransactions = await getTransactionsWithRPC(supabase, userId, filters);
    
    // Apply merchant filters in memory (RPC function doesn't support merchant filtering)
    allTransactions = applyMerchantFilter(allTransactions, filters);
    
    const total = allTransactions.length;
    
    // Map frontend column names to database column names
    const columnMap: Record<string, string> = {
      date: 'transaction_date',
      merchant: 'merchant',
      amount: 'amount_spending',
      category: 'category',
      notes: 'notes',
    };
    
    const dbColumn = columnMap[sortColumn] || 'transaction_date';
    
    // Sort transactions
    allTransactions.sort((a, b) => {
      let aVal: any = a[dbColumn];
      let bVal: any = b[dbColumn];
      
      // Handle date sorting
      if (dbColumn === 'transaction_date') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle numeric sorting
      if (dbColumn.includes('amount') || dbColumn.includes('spending')) {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      }
      
      // Handle string sorting (case-insensitive)
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      // Compare
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      
      // Secondary sort by ID for consistency
      return b.id - a.id;
    });
    
    // Paginate
    const start = page * pageSize;
    const end = start + pageSize;
    const paginatedTransactions = allTransactions.slice(start, end);
    
    return {
      transactions: paginatedTransactions.map((t: any) => ({
        id: t.id,
        date: t.transaction_date,
        merchant: t.merchant || 'Unknown',
        amount: Number(t.amount_spending || 0),
        category: t.category || null,
        secondaryCategory: t.secondary_category || null,
        notes: t.notes || null,
        sourceFilename: t.source_filename || null,
      })),
      total,
      hasMore: end < total,
    };
  }

  // Use standard query builder for simple filters
  // Get total count - build query with select first, then filters
  let countQueryBuilder = supabase
    .from('transactions_v2')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  
  // Apply filters to count query (must reassign to maintain chain)
  if (filters.onlySpending !== false) {
    countQueryBuilder = countQueryBuilder.gt('amount_spending', 0);
  }
  if (filters.startDate) {
    countQueryBuilder = countQueryBuilder.gte('transaction_date', filters.startDate);
  }
  if (filters.endDate) {
    countQueryBuilder = countQueryBuilder.lte('transaction_date', filters.endDate);
  }
  
  // Apply category filtering logic to count query
  if (filters.categorySecondaryMap !== undefined) {
    const conditions: string[] = [];
    
    for (const [primary, secondaries] of Object.entries(filters.categorySecondaryMap)) {
      // Check for "__OTHER__" (null secondary_category)
      const hasOther = secondaries.includes('__OTHER__');
      const otherSecondaries = secondaries.filter(s => s !== '__OTHER__');
      
      if (otherSecondaries.length > 0) {
        for (const secondary of otherSecondaries) {
          // Quote the secondary value to handle spaces and special characters
          const quotedSecondary = `"${secondary}"`;
          conditions.push(`category.eq.${primary},secondary_category.eq.${quotedSecondary}`);
        }
      }
      
      // Handle "Other" (null secondary_category)
      if (hasOther) {
        conditions.push(`category.eq.${primary},secondary_category.is.null`);
      }
    }
    
    if (conditions.length > 0) {
      countQueryBuilder = countQueryBuilder.or(conditions.join(','));
    } else {
      // No valid conditions - this means categorySecondaryMap was provided but is empty
      // This happens when user unchecks all secondaries for a primary
      // In this case, fall back to categories if they exist (show all for that primary)
      if (filters.categories && filters.categories.length > 0) {
        console.log('Empty categorySecondaryMap in count, falling back to categories:', filters.categories);
        countQueryBuilder = countQueryBuilder.in('category', filters.categories);
      } else {
        // No categories either, return empty result
        countQueryBuilder = countQueryBuilder.eq('id', -1);
      }
    }
  } else if (filters.categories && filters.categories.length > 0) {
    // Fallback: Only primary categories selected (no nested structure)
    if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
      // Both primary and secondary selected: filter for exact combinations
      // Build OR conditions for each valid primary+secondary combination
      const hasOther = filters.secondaryCategories.includes('__OTHER__');
      const otherSecondaries = filters.secondaryCategories.filter(c => c !== '__OTHER__');
      
      const conditions: string[] = [];
      
      for (const primary of filters.categories) {
        if (otherSecondaries.length > 0) {
          for (const secondary of otherSecondaries) {
            conditions.push(`category.eq.${primary},secondary_category.eq.${secondary}`);
          }
        }
        if (hasOther) {
          conditions.push(`category.eq.${primary},secondary_category.is.null`);
        }
      }
      
      if (conditions.length > 0) {
        countQueryBuilder = countQueryBuilder.or(conditions.join(','));
      }
    } else {
      countQueryBuilder = countQueryBuilder.in('category', filters.categories);
    }
  } else if (filters.category) {
    // Legacy single category support
    if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
      const hasOther = filters.secondaryCategories.includes('__OTHER__');
      const otherSecondaries = filters.secondaryCategories.filter(c => c !== '__OTHER__');
      
      const conditions: string[] = [];
      if (otherSecondaries.length > 0) {
        for (const secondary of otherSecondaries) {
          // Quote the secondary value to handle spaces and special characters
          const quotedSecondary = `"${secondary}"`;
          conditions.push(`category.eq.${filters.category},secondary_category.eq.${quotedSecondary}`);
        }
      }
      if (hasOther) {
        conditions.push(`category.eq.${filters.category},secondary_category.is.null`);
      }
      
      if (conditions.length > 0) {
        countQueryBuilder = countQueryBuilder.or(conditions.join(','));
      }
    } else {
      countQueryBuilder = countQueryBuilder.eq('category', filters.category);
    }
  } else if (filters.secondaryCategories && filters.secondaryCategories.length > 0) {
    // Only secondary categories selected (no primary)
    const hasOther = filters.secondaryCategories.includes('__OTHER__');
    const otherCategories = filters.secondaryCategories.filter(c => c !== '__OTHER__');
    
    if (hasOther && otherCategories.length > 0) {
      countQueryBuilder = countQueryBuilder.or(`secondary_category.is.null,secondary_category.in.(${otherCategories.map(c => `"${c}"`).join(',')})`);
    } else if (hasOther) {
      countQueryBuilder = countQueryBuilder.is('secondary_category', null);
    } else {
      countQueryBuilder = countQueryBuilder.in('secondary_category', otherCategories);
    }
  }
  // Merchant filter
  // Support both single merchant (legacy) and multiple merchants (OR logic)
  if (filters.merchants && filters.merchants.length > 0) {
    // Multiple merchants: use OR logic with exact match (since these are selected from typeahead)
    if (filters.merchants.length === 1) {
      countQueryBuilder = countQueryBuilder.ilike('merchant', filters.merchants[0]);
    } else {
      // For multiple merchants, use OR with exact match
      const merchantConditions = filters.merchants
        .map(m => `merchant.ilike.${m}`)
        .join(',');
      countQueryBuilder = countQueryBuilder.or(merchantConditions);
    }
  } else if (filters.merchant) {
    // Legacy single merchant support (partial match for backward compatibility)
    countQueryBuilder = countQueryBuilder.ilike('merchant', `%${filters.merchant}%`);
  }

  // Get total count
  const { count, error: countError } = await countQueryBuilder;

  if (countError) {
    console.error('Count query error:', countError);
    throw new Error(`Failed to get count: ${countError.message}`);
  }

  const total = count || 0;
  console.log('Transaction count:', total, 'Filters:', filters);

  // Map frontend column names to database column names
  const columnMap: Record<string, string> = {
    date: 'transaction_date',
    merchant: 'merchant',
    amount: 'amount_spending',
    category: 'category',
    notes: 'notes',
  };

  const dbColumn = columnMap[sortColumn] || 'transaction_date';
  const ascending = sortDirection === 'asc';

  // Get paginated data
  const dataQuery = buildBaseQuery(supabase, userId, filters);
  let query = dataQuery
    .select('id, transaction_date, merchant, amount_spending, category, secondary_category, notes, source_filename')
    .order(dbColumn, { ascending });

  // Add secondary sort for consistency when sorting by non-unique columns
  if (dbColumn !== 'id') {
    query = query.order('id', { ascending: false });
  }

  const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    console.error('Data query error:', error);
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  console.log('Fetched transactions:', data?.length || 0, 'out of total:', total);

  const transactions = (data || []).map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant || 'Unknown',
    amount: Number(t.amount_spending || 0),
    category: t.category || null,
    secondaryCategory: t.secondary_category || null,
    notes: t.notes || null,
    sourceFilename: t.source_filename || null,
  }));

  return {
    transactions,
    total,
    hasMore: (page + 1) * pageSize < total,
  };
}

// ============================================================================
// 7. GET UNIQUE CATEGORIES (for filter dropdown)
// ============================================================================

export async function getAvailableCategories(): Promise<string[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('transactions_v2')
    .select('category')
    .eq('user_id', userId)
    .not('category', 'is', null)
    .limit(10000); // Should be enough for unique categories

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  const uniqueCategories = Array.from(
    new Set((data || []).map((t: any) => t.category).filter(Boolean))
  ).sort();

  return uniqueCategories;
}

// ============================================================================
// 8. GET UNIQUE MERCHANTS (for autocomplete)
// ============================================================================

export async function getAvailableMerchants(search?: string): Promise<string[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  let query = supabase
    .from('transactions_v2')
    .select('merchant')
    .eq('user_id', userId)
    .not('merchant', 'is', null)
    .limit(1000); // Limit for performance

  if (search) {
    query = query.ilike('merchant', `%${search}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch merchants: ${error.message}`);
  }

  const uniqueMerchants = Array.from(
    new Set((data || []).map((t: any) => t.merchant).filter(Boolean))
  ).sort();

  return uniqueMerchants;
}

// ============================================================================
// 9. UPDATE TRANSACTION CATEGORIES
// ============================================================================

/**
 * Update a single transaction's category
 */
export async function updateTransactionCategory(
  transactionId: number,
  category: string | null
): Promise<void> {
  const supabase = await createClient();
  const userId = await getUserId();

  // Verify ownership
  const { data: transaction, error: checkError } = await supabase
    .from('transactions_v2')
    .select('id')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .single();

  if (checkError || !transaction) {
    throw new Error('Transaction not found or access denied');
  }

  // Update category
  const { error: updateError } = await supabase
    .from('transactions_v2')
    .update({ category })
    .eq('id', transactionId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to update transaction: ${updateError.message}`);
  }
}

/**
 * Bulk update categories for multiple transactions
 */
export async function bulkUpdateTransactionCategories(
  transactionIds: number[],
  category: string
): Promise<{ success: boolean; updated: number; error?: string }> {
  const supabase = await createClient();
  const userId = await getUserId();

  if (transactionIds.length === 0) {
    return { success: false, updated: 0, error: 'No transactions selected' };
  }

  // Verify ownership of all transactions
  const { data: transactions, error: checkError } = await supabase
    .from('transactions_v2')
    .select('id')
    .eq('user_id', userId)
    .in('id', transactionIds);

  if (checkError) {
    return { success: false, updated: 0, error: checkError.message };
  }

  if (!transactions || transactions.length !== transactionIds.length) {
    return { success: false, updated: 0, error: 'Some transactions not found or access denied' };
  }

  // Update all transactions
  const { data: updated, error: updateError } = await supabase
    .from('transactions_v2')
    .update({ category })
    .eq('user_id', userId)
    .in('id', transactionIds)
    .select();

  if (updateError) {
    return { success: false, updated: 0, error: updateError.message };
  }

  return { success: true, updated: updated?.length || 0 };
}

/**
 * Update secondary category for a single transaction
 */
export async function updateTransactionSecondaryCategory(
  transactionId: number,
  secondaryCategory: string | null,
  primaryCategory?: string | null
): Promise<void> {
  const supabase = await createClient();
  const userId = await getUserId();

  // Verify ownership and get current transaction data
  const { data: transaction, error: checkError } = await supabase
    .from('transactions_v2')
    .select('id, category')
    .eq('id', transactionId)
    .eq('user_id', userId)
    .single();

  if (checkError || !transaction) {
    throw new Error('Transaction not found or access denied');
  }

  // Use provided primaryCategory or get from transaction
  const primaryCat = primaryCategory || transaction.category;

  // Create mapping if secondary category is being set and primary category exists
  if (secondaryCategory && primaryCat) {
    await ensureSecondaryCategoryMapping(primaryCat, secondaryCategory);
  }

  // Update secondary category
  const { error: updateError } = await supabase
    .from('transactions_v2')
    .update({ secondary_category: secondaryCategory })
    .eq('id', transactionId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error(`Failed to update transaction: ${updateError.message}`);
  }
}

/**
 * Bulk update secondary categories for multiple transactions
 */
export async function bulkUpdateTransactionSecondaryCategories(
  transactionIds: number[],
  secondaryCategory: string | null,
  primaryCategory?: string | null
): Promise<{ success: boolean; updated: number; error?: string }> {
  const supabase = await createClient();
  const userId = await getUserId();

  if (transactionIds.length === 0) {
    return { success: false, updated: 0, error: 'No transactions selected' };
  }

  // Verify ownership and get primary categories
  const { data: transactions, error: checkError } = await supabase
    .from('transactions_v2')
    .select('id, category')
    .eq('user_id', userId)
    .in('id', transactionIds);

  if (checkError) {
    return { success: false, updated: 0, error: checkError.message };
  }

  if (!transactions || transactions.length !== transactionIds.length) {
    return { success: false, updated: 0, error: 'Some transactions not found or access denied' };
  }

  // Create mappings for all unique primary categories if secondary is being set
  if (secondaryCategory) {
    const primaryCategories = new Set<string>();
    transactions.forEach((t: any) => {
      const primaryCat = primaryCategory || t.category;
      if (primaryCat) {
        primaryCategories.add(primaryCat);
      }
    });

    // Create mappings for all primary categories
    for (const primaryCat of primaryCategories) {
      await ensureSecondaryCategoryMapping(primaryCat, secondaryCategory);
    }
  }

  // Update all transactions
  const { data: updated, error: updateError } = await supabase
    .from('transactions_v2')
    .update({ secondary_category: secondaryCategory })
    .eq('user_id', userId)
    .in('id', transactionIds)
    .select();

  if (updateError) {
    return { success: false, updated: 0, error: updateError.message };
  }

  return { success: true, updated: updated?.length || 0 };
}

/**
 * Get all categories from the categories table
 */
export async function getAllCategories(): Promise<Array<{ id: number; name: string }>> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .order('name');

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all unique secondary categories for the current user
 */
/**
 * Get secondary categories for a specific primary category
 */
export async function getSecondaryCategoriesForPrimary(
  primaryCategory: string
): Promise<string[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('secondary_category_mappings')
    .select('secondary_category')
    .eq('user_id', userId)
    .eq('primary_category', primaryCategory)
    .order('secondary_category');

  if (error) {
    throw new Error(`Failed to fetch secondary categories: ${error.message}`);
  }

  return (data || []).map((m: any) => m.secondary_category);
}

/**
 * Get all categories with their nested secondary categories
 * Returns a map of primary category -> array of secondary categories
 */
export async function getCategoriesWithSecondaries(): Promise<Map<string, string[]>> {
  const supabase = await createClient();
  const userId = await getUserId();

  // Try using RPC function first (bypasses PostgREST schema cache)
  // This is the recommended solution for schema cache issues
  console.log('Attempting to call RPC function get_category_mappings...');
  try {
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_category_mappings');

    console.log('RPC call completed. Data:', rpcData, 'Error:', rpcError);

    // Log for debugging
    if (rpcError) {
      console.error('RPC function error details:', {
        message: rpcError.message,
        code: rpcError.code,
        hint: rpcError.hint,
        details: rpcError.details,
        fullError: rpcError,
      });
    } else if (rpcData) {
      console.log('RPC function succeeded, returned', rpcData.length, 'mappings');
    } else {
      console.warn('RPC function returned no data and no error');
    }

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      // Group by primary category
      const categoryMap = new Map<string, string[]>();
      rpcData.forEach((m: any) => {
        if (m.primary_category && m.secondary_category) {
          const secondaries = categoryMap.get(m.primary_category) || [];
          if (!secondaries.includes(m.secondary_category)) {
            secondaries.push(m.secondary_category);
          }
          categoryMap.set(m.primary_category, secondaries);
        }
      });
      console.log('Category map created with', categoryMap.size, 'primary categories');
      return categoryMap;
    }
    
    // If RPC function doesn't exist yet, fall through to direct query
    if (rpcError) {
      console.warn('RPC function error, falling back to direct query:', rpcError.message);
    }
  } catch (e: any) {
    // RPC function might not exist yet, fall through to direct query
    console.error('RPC function exception:', e?.message || e);
  }

  // Fallback to direct table query (will fail if schema cache is stale)
  try {
    const { data, error } = await supabase
      .from('secondary_category_mappings')
      .select('primary_category, secondary_category')
      .eq('user_id', userId)
      .order('primary_category')
      .order('secondary_category');

    // If table doesn't exist or schema cache is stale, return empty map
    if (error) {
      const isTableNotFoundError = 
        error.message?.includes('Could not find the table') || 
        error.message?.includes('does not exist') ||
        error.message?.includes('relation') && error.message?.includes('does not exist') ||
        error.message?.includes('schema cache') ||
        error.code === '42P01' ||
        error.code === 'PGRST116' ||
        error.hint?.includes('relation');

      if (isTableNotFoundError) {
        console.warn('secondary_category_mappings table not found in schema cache. Run migration 008_add_get_category_mappings_function.sql to use RPC function (bypasses schema cache).');
        return new Map<string, string[]>();
      }
      console.warn('Error fetching category mappings:', error.message);
      return new Map<string, string[]>();
    }

    // Group by primary category
    const categoryMap = new Map<string, string[]>();
    (data || []).forEach((m: any) => {
      const secondaries = categoryMap.get(m.primary_category) || [];
      if (!secondaries.includes(m.secondary_category)) {
        secondaries.push(m.secondary_category);
      }
      categoryMap.set(m.primary_category, secondaries);
    });

    return categoryMap;
  } catch (e: any) {
    console.warn('Error fetching category mappings:', e?.message || e);
    return new Map<string, string[]>();
  }
}

/**
 * Create or ensure a mapping exists between primary and secondary category
 */
export async function ensureSecondaryCategoryMapping(
  primaryCategory: string,
  secondaryCategory: string
): Promise<void> {
  const supabase = await createClient();
  const userId = await getUserId();

  // Insert mapping if it doesn't exist (using ON CONFLICT DO NOTHING)
  const { error } = await supabase
    .from('secondary_category_mappings')
    .insert({
      user_id: userId,
      primary_category: primaryCategory,
      secondary_category: secondaryCategory,
    })
    .select();

  // If table doesn't exist, just log a warning (graceful degradation)
  if (error) {
    if (error.message.includes('Could not find the table') || 
        error.message.includes('does not exist') ||
        error.code === '42P01') {
      console.warn('secondary_category_mappings table does not exist yet. Cannot create mapping.');
      return; // Don't throw, just return
    }
    // Ignore unique constraint errors (mapping already exists)
    if (!error.message.includes('duplicate key')) {
      throw new Error(`Failed to create mapping: ${error.message}`);
    }
  }
}

/**
 * Legacy function - kept for backward compatibility
 * Returns all secondary categories (flattened, not grouped by primary)
 */
export async function getAvailableSecondaryCategories(): Promise<string[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('secondary_category_mappings')
    .select('secondary_category')
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to fetch secondary categories: ${error.message}`);
  }

  const uniqueCategories = Array.from(
    new Set((data || []).map((m: any) => m.secondary_category).filter(Boolean))
  ).sort();

  return uniqueCategories;
}

/**
 * Find transaction by merchant name and return source file (card)
 */
export async function findTransactionSource(merchantSearch: string): Promise<Array<{
  id: number;
  merchant: string;
  amount: number;
  date: string;
  sourceFilename: string;
}>> {
  const supabase = await createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('transactions_v2')
    .select('id, merchant, amount_spending, transaction_date, source_filename')
    .eq('user_id', userId)
    .ilike('merchant', `%${merchantSearch}%`)
    .order('transaction_date', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Failed to search transactions: ${error.message}`);
  }

  return (data || []).map((t: any) => ({
    id: t.id,
    merchant: t.merchant,
    amount: Number(t.amount_spending || 0),
    date: t.transaction_date,
    sourceFilename: t.source_filename,
  }));
}

