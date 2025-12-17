import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// --- KONFIGURASI ---
const CONTAINER_ID = "reader-custom-view";

const SCANNER_CONFIG = {
  fps: 20, // Turunkan sedikit agar iOS lebih stabil & tidak panas
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    // Membuat area scan responsif (kotak di tengah)
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: 1.0,
  disableFlip: false,
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.PDF_417,
  ],
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Fitur Kamera
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isFirstLoad = useRef(true);

  // --- LOGIKA UTAMA ---

  // 1. Start Scanner (Diperbaiki untuk Loading Cepat)
  const startScanner = useCallback(async (cameraIdOrConfig: string | MediaTrackConstraints) => {
    // Bersihkan instance lama jika ada
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    // Reset UI state
    setIsLoading(true);
    setPermissionError(false);
    setHasFlash(false);
    setZoomCap(null);

    // Pastikan container bersih
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // Konfigurasi Start
      // Jika string -> gunakan deviceId (user memilih dari dropdown)
      // Jika object -> gunakan facingMode (inisialisasi awal)
      const cameraConfig = typeof cameraIdOrConfig === 'string' 
        ? { deviceId: { exact: cameraIdOrConfig } }
        : cameraIdOrConfig;

      await html5QrCode.start(
        cameraConfig,
        SCANNER_CONFIG,
        (decodedText) => {
          // Success Callback
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
          
          // Optional: Pause sebentar agar tidak spam scan
           html5QrCode.pause(true);
           setTimeout(() => html5QrCode.resume(), 1500);
        },
        (errorMessage) => {
          // Ignore scanning errors usually
        }
      );

      setIsScanning(true);
      setIsLoading(false);

      // Setelah kamera jalan, ambil Capabilities (Zoom/Flash)
      setupCameraCapabilities();

      // Jika ini load pertama, ambil daftar kamera di background
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        fetchCameras();
      }

    } catch (err: any) {
      console.error("Error starting scanner:", err);
      setIsLoading(false);
      // Tangani error izin
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError(true);
      } else {
        // Retry logic sederhana atau fallback
        if (typeof cameraIdOrConfig === 'object' && (cameraIdOrConfig as any).facingMode === 'environment') {
            // Jika gagal buka kamera belakang, coba user facing sebagai fallback terakhir
            startScanner({ facingMode: "user" });
        }
      }
    }
  }, [onScanSuccess]);

  // 2. Ambil Daftar Kamera (Dilakukan setelah scanner jalan agar cepat)
  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Coba cari kamera yang sedang aktif untuk set selected value
        const currentTrack = videoTrackRef.current;
        if (currentTrack) {
            const activeLabel = currentTrack.label;
            const activeDevice = devices.find(d => d.label === activeLabel);
            if (activeDevice) setSelectedCameraId(activeDevice.id);
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil list kamera (mungkin izin belum full):", err);
    }
  };

  // 3. Setup Capabilities (Flash & Zoom)
  const setupCameraCapabilities = () => {
    setTimeout(() => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      // Cek Capabilities
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};

      // --- SETUP FLASH ---
      // iOS modern menggunakan 'torch', browser lama 'fillLightMode'
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        setHasFlash(true);
      }

      // --- SETUP ZOOM ---
      if ('zoom' in capabilities) {
        const zoomCapObj = (capabilities as any).zoom;
        setZoomCap({
          min: zoomCapObj.min,
          max: zoomCapObj.max,
          step: zoomCapObj.step || 0.1
        });
        
        // Set initial zoom value
        const currentZoom = (settings as any).zoom || zoomCapObj.min;
        setZoom(currentZoom);
      }
    }, 1000); // Beri jeda agar hardware siap
  };

  // 4. Handle Zoom Change
  const handleZoom = async (val: number) => {
    setZoom(val);
    if (videoTrackRef.current) {
      try {
        await videoTrackRef.current.applyConstraints({
          advanced: [{ zoom: val } as any]
        });
      } catch (e) {
        console.error("Gagal zoom:", e);
      }
    }
  };

  // 5. Handle Flash Toggle
  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const track = videoTrackRef.current;
      const targetStatus = !isFlashOn;
      
      // Coba standar modern (Torch)
      await track.applyConstraints({
        advanced: [{ torch: targetStatus } as any]
      });
      setIsFlashOn(targetStatus);
    } catch (e) {
      // Fallback untuk device lama/tertentu
      console.warn("Torch standard gagal, mencoba metode alternatif...");
      try {
         await videoTrackRef.current?.applyConstraints({
            advanced: [{ fillLightMode: !isFlashOn ? "flash" : "off" } as any]
         });
         setIsFlashOn(!isFlashOn);
      } catch (e2) {
          console.error("Flash tidak didukung hardware/browser ini", e2);
      }
    }
  };

  // 6. Stop Scanner
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
        try {
            await scannerRef.current.stop();
            scannerRef.current.clear();
        } catch (e) {
            console.error("Stop error", e);
        }
    }
    setIsScanning(false);
    setIsFlashOn(false);
  };

  // 7. Ganti Kamera via Dropdown
  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId); // Restart dengan ID spesifik
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    // Saat mount, langsung start dengan mode environment (belakang)
    // Ini memperbaiki masalah "Loading lama" dan "Hanya kamera depan di iOS"
    // karena kita memaksa request 'environment' di awal.
    startScanner({ facingMode: "environment" });

    return () => {
      // Cleanup saat unmount
      stopScanner();
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header / Top Bar */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center z-20 shadow-lg border-b border-slate-700">
        <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <div className="text-center">
            <h3 className="text-white font-bold text-sm">QR Code Scanner</h3>
            <span className="text-xs text-slate-400">
                {isScanning ? 'Kamera Aktif' : 'Memuat...'}
            </span>
        </div>

        {/* Flash Toggle Button */}
        <button 
            onClick={toggleFlash}
            disabled={!hasFlash || !isScanning}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                !hasFlash ? 'opacity-0 pointer-events-none' : 
                isFlashOn ? 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.5)]' : 'bg-slate-800 text-white'
            }`}
        >
            <i className={`fa-solid ${isFlashOn ? 'fa-bolt' : 'fa-bolt-lightning'}`}></i>
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        {/* Scanner Container (Library renders here) */}
        <div id={CONTAINER_ID} className="w-full h-full object-cover"></div>

        {/* Overlay Custom UI */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {/* Border Scan Area */}
                <div className="relative w-[280px] h-[280px] md:w-[350px] md:h-[350px] border-2 border-transparent">
                    {/* Sudut-sudut */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                    
                    {/* Scan Line Animation */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-scan-line"></div>
                </div>
            </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white text-sm">Menyiapkan Kamera...</p>
            </div>
        )}

        {/* Permission Error Message */}
        {permissionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 z-40 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-camera-slash text-red-500 text-2xl"></i>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Akses Kamera Ditolak</h3>
                <p className="text-slate-400 text-sm mb-6 max-w-xs">
                    Browser memblokir akses kamera. 
                    {isIOS ? ' Pada iPhone, silakan buka Pengaturan > Safari > Kamera > Izinkan.' : ' Silakan izinkan akses kamera pada address bar browser.'}
                </p>
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium transition"
                >
                    Coba Lagi / Refresh
                </button>
            </div>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="bg-slate-900 p-4 border-t border-slate-700 pb-8 safe-area-bottom">
        
        {/* Zoom Control (Only show if supported) */}
        {zoomCap && (
            <div className="mb-4 flex items-center gap-3 px-2">
                <i className="fa-solid fa-minus text-slate-400 text-xs"></i>
                <input 
                    type="range" 
                    min={zoomCap.min} 
                    max={zoomCap.max} 
                    step={zoomCap.step}
                    value={zoom}
                    onChange={(e) => handleZoom(parseFloat(e.target.value))}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                />
                <i className="fa-solid fa-plus text-slate-400 text-xs"></i>
            </div>
        )}

        {/* Camera Selector & Count */}
        <div className="flex gap-3">
             <div className="relative flex-1">
                <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-slate-800 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 appearance-none focus:outline-none focus:border-blue-500"
                >
                    <option value="" disabled>
                        {cameras.length === 0 ? "Mencari kamera..." : "Pilih Kamera"}
                    </option>
                    {cameras.map((cam, idx) => (
                        <option key={cam.id} value={cam.id}>
                            {cam.label || `Kamera ${idx + 1}`}
                        </option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <i className="fa-solid fa-chevron-down text-xs"></i>
                </div>
             </div>

             <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 flex items-center justify-center min-w-[80px]">
                <span className="text-blue-400 font-bold mr-2">{scanCount}</span>
                <i className="fa-solid fa-qrcode text-slate-500 text-xs"></i>
             </div>
        </div>
      </div>
    </div>
  );
};

// Tambahkan style untuk animasi baris scan
const style = document.createElement('style');
style.textContent = `
  @keyframes scan-line {
    0% { top: 0; opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { top: 100%; opacity: 0; }
  }
  .animate-scan-line {
    animation: scan-line 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
`;
document.head.appendChild(style);