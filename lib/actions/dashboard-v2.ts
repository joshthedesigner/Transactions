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
  notes: string | null;
};

export type DashboardFilters = {
  startDate?: string;
  endDate?: string;
  category?: string; // Single category (deprecated, use categories)
  categories?: string[]; // Multiple categories
  merchant?: string;
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
// HELPER: Build base query with filters
// ============================================================================

function buildBaseQuery(supabase: any, userId: string, filters: DashboardFilters = {}) {
  let query = supabase
    .from('transactions_v2')
    .select('*')
    .eq('user_id', userId);

  // Only spending transactions by default
  if (filters.onlySpending !== false) {
    query = query.gt('amount_spending', 0);
  }

  // Date range filter
  if (filters.startDate) {
    query = query.gte('transaction_date', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('transaction_date', filters.endDate);
  }

  // Category filter (support multiple categories)
  if (filters.categories && filters.categories.length > 0) {
    query = query.in('category', filters.categories);
  } else if (filters.category) {
    // Legacy single category support
    query = query.eq('category', filters.category);
  }

  // Merchant filter (case-insensitive partial match)
  if (filters.merchant) {
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

  const baseQuery = buildBaseQuery(supabase, userId, filters);

  // Get all transactions with pagination
  const transactions = await paginateQuery<any>(baseQuery);

  // Calculate metrics
  const totalSpending = transactions.reduce(
    (sum, t) => sum + Number(t.amount_spending || 0),
    0
  );
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
  filters: DashboardFilters = {}
): Promise<CategorySpending[]> {
  const supabase = await createClient();
  const userId = await getUserId();

  const baseQuery = buildBaseQuery(supabase, userId, filters);
  const transactions = await paginateQuery<any>(baseQuery);

  // Group by category
  const categoryMap = new Map<string, { total: number; count: number }>();

  transactions.forEach((t) => {
    const category = t.category || 'Uncategorized';
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
  metricType: 'amount' | 'count' = 'amount'
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

    const category = t.category || 'Uncategorized';
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

  const baseQuery = buildBaseQuery(supabase, userId, filters);

  const { data, error } = await baseQuery
    .select('id, transaction_date, merchant, amount_spending, category, notes')
    .order('transaction_date', { ascending: false })
    .order('id', { ascending: false }) // Secondary sort for consistency
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return (data || []).map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant || 'Unknown',
    amount: Number(t.amount_spending || 0),
    category: t.category || null,
    notes: t.notes || null,
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

  // Build separate queries for count and data (Supabase query builders are mutable)
  const countQuery = buildBaseQuery(supabase, userId, filters);
  const dataQuery = buildBaseQuery(supabase, userId, filters);

  // Get total count
  const { count, error: countError } = await countQuery
    .select('*', { count: 'exact', head: true });

  if (countError) {
    throw new Error(`Failed to get count: ${countError.message}`);
  }

  const total = count || 0;

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
  let query = dataQuery
    .select('id, transaction_date, merchant, amount_spending, category, notes')
    .order(dbColumn, { ascending });

  // Add secondary sort for consistency when sorting by non-unique columns
  if (dbColumn !== 'id') {
    query = query.order('id', { ascending: false });
  }

  const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  const transactions = (data || []).map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    merchant: t.merchant || 'Unknown',
    amount: Number(t.amount_spending || 0),
    category: t.category || null,
    notes: t.notes || null,
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

