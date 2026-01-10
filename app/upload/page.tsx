'use client';

import { useState } from 'react';
import { uploadTransactionsV2, UploadResult } from '@/lib/actions/upload-transactions-v2';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function UploadPage() {
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    try {
      const uploadResult = await uploadTransactionsV2(formData);
      setResult(uploadResult);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
        totalTransactions: 0,
        totalSpending: 0,
        fileResults: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-6xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-2">Upload Transactions</h1>
          <p className="text-gray-600 mb-6">
            Upload CSV or Excel files to import transactions. Multiple files can be uploaded at once.
          </p>

          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select CSV/Excel Files (Multiple files allowed)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                multiple
                onChange={handleFileChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
              {files.length > 0 && (
                <p className="mt-2 text-sm text-gray-600">
                  {files.length} file(s) selected: {files.map(f => f.name).join(', ')}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || files.length === 0}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? `Uploading ${files.length} file(s)...` : `Upload ${files.length} File(s)`}
            </button>
          </form>

          {result && (
            <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h2 className={`text-2xl font-semibold mb-4 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? '✅ Upload Successful' : '❌ Upload Failed'}
              </h2>
              
              <p className={`text-lg mb-6 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>

              {/* Summary Stats */}
              {result.success && (
                <div className="bg-white rounded-lg p-6 mb-6">
                  <h3 className="text-xl font-semibold mb-4">📊 Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Transactions</p>
                      <p className="text-2xl font-bold">{result.totalTransactions}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Spending</p>
                      <p className="text-2xl font-bold">{formatCurrency(result.totalSpending)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Files Processed</p>
                      <p className="text-2xl font-bold">{result.fileResults.length}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Results by File */}
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-xl font-semibold mb-4">📁 Results by File</h3>
                <div className="space-y-4">
                  {result.fileResults.map((fileResult, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg p-4 border-2 ${
                        fileResult.success
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-lg">{fileResult.filename}</h4>
                          <p className={`text-sm mt-1 ${fileResult.success ? 'text-green-700' : 'text-red-700'}`}>
                            {fileResult.message}
                          </p>
                        </div>
                        {fileResult.success && (
                          <div className="text-right ml-4">
                            <p className="text-sm text-gray-600">Transactions</p>
                            <p className="text-xl font-bold">{fileResult.transactionCount}</p>
                            <p className="text-sm text-gray-600">Spending</p>
                            <p className="text-lg font-bold">{formatCurrency(fileResult.totalSpending)}</p>
                          </div>
                        )}
                      </div>

                      {/* Errors */}
                      {fileResult.errors && fileResult.errors.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-3">
                          <h5 className="font-semibold mb-2 text-yellow-800 text-sm">Warnings:</h5>
                          <ul className="list-disc list-inside space-y-1 text-xs text-yellow-700">
                            {fileResult.errors.map((error, errorIdx) => (
                              <li key={errorIdx}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Next Steps */}
              {result.success && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm">
                    <strong>Next Steps:</strong> View your transactions in the{' '}
                    <a href="/analytics" className="text-blue-600 hover:underline">
                      Analytics Dashboard
                    </a>
                    {' '}or check{' '}
                    <a href="/raw-db-totals" className="text-blue-600 hover:underline">
                      Raw Database Totals
                    </a>
                    .
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

