import React, { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [errorMsg, setErrorMsg] = useState<string>('');
  const lastScanRef = useRef<number>(0);
  // Ref untuk mencegah inisialisasi ganda
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Pastikan elemen ada sebelum init
    if(!document.getElementById("reader")) return;

    // Bersihkan instance lama jika ada (Preventif)
    if (scannerRef.current) {
        try { scannerRef.current.clear(); } catch(e) {}
    }

    const scannerId = "reader";
    
    // Deteksi OS (iOS butuh perlakuan khusus agar tidak lag)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    const config = {
        // FPS Tinggi agar responsif
        fps: 30, 
        
        // KEMBALI KE KOTAK BESAR (Sesuai Request)
        qrbox: { width: 280, height: 250 }, 
        
        aspectRatio: 1.0,
        
        // Fokus format barcode batang (1D) dan QR
        formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.UPC_A
        ],
        
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        
        // KONFIGURASI KAMERA PINTAR
        videoConstraints: isIOS ? {
            // iOS: Biarkan Native (Jangan dipaksa resolusi spesifik biar ga berat)
            facingMode: "environment",
            focusMode: "continuous" 
        } : {
            // Android: Paksa HD 720p agar tajam dan fokus jalan
            facingMode: "environment",
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
            focusMode: "continuous"
        },
        
        // Matikan rememberLastUsedCamera sementara jika bikin dropdown error
        // Kita set false agar user Android selalu bisa pilih kamera di awal
        rememberLastUsedCamera: false 
    };

    // False = verbose (log) dimatikan agar ringan
    const scanner = new Html5QrcodeScanner(scannerId, config, false);
    scannerRef.current = scanner;

    const onScanSuccessCallback = (decodedText: string) => {
        const now = Date.now();
        // Debounce 1.5 detik
        if (now - lastScanRef.current > 1500) {
            lastScanRef.current = now;
            try { window.navigator.vibrate(200); } catch(e) {} 
            onScanSuccess(decodedText);
        }
    };

    try {
        scanner.render(onScanSuccessCallback, () => {});
    } catch (err) {
        console.error("Camera Error:", err);
        setErrorMsg("Gagal akses kamera.");
    }

    return () => {
        if (scannerRef.current) {
            try { scannerRef.current.clear(); } catch(e) {}
        }
    };
  }, []); // Dependency kosong [] = Mount sekali saja (PENTING AGAR SETTING TIDAK HILANG)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0 sm:p-4 animate-fade-in">
      
      {/* CSS INJECTION: Styling Stabil */}
      <style>{`
        /* Dropdown Kamera Stabil */
        #html5-qrcode-select-camera {
            background: #ffffff !important;
            color: #000000 !important;
            border: 2px solid #3b82f6 !important;
            padding: 12px !important;
            border-radius: 8px !important;
            width: 100% !important;
            font-size: 16px !important;
            margin-bottom: 15px !important;
            font-weight: bold !important;
            display: block !important;
            appearance: none; /* Hilangkan style bawaan browser */
        }

        /* Label Select Camera Jelas */
        #reader__dashboard_section_csr span, 
        #reader__dashboard_section_csr label {
            color: #ffffff !important;
            font-size: 16px !important;
            font-weight: bold !important;
            margin-bottom: 8px !important;
            display: block !important;
        }

        /* Tombol Izin (Biru Besar) */
        #html5-qrcode-button-camera-permission {
            background-color: #2563eb !important;
            color: white !important;
            padding: 14px 24px !important;
            border-radius: 8px !important;
            font-size: 16px !important;
            font-weight: bold !important;
            border: none !important;
            margin-top: 20px !important;
            width: 100%;
        }

        /* Tombol Stop (Merah) & Start (Hijau) */
        #html5-qrcode-button-camera-stop {
            background-color: #ef4444 !important;
            color: white !important;
            padding: 10px 20px !important;
            border-radius: 6px !important;
            border: none !important;
            font-weight: bold !important;
            margin-top: 10px !important;
            width: 100%;
        }
        #html5-qrcode-button-camera-start {
            background-color: #22c55e !important;
            color: white !important;
            padding: 10px 20px !important;
            border-radius: 6px !important;
            border: none !important;
            font-weight: bold !important;
            margin-top: 10px !important;
            width: 100%;
        }

        /* Scan Region Border */
        #reader { border: none !important; }
        #reader__scan_region {
            background: transparent !important;
            box-shadow: 0 0 0 1000px rgba(0,0,0,0.6) !important;
        }

        /* Laser Line Animasi (Opsional: Merah) */
        #reader__scan_region::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 5%;
            width: 90%;
            height: 2px;
            background: red;
            box-shadow: 0 0 4px red;
            z-index: 10;
        }

        /* Sembunyikan elemen sampah */
        #html5-qrcode-anchor-scan-type-change { display: none !important; }
        img[alt="Info icon"] { display: none !important; }
      `}</style>

      <div className="bg-slate-900 rounded-xl w-full max-w-md overflow-hidden shadow-2xl relative flex flex-col h-[90vh] sm:h-auto border border-slate-700">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 text-white flex justify-between items-center shrink-0 border-b border-slate-700">
            <h3 className="font-bold text-lg flex items-center text-blue-400">
                <i className="fa-solid fa-expand mr-2"></i> Scan Barcode
            </h3>
            <button 
                onClick={onClose} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300"
            >
                <i className="fa-solid fa-xmark text-xl"></i>
            </button>
        </div>
        
        {/* Main Camera Area */}
        <div className="flex-1 bg-black relative flex flex-col justify-center overflow-hidden">
            {errorMsg ? (
                <div className="text-red-400 text-center p-8">
                    <i className="fa-solid fa-video-slash text-4xl mb-4"></i>
                    <p>{errorMsg}</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 rounded text-white text-sm">Tutup</button>
                </div>
            ) : (
                <div id="reader" className="w-full h-full bg-black"></div>
            )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-800 text-center shrink-0 border-t border-slate-700">
            <p className="text-xs text-slate-400">
                <i className="fa-solid fa-lightbulb text-yellow-500 mr-1"></i>
                Tips: Pastikan cahaya terang & barcode bersih.
            </p>
        </div>
      </div>
    </div>
  );
};