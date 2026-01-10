import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function CleanupStatusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Step 1: Get current state BEFORE any cleanup
  const { data: allFiles } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  const { data: allTransactions } = await supabase
    .from('transactions')
    .select('id, source_file_id')
    .eq('user_id', user.id);

  const beforeState = allFiles?.map((file) => ({
    id: file.id,
    filename: file.filename,
    transactionCount: allTransactions?.filter((t) => t.source_file_id === file.id).length || 0,
  })) || [];

  const emptyFilesBefore = beforeState.filter((f) => f.transactionCount === 0);
  const nonEmptyFilesBefore = beforeState.filter((f) => f.transactionCount > 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Database Cleanup Status</h1>

        {/* Current State */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Current Database State</h2>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-gray-50 p-4 rounded">
              <p className="text-sm text-gray-600">Total Files</p>
              <p className="text-3xl font-bold">{allFiles?.length || 0}</p>
            </div>
            <div className="bg-green-50 p-4 rounded">
              <p className="text-sm text-gray-600">Files with Transactions</p>
              <p className="text-3xl font-bold text-green-600">{nonEmptyFilesBefore.length}</p>
            </div>
            <div className="bg-red-50 p-4 rounded">
              <p className="text-sm text-gray-600">Empty Files</p>
              <p className="text-3xl font-bold text-red-600">{emptyFilesBefore.length}</p>
            </div>
          </div>

          {/* Files with Transactions */}
          {nonEmptyFilesBefore.length > 0 && (
            <div className="mb-6">
              <h3 className="font-bold text-green-800 mb-2">✅ Files with Transactions ({nonEmptyFilesBefore.length}):</h3>
              <div className="space-y-2">
                {nonEmptyFilesBefore.map((file) => (
                  <div key={file.id} className="bg-green-50 p-3 rounded flex justify-between items-center">
                    <span className="font-medium">{file.filename}</span>
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                      {file.transactionCount} transactions
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty Files */}
          {emptyFilesBefore.length > 0 && (
            <div>
              <h3 className="font-bold text-red-800 mb-2">❌ Empty Files ({emptyFilesBefore.length}):</h3>
              <div className="space-y-2">
                {emptyFilesBefore.slice(0, 10).map((file) => (
                  <div key={file.id} className="bg-red-50 p-3 rounded flex justify-between items-center">
                    <span className="font-medium">{file.filename}</span>
                    <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-semibold">
                      0 transactions
                    </span>
                  </div>
                ))}
                {emptyFilesBefore.length > 10 && (
                  <p className="text-sm text-gray-600 italic">
                    ... and {emptyFilesBefore.length - 10} more empty files
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        {emptyFilesBefore.length > 0 ? (
          <div className="bg-yellow-50 border-2 border-yellow-500 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-800 mb-4">⚠️ Action Required</h2>
            <p className="text-yellow-700 mb-4">
              You have <strong>{emptyFilesBefore.length}</strong> empty source files that need to be cleaned up.
            </p>
            <form action="/cleanup-execute" method="GET">
              <button
                type="submit"
                className="w-full bg-red-600 text-white py-4 px-6 rounded-md hover:bg-red-700 font-bold text-lg"
              >
                🗑️ Delete {emptyFilesBefore.length} Empty Files Now
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold text-green-800 mb-2">✅ Database is Clean!</h2>
            <p className="text-green-700">
              All {allFiles?.length || 0} source files have transactions. No cleanup needed.
            </p>
            <a
              href="/"
              className="inline-block mt-4 bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 font-semibold"
            >
              Back to Dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

