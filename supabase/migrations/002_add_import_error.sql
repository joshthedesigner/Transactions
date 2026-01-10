-- Add import_error columns to track failed imports
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS import_error_reason TEXT,
ADD COLUMN IF NOT EXISTS import_error_message TEXT;

-- Create index for filtering failed imports
CREATE INDEX IF NOT EXISTS idx_transactions_import_error ON transactions(import_error_reason) 
WHERE import_error_reason IS NOT NULL;

