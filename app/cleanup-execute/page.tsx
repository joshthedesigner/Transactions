import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function CleanupExecutePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get state BEFORE cleanup
  const { data: filesBefore } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  const { data: transactions } = await supabase
    .from('transactions')
    .select('source_file_id')
    .eq('user_id', user.id);

  // Find empty files
  const emptyFileIds = filesBefore
    ?.filter((file) => {
      const hasTransactions = transactions?.some((t) => t.source_file_id === file.id);
      return !hasTransactions;
    })
    .map((file) => file.id) || [];

  const beforeCount = filesBefore?.length || 0;
  let deletedCount = 0;
  let error = null;

  // Execute cleanup
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

  // Get state AFTER cleanup
  const { data: filesAfter } = await supabase
    .from('source_files')
    .select('id, filename')
    .eq('user_id', user.id);

  const afterCount = filesAfter?.length || 0;

  // Build remaining file list with transaction counts
  const remainingFiles = filesAfter?.map((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    return {
      filename: file.filename,
      transactionCount: fileTransactions.length,
    };
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-3xl w-full">
        <div className={`rounded-lg p-8 ${error ? 'bg-red-50 border-2 border-red-500' : 'bg-green-50 border-2 border-green-500'}`}>
          {error ? (
            <>
              <h1 className="text-3xl font-bold text-red-800 mb-4">❌ Cleanup Failed</h1>
              <p className="text-red-700 text-lg mb-4">{error}</p>
              <a
                href="/cleanup-status"
                className="inline-block bg-blue-600 text-white py-3 px-6 rounded-md hover:bg-blue-700 font-semibold"
              >
                Try Again
              </a>
            </>
          ) : (
            <>
              <h1 className="text-4xl font-bold text-green-800 mb-6">
                {deletedCount > 0 ? '✅ Cleanup Complete!' : '✅ Already Clean!'}
              </h1>
              
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Files Before</p>
                  <p className="text-4xl font-bold text-gray-800">{beforeCount}</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Files Deleted</p>
                  <p className="text-4xl font-bold text-red-600">{deletedCount}</p>
                </div>

                <div className="bg-white rounded-lg p-6">
                  <p className="text-sm text-gray-600 mb-2">Files After</p>
                  <p className="text-4xl font-bold text-green-600">{afterCount}</p>
                </div>
              </div>

              {deletedCount > 0 && (
                <div className="bg-white rounded-lg p-6 mb-6">
                  <p className="text-xl font-bold text-green-800 mb-4">
                    🎉 Successfully deleted {deletedCount} empty source files!
                  </p>
                </div>
              )}

              {/* Show remaining files */}
              <div className="bg-white rounded-lg p-6 mb-6">
                <h2 className="text-xl font-bold mb-4">Remaining Files ({afterCount})</h2>
                <div className="space-y-2">
                  {remainingFiles.map((file, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <span className="font-medium">{file.filename}</span>
                      <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-semibold text-sm">
                        {file.transactionCount} transactions
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <a
                  href="/"
                  className="block w-full bg-blue-600 text-white text-center py-4 px-6 rounded-md hover:bg-blue-700 font-bold text-lg"
                >
                  Back to Dashboard
                </a>
                <a
                  href="/db-check"
                  className="block w-full bg-gray-200 text-gray-800 text-center py-3 px-6 rounded-md hover:bg-gray-300 font-semibold"
                >
                  View Database Status
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

