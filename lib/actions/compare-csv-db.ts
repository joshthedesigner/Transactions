'use server';

import { createClient } from '@/lib/supabase/server';
import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { detectColumns } from '@/lib/utils/column-detector';
import { normalizeTransactions } from '@/lib/utils/normalizer';

type CSVTransaction = {
  date: string;
  merchant: string;
  amount: number;
  rawRow: any;
};

type DBTransaction = {
  id: number;
  date: string;
  merchant_raw: string;
  merchant_normalized: string;
  amount: number;
};

export type ComparisonResult = {
  filename: string;
  csvTotal: number;
  csvCount: number;
  dbTotal: number;
  dbCount: number;
  difference: number;
  missingInDB: CSVTransaction[];
  extraInDB: DBTransaction[];
  dateRange: {
    csv: { min: string; max: string };
    db: { min: string; max: string };
  };
  error?: string;
  debugInfo?: {
    sourceFileId?: number;
    totalUserTransactions?: number;
    sampleSourceFileIds?: number[];
  };
};

/**
 * Parse a CSV file from the filesystem
 */
function parseCSVFile(filePath: string): any[] {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const content = readFileSync(filePath, 'utf-8');
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }
  return result.data as any[];
}

/**
 * Compare a CSV file with database records
 */
export async function compareCSVWithDatabase(
  csvFilePath: string,
  sourceFilename: string
): Promise<ComparisonResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // 1. Parse CSV file
  const csvRows = parseCSVFile(csvFilePath);
  const columns = detectColumns(csvRows);
  const normalizationResult = normalizeTransactions(csvRows, columns);
  const normalized = normalizationResult.transactions;

  // Calculate CSV totals
  const csvTransactions: CSVTransaction[] = normalized.map((t, i) => ({
    date: t.date.toISOString().split('T')[0],
    merchant: t.merchant,
    amount: t.amount,
    rawRow: csvRows[i],
  }));

  // Calculate CSV total using same logic as database
  // Chase files: negative = spending, positive = credit (count negative only)
  // Other files: positive = spending, negative = credit (count positive only)
  const isChaseFile = sourceFilename.toLowerCase().includes('chase');
  const csvTotal = csvTransactions.reduce((sum, t) => {
    if (isChaseFile) {
      // Chase: count negative amounts only
      return sum + (t.amount < 0 ? Math.abs(t.amount) : 0);
    } else {
      // Other files: count positive amounts only
      return sum + (t.amount > 0 ? t.amount : 0);
    }
  }, 0);
  const csvCount = csvTransactions.length;
  const csvDates = csvTransactions.map(t => t.date).sort();
  const csvDateRange = {
    min: csvDates[0] || '',
    max: csvDates[csvDates.length - 1] || '',
  };

  // 2. Get ALL source files matching this filename (there may be multiple uploads)
  const { data: matchingSourceFiles } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('filename', sourceFilename)
    .eq('user_id', user.id);

  // Also try partial match for sanitized filenames
  let allMatchingFiles = matchingSourceFiles || [];
  if (allMatchingFiles.length === 0) {
    const sanitizedFilename = sourceFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const originalBase = sourceFilename.toLowerCase().split('.')[0];
    const { data: files } = await supabase
      .from('source_files')
      .select('id, filename')
      .eq('user_id', user.id);
    
    if (files) {
      allMatchingFiles = files.filter(f => {
        const dbBase = f.filename.toLowerCase().split('.')[0];
        return dbBase.includes(originalBase) || originalBase.includes(dbBase) ||
               f.filename.replace(/[^a-zA-Z0-9._-]/g, '_') === sanitizedFilename;
      });
    }
  }

  console.log(`[Compare] Found ${allMatchingFiles.length} source file(s) matching "${sourceFilename}"`);

  if (allMatchingFiles.length === 0) {
    // Get all source files for debugging
    const { data: allFiles } = await supabase
      .from('source_files')
      .select('id, filename, uploaded_at')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });
    
    return {
      filename: sourceFilename,
      csvTotal,
      csvCount,
      dbTotal: 0,
      dbCount: 0,
      difference: csvTotal,
      missingInDB: csvTransactions,
      extraInDB: [],
      dateRange: {
        csv: csvDateRange,
        db: { min: '', max: '' },
      },
      error: `Source file not found in database. Available files: ${allFiles?.map(f => f.filename).join(', ') || 'none'}`,
    };
  }

  // Get transactions from ALL matching source files (aggregate across multiple uploads)
  const sourceFileIds = allMatchingFiles.map(f => f.id);
  
  // Debug: Check if transactions exist at all
  const { data: allUserTransactions, count: totalCount } = await supabase
    .from('transactions')
    .select('id, source_file_id', { count: 'exact' })
    .eq('user_id', user.id)
    .limit(5);

  console.log(`[Compare] User has ${totalCount} total transactions`);
  console.log(`[Compare] Looking for source_file_ids: ${sourceFileIds.join(', ')}`);
  console.log(`[Compare] Sample transactions source_file_ids:`, allUserTransactions?.map(t => t.source_file_id));

  const { data: dbTransactions, error: dbError } = await supabase
    .from('transactions')
    .select('id, date, merchant_raw, merchant_normalized, amount')
    .in('source_file_id', sourceFileIds)
    .eq('user_id', user.id)
    .order('date', { ascending: true });

  if (dbError) {
    console.error(`[Compare] Database error:`, dbError);
  }

  console.log(`[Compare] Found ${dbTransactions?.length || 0} transactions across ${sourceFileIds.length} source file(s)`);

  const dbTrans: DBTransaction[] = (dbTransactions || []).map(t => ({
    id: t.id,
    date: t.date,
    merchant_raw: t.merchant_raw,
    merchant_normalized: t.merchant_normalized,
    amount: Number(t.amount),
  }));

  // Calculate DB totals (using same logic as getSummaryMetrics)
  const isChase = sourceFilename.toLowerCase().includes('chase');
  const dbTotal = dbTrans.reduce((sum, t) => {
    const amount = t.amount;
    if (isChase) {
      return sum + (amount < 0 ? Math.abs(amount) : 0);
    } else {
      return sum + (amount > 0 ? amount : 0);
    }
  }, 0);
  const dbCount = dbTrans.length;
  const dbDates = dbTrans.map(t => t.date).sort();
  const dbDateRange = {
    min: dbDates[0] || '',
    max: dbDates[dbDates.length - 1] || '',
  };

  // 3. Find missing transactions (in CSV but not in DB)
  // Create a map of DB transactions by date+merchant+amount for comparison
  const dbMap = new Map<string, DBTransaction[]>();
  dbTrans.forEach(t => {
    const key = `${t.date}|${t.merchant_normalized}|${Math.abs(t.amount).toFixed(2)}`;
    if (!dbMap.has(key)) {
      dbMap.set(key, []);
    }
    dbMap.get(key)!.push(t);
  });

  const missingInDB: CSVTransaction[] = [];
  csvTransactions.forEach(csvT => {
    const key = `${csvT.date}|${csvT.merchant}|${Math.abs(csvT.amount).toFixed(2)}`;
    const matches = dbMap.get(key) || [];
    if (matches.length === 0) {
      missingInDB.push(csvT);
    } else {
      // Remove one match (mark as found)
      matches.shift();
    }
  });

  // 4. Find extra transactions (in DB but not in CSV)
  const csvMap = new Map<string, number>();
  csvTransactions.forEach(t => {
    const key = `${t.date}|${t.merchant}|${Math.abs(t.amount).toFixed(2)}`;
    csvMap.set(key, (csvMap.get(key) || 0) + 1);
  });

  const extraInDB: DBTransaction[] = [];
  dbTrans.forEach(dbT => {
    const key = `${dbT.date}|${dbT.merchant_normalized}|${Math.abs(dbT.amount).toFixed(2)}`;
    const csvCount = csvMap.get(key) || 0;
    if (csvCount === 0) {
      extraInDB.push(dbT);
    } else {
      csvMap.set(key, csvCount - 1);
    }
  });

  return {
    filename: sourceFilename,
    csvTotal,
    csvCount,
    dbTotal,
    dbCount,
    difference: csvTotal - dbTotal,
    missingInDB,
    extraInDB,
    dateRange: {
      csv: csvDateRange,
      db: dbDateRange,
    },
    debugInfo: {
      sourceFileId: sourceFileIds.join(', '),
      totalUserTransactions: totalCount || 0,
      sampleSourceFileIds: allUserTransactions?.map(t => t.source_file_id) || [],
      matchingSourceFileCount: allMatchingFiles.length,
    },
  };
}

/**
 * Compare all CSV files with database
 */
export async function compareAllCSVsWithDatabase(): Promise<ComparisonResult[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  // First, get all source files in the database to see what we're working with
  const { data: allSourceFiles } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  console.log('[Compare] Source files in database:', allSourceFiles?.map(f => f.filename));

  const csvFiles = [
    { path: '/Users/joshgold/Downloads/Chase2861_Activity20250101_20260101_20260109.CSV', filename: 'Chase2861_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase3126_Activity20250101_20260101_20260109.CSV', filename: 'Chase3126_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/Chase1462_Activity20250101_20260101_20260109.CSV', filename: 'Chase1462_Activity20250101_20260101_20260109.CSV' },
    { path: '/Users/joshgold/Downloads/activity.csv', filename: 'activity.csv' },
  ];

  const results: ComparisonResult[] = [];

  for (const file of csvFiles) {
    try {
      // Try to find matching source file in database
      const sanitizedOriginal = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const originalBase = file.filename.toLowerCase().split('.')[0];
      
      // For activity.csv, be more specific - don't match to Chase files
      const isActivityCSV = file.filename.toLowerCase() === 'activity.csv';
      
      const matchingSourceFile = allSourceFiles?.find(dbFile => {
        if (isActivityCSV && dbFile.filename.toLowerCase().includes('chase')) {
          return false; // Don't match activity.csv to Chase files
        }
        const dbSanitized = dbFile.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const dbBase = dbFile.filename.toLowerCase().split('.')[0];
        // Match by base name (before extension) or by key parts
        return dbBase.includes(originalBase) || originalBase.includes(dbBase) || 
               dbSanitized === sanitizedOriginal ||
               (isActivityCSV && dbFile.filename.toLowerCase() === 'activity.csv');
      });

      if (matchingSourceFile) {
        // Use the actual database filename
        const result = await compareCSVWithDatabase(file.path, matchingSourceFile.filename);
        result.filename = `${file.filename} → ${matchingSourceFile.filename}`; // Show both
        results.push(result);
      } else {
        // File not found, but still parse CSV to show what should be there
        const result = await compareCSVWithDatabase(file.path, file.filename);
        result.error = `No matching source file found in database. Available: ${allSourceFiles?.map(f => f.filename).join(', ') || 'none'}`;
        results.push(result);
      }
    } catch (error) {
      console.error(`Error comparing ${file.filename}:`, error);
      results.push({
        filename: file.filename,
        csvTotal: 0,
        csvCount: 0,
        dbTotal: 0,
        dbCount: 0,
        difference: 0,
        missingInDB: [],
        extraInDB: [],
        dateRange: {
          csv: { min: '', max: '' },
          db: { min: '', max: '' },
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      } as any);
    }
  }

  return results;
}

