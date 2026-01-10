'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/app/components/AppLayout';
import { diagnoseFiles, FilesDiagnostic } from '@/lib/actions/diagnose-files';
import { format } from 'date-fns';

export default function DiagnoseFilesPage() {
  const [diagnostic, setDiagnostic] = useState<FilesDiagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiagnostic();
  }, []);

  const loadDiagnostic = async () => {
    try {
      setLoading(true);
      const data = await diagnoseFiles();
      setDiagnostic(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-lg">Loading diagnostic...</div>
        </div>
      </AppLayout>
    );
  }

  if (error || !diagnostic) {
    return (
      <AppLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-red-800 mb-2">Error</h2>
          <p className="text-red-700">{error || 'Failed to load diagnostic'}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Files Diagnostic</h1>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Files in Database</p>
            <p className="text-3xl font-bold text-gray-900">{diagnostic.totalFilesInDatabase}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Files with Approved Transactions</p>
            <p className="text-3xl font-bold text-green-900">{diagnostic.filesWithApprovedTransactions}</p>
            <p className="text-xs text-gray-500 mt-1">(Shown on dashboard)</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Files with Only Pending</p>
            <p className="text-3xl font-bold text-yellow-900">{diagnostic.filesWithOnlyPendingTransactions}</p>
            <p className="text-xs text-gray-500 mt-1">(Hidden from dashboard)</p>
          </div>
        </div>

        {/* Issue Alert */}
        {diagnostic.filesWithOnlyPendingTransactions > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-800 mb-2">⚠️ Issue Found</h2>
            <p className="text-yellow-700">
              <strong>{diagnostic.filesWithOnlyPendingTransactions}</strong> file(s) have transactions that are marked
              as 'pending_review' instead of 'approved'. The dashboard only shows files with approved transactions.
            </p>
            <p className="text-yellow-700 mt-2">
              This is why you're seeing {diagnostic.filesWithApprovedTransactions} files instead of{' '}
              {diagnostic.totalFilesInDatabase}.
            </p>
          </div>
        )}

        {/* All Files Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">All Files in Database</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Filename
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uploaded At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Convention
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Transactions
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approved
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Visible?
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {diagnostic.allFiles.map((file) => {
                  const isVisible = file.approvedTransactions > 0;
                  return (
                    <tr key={file.id} className={isVisible ? '' : 'bg-yellow-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {file.filename}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {format(new Date(file.uploadedAt), 'MMM dd, yyyy HH:mm')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <span className="font-mono">{file.convention || 'null'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                        {file.totalTransactions}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold">
                          {file.approvedTransactions}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <span
                          className={`px-2 py-1 rounded font-semibold ${
                            file.pendingTransactions > 0
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {file.pendingTransactions}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        {isVisible ? (
                          <span className="text-green-600 font-semibold">✓ Yes</span>
                        ) : (
                          <span className="text-red-600 font-semibold">✗ No</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Explanation */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-800 mb-4">Why This Happens</h2>
          <div className="space-y-2 text-blue-900">
            <p>
              The dashboard filters transactions by <code className="bg-blue-100 px-1 rounded">status = 'approved'</code>
              . This means:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Files with approved transactions are counted and shown</li>
              <li>Files with only pending transactions are not counted or shown</li>
              <li>Transactions can be pending if they had low AI confidence during upload</li>
            </ul>
            <p className="mt-4 font-semibold">
              Solution: The new upload flow (v2) marks all transactions as 'approved' by default. If you see pending
              transactions, they were uploaded with the old flow.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

