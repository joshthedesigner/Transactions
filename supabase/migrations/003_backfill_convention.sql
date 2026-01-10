-- Backfill amount_sign_convention for existing source_files
-- This sets the convention based on filename for files uploaded before migration 002

UPDATE source_files
SET amount_sign_convention = CASE
  WHEN LOWER(filename) LIKE '%chase%' THEN 'negative'
  ELSE 'positive'
END
WHERE amount_sign_convention IS NULL;




