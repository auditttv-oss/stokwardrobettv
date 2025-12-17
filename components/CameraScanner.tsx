import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "reader-custom-view";

// Konfigurasi Standar Stabil
const SCANNER_CONFIG = {
  fps: 15,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  // PENTING: Jangan set aspectRatio agar menyesuaikan HP otomatis (Anti Gepeng)
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
  // State
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Hardware State
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const mountedRef = useRef(true);

  // --- FUNGSI STOP & CLEANUP ---
  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (e) {
        console.warn("Stop error:", e);
      }
    }
    setIsScanning(false);
  };

  // --- FUNGSI START ---
  const startScanner = useCallback(async (cameraIdOrConfig: string | MediaTrackConstraints) => {
    if (!mountedRef.current) return;

    // 1. Bersihkan dulu instance lama
    await stopScanner();

    setIsLoading(true);
    setErrorMessage('');
    
    // Pastikan DOM element ada
    const container = document.getElementById(CONTAINER_ID);
    if (!container) {
        setErrorMessage("Container kamera tidak ditemukan.");
        setIsLoading(false);
        return;
    }
    container.innerHTML = ''; // Reset isi container

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // 2. Config Video Minimalis (Agar pasti nyala)
      let videoConstraints: any = {};
      if (typeof cameraIdOrConfig === 'string') {
        videoConstraints.deviceId = { exact: cameraIdOrConfig };
      } else {
        videoConstraints.facingMode = "environment";
      }

      // 3. Mulai Kamera
      await html5QrCode.start(
        videoConstraints, 
        SCANNER_CONFIG,
        (decodedText) => {
          // Success Callback
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
          
          // Pause sebentar
          html5QrCode.pause(true);
          setTimeout(() => html5QrCode.resume(), 1500);
        },
        (error) => {
          // Ignore scanning failure (frame by frame)
        }
      );

      if (!mountedRef.current) {
          await stopScanner();
          return;
      }

      setIsScanning(true);
      setIsLoading(false);

      // 4. Setup Hardware Lanjutan (Zoom/Focus) setelah kamera nyala
      setupHardwareCapabilities();

      // Ambil list kamera untuk dropdown (hanya sekali)
      Html5Qrcode.getCameras().then((devices) => {
        if (mountedRef.current && devices && devices.length > 0) {
           setCameras(devices);
        }
      }).catch(err => console.warn("Cam list error", err));

    } catch (err: any) {
      console.error("Start Error:", err);
      if (mountedRef.current) {
        setIsLoading(false);
        setErrorMessage(err.message || "Gagal mengakses kamera.");
      }
    }
  }, [onScanSuccess]);

  // --- SETUP HARDWARE (Focus, Zoom, Flash) ---
  const setupHardwareCapabilities = () => {
    setTimeout(async () => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      // CSS Force Cover
      videoElement.style.objectFit = "cover";
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};

      // Cek Flash
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        setHasFlash(true);
      }

      // Cek Zoom
      if ('zoom' in capabilities) {
        const z = (capabilities as any).zoom;
        setZoomCap({ min: z.min, max: z.max, step: z.step || 0.1 });
        
        // Auto Zoom sedikit (1.5x) agar tidak terlalu wide (Fix iOS)
        try {
            const initialZoom = Math.min(z.max, Math.max(z.min, 1.5));
            await track.applyConstraints({ advanced: [{ zoom: initialZoom } as any] });
            setZoom(initialZoom);
        } catch (e) { console.warn("Zoom init failed", e); }
      }

      // Cek Focus (Fix Android Blur)
      try {
          // @ts-ignore
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { console.warn("Focus init failed", e); }

    }, 500);
  };

  // --- EVENT HANDLERS ---
  const handleZoomChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setZoom(val);
    if (videoTrackRef.current) {
      try { await videoTrackRef.current.applyConstraints({ advanced: [{ zoom: val } as any] }); } catch (e) {}
    }
  };

  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const target = !isFlashOn;
      await videoTrackRef.current.applyConstraints({ advanced: [{ torch: target } as any] });
      setIsFlashOn(target);
    } catch (e) {
      console.warn("Flash failed", e);
    }
  };

  const handleCameraSwitch = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId);
  };

  const handleClose = async () => {
      await stopScanner();
      onClose();
  };

  // --- LIFECYCLE ---
  useEffect(() => {
    mountedRef.current = true;
    
    // Inject CSS Animasi
    const styleId = 'scanner-anim-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          @keyframes scan-line { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
          .animate-scan-line { animation: scan-line 2s ease-in-out infinite; }
        `;
        document.head.appendChild(style);
    }

    // Start Scanner Default
    startScanner({ facingMode: "environment" });

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white font-sans">
      
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-20 shadow-md">
        <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 transition">
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
            <h3 className="font-bold text-sm tracking-wide">SCANNER PRO</h3>
            {isScanning && <span className="text-[10px] text-emerald-400">● Live Camera</span>}
        </div>
        <button onClick={toggleFlash} disabled={!hasFlash} className={`w-10 h-10 flex items-center justify-center rounded-full transition ${isFlashOn ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-400'} ${!hasFlash && 'opacity-0'}`}>
          <i className="fa-solid fa-bolt"></i>
        </button>
      </div>

      {/* VIEWPORT */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
         
         <div id={CONTAINER_ID} className="w-full h-full bg-black" />

         {/* OVERLAY */}
         {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
               <div className="relative w-64 h-64 sm:w-80 sm:h-80 border-2 border-white/20 rounded-xl overflow-hidden">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500"></div>
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500"></div>
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500"></div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500"></div>
                  <div className="absolute w-full h-0.5 bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-scan-line"></div>
               </div>
               <p className="mt-4 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs text-white/80">
                  Arahkan kamera ke barcode
               </p>
            </div>
         )}

         {/* LOADING */}
         {isLoading && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black">
                <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 text-sm">Membuka Kamera...</p>
            </div>
         )}

         {/* ERROR */}
         {errorMessage && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                <i className="fa-solid fa-triangle-exclamation text-4xl text-amber-500 mb-4"></i>
                <h3 className="font-bold mb-2">Terjadi Kesalahan</h3>
                <p className="text-slate-400 text-sm mb-6">{errorMessage}</p>
                <button onClick={() => window.location.reload()} className="bg-blue-600 px-6 py-2 rounded-lg font-bold">
                    Refresh Halaman
                </button>
            </div>
         )}
      </div>

      {/* FOOTER */}
      <div className="bg-slate-900 p-4 border-t border-slate-800 safe-area-bottom">
         {/* Zoom */}
         {zoomCap && (
            <div className="flex items-center gap-3 mb-4 px-2">
                <i className="fa-solid fa-minus text-xs text-slate-500"></i>
                <input 
                    type="range" 
                    min={zoomCap.min} max={zoomCap.max} step={zoomCap.step}
                    value={zoom} 
                    onChange={handleZoomChange}
                    className="flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <i className="fa-solid fa-plus text-xs text-slate-500"></i>
            </div>
         )}

         <div className="flex gap-3">
             <div className="relative flex-1">
                 <select 
                    value={selectedCameraId} 
                    onChange={handleCameraSwitch} 
                    disabled={cameras.length <= 1}
                    className="w-full bg-slate-800 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 outline-none focus:border-blue-500 disabled:opacity-50"
                 >
                    {cameras.length === 0 ? <option>Mendeteksi...</option> : 
                        cameras.map((c, i) => <option key={c.id} value={c.id}>{c.label || `Kamera ${i+1}`}</option>)
                    }
                 </select>
                 <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none"></i>
             </div>
             <div className="flex flex-col items-center justify-center w-16 bg-slate-800 border border-slate-700 rounded-xl">
                 <span className="text-blue-400 font-bold">{scanCount}</span>
                 <span className="text-[9px] text-slate-500 uppercase">SCANS</span>
             </div>
         </div>
      </div>
    </div>
  );
};
