import { createClient } from '@/lib/supabase/server';

async function analyzeMerchantChallenges() {
  const supabase = await createClient();
  
  // Get user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    console.error('Not authenticated');
    process.exit(1);
  }

  // Fetch sample of transactions
  const { data: transactions, error } = await supabase
    .from('transactions_v2')
    .select('merchant')
    .eq('user_id', user.id)
    .not('merchant', 'is', null)
    .limit(500);

  if (error) {
    console.error('Error fetching transactions:', error);
    process.exit(1);
  }

  // Get unique merchants
  const uniqueMerchants = new Set<string>();
  transactions?.forEach(t => {
    if (t.merchant) uniqueMerchants.add(t.merchant);
  });

  console.log(`\n=== Merchant Normalization Challenge Analysis ===\n`);
  console.log(`Total transactions analyzed: ${transactions?.length || 0}`);
  console.log(`Unique merchant strings: ${uniqueMerchants.size}\n`);

  // Analyze patterns
  const merchants = Array.from(uniqueMerchants);
  
  // Group by patterns
  const patterns = {
    hasNumbers: [] as string[],
    hasPaymentProcessors: [] as string[],
    hasLocationInfo: [] as string[],
    hasSpecialChars: [] as string[],
    hasStoreNumbers: [] as string[],
    hasTransactionCodes: [] as string[],
    longMerchants: [] as string[],
  };

  merchants.forEach(merchant => {
    const lower = merchant.toLowerCase();
    
    // Check for numbers (likely transaction IDs or store numbers)
    if (/\d/.test(merchant)) {
      patterns.hasNumbers.push(merchant);
    }
    
    // Check for payment processors
    if (/paypal|apple\s*pay|aplpay|amex|american\s*express|square|sq\s*\*|pp\*|venmo|zelle/i.test(merchant)) {
      patterns.hasPaymentProcessors.push(merchant);
    }
    
    // Check for location info (state codes, city names)
    if (/\b(ca|ny|tx|fl|il|pa|oh|ga|nc|mi|nj|va|wa|az|ma|tn|in|mo|md|wi|co|mn|sc|al|la|ky|or|ok|ct|ia|ar|ms|ks|ut|nv|nm|wv|ne|id|hi|nh|me|ri|mt|de|sd|nd|ak|dc|vt|wy)\b/i.test(merchant)) {
      patterns.hasLocationInfo.push(merchant);
    }
    
    // Check for special characters
    if (/[#*\-_@]/.test(merchant)) {
      patterns.hasSpecialChars.push(merchant);
    }
    
    // Check for store numbers (patterns like "store #123", "store 123", "#123")
    if (/store\s*#?\s*\d+|#\s*\d+|\d+\s*-\s*\d+/.test(merchant)) {
      patterns.hasStoreNumbers.push(merchant);
    }
    
    // Check for transaction codes (long alphanumeric strings)
    if (/[a-z0-9]{8,}/i.test(merchant)) {
      patterns.hasTransactionCodes.push(merchant);
    }
    
    // Check for very long merchant names (likely have extra info)
    if (merchant.length > 40) {
      patterns.longMerchants.push(merchant);
    }
  });

  // Print analysis
  console.log('=== Pattern Analysis ===\n');
  console.log(`Merchants with numbers: ${patterns.hasNumbers.length} (${((patterns.hasNumbers.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Merchants with payment processors: ${patterns.hasPaymentProcessors.length} (${((patterns.hasPaymentProcessors.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Merchants with location info: ${patterns.hasLocationInfo.length} (${((patterns.hasLocationInfo.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Merchants with special chars: ${patterns.hasSpecialChars.length} (${((patterns.hasSpecialChars.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Merchants with store numbers: ${patterns.hasStoreNumbers.length} (${((patterns.hasStoreNumbers.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Merchants with transaction codes: ${patterns.hasTransactionCodes.length} (${((patterns.hasTransactionCodes.length / merchants.length) * 100).toFixed(1)}%)`);
  console.log(`Long merchant names (>40 chars): ${patterns.longMerchants.length} (${((patterns.longMerchants.length / merchants.length) * 100).toFixed(1)}%)\n`);

  // Show examples
  console.log('=== Example Challenges ===\n');
  
  console.log('Examples with numbers:');
  patterns.hasNumbers.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');
  
  console.log('Examples with payment processors:');
  patterns.hasPaymentProcessors.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');
  
  console.log('Examples with location info:');
  patterns.hasLocationInfo.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');
  
  console.log('Examples with store numbers:');
  patterns.hasStoreNumbers.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');
  
  console.log('Examples with transaction codes:');
  patterns.hasTransactionCodes.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');
  
  console.log('Long merchant names:');
  patterns.longMerchants.slice(0, 10).forEach(m => console.log(`  - ${m}`));
  console.log('');

  // Find potential duplicates (merchants that might be the same)
  console.log('=== Potential Duplicate Groups ===\n');
  const merchantGroups = new Map<string, string[]>();
  
  merchants.forEach(merchant => {
    // Simple grouping: remove numbers, special chars, lowercase
    const cleaned = merchant
      .toLowerCase()
      .replace(/\d+/g, '')
      .replace(/[#*\-_@]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > 3) {
      if (!merchantGroups.has(cleaned)) {
        merchantGroups.set(cleaned, []);
      }
      merchantGroups.get(cleaned)!.push(merchant);
    }
  });

  // Find groups with multiple variations
  const duplicates = Array.from(merchantGroups.entries())
    .filter(([_, variations]) => variations.length > 1)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  console.log(`Found ${duplicates.length} potential duplicate groups:\n`);
  duplicates.forEach(([cleaned, variations]) => {
    console.log(`Group: "${cleaned}" (${variations.length} variations)`);
    variations.forEach(v => console.log(`  - ${v}`));
    console.log('');
  });
}

analyzeMerchantChallenges().catch(console.error);
