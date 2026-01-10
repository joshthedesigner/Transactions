'use client';

import { useState, useRef } from 'react';
import { uploadTransactionsV2, UploadResult as V2UploadResult } from '@/lib/actions/upload-transactions-v2';
import { clearAllTransactions } from '@/lib/actions/clear-transactions';

interface FileUploadProps {
  onUploadSuccess?: (result: V2UploadResult) => void;
  showClearButton?: boolean;
}

export default function FileUpload({ onUploadSuccess, showClearButton = true }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<V2UploadResult | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const uploadResult = await uploadTransactionsV2(formData);
      setResult(uploadResult);

      if (uploadResult.success && uploadResult.totalTransactions > 0) {
        setFiles([]);
        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        
        // Call success callback if provided
        if (onUploadSuccess) {
          onUploadSuccess(uploadResult);
        }
      }
    } catch (error) {
      console.error('Upload error:', error);
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        totalTransactions: 0,
        totalSpending: 0,
        fileResults: [],
      });
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleClearTransactions = async () => {
    if (!confirm('Are you sure you want to delete ALL transactions? This cannot be undone.')) {
      return;
    }

    setClearing(true);
    setClearResult(null);

    try {
      const clearResult = await clearAllTransactions();
      setClearResult(clearResult.message);
      
      if (clearResult.success) {
        // Refresh the page after a short delay to show updated state
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error) {
      setClearResult(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Upload Transactions</h2>
      
      <div className="space-y-4">
        <div>
          <label htmlFor="file-input" className="block text-sm font-medium text-gray-700 mb-2">
            Select CSV or Excel file
          </label>
          <input
            id="file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-1 text-sm text-gray-500">
            Supports CSV files and Excel files (.xlsx, .xls) with multiple sheets. You can select multiple files at once.
          </p>
        </div>

        {files.length > 0 && (
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Selected {files.length} file(s):
            </p>
            <ul className="space-y-1">
              {files.map((file, index) => (
                <li key={index} className="text-sm text-gray-700">
                  • <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
                </li>
              ))}
            </ul>
          </div>
        )}

        {uploading && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-blue-800">
              Processing {files.length} file(s)... Please wait.
            </p>
          </div>
        )}

        <div className="flex space-x-4">
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          >
            {uploading 
              ? `Uploading ${files.length} file(s)...` 
              : `Upload ${files.length > 0 ? `${files.length} file(s)` : 'Files'}`
            }
          </button>
          
          {showClearButton && !uploading && (
            <button
              onClick={handleClearTransactions}
              disabled={clearing}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete all transactions (for testing)"
            >
              {clearing ? 'Clearing...' : 'Clear All'}
            </button>
          )}
        </div>

        {result && (
          <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h3 className={`text-xl font-semibold mb-4 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? '✅ Upload Successful' : '❌ Upload Failed'}
            </h3>
            
            <p className={`text-lg mb-4 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
              {result.message}
            </p>

            {/* Summary Stats */}
            {result.success && (
              <div className="bg-white rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-3">Summary</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Transactions</p>
                    <p className="text-xl font-bold">{result.totalTransactions}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Spending</p>
                    <p className="text-xl font-bold">{formatCurrency(result.totalSpending)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Files Processed</p>
                    <p className="text-xl font-bold">{result.fileResults.length}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Results by File */}
            {result.fileResults.length > 0 && (
              <div className="bg-white rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-3">Results by File</h4>
                <div className="space-y-3">
                  {result.fileResults.map((fileResult, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded border-2 ${
                        fileResult.success
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold">{fileResult.filename}</p>
                          <p className={`text-sm ${fileResult.success ? 'text-green-700' : 'text-red-700'}`}>
                            {fileResult.message}
                          </p>
                        </div>
                        {fileResult.success && (
                          <div className="text-right">
                            <p className="text-sm text-gray-600">{fileResult.transactionCount} transactions</p>
                            <p className="font-semibold">{formatCurrency(fileResult.totalSpending)}</p>
                          </div>
                        )}
                      </div>
                      {fileResult.errors && fileResult.errors.length > 0 && (
                        <div className="mt-2 text-xs text-yellow-700">
                          {fileResult.errors.slice(0, 2).map((e, i) => (
                            <p key={i}>⚠️ {e}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {clearResult && (
          <div
            className={`p-4 rounded-md ${
              clearResult.includes('Successfully')
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}
          >
            <p
              className={`font-medium ${
                clearResult.includes('Successfully') ? 'text-green-800' : 'text-red-800'
              }`}
            >
              {clearResult}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

