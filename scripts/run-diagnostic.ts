import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load env vars manually
const envPath = path.join(process.cwd(), '.env.local');
let supabaseUrl = '';
let supabaseKey = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
        supabaseUrl = value;
      }
      if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
        supabaseKey = value;
      }
    }
  });
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Import calculation utilities
function calculateSpendingAmount(amount: number, convention: 'negative' | 'positive'): number {
  if (convention === 'negative') {
    return amount < 0 ? Math.abs(amount) : 0;
  } else {
    return amount > 0 ? amount : 0;
  }
}

async function runDiagnostic() {
  console.log('=== RUNNING DASHBOARD DISCREPANCY DIAGNOSTIC ===\n');

  const csvTotal = 91180.01;
  
  // First check if we can access transactions (this will tell us if RLS is blocking)
  const { data: testTransactions, error: testError, count: transactionCount } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .limit(1);

  if (testError) {
    console.error('❌ Error accessing transactions:', testError.message);
    console.log('\n⚠️  This is likely due to Row Level Security (RLS) policies.');
    console.log('   The script cannot access user data without authentication.');
    console.log('   Please run the diagnostic through the app at /diagnose-dashboard\n');
    return;
  }

  console.log(`📊 Found ${transactionCount || 0} total transactions in database\n`);

  // Get all source files
  const { data: sourceFiles, error: sfError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .order('uploaded_at', { ascending: false });

  if (sfError) {
    console.error('Error fetching source files:', sfError);
    console.log('   This might be due to RLS policies blocking access.\n');
  }

  console.log('📁 SOURCE FILES IN DATABASE:');
  if (!sourceFiles || sourceFiles.length === 0) {
    console.log('   ⚠️  NO FILES FOUND!');
    if (transactionCount && transactionCount > 0) {
      console.log('   ⚠️  BUT TRANSACTIONS EXIST - This indicates a data integrity issue!');
      console.log('   Transactions exist without source_file records.\n');
    } else {
      console.log('   ✅ No CSV files uploaded and no transactions found.\n');
      return;
    }
  } else {
    console.log(`   Found ${sourceFiles.length} file(s):`);
    sourceFiles.forEach(f => {
      console.log(`   - ${f.filename} (Convention: ${f.amount_sign_convention || 'null'})`);
    });
    console.log('');
  }

  sourceFiles.forEach(f => {
    console.log(`   - ${f.filename}`);
    console.log(`     Convention: ${f.amount_sign_convention || 'null'}`);
    console.log(`     Uploaded: ${new Date(f.uploaded_at).toLocaleString()}`);
  });
  console.log(`   Total: ${sourceFiles.length} file(s)\n`);

  // Get all transactions
  const { data: allTransactions, error: transError } = await supabase
    .from('transactions')
    .select(`
      id,
      date,
      amount,
      status,
      source_file_id,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .order('date', { ascending: false })
    .limit(10000);

  if (transError) {
    console.error('❌ Error fetching transactions:', transError.message);
    console.log('\n⚠️  This is likely due to Row Level Security (RLS) policies.');
    console.log('   The script cannot access user-specific data without authentication.');
    console.log('   Please run the diagnostic through the app at /diagnose-dashboard\n');
    return;
  }

  if (!allTransactions || allTransactions.length === 0) {
    console.log('⚠️  NO TRANSACTIONS FOUND IN DATABASE!\n');
    if (transactionCount && transactionCount > 0) {
      console.log('   ⚠️  BUT COUNT SHOWS TRANSACTIONS EXIST!');
      console.log('   This means RLS is blocking the query.\n');
    } else {
      console.log('✅ CONFIRMED: Files uploaded but no transactions imported.\n');
    }
    return;
  }

  console.log(`📊 Analyzing ${allTransactions.length} transactions...\n`);

  // Check for transactions without source_file
  const transactionsWithoutSource = allTransactions.filter((t: any) => !t.source_file);
  if (transactionsWithoutSource.length > 0) {
    console.log(`⚠️  WARNING: ${transactionsWithoutSource.length} transactions have no source_file!`);
    console.log('   This indicates a data integrity issue.\n');
  }

  // Calculate totals
  let allSpendingTotal = 0;
  let allPendingTotal = 0;
  let approvedSpendingTotal = 0;
  let allPendingCount = 0;
  let approvedCount = 0;

  const bySourceFile = new Map<string, {
    filename: string;
    total: number;
    approved: number;
    pending: number;
    approvedAmount: number;
    pendingAmount: number;
  }>();

  allTransactions.forEach((t: any) => {
    const amount = Number(t.amount);
    const sourceFile = t.source_file;
    const filename = sourceFile?.filename || 'unknown';
    
    let convention = (sourceFile?.amount_sign_convention || null) as 'negative' | 'positive' | null;
    if (!convention) {
      const fn = filename.toLowerCase();
      convention = fn.includes('chase') ? 'negative' : 'positive';
    }
    
    const spendingAmount = calculateSpendingAmount(amount, convention);
    
    if (spendingAmount > 0) {
      if (!bySourceFile.has(filename)) {
        bySourceFile.set(filename, {
          filename,
          total: 0,
          approved: 0,
          pending: 0,
          approvedAmount: 0,
          pendingAmount: 0,
        });
      }

      const fileData = bySourceFile.get(filename)!;
      fileData.total++;

      if (t.status === 'approved') {
        allSpendingTotal += spendingAmount;
        approvedSpendingTotal += spendingAmount;
        approvedCount++;
        fileData.approved++;
        fileData.approvedAmount += spendingAmount;
      } else {
        allPendingTotal += spendingAmount;
        allPendingCount++;
        fileData.pending++;
        fileData.pendingAmount += spendingAmount;
      }
    }
  });

  // Get dashboard total (approved, date filtered)
  const today = new Date().toISOString().split('T')[0];
  const { data: dashboardTransactions } = await supabase
    .from('transactions')
    .select(`
      amount,
      status,
      date,
      source_file:source_files(id, filename, amount_sign_convention)
    `)
    .eq('status', 'approved')
    .gte('date', '2020-01-01')
    .lte('date', today);

  let dashboardTotal = 0;
  if (dashboardTransactions) {
    dashboardTransactions.forEach((t: any) => {
      const amount = Number(t.amount);
      const sourceFile = t.source_file;
      let convention = (sourceFile?.amount_sign_convention || null) as 'negative' | 'positive' | null;
      if (!convention) {
        const filename = (sourceFile?.filename || '').toLowerCase();
        convention = filename.includes('chase') ? 'negative' : 'positive';
      }
      const spendingAmount = calculateSpendingAmount(amount, convention);
      if (spendingAmount > 0) {
        dashboardTotal += spendingAmount;
      }
    });
  }

  console.log('📊 TOTALS:');
  console.log(`   CSV Files Total: $${csvTotal.toFixed(2)}`);
  console.log(`   Database All (Approved + Pending): $${(allSpendingTotal + allPendingTotal).toFixed(2)}`);
  console.log(`   Database Approved Only: $${approvedSpendingTotal.toFixed(2)}`);
  console.log(`   Dashboard Shows: $${dashboardTotal.toFixed(2)}`);
  console.log(`   Pending (Excluded): $${allPendingTotal.toFixed(2)} (${allPendingCount} transactions)\n`);

  console.log('⚠️  DISCREPANCIES:');
  console.log(`   CSV vs Database: $${(csvTotal - (allSpendingTotal + allPendingTotal)).toFixed(2)}`);
  console.log(`   CSV vs Dashboard: $${(csvTotal - dashboardTotal).toFixed(2)}`);
  console.log(`   Pending Amount: $${allPendingTotal.toFixed(2)}\n`);

  if (bySourceFile.size > 0) {
    console.log('📁 BREAKDOWN BY SOURCE FILE:');
    Array.from(bySourceFile.values()).forEach(file => {
      console.log(`   ${file.filename}:`);
      console.log(`     Total Transactions: ${file.total}`);
      console.log(`     Approved: ${file.approved} ($${file.approvedAmount.toFixed(2)})`);
      console.log(`     Pending: ${file.pending} ($${file.pendingAmount.toFixed(2)})`);
    });
    console.log('');
  }

  console.log('✅ CONFIRMED ROOT CAUSES:');
  const csvVsDb = csvTotal - (allSpendingTotal + allPendingTotal);
  const csvVsDashboard = csvTotal - dashboardTotal;
  
  if (csvVsDb > 1000) {
    console.log(`   1. Missing from Database: $${csvVsDb.toFixed(2)}`);
    console.log('      → Not all CSV files uploaded, or transactions failed to import');
  }
  
  if (allPendingTotal > 1000) {
    console.log(`   2. Pending Transactions: $${allPendingTotal.toFixed(2)}`);
    console.log('      → These need to be approved to show in dashboard');
  }
  
  if (csvVsDashboard > csvVsDb + 100) {
    console.log(`   3. Dashboard Filtering: $${(csvVsDashboard - csvVsDb).toFixed(2)}`);
    console.log('      → Date range or other filters excluding transactions');
  }
}

runDiagnostic().catch(console.error);

