import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { RawCSVRow } from '@/lib/types/database';

/**
 * Detect file type and parse accordingly
 */
export async function parseFile(file: File): Promise<RawCSVRow[][]> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();
  const mimeType = file.type;
  
  if (fileExtension === 'csv' || mimeType === 'text/csv' || mimeType.includes('csv')) {
    return parseCSV(file);
  } else if (['xlsx', 'xls'].includes(fileExtension || '') || mimeType.includes('spreadsheet')) {
    return parseExcel(file);
  } else {
    throw new Error('Unsupported file type. Please upload CSV or Excel files.');
  }
}

/**
 * Parse CSV file
 * Converts File to text first (Papa.parse needs text, not File in server environment)
 * Best practice: Always convert File to text/arrayBuffer before parsing in server environments
 */
async function parseCSV(file: File): Promise<RawCSVRow[][]> {
  try {
    // Convert File to text string (works in both browser and server)
    // This is the recommended approach for server-side parsing
    const text = await file.text();
    
    if (!text || text.length === 0) {
      throw new Error('File is empty');
    }
    
    return new Promise((resolve, reject) => {
      // Papa.parse with text string (not File object) - works in server environment
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors.length > 0) {
            const errorMessages = results.errors.map(e => e.message).join(', ');
            reject(new Error(`CSV parsing errors: ${errorMessages}`));
            return;
          }
          resolve([results.data as RawCSVRow[]]);
        },
        error: (error) => {
          reject(new Error(`Failed to parse CSV: ${error.message}`));
        },
      });
    });
  } catch (error) {
    // Handle File.text() errors or parsing errors
    if (error instanceof Error) {
      throw new Error(`CSV parsing failed: ${error.message}`);
    }
    throw new Error('Unknown error occurred while parsing CSV');
  }
}

/**
 * Parse Excel file (supports multiple sheets)
 * Uses arrayBuffer() method which works in both browser and Node.js
 */
async function parseExcel(file: File): Promise<RawCSVRow[][]> {
  try {
    // Use file.arrayBuffer() which works in server environment
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });
    
    const sheets: RawCSVRow[][] = [];
    
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
      if (jsonData.length > 0) {
        sheets.push(jsonData as RawCSVRow[]);
      }
    });
    
    if (sheets.length === 0) {
      throw new Error('No data found in Excel file');
    }
    
    return sheets;
  } catch (error) {
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
