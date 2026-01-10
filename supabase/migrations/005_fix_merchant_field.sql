-- ============================================================================
-- Migration: Fix merchant field in existing transactions_v2 table
-- Purpose: Convert merchant_raw/merchant_normalized to single merchant field
-- Date: 2026-01-10
-- ============================================================================

-- Check if table exists and has old columns
DO $$
BEGIN
  -- Check if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'transactions_v2'
  ) THEN
    
    -- Check if old columns exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'transactions_v2' 
      AND column_name IN ('merchant_raw', 'merchant_normalized')
    ) THEN
      
      -- Step 1: Add merchant column if it doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'transactions_v2' AND column_name = 'merchant'
      ) THEN
        ALTER TABLE transactions_v2 ADD COLUMN merchant TEXT;
        
        -- Step 2: Migrate data from old columns
        UPDATE transactions_v2 
        SET merchant = COALESCE(merchant_normalized, merchant_raw, 'Unknown')
        WHERE merchant IS NULL;
        
        -- Step 3: Make NOT NULL after data migration
        ALTER TABLE transactions_v2 ALTER COLUMN merchant SET NOT NULL;
        
        RAISE NOTICE 'Added merchant column and migrated data from merchant_raw/merchant_normalized';
      END IF;
      
      -- Step 4: Drop old index if it exists
      DROP INDEX IF EXISTS idx_transactions_v2_user_merchant;
      
      -- Step 5: Recreate index with new merchant column
      CREATE INDEX IF NOT EXISTS idx_transactions_v2_user_merchant 
        ON transactions_v2(user_id, merchant);
      
      -- Step 6: Drop old constraint if it exists
      ALTER TABLE transactions_v2 
        DROP CONSTRAINT IF EXISTS chk_merchant_not_empty;
      
      -- Step 7: Add new constraint with merchant field
      ALTER TABLE transactions_v2 
        ADD CONSTRAINT chk_merchant_not_empty 
        CHECK (LENGTH(TRIM(merchant)) > 0);
      
      -- Step 8: Drop old columns
      ALTER TABLE transactions_v2 
        DROP COLUMN IF EXISTS merchant_raw,
        DROP COLUMN IF EXISTS merchant_normalized;
      
      RAISE NOTICE 'Migration complete: merchant field updated, old columns removed';
      
    ELSE
      RAISE NOTICE 'Table exists but old merchant columns not found - migration may have already run';
    END IF;
    
  ELSE
    RAISE NOTICE 'Table transactions_v2 does not exist - run 004_create_transactions_v2.sql first';
  END IF;
END $$;

-- Verify the migration
DO $$
DECLARE
  merchant_exists BOOLEAN;
  old_columns_exist BOOLEAN;
BEGIN
  -- Check if merchant column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions_v2' AND column_name = 'merchant'
  ) INTO merchant_exists;
  
  -- Check if old columns still exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'transactions_v2' 
    AND column_name IN ('merchant_raw', 'merchant_normalized')
  ) INTO old_columns_exist;
  
  IF merchant_exists AND NOT old_columns_exist THEN
    RAISE NOTICE '✅ Migration successful: merchant column exists, old columns removed';
  ELSIF merchant_exists AND old_columns_exist THEN
    RAISE WARNING '⚠️  Partial migration: merchant exists but old columns still present';
  ELSIF NOT merchant_exists THEN
    RAISE WARNING '⚠️  Migration incomplete: merchant column not found';
  END IF;
END $$;

