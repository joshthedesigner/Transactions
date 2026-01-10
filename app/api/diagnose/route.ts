import { NextResponse } from 'next/server';
import { diagnoseTransactions } from '@/lib/actions/diagnose';

export async function GET() {
  try {
    const result = await diagnoseTransactions();
    
    // Format for console output
    let output = '\n' + '='.repeat(70) + '\n';
    output += 'TRANSACTION DATA DIAGNOSIS\n';
    output += '='.repeat(70) + '\n\n';

    // Date range
    output += '📅 DATE RANGE ANALYSIS\n';
    output += '-'.repeat(70) + '\n';
    output += `  Earliest transaction: ${result.dateRange.earliest || 'N/A'}\n`;
    output += `  Latest transaction: ${result.dateRange.latest || 'N/A'}\n`;
    if (result.dateRange.monthsDiff !== null) {
      output += `  Date range: ${result.dateRange.monthsDiff} months\n`;
    }
    output += '\n';

    // Breakdown by file
    output += '📊 TRANSACTION BREAKDOWN BY SOURCE FILE\n';
    output += '-'.repeat(70) + '\n';
    
    result.byFile.forEach((file) => {
      output += `\n  📄 ${file.filename}\n`;
      output += `     Transactions: ${file.count}\n`;
      output += `     Date range: ${file.dates.min} to ${file.dates.max}\n`;
      output += `     Positive: ${file.positiveCount} transactions = $${file.positiveTotal.toFixed(2)}\n`;
      output += `     Negative: ${file.negativeCount} transactions = $${file.negativeTotal.toFixed(2)}\n`;
      output += `     Absolute total: $${file.absoluteTotal.toFixed(2)}\n`;
      
      if (file.filename.toLowerCase().includes('chase')) {
        output += `     Expected spending (Chase): $${file.negativeTotal.toFixed(2)} (negative amounts)\n`;
      } else {
        output += `     Expected spending (Other): $${file.positiveTotal.toFixed(2)} (positive amounts)\n`;
      }
    });

    output += '\n' + '-'.repeat(70) + '\n';
    output += `  TOTAL: ${result.grandCount} transactions, $${result.grandTotal.toFixed(2)} expected spending\n\n`;

    // Activity.csv negative analysis
    output += '🔍 ACTIVITY.CSV NEGATIVE AMOUNTS ANALYSIS\n';
    output += '-'.repeat(70) + '\n';
    output += `  Found ${result.activityNegative.count} negative transactions in activity.csv\n`;
    output += `  Total negative amount: $${result.activityNegative.total.toFixed(2)}\n`;
    output += `  Transactions with credit/refund keywords: ${result.activityNegative.creditKeywordCount}/${result.activityNegative.count}\n`;
    
    if (result.activityNegative.samples.length > 0) {
      output += '\n  Sample negative transactions (first 10):\n';
      result.activityNegative.samples.forEach((t) => {
        output += `    ${t.date} | ${t.merchant} | $${t.amount.toFixed(2)}\n`;
      });
    }

    output += '\n' + '='.repeat(70) + '\n';
    output += 'SUMMARY\n';
    output += '='.repeat(70) + '\n';
    output += `  Total transactions in database: ${result.grandCount}\n`;
    output += `  Expected total spending: $${result.grandTotal.toFixed(2)}\n`;
    output += '='.repeat(70) + '\n\n';

    return NextResponse.json({ 
      success: true, 
      result,
      formatted: output 
    });
  } catch (error) {
    console.error('Diagnosis error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}




