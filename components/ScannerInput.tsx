import React, { useEffect, useRef, useState } from 'react';

interface ScannerInputProps {
  onScan: (barcode: string) => void;
  lastResult: string;
  isProcessing: boolean;
}

export const ScannerInput: React.FC<ScannerInputProps> = ({ onScan, lastResult, isProcessing }) => {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus otomatis saat idle, tapi hati-hati di mobile agar keyboard tidak popup terus
    // Kita hanya auto-focus jika bukan device sentuh, atau saat pertama load
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (!isTouch && inputRef.current) {
        inputRef.current.focus();
    }
  }, [lastResult]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (inputValue.trim()) {
        onScan(inputValue.trim());
        setInputValue('');
      }
    }
  };

  const getBorderColor = () => {
    if (isProcessing) return 'border-slate-300 bg-slate-100';
    if (lastResult === 'FOUND') return 'border-emerald-500 ring-emerald-200';
    if (lastResult === 'NOT_FOUND') return 'border-rose-500 ring-rose-200';
    if (lastResult === 'DUPLICATE') return 'border-amber-500 ring-amber-200';
    return 'border-blue-500 ring-blue-200';
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-slate-600 mb-1">
        <i className="fa-solid fa-barcode mr-2"></i>
        Barcode Input
      </label>
      <input
        ref={inputRef}
        type="text"
        inputMode="text" 
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isProcessing}
        // text-base prevents auto-zoom on iOS
        className={`w-full text-base sm:text-2xl font-mono p-4 rounded-lg border-2 outline-none focus:ring-4 transition-all shadow-sm ${getBorderColor()}`}
        placeholder={isProcessing ? "Saving..." : "Scan barcode..."}
        autoComplete="off"
      />
    </div>
  );
};