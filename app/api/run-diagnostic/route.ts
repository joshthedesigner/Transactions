import { NextResponse } from 'next/server';
import { diagnoseDashboardDiscrepancy } from '@/lib/actions/diagnose-dashboard-discrepancy';

export async function GET() {
  try {
    const result = await diagnoseDashboardDiscrepancy();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

