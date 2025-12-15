import React from 'react';
import { ScanFeedback } from '../types';

interface FeedbackDisplayProps {
  feedback: ScanFeedback;
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({ feedback }) => {
  const { status, message, item } = feedback;

  if (status === 'IDLE') {
    // Hidden di mobile agar tidak makan tempat saat belum scan
    return (
      <div className="hidden sm:flex h-32 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex-col items-center justify-center text-slate-400 mb-6">
        <i className="fa-solid fa-barcode text-2xl mb-2"></i>
        <p className="text-sm">Siap Scan</p>
      </div>
    );
  }

  let bgColor = 'bg-slate-600';
  let icon = 'fa-circle-question';

  if (status === 'FOUND') { bgColor = 'bg-emerald-600'; icon = 'fa-circle-check'; } 
  else if (status === 'NOT_FOUND') { bgColor = 'bg-rose-600'; icon = 'fa-circle-xmark'; } 
  else if (status === 'DUPLICATE') { bgColor = 'bg-amber-500'; icon = 'fa-triangle-exclamation'; }

  return (
    // Padding p-3 (kecil) di mobile, p-5 di desktop. min-h dikurangi.
    <div className={`${bgColor} w-full rounded-xl shadow-lg mb-4 p-3 sm:p-5 flex flex-col items-center justify-center text-white relative overflow-hidden animate-fade-in`}>
      <div className="flex items-center gap-2 mb-1 z-10">
        <i className={`fa-solid ${icon} text-xl sm:text-3xl`}></i>
        {/* Ukuran font responsif */}
        <h2 className="text-xl sm:text-3xl font-bold uppercase drop-shadow-md text-center leading-tight">{message}</h2>
      </div>
      
      {item && (
        <div className="text-center z-10 w-full mt-1">
          <p className="text-white text-sm sm:text-lg font-medium truncate px-1">{item.item_name}</p>
          <div className="flex flex-wrap gap-2 justify-center mt-2 text-[10px] sm:text-xs bg-black/20 py-1 px-2 rounded-full">
            <span>{item.brand}</span>
            <span className="opacity-50">|</span>
            <span className="font-mono font-bold">{item.barcode}</span>
          </div>
        </div>
      )}
    </div>
  );
};