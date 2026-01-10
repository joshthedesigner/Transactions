import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function RunCleanupPage() {
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

  // Find files with no transactions
  const emptyFileIds = sourceFiles
    ?.filter((file) => {
      const hasTransactions = transactions?.some((t) => t.source_file_id === file.id);
      return !hasTransactions;
    })
    .map((file) => file.id) || [];

  const beforeCount = sourceFiles?.length || 0;
  let deletedCount = 0;
  let error = null;

  // Delete empty files if any exist
  if (emptyFileIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('source_files')
      .delete()
      .in('id', emptyFileIds);

    if (deleteError) {
      error = deleteError.message;
    } else {
      deletedCount = emptyFileIds.length;
    }
  }

  const afterCount = beforeCount - deletedCount;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className={`rounded-lg p-8 ${error ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          {error ? (
            <>
              <h1 className="text-3xl font-bold text-red-800 mb-4">❌ Cleanup Failed</h1>
              <p className="text-red-700 text-lg">{error}</p>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-green-800 mb-4">✅ Cleanup Complete!</h1>
              
              <div className="space-y-4 text-green-900">
                <div className="bg-white rounded-lg p-4">
                  <p className="text-sm text-gray-600">Files Before Cleanup</p>
                  <p className="text-3xl font-bold">{beforeCount}</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <p className="text-sm text-gray-600">Empty Files Deleted</p>
                  <p className="text-3xl font-bold text-red-600">{deletedCount}</p>
                </div>

                <div className="bg-white rounded-lg p-4">
                  <p className="text-sm text-gray-600">Files Remaining</p>
                  <p className="text-3xl font-bold text-green-600">{afterCount}</p>
                </div>

                {deletedCount === 0 ? (
                  <p className="text-lg mt-6">No empty files found. Database is already clean!</p>
                ) : (
                  <p className="text-lg mt-6">
                    Successfully removed <strong>{deletedCount}</strong> empty source files from your database.
                  </p>
                )}
              </div>

              <div className="mt-8 space-y-3">
                <a
                  href="/db-check"
                  className="block w-full bg-blue-600 text-white text-center py-3 px-4 rounded-md hover:bg-blue-700 font-semibold"
                >
                  View Database Status
                </a>
                <a
                  href="/"
                  className="block w-full bg-gray-200 text-gray-800 text-center py-3 px-4 rounded-md hover:bg-gray-300 font-semibold"
                >
                  Back to Dashboard
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

