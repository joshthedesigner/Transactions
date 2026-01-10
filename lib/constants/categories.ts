// Fixed category list matching database schema
export const CATEGORIES = [
  'Housing',
  'Utilities',
  'Groceries',
  'Dining',
  'Transportation',
  'Travel',
  'Shopping',
  'Health',
  'Entertainment',
  'Subscriptions',
  'Misc',
] as const;

export type CategoryName = typeof CATEGORIES[number];

// Confidence threshold for auto-approval
export const CONFIDENCE_THRESHOLD = 0.75;




