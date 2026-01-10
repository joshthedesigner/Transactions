'use client';

import { useEffect, useState } from 'react';
import { compareCSVDBDetailed } from '@/lib/actions/compare-csv-db-detailed';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CompareCSVDBDetailedPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(true);
  const [showFiltered, setShowFiltered] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await compareCSVDBDetailed();
        setData(result);
      } catch (e) {
        console.error('Error:', e);
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <p className="text-blue-800">Analyzing CSV files and comparing with database...</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (error) {
    return (
      <FlowProvider>
        <AppLayout>
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">Error: {error}</p>
            </div>
          </div>
        </AppLayout>
      </FlowProvider>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-6">CSV vs Database Detailed Comparison</h1>

          {/* Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">CSV Charges</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.csvChargesTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">DB Charges</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(data.summary.dbChargesTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Matched</p>
                <p className="text-2xl font-bold">{formatCurrency(data.summary.matchedTotal)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Missing</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(data.summary.missingTotal)}</p>
                <p className="text-xs text-gray-500">
                  {data.byFile.reduce((sum: number, f: any) => sum + f.missing, 0)} transactions
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Extra in DB</p>
                <p className="text-2xl font-bold text-yellow-600">{formatCurrency(data.summary.extraTotal)}</p>
                <p className="text-xs text-gray-500">
                  {data.byFile.reduce((sum: number, f: any) => sum + f.extra, 0)} transactions
                </p>
              </div>
            </div>

            {/* Filtered Out Summary */}
            <div className="mt-4 pt-4 border-t border-blue-200">
              <h3 className="font-semibold mb-2">Filtered Out (Payments & Refunds)</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Payments</p>
                  <p className="font-bold">{data.summary.totalFilteredPayments} transactions</p>
                </div>
                <div>
                  <p className="text-gray-600">Credit Card Payments</p>
                  <p className="font-bold">{data.summary.totalFilteredCreditCardPayments} transactions</p>
                </div>
                <div>
                  <p className="text-gray-600">Credits/Refunds</p>
                  <p className="font-bold">
                    {data.summary.totalFilteredCredits} transactions = {formatCurrency(data.summary.totalFilteredCreditsAmount)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* By File */}
          <div className="space-y-6">
            {data.byFile.map((file: any, idx: number) => (
              <div key={idx} className="bg-white rounded-lg shadow p-6">
                <h3 className="text-xl font-semibold mb-4">{file.filename}</h3>
                
                {/* File Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">CSV Charges</p>
                    <p className="text-lg font-bold">{formatCurrency(file.csvChargesTotal)}</p>
                    <p className="text-xs text-gray-500">{file.csvCharges} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">DB Charges</p>
                    <p className="text-lg font-bold text-green-600">{formatCurrency(file.dbChargesTotal)}</p>
                    <p className="text-xs text-gray-500">{file.dbCharges} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Matched</p>
                    <p className="text-lg font-bold">{formatCurrency(file.matchedTotal)}</p>
                    <p className="text-xs text-gray-500">{file.matched} transactions</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Missing</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(file.missingTotal)}</p>
                    <p className="text-xs text-gray-500">{file.missing} transactions</p>
                  </div>
                </div>

                {/* Filtered Out */}
                {showFiltered && (
                  <div className="mb-4 p-4 bg-gray-50 rounded">
                    <h4 className="font-semibold mb-2">Filtered Out</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Payments:</p>
                        <p className="font-bold">{file.filteredOut.payments}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Credit Card Payments:</p>
                        <p className="font-bold">{file.filteredOut.creditCardPayments}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Credits/Refunds:</p>
                        <p className="font-bold">
                          {file.filteredOut.credits.length} = {formatCurrency(
                            file.filteredOut.credits.reduce((sum: number, c: any) => sum + Math.abs(c.amount), 0)
                          )}
                        </p>
                      </div>
                    </div>
                    {file.filteredOut.otherErrors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-600">Other Errors: {file.filteredOut.otherErrors.length}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Missing Transactions */}
                {showMissing && file.missingTransactions && file.missingTransactions.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-red-600 mb-2">
                      Missing Transactions ({file.missing} total, {formatCurrency(file.missingTotal)})
                    </h4>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Merchant</th>
                            <th className="px-3 py-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {file.missingTransactions.map((t: any, i: number) => (
                            <tr key={i} className="border-b bg-red-50">
                              <td className="px-3 py-2">{t.csvDate}</td>
                              <td className="px-3 py-2">{t.csvMerchant}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCurrency(t.csvSpendingAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 sticky bottom-0">
                          <tr>
                            <td colSpan={2} className="px-3 py-2 font-semibold">Total</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(file.missingTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

