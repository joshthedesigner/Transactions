import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns, normalizeTransactions } from '../lib/utils/normalizer';
import { calculateSpendingAmount, AmountSignConvention } from '../lib/utils/amount-calculator';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function confirm() {
  console.log('=== CONFIRMING DISCREPANCY ===\n');

  // 1. Calculate CSV totals
  const csvFiles = [
    { 
      path: '/Users/joshgold/Desktop/transactions/activity.csv', 
      filename: 'activity.csv',
      convention: 'positive' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase2861_Activity20250101_20260101_20260109.CSV', 
      filename: 'Chase2861_Activity20250101_20260101_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase2909_Activity20250101_20251231_20260109.CSV', 
      filename: 'Chase2909_Activity20250101_20251231_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
    { 
      path: '/Users/joshgold/Desktop/transactions/Chase3887_Activity20250101_20251231_20260109.CSV', 
      filename: 'Chase3887_Activity20250101_20251231_20260109.CSV',
      convention: 'negative' as AmountSignConvention
    },
  ];

  let csvTotal = 0;
  const csvByFile: Array<{ filename: string; total: number; count: number }> = [];

  for (const file of csvFiles) {
    if (!existsSync(file.path)) {
      console.log(`⚠️  File not found: ${file.filename}`);
      continue;
    }

    const content = readFileSync(file.path, 'utf-8');
    const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
    const csvRows = parsed.data as any[];
    const columns = detectColumns(csvRows);
    const normalizationResult = normalizeTransactions(csvRows, columns);

    let fileTotal = 0;
    let fileCount = 0;

    normalizationResult.transactions.forEach((t) => {
      const spendingAmount = calculateSpendingAmount(t.amount, file.convention);
      if (spendingAmount > 0) {
        fileTotal += spendingAmount;
        fileCount++;
      }
    });

    csvTotal += fileTotal;
    csvByFile.push({ filename: file.filename, total: fileTotal, count: fileCount });
  }

  console.log('📄 CSV FILES TOTAL:');
  csvByFile.forEach(f => {
    console.log(`   ${f.filename}: $${f.total.toFixed(2)} (${f.count} transactions)`);
  });
  console.log(`   TOTAL: $${csvTotal.toFixed(2)}\n`);

  // 2. Get what's in the database
  // Note: This requires authentication, so we'll need to check via a different method
  // For now, let's check source files
  const { data: sourceFiles, error: sfError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .order('uploaded_at', { ascending: false })
    .limit(10);

  if (sfError) {
    console.error('Error fetching source files:', sfError);
    return;
  }

  console.log('📁 FILES IN DATABASE:');
  if (!sourceFiles || sourceFiles.length === 0) {
    console.log('   ⚠️  NO FILES FOUND IN DATABASE!\n');
    console.log('✅ CONFIRMED: The discrepancy is because NO CSV files have been uploaded to the database.');
    console.log(`   CSV Total: $${csvTotal.toFixed(2)}`);
    console.log(`   Database Total: $0.00`);
    console.log(`   Missing: $${csvTotal.toFixed(2)}`);
    return;
  }

  sourceFiles.forEach(f => {
    console.log(`   - ${f.filename} (Convention: ${f.amount_sign_convention || 'null'})`);
  });
  console.log(`   Total files: ${sourceFiles.length}\n`);

  // Check if all 4 files are uploaded
  const uploadedFilenames = sourceFiles.map(f => f.filename.toLowerCase());
  const expectedFiles = csvFiles.map(f => f.filename.toLowerCase());
  
  const missingFiles = csvFiles.filter(f => {
    const csvName = f.filename.toLowerCase();
    return !uploadedFilenames.some(u => u.includes(csvName.split('_')[0]) || csvName.includes(u.split('_')[0]));
  });

  if (missingFiles.length > 0) {
    console.log('⚠️  MISSING FILES:');
    missingFiles.forEach(f => {
      console.log(`   - ${f.filename}`);
    });
    console.log('');
  }

  console.log('✅ CONFIRMED DISCREPANCY:');
  console.log(`   CSV Files Total: $${csvTotal.toFixed(2)}`);
  console.log(`   Files in Database: ${sourceFiles.length} of ${csvFiles.length}`);
  if (missingFiles.length > 0) {
    const missingTotal = missingFiles.reduce((sum, f) => {
      const found = csvByFile.find(c => c.filename === f.filename);
      return sum + (found?.total || 0);
    }, 0);
    console.log(`   Missing Files Amount: $${missingTotal.toFixed(2)}`);
    console.log(`   This explains ${((missingTotal / csvTotal) * 100).toFixed(1)}% of the discrepancy`);
  }
}

confirm().catch(console.error);

