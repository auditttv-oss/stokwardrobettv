import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// --- KONFIGURASI AMAN ---
const CONTAINER_ID = "reader-custom-view";

const SCANNER_CONFIG = {
  fps: 15, // Standar stabil
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: undefined, // Biarkan otomatis agar tidak gepeng
  disableFlip: false,
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  formatsToSupport: [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
  ],
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Fitur Hardware
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const isFirstLoad = useRef(true);

  // --- 1. START SCANNER (Versi Stabil) ---
  const startScanner = useCallback(async (cameraIdOrConfig: string | MediaTrackConstraints) => {
    // Stop jika ada instance berjalan
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (err) {
        console.warn("Cleanup error", err);
      }
    }

    setIsLoading(true);
    setPermissionError(false);
    setErrorMessage('');
    
    // Reset container DOM
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // CONFIG VIDEO: Gunakan setting minimalis agar pasti nyala (Anti Black Screen)
      let videoConstraints: any = {};
      if (typeof cameraIdOrConfig === 'string') {
        videoConstraints.deviceId = { exact: cameraIdOrConfig };
      } else {
        videoConstraints.facingMode = "environment"; 
      }

      await html5QrCode.start(
        videoConstraints, 
        SCANNER_CONFIG,
        (decodedText) => {
          // Success Callback
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
          
          // Jeda sebentar agar tidak double scan
          html5QrCode.pause(true);
          setTimeout(() => html5QrCode.resume(), 1500);
        },
        (error) => {
          // Ignore frame errors
        }
      );

      // Jika sampai sini, berarti kamera nyala (tidak hitam)
      setIsScanning(true);
      setIsLoading(false);

      // BARU KITA OPTIMALKAN HARDWARE (Focus & Zoom)
      applyHardwareOptimizations();

      // Ambil list kamera untuk dropdown
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        Html5Qrcode.getCameras().then(setCameras).catch(console.warn);
      }

    } catch (err: any) {
      console.error("Critical Start Error:", err);
      setIsLoading(false);
      setIsScanning(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError(true);
      } else {
        // Tampilkan error teknis jika bukan masalah izin (misal: hardware in use)
        setErrorMessage(err.message || "Gagal membuka kamera.");
      }
    }
  }, [onScanSuccess]);

  // --- 2. OPTIMASI HARDWARE (Safe Mode) ---
  // Kita jalankan ini SETELAH kamera nyala. Jika gagal, kamera tetap nyala.
  const applyHardwareOptimizations = () => {
    setTimeout(async () => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      // CSS Fix agar full screen cover
      videoElement.style.objectFit = "cover";
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      // A. SETUP ZOOM
      if ('zoom' in capabilities) {
        const z = (capabilities as any).zoom;
        setZoomCap({ min: z.min, max: z.max, step: z.step || 0.1 });
        // Set zoom awal ke 1.5x (sedikit zoom) jika didukung, untuk menghindari lensa wide
        try {
            const initialZoom = Math.min(z.max, Math.max(z.min, 1.5));
            await track.applyConstraints({ advanced: [{ zoom: initialZoom } as any] });
            setZoom(initialZoom);
        } catch(e) { console.warn("Auto-zoom failed", e); }
      }

      // B. SETUP FOCUS (Android Fix)
      try {
         await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
      } catch (e) {
          // Jika gagal, biarkan default (jangan crash)
          console.log("Continuous focus not supported explicitly");
      }

      // C. SETUP FLASH
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        setHasFlash(true);
      }

    }, 500); // Tunggu 500ms agar hardware siap
  };

  // --- ACTIONS ---
  const handleZoom = async (val: number) => {
    setZoom(val);
    if (videoTrackRef.current) {
      try { await videoTrackRef.current.applyConstraints({ advanced: [{ zoom: val } as any] }); } catch (e) {}
    }
  };

  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const track = videoTrackRef.current;
      const target = !isFlashOn;
      await track.applyConstraints({ advanced: [{ torch: target } as any] });
      setIsFlashOn(target);
    } catch (e) {
        // Fallback older browsers
        try {
            await videoTrackRef.current?.applyConstraints({ advanced: [{ fillLightMode: !isFlashOn ? "flash" : "off" } as any] });
            setIsFlashOn(!isFlashOn);
        } catch(e2) {}
    }
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId);
  };

  const stopAndClose = async () => {
    if (scannerRef.current) {
      try {
        if(scannerRef.current.isScanning) await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) { console.error(e); }
    }
    onClose();
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    // Start default kamera belakang
    startScanner({ facingMode: "environment" });
    
    // Cleanup saat unmount
    return () => {
      if(scannerRef.current && scannerRef.current.isScanning) {
         scannerRef.current.stop().catch(console.error);
         scannerRef.current.clear();
      }
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black font-sans">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center z-20 border-b border-slate-700 shadow-xl shrink-0">
        <button onClick={stopAndClose} className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center active:scale-95 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <h3 className="text-white font-bold tracking-wide">SCANNER</h3>
        <button onClick={toggleFlash} disabled={!hasFlash} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${isFlashOn ? 'bg-yellow-400 text-black' : 'bg-slate-800 text-slate-400'} ${!hasFlash && 'opacity-0'}`}>
           <i className="fa-solid fa-bolt"></i>
        </button>
      </div>

      {/* Main Viewport */}
      <div className="relative flex-1 bg-black w-full overflow-hidden flex items-center justify-center">
         {/* Container Library */}
         <div id={CONTAINER_ID} className="w-full h-full bg-black"></div>

         {/* UI Overlay (Hanya muncul jika scanning aktif) */}
         {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                {/* Frame Kotak */}
                <div className="relative w-64 h-64 sm:w-80 sm:h-80 border-2 border-slate-500/30 rounded-lg">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 -ml-[2px] -mt-[2px] rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 -mr-[2px] -mt-[2px] rounded-tr-lg"></div>
