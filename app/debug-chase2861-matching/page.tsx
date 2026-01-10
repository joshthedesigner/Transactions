'use client';

import { useEffect, useState } from 'react';
import { debugChase2861Matching } from '@/lib/actions/debug-chase2861-matching';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DebugChase2861MatchingPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await debugChase2861Matching();
        setData(result);
      } catch (e) {
        console.error('Error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Debugging Chase2861 matching...</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (!data || data.error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">{data?.error || 'No data'}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Chase2861 Matching Debug</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Source File</p>
                <p className="text-lg font-bold">{data.sourceFile.filename}</p>
                <p className="text-xs text-gray-500">ID: {data.sourceFile.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">CSV Samples</p>
                <p className="text-2xl font-bold">{data.csvSampleCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Transactions</p>
                <p className="text-2xl font-bold">{data.dbTransactionCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Matches Found</p>
                <p className="text-2xl font-bold text-green-600">{data.summary.found}</p>
                <p className="text-xs text-gray-500">Not Found: {data.summary.notFound}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-300">
              <p className="text-sm">
                <span className="font-semibold">Exact Matches:</span> {data.summary.exactMatches} | 
                <span className="font-semibold"> Case-Insensitive:</span> {data.summary.caseInsensitiveMatches} | 
                <span className="font-semibold"> Raw Matches:</span> {data.summary.rawMatches}
              </p>
            </div>
          </div>

          {/* Matching Results */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔍 Matching Results (First 10 CSV Transactions)</h2>
            <div className="space-y-4">
              {data.matchingResults.map((result: any, idx: number) => (
                <div key={idx} className={`p-4 rounded border-2 ${result.found ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold">
                        {result.found ? '✓ FOUND' : '✗ NOT FOUND'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {result.csvTransaction.date} - {result.csvTransaction.merchant}
                      </p>
                      <p className="text-sm text-gray-600">
                        Amount: {formatCurrency(result.csvTransaction.amount)} → Spending: {formatCurrency(result.csvTransaction.spendingAmount)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        CSV Key: <code className="bg-gray-100 px-1 rounded">{result.csvKey}</code>
                      </p>
                    </div>
                  </div>
                  
                  {result.exactMatch && (
                    <div className="mt-2 p-2 bg-green-100 rounded">
                      <p className="text-xs font-semibold">Exact Match:</p>
                      <p className="text-xs">DB ID: {result.exactMatch.id}</p>
                      <p className="text-xs">Merchant (normalized): {result.exactMatch.merchant_normalized}</p>
                      <p className="text-xs">Merchant (raw): {result.exactMatch.merchant_raw}</p>
                      <p className="text-xs">DB Key: <code className="bg-white px-1 rounded">{result.exactMatch.dbKey}</code></p>
                    </div>
                  )}
                  
                  {result.caseInsensitiveMatch && (
                    <div className="mt-2 p-2 bg-yellow-100 rounded">
                      <p className="text-xs font-semibold">Case-Insensitive Match:</p>
                      <p className="text-xs">DB ID: {result.caseInsensitiveMatch.id}</p>
                      <p className="text-xs">Merchant (normalized): {result.caseInsensitiveMatch.merchant_normalized}</p>
                    </div>
                  )}
                  
                  {result.rawMatch && (
                    <div className="mt-2 p-2 bg-blue-100 rounded">
                      <p className="text-xs font-semibold">Raw Match:</p>
                      <p className="text-xs">DB ID: {result.rawMatch.id}</p>
                      <p className="text-xs">Merchant (raw): {result.rawMatch.merchant_raw}</p>
                    </div>
                  )}
                  
                  {!result.found && (
                    <div className="mt-2 p-2 bg-red-100 rounded">
                      <p className="text-xs font-semibold text-red-800">No match found in database</p>
                      <p className="text-xs text-red-700">This transaction is truly missing from the database</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* DB Samples */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">📁 Database Transactions (First 10)</h2>
            <div className="space-y-2">
              {data.dbSamples.map((db: any, idx: number) => (
                <div key={idx} className="p-3 border-b">
                  <p className="font-medium">{db.date} - {db.merchant_normalized}</p>
                  <p className="text-sm text-gray-600">Raw: {db.merchant_raw}</p>
                  <p className="text-sm text-gray-600">Amount: {formatCurrency(db.amount)}</p>
                  <p className="text-xs text-gray-500">
                    DB Key: <code className="bg-gray-100 px-1 rounded">{db.dbKey}</code>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

