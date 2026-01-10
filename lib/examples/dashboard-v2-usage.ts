/**
 * Example usage of the Production Dashboard V2
 * 
 * This file demonstrates how to use the dashboard actions and components.
 */

import {
  getDashboardMetrics,
  getSpendingByCategory,
  getTopMerchants,
  getSpendingOverTime,
  getRecentTransactions,
  getPaginatedTransactions,
  getAvailableCategories,
  getAvailableMerchants,
  type DashboardFilters,
} from '@/lib/actions/dashboard-v2';

// ============================================================================
// EXAMPLE 1: Get Basic Metrics
// ============================================================================

export async function exampleGetMetrics() {
  // Get all-time metrics
  const metrics = await getDashboardMetrics();
  
  console.log('Total Spending:', metrics.totalSpending);
  console.log('Total Transactions:', metrics.totalTransactions);
  console.log('Categories Covered:', metrics.categoriesCovered);
  console.log('Average Transaction:', metrics.averageTransaction);
  console.log('Uncategorized:', metrics.uncategorizedCount);
}

// ============================================================================
// EXAMPLE 2: Get Metrics with Date Range Filter
// ============================================================================

export async function exampleGetMetricsWithDateRange() {
  const filters: DashboardFilters = {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    onlySpending: true,
  };

  const metrics = await getDashboardMetrics(filters);
  console.log('2024 Metrics:', metrics);
}

// ============================================================================
// EXAMPLE 3: Get Spending by Category
// ============================================================================

export async function exampleGetCategorySpending() {
  const categoryData = await getSpendingByCategory();
  
  categoryData.forEach((cat) => {
    console.log(`${cat.category}: ${cat.total} (${cat.percentage.toFixed(1)}%)`);
  });
}

// ============================================================================
// EXAMPLE 4: Get Top Merchants
// ============================================================================

export async function exampleGetTopMerchants() {
  // Get top 10 merchants
  const merchants = await getTopMerchants(10);
  
  merchants.forEach((merchant) => {
    console.log(`${merchant.merchant}: ${merchant.total} (${merchant.count} transactions)`);
  });
}

// ============================================================================
// EXAMPLE 5: Get Time Series Data
// ============================================================================

export async function exampleGetTimeSeries() {
  // Monthly view
  const monthly = await getSpendingOverTime('monthly');
  console.log('Monthly spending:', monthly);

  // Weekly view
  const weekly = await getSpendingOverTime('weekly');
  console.log('Weekly spending:', weekly);
}

// ============================================================================
// EXAMPLE 6: Get Recent Transactions
// ============================================================================

export async function exampleGetRecentTransactions() {
  const recent = await getRecentTransactions(20);
  
  recent.forEach((transaction) => {
    console.log(`${transaction.date} - ${transaction.merchant}: ${transaction.amount}`);
  });
}

// ============================================================================
// EXAMPLE 7: Get Paginated Transactions
// ============================================================================

export async function exampleGetPaginatedTransactions() {
  let page = 0;
  const pageSize = 50;
  let hasMore = true;

  while (hasMore) {
    const result = await getPaginatedTransactions(page, pageSize);
    
    console.log(`Page ${page + 1}: ${result.transactions.length} transactions`);
    console.log(`Total: ${result.total}`);
    
    hasMore = result.hasMore;
    page++;
  }
}

// ============================================================================
// EXAMPLE 8: Get Available Categories for Filter
// ============================================================================

export async function exampleGetCategories() {
  const categories = await getAvailableCategories();
  console.log('Available categories:', categories);
}

// ============================================================================
// EXAMPLE 9: Search Merchants (Autocomplete)
// ============================================================================

export async function exampleSearchMerchants() {
  // Search for merchants containing "amazon"
  const merchants = await getAvailableMerchants('amazon');
  console.log('Merchants matching "amazon":', merchants);
}

// ============================================================================
// EXAMPLE 10: Complex Filtering
// ============================================================================

export async function exampleComplexFiltering() {
  const filters: DashboardFilters = {
    startDate: '2024-06-01',
    endDate: '2024-06-30',
    category: 'Dining',
    merchant: 'restaurant',
    onlySpending: true,
  };

  // Get metrics with filters
  const metrics = await getDashboardMetrics(filters);
  console.log('June Dining at restaurants:', metrics);

  // Get category breakdown (will only show Dining)
  const categories = await getSpendingByCategory(filters);
  console.log('Category breakdown:', categories);

  // Get time series (will only show June)
  const timeSeries = await getSpendingOverTime('weekly', filters);
  console.log('Weekly spending in June:', timeSeries);
}

// ============================================================================
// EXAMPLE 11: Using in a React Component
// ============================================================================

/**
 * Example React component usage:
 * 
 * ```tsx
 * 'use client';
 * 
 * import { useEffect, useState } from 'react';
 * import { getDashboardMetrics } from '@/lib/actions/dashboard-v2';
 * 
 * export default function MyDashboard() {
 *   const [metrics, setMetrics] = useState(null);
 *   const [loading, setLoading] = useState(true);
 * 
 *   useEffect(() => {
 *     async function load() {
 *       try {
 *         const data = await getDashboardMetrics();
 *         setMetrics(data);
 *       } catch (error) {
 *         console.error('Error:', error);
 *       } finally {
 *         setLoading(false);
 *       }
 *     }
 *     load();
 *   }, []);
 * 
 *   if (loading) return <div>Loading...</div>;
 *   if (!metrics) return <div>No data</div>;
 * 
 *   return (
 *     <div>
 *       <h1>Total Spending: ${metrics.totalSpending}</h1>
 *       <p>Transactions: {metrics.totalTransactions}</p>
 *     </div>
 *   );
 * }
 * ```
 */

// ============================================================================
// EXAMPLE 12: Integration with Charts (Recharts)
// ============================================================================

/**
 * Example chart integration:
 * 
 * ```tsx
 * import { BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
 * import { getSpendingByCategory } from '@/lib/actions/dashboard-v2';
 * 
 * export default async function CategoryChart() {
 *   const data = await getSpendingByCategory();
 * 
 *   return (
 *     <BarChart width={600} height={300} data={data}>
 *       <XAxis dataKey="category" />
 *       <YAxis />
 *       <Tooltip />
 *       <Bar dataKey="total" fill="#3b82f6" />
 *     </BarChart>
 *   );
 * }
 * ```
 */

