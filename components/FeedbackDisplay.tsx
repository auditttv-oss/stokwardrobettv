import React from 'react';
import { ScanFeedback } from '../types';

interface FeedbackDisplayProps {
  feedback: ScanFeedback;
}

export const FeedbackDisplay: React.FC<FeedbackDisplayProps> = ({ feedback }) => {
  const { status, message, item } = feedback;

  if (status === 'IDLE') {
    return (
      <div className="h-48 rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 mb-6">
        <i className="fa-solid fa-barcode text-4xl mb-3"></i>
        <p className="font-medium">Ready to Scan</p>
      </div>
    );
  }

  let bgColor = 'bg-slate-600';
  let icon = 'fa-circle-question';
  let titleText = message;

  if (status === 'FOUND') {
      bgColor = 'bg-emerald-600';
      icon = 'fa-circle-check';
  } else if (status === 'NOT_FOUND') {
      bgColor = 'bg-rose-600';
      icon = 'fa-circle-xmark';
  } else if (status === 'DUPLICATE') {
      bgColor = 'bg-amber-500'; // Yellow/Orange for warning
      icon = 'fa-triangle-exclamation';
      titleText = "SUDAH DI SO";
  }

  return (
    <div className={`${bgColor} h-48 rounded-xl shadow-lg mb-6 flex flex-col items-center justify-center text-white transition-all duration-300 animate-fade-in relative overflow-hidden`}>
      {/* Background pattern for visual interest */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white to-transparent pointer-events-none"></div>
      
      <div className="flex items-center gap-3 mb-2 z-10">
        <i className={`fa-solid ${icon} text-3xl`}></i>
        <h2 className="text-4xl font-extrabold tracking-tight uppercase drop-shadow-md">
          {titleText}
        </h2>
      </div>
      
      {item ? (
        <div className="text-center mt-2 px-4 z-10">
          <p className="text-white text-lg font-medium drop-shadow-sm">{item.itemName}</p>
          <div className="flex gap-3 justify-center mt-2 text-sm bg-black/20 py-1 px-3 rounded-full backdrop-blur-sm">
            <span>{item.brand}</span>
            <span className="opacity-50">|</span>
            <span>{item.color}</span>
            <span className="opacity-50">|</span>
            <span className="font-mono font-bold">{item.barcode}</span>
          </div>
          {status === 'DUPLICATE' && (
             <p className="mt-2 text-xs font-bold text-amber-900 bg-amber-200 inline-block px-2 py-1 rounded">
                Scanned previously
             </p>
          )}
        </div>
      ) : (
         <div className="text-center mt-2 px-4 z-10">
            <p className="text-white/90 font-medium">Item not found in master data.</p>
         </div>
      )}
    </div>
  );
};