import { getRawDbTotals } from '@/lib/actions/raw-db-totals';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await getRawDbTotals();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

