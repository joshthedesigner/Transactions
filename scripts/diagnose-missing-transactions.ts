/**
 * Diagnostic script to find missing transactions and why they failed
 * 
 * This compares CSV files with database records to identify:
 * 1. Which transactions are missing
 * 2. Why they might have failed (parse errors, validation, etc.)
 */

import { readFileSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';

interface CSVRow {
  [key: string]: string | number | null;
}

interface Transaction {
  date: string;
  merchant: string;
  amount: number;
  rawRow: CSVRow;
}

function parseCSVFile(filePath: string): CSVRow[] {
  const content = readFileSync(filePath, 'utf-8');
  const result = Papa.parse(content, { header: true, skipEmptyLines: true });
  return result.data as CSVRow[];
}

function analyzeMissingTransactions(
  csvPath: string,
  filename: string,
  dbTransactions: Array<{ date: string; merchant_normalized: string; amount: number }>
) {
  console.log(`\n=== Analyzing ${filename} ===\n`);
  
  // Parse CSV
  const csvRows = parseCSVFile(csvPath);
  const columns = detectColumns(csvRows);
  
  // Normalize and get errors
  const normalizationResult = normalizeTransactions(csvRows, columns);
  const normalized = normalizationResult.transactions;
  const errors = normalizationResult.errors;
  
  console.log(`CSV rows: ${csvRows.length}`);
  console.log(`Successfully normalized: ${normalized.length}`);
  console.log(`Errors during normalization: ${errors.length}\n`);
  
  // Show normalization errors
  if (errors.length > 0) {
    console.log('Normalization Errors:');
    const errorGroups = errors.reduce((acc, err) => {
      acc[err.reason] = (acc[err.reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    Object.entries(errorGroups).forEach(([reason, count]) => {
      console.log(`  ${reason}: ${count}`);
    });
    
    // Show sample errors
    console.log('\nSample errors:');
    errors.slice(0, 5).forEach((err, i) => {
      console.log(`\n  Error ${i + 1}:`);
      console.log(`    Reason: ${err.reason}`);
      console.log(`    Error: ${err.error}`);
      const merchantCol = Object.keys(err.row).find(k => /description|merchant/i.test(k));
      const amountCol = Object.keys(err.row).find(k => /amount/i.test(k));
      const dateCol = Object.keys(err.row).find(k => /date/i.test(k));
      console.log(`    Date: ${err.row[dateCol || '']}`);
      console.log(`    Merchant: ${err.row[merchantCol || '']}`);
      console.log(`    Amount: ${err.row[amountCol || '']}`);
    });
    console.log('');
  }
  
  // Create map of database transactions
  const dbMap = new Map<string, number>();
  dbTransactions.forEach(t => {
    const key = `${t.date}|${t.merchant_normalized}|${Math.abs(t.amount).toFixed(2)}`;
    dbMap.set(key, (dbMap.get(key) || 0) + 1);
  });
  
  // Find missing transactions
  const missing: Transaction[] = [];
  normalized.forEach(t => {
    const date = t.date.toISOString().split('T')[0];
    const key = `${date}|${t.merchant}|${Math.abs(t.amount).toFixed(2)}`;
    const dbCount = dbMap.get(key) || 0;
    if (dbCount === 0) {
      missing.push({
        date,
        merchant: t.merchant,
        amount: t.amount,
        rawRow: csvRows[normalized.indexOf(t)] || {},
      });
    } else {
      dbMap.set(key, dbCount - 1);
    }
  });
  
  console.log(`Missing transactions: ${missing.length}`);
  if (missing.length > 0) {
    console.log('\nMissing transaction details:');
    missing.slice(0, 10).forEach((t, i) => {
      console.log(`\n  ${i + 1}. ${t.date} | ${t.merchant} | $${Math.abs(t.amount).toFixed(2)}`);
    });
    if (missing.length > 10) {
      console.log(`  ... and ${missing.length - 10} more`);
    }
    
    // Calculate missing total
    const missingTotal = missing.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    console.log(`\nMissing total: $${missingTotal.toFixed(2)}`);
  }
  
  return {
    csvRows: csvRows.length,
    normalized: normalized.length,
    errors: errors.length,
    dbTransactions: dbTransactions.length,
    missing: missing.length,
    missingTotal: missing.reduce((sum, t) => sum + Math.abs(t.amount), 0),
    errorBreakdown: errors.reduce((acc, err) => {
      acc[err.reason] = (acc[err.reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}

// Note: This script needs database access, so it should be run as an API route
// For now, let's create a page that does this analysis
console.log('This diagnostic script needs to be run in a Next.js API context.');
console.log('Creating a diagnostic page instead...');

