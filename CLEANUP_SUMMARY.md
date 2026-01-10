# Legacy Code Cleanup Summary

## Overview
This cleanup removed all legacy code related to the old `transactions` table and deprecated upload functions, now that `transactions_v2` is fully live and serving as the single source of truth.

## Files Removed

### Legacy Upload
- `lib/actions/upload-transactions.ts` - Deprecated upload function (replaced by `upload-transactions-v2.ts`)

### Legacy Debug/Diagnostic Pages (89 files removed)
- All `app/debug-*` pages
- All `app/diagnose-*` pages  
- All `app/check-*` pages
- All `app/cleanup-*` pages
- All `app/compare-*` pages
- All `app/verify-cleanup` pages
- `app/simple-upload` page
- `app/test-summary-metrics` page
- All related API routes in `app/api/`

### Legacy Action Files
- All `lib/actions/debug-*` files
- All `lib/actions/diagnose-*` files
- All `lib/actions/check-*` files
- All `lib/actions/cleanup-*` files
- All `lib/actions/compare-*` files
- All `lib/actions/find-*` files
- All `lib/actions/import-*` files
- `lib/actions/simple-upload.ts`
- `lib/actions/test-*` files
- `lib/actions/get-db-status.ts`
- `lib/actions/list-source-files.ts`
- `lib/actions/raw-db-totals.ts`
- `lib/actions/explain-transaction-values.ts`
- `lib/actions/create-failed-transactions.ts`

### Legacy Scripts
- All `scripts/diagnose-*` files
- All `scripts/check-*` files
- `scripts/query-raw-totals.ts`
- `scripts/confirm-discrepancy.ts`
- `scripts/run-diagnostic.ts`

## Code Updates

### Analytics (`lib/actions/analytics.ts`)
- Updated all functions to use `category` (TEXT) instead of `category_id` (INTEGER)
- Removed joins with `categories` table
- Changed function parameters from `categoryId: number` to `categoryName: string`
- Functions updated:
  - `getMonthlySpendByCategory()`
  - `getTotalSpendOverTime()`
  - `getCategoryTrend()`
  - `getFilteredTransactions()`
  - `getSummaryMetrics()`

### Review Queue (`lib/actions/review-queue.ts`)
- Updated to use `category` (TEXT) field instead of `category_id`
- Created new `ReviewQueueTransaction` type (replaces `TransactionWithCategory`)
- Updated all functions to work with category names:
  - `getReviewQueue()` - now filters by `category IS NULL`
  - `acceptTransaction()` - uses category name
  - `changeTransactionCategory()` - accepts category name, maps to category_id for merchant rules
  - `bulkApplyCategory()` - accepts category name
  - `acceptAllTransactions()` - works with category names

### Review Queue Component (`app/components/ReviewQueue.tsx`)
- Updated to use `ReviewQueueTransaction` type
- Changed from category IDs to category names throughout
- Removed legacy fields: `merchant_raw`, `merchant_normalized`, `confidence_score`, `status`
- Simplified to work with `transactions_v2` schema

### Types (`lib/types/database.ts`)
- Marked `Transaction` and `TransactionWithCategory` as `@deprecated`
- Added comments directing to use `TransactionV2` and `TransactionV2Insert` instead

## Statistics
- **89 files deleted**
- **14,268 lines of code removed**
- **161 lines of updated code**

## Remaining Active Pages
All these pages use `transactions_v2` and remain active:
- `/` - Main dashboard (DashboardV2)
- `/upload` - File upload
- `/test-upload` - Test upload page
- `/verify-upload` - Upload verification
- `/dashboard-v2` - Production dashboard
- `/categorization-status` - Categorization performance
- `/analyze-misc` - Misc category analysis
- `/categorize-amex` - ML categorization tool

## Verification Checklist
- ✅ Legacy upload function removed
- ✅ All debug/diagnostic pages removed
- ✅ Analytics updated to use category TEXT field
- ✅ Review Queue updated to use category TEXT field
- ✅ Legacy types marked as deprecated
- ✅ No broken imports (linting passes)

## Next Steps
1. Test file upload via `/test-upload` or `/upload`
2. Verify dashboard shows accurate totals
3. Test review queue functionality
4. Verify analytics charts work correctly

