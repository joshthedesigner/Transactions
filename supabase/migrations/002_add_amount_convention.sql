-- Add amount_sign_convention column to source_files table
-- This tracks how each file represents spending:
-- 'negative' = spending is negative (e.g., Chase credit cards)
-- 'positive' = spending is positive (e.g., debit cards, activity.csv)
ALTER TABLE source_files 
ADD COLUMN IF NOT EXISTS amount_sign_convention TEXT 
CHECK (amount_sign_convention IN ('negative', 'positive'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_source_files_convention ON source_files(amount_sign_convention);




