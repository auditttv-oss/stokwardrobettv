import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Safety check for cleanup
    let isMounted = true;

    // Initialize scanner
    const scannerId = "reader";
    
    // Check if element exists before init
    if(!document.getElementById(scannerId)) return;

    try {
        const config = {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.UPC_A
            ]
        };

        const scanner = new Html5QrcodeScanner(scannerId, config, false);
        scannerRef.current = scanner;

        scanner.render(
            (decodedText) => {
                if (isMounted) {
                    // Play a beep sound logic could go here
                    onScanSuccess(decodedText);
                    // We don't clear immediately to allow rapid scanning, 
                    // but the parent might close this modal.
                }
            }, 
            (errorMessage) => {
                // Ignore scan errors, they happen when no code is in frame
            }
        );
    } catch (err) {
        console.error("Camera init failed", err);
        setError("Could not access camera. Please ensure permissions are granted.");
    }

    return () => {
        isMounted = false;
        if (scannerRef.current) {
            scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
        }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
            <h3 className="font-bold text-lg"><i className="fa-solid fa-camera mr-2"></i> Scan Barcode</h3>
            <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
                <i className="fa-solid fa-xmark text-2xl"></i>
            </button>
        </div>
        
        <div className="p-4 bg-black">
            {error ? (
                <div className="text-red-400 text-center p-8 border border-red-900 rounded bg-red-900/20">
                    {error}
                </div>
            ) : (
                <div id="reader" className="w-full h-auto bg-black rounded-lg overflow-hidden"></div>
            )}
        </div>

        <div className="p-4 bg-slate-50 text-center text-sm text-slate-500">
            Point camera at a barcode. Ensure good lighting.
        </div>
      </div>
    </div>
  );
};