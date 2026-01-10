import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AppLayout from '@/app/components/AppLayout';

export default async function CheckDbDirectPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Get all source files for this user
  const { data: sourceFiles, error: filesError } = await supabase
    .from('source_files')
    .select('id, filename, uploaded_at, amount_sign_convention')
    .eq('user_id', user.id)
    .order('uploaded_at', { ascending: false });

  // Get all transactions for this user
  const { data: transactions, error: transactionsError } = await supabase
    .from('transactions')
    .select('id, source_file_id, status, amount')
    .eq('user_id', user.id);

  // Build breakdown
  const fileBreakdown = sourceFiles?.map((file) => {
    const fileTransactions = transactions?.filter((t) => t.source_file_id === file.id) || [];
    const approved = fileTransactions.filter((t) => t.status === 'approved');
    const pending = fileTransactions.filter((t) => t.status === 'pending_review');

    return {
      id: file.id,
      filename: file.filename,
      convention: file.amount_sign_convention,
      uploadedAt: new Date(file.uploaded_at).toLocaleString(),
      totalTransactions: fileTransactions.length,
      approvedCount: approved.length,
      pendingCount: pending.length,
      visibleOnDashboard: approved.length > 0,
    };
  }) || [];

  const totalApproved = transactions?.filter((t) => t.status === 'approved').length || 0;
  const totalPending = transactions?.filter((t) => t.status === 'pending_review').length || 0;
  const filesWithApproved = fileBreakdown.filter((f) => f.approvedCount > 0);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Database Status (Authenticated)</h1>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Files in DB</p>
            <p className="text-3xl font-bold text-gray-900">{sourceFiles?.length || 0}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Files Visible on Dashboard</p>
            <p className="text-3xl font-bold text-green-900">{filesWithApproved.length}</p>
            <p className="text-xs text-gray-500 mt-1">(Have approved transactions)</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-sm font-medium text-gray-600 mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-gray-900">{transactions?.length || 0}</p>
            <p className="text-xs text-gray-500 mt-1">Approved: {totalApproved} | Pending: {totalPending}</p>
          </div>
        </div>

        {/* Issue Alert */}
        {sourceFiles && sourceFiles.length > filesWithApproved.length && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-yellow-800 mb-2">⚠️ Found the Issue!</h2>
            <p className="text-yellow-700">
              You have <strong>{sourceFiles.length}</strong> files in the database, but only{' '}
              <strong>{filesWithApproved.length}</strong> are visible on the dashboard.
            </p>
            <p className="text-yellow-700 mt-2">
              <strong>{sourceFiles.length - filesWithApproved.length}</strong> file(s) have NO approved transactions
              (only pending), so they're hidden from the dashboard.
            </p>
          </div>
        )}

        {/* Files Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold">All Files</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Convention</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Approved</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Visible?</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {fileBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No files found in database
                    </td>
                  </tr>
                ) : (
                  fileBreakdown.map((file) => (
                    <tr key={file.id} className={file.visibleOnDashboard ? '' : 'bg-yellow-50'}>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{file.filename}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <code className="bg-gray-100 px-2 py-1 rounded">{file.convention || 'null'}</code>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 text-center">{file.totalTransactions}</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold">
                          {file.approvedCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span
                          className={`px-2 py-1 rounded font-semibold ${
                            file.pendingCount > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {file.pendingCount}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-center">
                        {file.visibleOnDashboard ? (
                          <span className="text-green-600 font-semibold">✓ Yes</span>
                        ) : (
                          <span className="text-red-600 font-semibold">✗ No</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Explanation */}
        {sourceFiles && sourceFiles.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-blue-800 mb-4">Why Files Are Hidden</h2>
            <p className="text-blue-900">
              The dashboard only shows files that have <strong>approved</strong> transactions. Files with only{' '}
              <strong>pending</strong> transactions are filtered out.
            </p>
            <p className="text-blue-900 mt-2">
              Dashboard query: <code className="bg-blue-100 px-2 py-1 rounded">.eq('status', 'approved')</code>
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

