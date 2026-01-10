import { getDbStatus } from '@/lib/actions/get-db-status';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DbCheckPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const result = await getDbStatus();

  if ('error' in result) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-600">Error</h1>
        <p>{result.error}</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Database Status Report</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Summary</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-600">Total Files in Database:</p>
            <p className="text-2xl font-bold">{result.summary.totalFiles}</p>
          </div>
          <div>
            <p className="text-gray-600">Files Visible on Dashboard:</p>
            <p className="text-2xl font-bold text-green-600">{result.summary.filesVisible}</p>
          </div>
          <div>
            <p className="text-gray-600">Files Hidden (No Approved):</p>
            <p className="text-2xl font-bold text-red-600">{result.summary.filesHidden}</p>
          </div>
          <div>
            <p className="text-gray-600">Total Transactions:</p>
            <p className="text-2xl font-bold">{result.summary.totalTransactions}</p>
          </div>
          <div>
            <p className="text-gray-600">Approved Transactions:</p>
            <p className="text-2xl font-bold text-green-600">{result.summary.approvedTransactions}</p>
          </div>
          <div>
            <p className="text-gray-600">Pending Transactions:</p>
            <p className="text-2xl font-bold text-yellow-600">{result.summary.pendingTransactions}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">File Breakdown</h2>
        </div>
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Filename</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Convention</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Approved</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Pending</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {result.files.map((file) => (
              <tr key={file.id} className={file.visibleOnDashboard ? 'bg-white' : 'bg-yellow-50'}>
                <td className="px-6 py-4 text-sm font-medium">{file.filename}</td>
                <td className="px-6 py-4 text-sm">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">{file.convention || 'null'}</code>
                </td>
                <td className="px-6 py-4 text-sm text-center">{file.totalTransactions}</td>
                <td className="px-6 py-4 text-sm text-center">
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded font-semibold">
                    {file.approvedCount}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <span className={`px-2 py-1 rounded font-semibold ${
                    file.pendingCount > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {file.pendingCount}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  {file.visibleOnDashboard ? (
                    <span className="text-green-600 font-semibold">✓ VISIBLE</span>
                  ) : (
                    <span className="text-red-600 font-semibold">✗ HIDDEN</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

