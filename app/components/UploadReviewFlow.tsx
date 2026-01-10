'use client';

import { useState, useEffect } from 'react';
import FileUpload from './FileUpload';
import { UploadResult } from '@/lib/actions/upload-transactions-v2';

interface UploadReviewFlowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadReviewFlow({ isOpen, onClose }: UploadReviewFlowProps) {
  // Handle successful upload - close and refresh
  const handleUploadSuccess = (result: UploadResult) => {
    // Close after a short delay to show results
    setTimeout(() => {
      onClose();
      // Refresh the page to update analytics
      window.location.reload();
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <h2 className="text-2xl font-bold text-gray-900">Add Transactions</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="h-[calc(100vh-80px)] overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <FileUpload
            onUploadSuccess={handleUploadSuccess}
            showClearButton={false}
          />
        </div>
      </div>
    </div>
  );
}

