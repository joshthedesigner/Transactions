'use client';

import { useEffect, useState } from 'react';
import { debugDatabase } from '@/lib/actions/debug-db';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function DebugDBPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await debugDatabase();
        setData(result);
      } catch (e) {
        console.error('Debug error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-6">Database Debug Info</h1>

          {loading && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Loading...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          )}

          {!loading && !error && data && (
            <div className="space-y-6">
              {/* Source Files */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📁 Source Files ({data.sourceFiles.length})</h2>
                <div className="space-y-2">
                  {data.sourceFiles.map((file: any) => (
                    <div key={file.id} className="border-b pb-2">
                      <p><strong>ID:</strong> {file.id} | <strong>Filename:</strong> {file.filename}</p>
                      <p className="text-sm text-gray-600">Uploaded: {new Date(file.uploaded_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transactions by Source File */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📊 Transactions by Source File</h2>
                <div className="space-y-4">
                  {data.transactionsBySourceFile.map((item: any) => (
                    <div key={item.sourceFileId} className="border-b pb-4">
                      <p className="font-semibold">
                        Source File ID {item.sourceFileId}: {item.filename}
                      </p>
                      <p className="text-sm">
                        <strong>Count:</strong> {item.count} transactions | 
                        <strong> Total:</strong> ${item.total.toFixed(2)}
                      </p>
                      {item.sample.length > 0 && (
                        <div className="mt-2 text-xs">
                          <p className="font-semibold">Sample transactions:</p>
                          <ul className="list-disc list-inside">
                            {item.sample.map((t: any, i: number) => (
                              <li key={i}>
                                {t.date} | {t.merchant} | ${t.amount.toFixed(2)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  {data.transactionsBySourceFile.length === 0 && (
                    <p className="text-gray-600">No transactions found grouped by source file</p>
                  )}
                </div>
              </div>

              {/* Sample Transactions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">📋 Sample Transactions (first 10 of {data.totalTransactions})</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left">ID</th>
                        <th className="px-4 py-2 text-left">Date</th>
                        <th className="px-4 py-2 text-left">Merchant</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        <th className="px-4 py-2 text-left">Source File ID</th>
                        <th className="px-4 py-2 text-left">Source Filename</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sampleTransactions.map((t: any) => (
                        <tr key={t.id} className="border-b">
                          <td className="px-4 py-2">{t.id}</td>
                          <td className="px-4 py-2">{t.date}</td>
                          <td className="px-4 py-2">{t.merchant_raw}</td>
                          <td className="px-4 py-2 text-right">${Number(t.amount).toFixed(2)}</td>
                          <td className="px-4 py-2">{t.source_file_id}</td>
                          <td className="px-4 py-2">{t.source_file?.filename || 'NULL'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Errors */}
              {(data.errors.sourceFiles || data.errors.transactions) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                  <h3 className="font-semibold mb-2">Errors:</h3>
                  {data.errors.sourceFiles && (
                    <p className="text-sm">Source Files: {data.errors.sourceFiles}</p>
                  )}
                  {data.errors.transactions && (
                    <p className="text-sm">Transactions: {data.errors.transactions}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}




