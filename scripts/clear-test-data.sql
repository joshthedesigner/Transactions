-- Clear test transactions and related data
-- Run this in Supabase SQL Editor to delete all transactions

-- Delete transactions (this will cascade to any dependent data if foreign keys are set up)
DELETE FROM transactions;

-- Optionally delete source files (uncomment if you want to remove file records too)
-- DELETE FROM source_files;

-- Reset any sequences if needed (optional)
-- This is usually not necessary, but can be useful if you want to reset IDs

-- Verify deletion
SELECT COUNT(*) as remaining_transactions FROM transactions;
SELECT COUNT(*) as remaining_source_files FROM source_files;




