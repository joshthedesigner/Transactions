'use client';

import { useEffect, useState } from 'react';
import { checkChase2861Upload } from '@/lib/actions/check-chase2861-upload';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CheckChase2861Page() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await checkChase2861Upload();
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
              <p className="text-blue-800">Checking Chase2861 upload status...</p>
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

  if (!data) {
    return null;
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Chase2861 Upload Status</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Chase2861 Files Found</p>
                <p className="text-2xl font-bold">{data.totalChase2861Files}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Source Files</p>
                <p className="text-2xl font-bold">{data.allSourceFilesCount}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Transactions</p>
                <p className="text-2xl font-bold">{data.allTransactionsCount}</p>
              </div>
            </div>
          </div>

          {/* Chase2861 Files */}
          {data.chase2861SourceFiles.length > 0 ? (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">📁 Chase2861 Source Files</h2>
              {data.chase2861SourceFiles.map((result: any, idx: number) => (
                <div key={idx} className="mb-4 p-4 bg-gray-50 rounded">
                  <p className="font-semibold">{result.sourceFile.filename}</p>
                  <p className="text-sm text-gray-600">
                    Uploaded: {new Date(result.sourceFile.uploaded_at).toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-600">
                    Convention: {result.sourceFile.amount_sign_convention || 'null'}
                  </p>
                  <p className="text-lg font-bold mt-2">
                    Transactions: {result.transactionCount}
                  </p>
                  {result.transactionCount === 0 && (
                    <p className="text-red-600 font-semibold mt-2">
                      ⚠️ NO TRANSACTIONS FOUND - File uploaded but transactions not inserted!
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 text-red-800">⚠️ No Chase2861 Files Found</h2>
              <p className="text-lg">
                No source files matching "Chase2861" were found in the database.
              </p>
              <p className="mt-2 text-sm text-gray-700">
                This means the file was never successfully uploaded, or the filename doesn't match.
              </p>
            </div>
          )}

          {/* Sample Transactions Check */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">🔍 Sample Transactions Check</h2>
            <p className="text-sm text-gray-600 mb-4">
              Checking if specific Chase2861 transactions exist in the database:
            </p>
            <div className="space-y-2">
              {data.sampleTransactionsCheck.map((check: any, idx: number) => (
                <div key={idx} className={`p-3 rounded ${check.found ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {check.found ? '✓ Found' : '✗ Missing'}: {check.sample.date} - {check.sample.merchant}
                      </p>
                      <p className="text-sm text-gray-600">
                        Amount: {formatCurrency(check.sample.amount)}
                      </p>
                    </div>
                    {check.found && check.transaction && (
                      <div className="text-sm text-gray-500">
                        Source: {(check.transaction as any).source_file?.filename || 'unknown'}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Source Files */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">📤 Recent Source Files (Last 10)</h2>
            <div className="space-y-2">
              {data.recentSourceFiles.map((file: any) => (
                <div key={file.id} className="p-2 border-b">
                  <p className="font-medium">{file.filename}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(file.uploaded_at).toLocaleString()} | Convention: {file.amount_sign_convention || 'null'}
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

