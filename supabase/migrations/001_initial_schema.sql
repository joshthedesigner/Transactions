-- Create categories table (fixed categories)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert fixed categories
INSERT INTO categories (name) VALUES
  ('Housing'),
  ('Utilities'),
  ('Groceries'),
  ('Dining'),
  ('Transportation'),
  ('Travel'),
  ('Shopping'),
  ('Health'),
  ('Entertainment'),
  ('Subscriptions'),
  ('Misc')
ON CONFLICT (name) DO NOTHING;

-- Create source_files table
CREATE TABLE IF NOT EXISTS source_files (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create merchant_rules table (for learning system)
CREATE TABLE IF NOT EXISTS merchant_rules (
  merchant_normalized TEXT NOT NULL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  confidence_boost DECIMAL(3,2) DEFAULT 0.0 CHECK (confidence_boost >= 0 AND confidence_boost <= 1),
  created_from_manual_override BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  merchant_raw TEXT NOT NULL,
  merchant_normalized TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved')),
  source_file_id INTEGER REFERENCES source_files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_normalized ON transactions(merchant_normalized);
CREATE INDEX IF NOT EXISTS idx_source_files_user_id ON source_files(user_id);
CREATE INDEX IF NOT EXISTS idx_merchant_rules_user_id ON merchant_rules(user_id);

-- Enable Row Level Security
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for categories (read-only for all authenticated users)
CREATE POLICY "Categories are viewable by authenticated users"
  ON categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policies for source_files (users can only see their own files)
CREATE POLICY "Users can view their own source files"
  ON source_files FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own source files"
  ON source_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for merchant_rules (users can only see their own rules)
CREATE POLICY "Users can view their own merchant rules"
  ON merchant_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own merchant rules"
  ON merchant_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own merchant rules"
  ON merchant_rules FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for transactions (users can only see their own transactions)
CREATE POLICY "Users can view their own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
  ON transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own transactions"
  ON transactions FOR UPDATE
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for merchant_rules updated_at
CREATE TRIGGER update_merchant_rules_updated_at BEFORE UPDATE ON merchant_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();




