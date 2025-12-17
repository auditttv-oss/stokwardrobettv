import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// --- KONFIGURASI SCANNER ---
const CONTAINER_ID = "reader-custom-view";

const SCANNER_CONFIG = {
  // FPS sedikit diturunkan agar algoritma AutoFocus punya waktu untuk bekerja per frame
  fps: 15, 
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  // Hapus aspectRatio statis, biarkan responsif mengikuti resolusi kamera
  // aspectRatio: 1.0, 
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

  const startScanner = useCallback(async (cameraIdOrConfig: string | MediaTrackConstraints) => {
    // 1. Bersihkan instance lama
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    setIsLoading(true);
    setPermissionError(false);
    setHasFlash(false);
    setZoomCap(null);

    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // --- CONFIG CONSTRAINT KAMERA (SOLUSI BLUR) ---
      // Kita susun object constraints manual agar bisa inject resolusi & focusMode
      let videoConstraints: any = {};

      if (typeof cameraIdOrConfig === 'string') {
        // Jika user memilih kamera spesifik dari dropdown
        videoConstraints.deviceId = { exact: cameraIdOrConfig };
      } else {
        // Default startup (biasanya environment/belakang)
        videoConstraints.facingMode = "environment";
      }

      // INI KUNCI FIX IOS & ANDROID BLUR:
      // 1. Resolution: Meminta resolusi HD/FHD memaksa iPhone memilih Lensa Utama (bukan Ultra Wide)
      // 2. FocusMode: Meminta browser Android untuk Continuous Auto Focus
      const finalConstraints = {
          ...videoConstraints,
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          focusMode: "continuous", // Android specific (non-standard standard)
          advanced: [{ focusMode: "continuous" }] // Alternative syntax
      };

      await html5QrCode.start(
        finalConstraints, 
        SCANNER_CONFIG,
        (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
          
           html5QrCode.pause(true);
           setTimeout(() => html5QrCode.resume(), 1500);
        },
        (errorMessage) => {
          // Ignore scanning errors usually
        }
      );

      setIsScanning(true);
      setIsLoading(false);

      setupCameraCapabilities();

      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        fetchCameras();
      }

    } catch (err: any) {
      console.error("Error starting scanner:", err);
      setIsLoading(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionError(true);
      } else {
         // Fallback: Jika resolusi tinggi gagal (kamera kentang), coba tanpa constraint resolusi
         if (typeof cameraIdOrConfig === 'object' && !isFirstLoad.current) {
             console.log("Retrying without strict constraints...");
             // Retry logic sederhana tanpa constraints berat bisa ditambahkan di sini jika perlu
         }
      }
    }
  }, [onScanSuccess]);

  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        const currentTrack = videoTrackRef.current;
        if (currentTrack) {
            const activeLabel = currentTrack.label;
            const activeDevice = devices.find(d => d.label === activeLabel);
            if (activeDevice) setSelectedCameraId(activeDevice.id);
        }
      }
    } catch (err) {
      console.warn("Gagal mengambil list kamera:", err);
    }
  };

  const setupCameraCapabilities = () => {
    setTimeout(() => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      // Fix CSS Video Element agar 'cover' area kontainer (menghindari gepeng)
      videoElement.style.objectFit = "cover"; 
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};

      // Flash Check
      if ('torch' in capabilities || 'fillLightMode' in capabilities) {
        setHasFlash(true);
      }

      // Zoom Check
      if ('zoom' in capabilities) {
        const zoomCapObj = (capabilities as any).zoom;
        setZoomCap({
          min: zoomCapObj.min,
          max: zoomCapObj.max,
          step: zoomCapObj.step || 0.1
        });
        const currentZoom = (settings as any).zoom || zoomCapObj.min;
        setZoom(currentZoom);
      }
    }, 1000);
  };

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

  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const track = videoTrackRef.current;
      const targetStatus = !isFlashOn;
      
      await track.applyConstraints({
        advanced: [{ torch: targetStatus } as any]
      });
      setIsFlashOn(targetStatus);
    } catch (e) {
      try {
         await videoTrackRef.current?.applyConstraints({
            advanced: [{ fillLightMode: !isFlashOn ? "flash" : "off" } as any]
         });
         setIsFlashOn(!isFlashOn);
      } catch (e2) {
          console.error("Flash error", e2);
      }
    }
  };

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

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId); 
  };

  useEffect(() => {
    startScanner({ facingMode: "environment" });
    return () => { stopScanner(); };
    // eslint-disable-next-line
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Top Bar */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center z-20 shadow-lg border-b border-slate-700">
        <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <div className="text-center">
            <h3 className="text-white font-bold text-sm">Scanner Pro</h3>
            <span className="text-xs text-slate-400">
                {isScanning ? 'Auto Focus Active' : 'Starting...'}
            </span>
        </div>

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

      {/* Viewport */}
      <div className="relative flex-1 bg-black overflow-hidden flex items-center justify-center">
        <div id={CONTAINER_ID} className="w-full h-full"></div>

        {/* Overlay */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[280px] h-[280px] md:w-[350px] md:h-[350px] border-2 border-transparent">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400 shadow-[0_0_10px_#60a5fa] animate-scan-line"></div>
                </div>
                
                {/* Petunjuk Fokus Manual jika masih blur */}
                <div className="absolute bottom-10 bg-black/50 text-white text-xs px-3 py-1 rounded-full backdrop-blur-sm">
                   Jaga jarak 15-20cm untuk fokus
                </div>
            </div>
        )}

        {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white text-sm">Menyiapkan Kamera HD...</p>
            </div>
        )}

        {permissionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 z-40 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-camera-slash text-red-500 text-2xl"></i>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Izin Kamera Ditolak</h3>
                <button 
                    onClick={() => window.location.reload()}
                    className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-medium transition"
                >
                    Refresh Halaman
                </button>
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-4 border-t border-slate-700 pb-8 safe-area-bottom">
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

        <div className="flex gap-3">
             <div className="relative flex-1">
                <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-slate-800 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 appearance-none focus:outline-none focus:border-blue-500"
                >
                    <option value="" disabled>
                        {cameras.length === 0 ? "Detecting cameras..." : "Pilih Kamera"}
                    </option>
                    {cameras.map((cam, idx) => (
                        <option key={cam.id} value={cam.id}>
                            {cam.label || `Camera ${idx + 1}`}
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
