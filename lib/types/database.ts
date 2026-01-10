export type Category = {
  id: number;
  name: string;
  created_at: string;
};

export type SourceFile = {
  id: number;
  filename: string;
  uploaded_at: string;
  user_id: string;
  amount_sign_convention?: 'negative' | 'positive' | null;
};

export type MerchantRule = {
  merchant_normalized: string;
  category_id: number;
  confidence_boost: number;
  created_from_manual_override: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
};

/**
 * @deprecated This type is for the legacy `transactions` table which is no longer used.
 * Use `TransactionV2` and `TransactionV2Insert` from '@/lib/types/transactions-v2' instead.
 */
export type Transaction = {
  id: number;
  date: string;
  merchant_raw: string;
  merchant_normalized: string;
  amount: number;
  category_id: number | null;
  confidence_score: number | null;
  status: 'pending_review' | 'approved';
  source_file_id: number;
  created_at: string;
  user_id: string;
  import_error_reason?: string | null;
  import_error_message?: string | null;
};

/**
 * @deprecated This type is for the legacy `transactions` table which is no longer used.
 * Use `TransactionV2` from '@/lib/types/transactions-v2' instead.
 */
export type TransactionWithCategory = Transaction & {
  category?: {
    id: number;
    name: string;
  };
};

// Type for CSV row (before normalization)
export type RawCSVRow = {
  [key: string]: string | number | null;
};

// Type for normalized transaction (before categorization)
export type NormalizedTransaction = {
  date: Date;
  merchant: string;
  amount: number;
};

// Type for AI categorization response
export type CategoryProbability = {
  category_id: number;
  category_name: string;
  probability: number;
};

