'use client';

import { useState } from 'react';
import { simpleUpload, SimpleUploadResult } from '@/lib/actions/simple-upload';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function SimpleUploadPage() {
  const [result, setResult] = useState<SimpleUploadResult | null>(null);
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
      formData.append('file', file);
    });

    try {
      const uploadResult = await simpleUpload(formData);
      setResult(uploadResult);
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed',
        totalTransactionCount: 0,
        fileResults: [],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">Simple Upload</h1>
          <p className="text-gray-600 mb-6">
            Ultra-simple upload: Parse CSV → Insert transactions → Done. No categorization, no review queue.
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
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? `Uploading ${files.length} file(s)...` : `Upload ${files.length} File(s)`}
            </button>
          </form>

          {result && (
            <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h2 className={`text-xl font-semibold mb-4 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? '✅ Success' : '❌ Error'}
              </h2>
              
              <p className={`mb-4 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                {result.message}
              </p>

              {result.totalTransactionCount > 0 && (
                <div className="bg-white rounded p-4 mb-4">
                  <h3 className="font-semibold mb-2">Total Summary:</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Transactions</p>
                      <p className="text-lg font-bold">{result.totalTransactionCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Value</p>
                      <p className="text-lg font-bold">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(result.totalValue || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Results by File */}
              {result.fileResults.length > 0 && (
                <div className="space-y-4 mb-4">
                  <h3 className="font-semibold">Results by File:</h3>
                  {result.fileResults.map((fileResult, idx) => (
                    <div
                      key={idx}
                      className={`rounded p-4 ${fileResult.success ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}
                    >
                      <h4 className="font-semibold mb-2">{fileResult.filename}</h4>
                      <p className={`text-sm mb-2 ${fileResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {fileResult.message}
                      </p>
                      
                      {fileResult.details && (
                        <div className="bg-white rounded p-3 mt-2 text-sm">
                          <ul className="space-y-1">
                            <li>Rows Processed: {fileResult.details.rowsProcessed}</li>
                            <li>Rows Normalized: {fileResult.details.rowsNormalized}</li>
                            <li>Rows Skipped: {fileResult.details.rowsSkipped}</li>
                            <li className="font-semibold">Transactions Inserted: {fileResult.details.insertCount}</li>
                            <li className="font-semibold">
                              Total Value: {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: 'USD',
                              }).format(fileResult.details.totalValue || 0)}
                            </li>
                          </ul>
                        </div>
                      )}

                      {fileResult.errors && fileResult.errors.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
                          <h5 className="font-semibold mb-1 text-yellow-800 text-sm">Warnings:</h5>
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
              )}

              {result.success && (
                <div className="mt-4">
                  <a
                    href="/raw-db-totals"
                    className="text-blue-600 hover:underline"
                  >
                    View Raw Database Totals →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

