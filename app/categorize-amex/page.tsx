'use client';

import { useState } from 'react';
import { applyAmexCategories, previewAmexCategoryPredictions, ApplyCategoriesResult } from '@/lib/actions/apply-amex-categories';
import AppLayout from '@/app/components/AppLayout';
import { FlowProvider } from '@/app/contexts/FlowContext';

export default function CategorizeAmexPage() {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<ApplyCategoriesResult | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [includeLowConfidence, setIncludeLowConfidence] = useState(false);

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const data = await previewAmexCategoryPredictions();
      setPreview(data);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to preview predictions');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApply = async () => {
    if (!preview) {
      alert('Please preview predictions first');
      return;
    }

    if (!confirm(`Apply categories to ${includeLowConfidence ? preview.summary.predictionsGenerated : preview.summary.highConfidence} transactions?`)) {
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const data = await applyAmexCategories(includeLowConfidence);
      setResult(data);
      if (data.success) {
        // Refresh preview
        await handlePreview();
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to apply categories');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <FlowProvider>
      <AppLayout>
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-3xl font-bold mb-2">Categorize Amex Transactions</h1>
          <p className="text-gray-600 mb-6">
            Use ML model trained on Chase transactions to predict categories for uncategorized Amex transactions.
          </p>

          {/* Preview Section */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">📊 Preview Predictions</h2>
            <p className="text-gray-600 mb-4">
              Preview ML-generated category predictions before applying them.
            </p>
            <button
              onClick={handlePreview}
              disabled={previewLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {previewLoading ? 'Generating Predictions...' : 'Preview Predictions'}
            </button>

            {preview && (
              <div className="mt-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold mb-2">Summary</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Uncategorized</p>
                      <p className="text-xl font-bold">{preview.summary.totalUncategorized}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">High Confidence</p>
                      <p className="text-xl font-bold text-green-600">{preview.summary.highConfidence}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Low Confidence</p>
                      <p className="text-xl font-bold text-yellow-600">{preview.summary.lowConfidence}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Total Predictions</p>
                      <p className="text-xl font-bold">{preview.summary.predictionsGenerated}</p>
                    </div>
                  </div>
                </div>

                {preview.summary.lowConfidencePredictions.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                    <h3 className="font-semibold mb-2">⚠️ Low Confidence Predictions</h3>
                    <p className="text-sm text-gray-700 mb-2">
                      {preview.summary.lowConfidencePredictions.length} predictions have low confidence (&lt; 60%).
                      Review these before applying.
                    </p>
                    <div className="max-h-40 overflow-y-auto">
                      <ul className="list-disc list-inside text-sm">
                        {preview.summary.lowConfidencePredictions.slice(0, 10).map((p: any, idx: number) => (
                          <li key={idx}>
                            Transaction {p.transactionId}: {p.predictedCategoryName} ({(p.confidence * 100).toFixed(1)}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Sample Predictions */}
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Sample Predictions (First 10)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">ID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Confidence</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.predictions.slice(0, 10).map((p: any) => (
                          <tr key={p.transactionId}>
                            <td className="px-4 py-2 text-sm">{p.transactionId}</td>
                            <td className="px-4 py-2 text-sm">{p.predictedCategoryName}</td>
                            <td className={`px-4 py-2 text-sm text-right ${p.lowConfidence ? 'text-yellow-600' : 'text-green-600'}`}>
                              {(p.confidence * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Apply Section */}
          {preview && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">✅ Apply Predictions</h2>
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="include-low-confidence"
                    checked={includeLowConfidence}
                    onChange={(e) => setIncludeLowConfidence(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="include-low-confidence" className="text-sm text-gray-700">
                    Include low-confidence predictions ({preview.summary.lowConfidence} transactions)
                  </label>
                </div>
                <button
                  onClick={handleApply}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 font-semibold"
                >
                  {loading
                    ? 'Applying...'
                    : `Apply ${includeLowConfidence ? preview.summary.predictionsGenerated : preview.summary.highConfidence} Predictions`}
                </button>
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h2 className={`text-xl font-semibold mb-4 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.success ? '✅ Success' : '❌ Error'}
              </h2>
              <p className={result.success ? 'text-green-700' : 'text-red-700'}>{result.message}</p>
              {result.success && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Updated</p>
                    <p className="text-xl font-bold text-green-600">{result.updated}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Skipped</p>
                    <p className="text-xl font-bold">{result.skipped}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">High Confidence</p>
                    <p className="text-xl font-bold">{result.highConfidence}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Low Confidence</p>
                    <p className="text-xl font-bold text-yellow-600">{result.lowConfidence}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </AppLayout>
    </FlowProvider>
  );
}

