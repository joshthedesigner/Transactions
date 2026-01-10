import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function VerifyCleanupPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get all source files
  const { data: sourceFiles } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  // Get all transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('source_file_id')
    .eq('user_id', user.id);

  // Build breakdown
  const fileBreakdown = sourceFiles?.map((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    return {
      filename: file.filename,
      transactionCount: fileTransactions.length,
      isEmpty: fileTransactions.length === 0,
    };
  }) || [];

  const emptyFiles = fileBreakdown.filter((f) => f.isEmpty);
  const nonEmptyFiles = fileBreakdown.filter((f) => !f.isEmpty);
  const cleanupWorked = emptyFiles.length === 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className={`rounded-lg p-8 ${cleanupWorked ? 'bg-green-50 border-2 border-green-500' : 'bg-yellow-50 border-2 border-yellow-500'}`}>
          {cleanupWorked ? (
            <>
              <h1 className="text-4xl font-bold text-green-800 mb-6">✅ Cleanup Confirmed!</h1>
              
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Total Source Files in Database</p>
                  <p className="text-5xl font-bold text-green-600">{sourceFiles?.length || 0}</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Empty Files Remaining</p>
                  <p className="text-5xl font-bold text-green-600">0</p>
                  <p className="text-sm text-green-700 mt-2">🎉 All empty files removed!</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-3">Files with Transactions:</p>
                  {nonEmptyFiles.map((file, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b last:border-b-0">
                      <span className="font-medium text-gray-800">{file.filename}</span>
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold">
                        {file.transactionCount} transactions
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                  <p className="text-blue-900 font-semibold">✅ Database is clean!</p>
                  <p className="text-blue-800 text-sm mt-2">
                    All {sourceFiles?.length || 0} source files have transactions linked to them.
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-yellow-800 mb-4">⚠️ Cleanup Incomplete</h1>
              
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Total Files</p>
                  <p className="text-3xl font-bold">{sourceFiles?.length || 0}</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Files with Transactions</p>
                  <p className="text-3xl font-bold text-green-600">{nonEmptyFiles.length}</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Empty Files Still Remaining</p>
                  <p className="text-3xl font-bold text-red-600">{emptyFiles.length}</p>
                </div>

                <p className="text-yellow-700 mt-4">
                  There are still {emptyFiles.length} empty files in the database. You may need to run the cleanup again.
                </p>
              </div>
            </>
          )}

          <div className="mt-8 space-y-3">
            <a
              href="/"
              className="block w-full bg-blue-600 text-white text-center py-3 px-4 rounded-md hover:bg-blue-700 font-semibold"
            >
              Back to Dashboard
            </a>
            {!cleanupWorked && (
              <a
                href="/run-cleanup"
                className="block w-full bg-red-600 text-white text-center py-3 px-4 rounded-md hover:bg-red-700 font-semibold"
              >
                Run Cleanup Again
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

