'use client';

import { useState } from 'react';
import AppLayout from '@/app/components/AppLayout';
import { cleanupEmptyFiles } from '@/lib/actions/cleanup-empty-files';

export default function CleanupPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCleanup = async () => {
    if (!confirm('This will delete all source files that have 0 transactions. Continue?')) {
      return;
    }

    setLoading(true);
    try {
      const res = await cleanupEmptyFiles();
      setResult(res);
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Cleanup Empty Source Files</h1>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-yellow-800 mb-2">⚠️ Warning</h2>
          <p className="text-yellow-700">
            You have <strong>59 source files</strong> with <strong>0 transactions</strong> in the database.
          </p>
          <p className="text-yellow-700 mt-2">
            These are "ghost" files from failed uploads that are cluttering your database.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">What This Will Do</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Find all source files with 0 linked transactions</li>
            <li>Delete those empty source file records</li>
            <li>Keep all files that have transactions</li>
            <li>This will NOT delete any actual transaction data</li>
          </ul>

          <button
            onClick={handleCleanup}
            disabled={loading}
            className="mt-6 w-full bg-red-600 text-white py-3 px-4 rounded-md hover:bg-red-700 disabled:opacity-50 font-semibold"
          >
            {loading ? 'Cleaning up...' : 'Clean Up Empty Files'}
          </button>
        </div>

        {result && (
          <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h2 className={`text-xl font-bold mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? '✅ Success' : '❌ Error'}
            </h2>
            <p className={result.success ? 'text-green-700' : 'text-red-700'}>
              {result.message}
            </p>
            {result.success && result.deletedCount > 0 && (
              <p className="text-green-700 mt-2">
                Deleted <strong>{result.deletedCount}</strong> empty source files.
              </p>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-800 mb-4">Next Steps After Cleanup</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-900">
            <li>After cleanup, you'll have only 3 clean source files in the database</li>
            <li>We need to investigate why the uploads are failing to insert transactions</li>
            <li>Then re-upload the missing file (Chase3887) and the incomplete file (Chase2909)</li>
          </ol>
        </div>
      </div>
    </AppLayout>
  );
}

