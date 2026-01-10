import { diagnoseTransactions } from '@/lib/actions/diagnose';
import AppLayout from '@/app/components/AppLayout';

export default async function DiagnosePage() {
  let result;
  let error: string | null = null;

  try {
    result = await diagnoseTransactions();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Transaction Data Diagnosis</h1>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        ) : result ? (
          <div className="space-y-6">
            {/* Date Range */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📅 Date Range Analysis</h2>
              <div className="space-y-2">
                <p><strong>Earliest transaction:</strong> {result.dateRange.earliest || 'N/A'}</p>
                <p><strong>Latest transaction:</strong> {result.dateRange.latest || 'N/A'}</p>
                {result.dateRange.monthsDiff !== null && (
                  <p><strong>Date range:</strong> {result.dateRange.monthsDiff} months</p>
                )}
              </div>
            </div>

            {/* Breakdown by File */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">📊 Transaction Breakdown by Source File</h2>
              <div className="space-y-4">
                {result.byFile.map((file) => (
                  <div key={file.filename} className="border-b pb-4 last:border-b-0">
                    <h3 className="font-semibold text-lg mb-2">📄 {file.filename}</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p><strong>Transactions:</strong> {file.count}</p>
                        <p><strong>Date range:</strong> {file.dates.min} to {file.dates.max}</p>
                      </div>
                      <div>
                        <p><strong>Positive:</strong> {file.positiveCount} = ${file.positiveTotal.toFixed(2)}</p>
                        <p><strong>Negative:</strong> {file.negativeCount} = ${file.negativeTotal.toFixed(2)}</p>
                        <p><strong>Absolute total:</strong> ${file.absoluteTotal.toFixed(2)}</p>
                      </div>
                    </div>
                    {file.filename.toLowerCase().includes('chase') ? (
                      <p className="mt-2 text-blue-600">
                        <strong>Expected spending (Chase):</strong> ${file.negativeTotal.toFixed(2)} (negative amounts)
                      </p>
                    ) : (
                      <p className="mt-2 text-green-600">
                        <strong>Expected spending (Other):</strong> ${file.positiveTotal.toFixed(2)} (positive amounts)
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <p className="text-lg font-semibold">
                  <strong>TOTAL:</strong> {result.grandCount} transactions, ${result.grandTotal.toFixed(2)} expected spending
                </p>
              </div>
            </div>

            {/* Activity.csv Negative Analysis */}
            {result.activityNegative.count > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">🔍 Activity.csv Negative Amounts Analysis</h2>
                <div className="space-y-2 mb-4">
                  <p><strong>Found:</strong> {result.activityNegative.count} negative transactions</p>
                  <p><strong>Total negative amount:</strong> ${result.activityNegative.total.toFixed(2)}</p>
                  <p><strong>Transactions with credit/refund keywords:</strong> {result.activityNegative.creditKeywordCount}/{result.activityNegative.count}</p>
                </div>
                {result.activityNegative.samples.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Sample negative transactions (first 10):</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left">Date</th>
                            <th className="px-4 py-2 text-left">Merchant</th>
                            <th className="px-4 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.activityNegative.samples.map((t, i) => (
                            <tr key={i} className="border-b">
                              <td className="px-4 py-2">{t.date}</td>
                              <td className="px-4 py-2">{t.merchant}</td>
                              <td className="px-4 py-2 text-right">${t.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">📋 Summary</h2>
              <div className="space-y-2">
                <p><strong>Total transactions in database:</strong> {result.grandCount}</p>
                <p><strong>Expected total spending:</strong> ${result.grandTotal.toFixed(2)}</p>
                <p className="mt-4 text-sm text-gray-600">
                  💡 <strong>Next steps:</strong> Compare this expected total with what the app shows. 
                  If there's a discrepancy, check the date range filter in the Analytics page.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="text-yellow-800">No data available</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}




