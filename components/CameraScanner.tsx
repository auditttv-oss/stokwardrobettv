import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "reader-custom-view";

// Konfigurasi Scanner Standar
const SCANNER_CONFIG = {
  fps: 25, // FPS seimbang
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
  aspectRatio: 1.777778, // 16:9 aspect ratio membantu full screen
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
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  // --- LOGIKA UTAMA ---

  // 1. Start Scanner
  const startScanner = useCallback(async (cameraIdOrConfig: string | object) => {
    // Stop jika sedang jalan
    if (scannerRef.current?.isScanning) {
      await stopScanner();
    }

    setIsLoading(true);
    setPermissionError(false);
    setHasFlash(false);
    setZoomCap(null);

    // Cleanup container
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // KONFIGURASI KAMERA
      // Kunci perbaikan: Gunakan 'videoConstraints' di dalam config untuk resolusi,
      // tapi gunakan parameter pertama .start() untuk pemilihan kamera.
      
      const config = {
        ...SCANNER_CONFIG,
        videoConstraints: {
             // Resolusi tinggi memaksa iPhone pakai lensa utama (Autofocus)
             // Resolusi rendah sering melempar ke lensa wide (Fixed focus)
             width: { min: 720, ideal: 1280, max: 1920 },
             height: { min: 576, ideal: 720, max: 1080 },
             focusMode: "continuous", // Sinyal untuk Android
             facingMode: "environment" // Fallback constraint
        }
      };

      // Tentukan target kamera (ID spesifik atau Environment)
      const cameraIdConfig = typeof cameraIdOrConfig === 'string' 
        ? { deviceId: { exact: cameraIdOrConfig } }
        : { facingMode: "environment" }; // Default start: Back Camera

      await html5QrCode.start(
        cameraIdConfig, 
        config,
        (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount((prev) => prev + 1);
          onScanSuccess(decodedText);
          
          // Pause sebentar untuk UX
          html5QrCode.pause(true);
          setTimeout(() => html5QrCode.resume(), 1500);
        },
        (errorMessage) => {
          // Ignore scanning errors
        }
      );

      setIsScanning(true);
      setIsLoading(false);

      // Setup Capabilities (Zoom/Flash/Focus)
      // Delay penting agar hardware siap
      setTimeout(() => setupCameraCapabilities(), 500);

      // Fetch list kamera hanya sekali di awal
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
        // Fallback Retry (jika environment gagal, coba user facing)
        if (JSON.stringify(cameraIdOrConfig).includes("environment")) {
            console.warn("Environment camera failed, retrying generic...");
             // Coba restart tanpa constraint facingMode yang ketat
             // (Logic ini jarang terpanggil jika device normal)
        }
      }
    }
  }, [onScanSuccess]);

  // 2. Fetch List Kamera
  const fetchCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        
        // Coba sinkronkan dropdown dengan kamera yang aktif
        const currentTrack = videoTrackRef.current;
        if (currentTrack) {
           const activeDevice = devices.find(d => d.label === currentTrack.label);
           if (activeDevice) setSelectedCameraId(activeDevice.id);
        }
      }
    } catch (err) {
      console.warn("Gagal ambil list kamera", err);
    }
  };

  // 3. Setup Hardware Capabilities (Flash, Zoom, & Force Focus)
  const setupCameraCapabilities = async () => {
    const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
    if (!videoElement || !videoElement.srcObject) return;

    const stream = videoElement.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];
    videoTrackRef.current = track;

    // --- LOGIKA AUTOFOCUS ---
    // Kita paksa lagi constraint focus setelah track berjalan
    try {
        const constraints = { advanced: [{ focusMode: "continuous" }] } as any;
        await track.applyConstraints(constraints);
        console.log("Autofocus constraint applied successfully");
    } catch (e) {
        // iOS sering reject ini karena autofocus otomatis aktif pada lensa utama
        // Tidak apa-apa error di sini, karena kita sudah set resolusi tinggi sebelumnya
    }

    // --- CAPABILITIES (Zoom & Flash) ---
    const capabilities = track.getCapabilities ? track.getCapabilities() : {};
    const settings = track.getSettings ? track.getSettings() : {};

    // Cek Flash
    if ('torch' in capabilities || 'fillLightMode' in capabilities) {
      setHasFlash(true);
    }

    // Cek Zoom
    if ('zoom' in capabilities) {
      const zoomCapObj = (capabilities as any).zoom;
      setZoomCap({
        min: zoomCapObj.min,
        max: zoomCapObj.max,
        step: zoomCapObj.step || 0.1
      });
      // Set zoom saat ini
      const currentZoom = (settings as any).zoom || zoomCapObj.min;
      setZoom(currentZoom);
    }
  };

  // 4. Zoom Manual Handler
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

  // 5. Flash Handler
  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const track = videoTrackRef.current;
      const targetStatus = !isFlashOn;
      
      // Standard method
      await track.applyConstraints({
        advanced: [{ torch: targetStatus } as any]
      });
      setIsFlashOn(targetStatus);
    } catch (e) {
      // Fallback method
      try {
         await videoTrackRef.current?.applyConstraints({
            advanced: [{ fillLightMode: !isFlashOn ? "flash" : "off" } as any]
         });
         setIsFlashOn(!isFlashOn);
      } catch (e2) {}
    }
  };

  // 6. Stop & Restart Logic
  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
        try {
            await scannerRef.current.stop();
            scannerRef.current.clear();
        } catch (e) {}
    }
    setIsScanning(false);
    setIsFlashOn(false);
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId); // Restart dengan ID spesifik
  };

  // --- EFFECT ---
  useEffect(() => {
    // Mulai dengan mode 'environment' (belakang)
    startScanner({ facingMode: "environment" });

    return () => {
      stopScanner();
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 px-4 py-3 flex justify-between items-center z-20 shadow-lg border-b border-slate-700">
        <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-full bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition"
        >
          <i className="fa-solid fa-arrow-left"></i>
        </button>
        
        <div className="text-center">
            <h3 className="text-white font-bold text-sm">Scanner</h3>
            <span className="text-xs text-blue-400">
                {isScanning ? (isIOS ? 'iOS Optimized' : 'Auto Focus On') : 'Memulai...'}
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
        <div id={CONTAINER_ID} className="w-full h-full object-cover"></div>

        {/* Scan Frame Overlay */}
        {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="relative w-[280px] h-[280px] md:w-[350px] md:h-[350px]">
                    {/* Corners */}
                    <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-blue-500 rounded-tl-xl"></div>
                    <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-blue-500 rounded-tr-xl"></div>
                    <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-blue-500 rounded-bl-xl"></div>
                    <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-blue-500 rounded-br-xl"></div>
                    
                    {/* Scan Line */}
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-blue-400 shadow-[0_0_15px_#60a5fa] animate-scan-line"></div>
                </div>
            </div>
        )}

        {/* Loading Spinner */}
        {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-30">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-white text-sm">Menyiapkan Kamera...</p>
            </div>
        )}

        {/* Permission Error */}
        {permissionError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-6 z-40 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-camera-slash text-red-500 text-2xl"></i>
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Izin Kamera Diperlukan</h3>
                <p className="text-slate-400 text-sm mb-6">
                    {isIOS ? 'Buka Pengaturan iPhone > Safari > Kamera > Pilih "Izinkan".' : 'Mohon izinkan akses kamera di browser Anda.'}
                </p>
                <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg">
                    Muat Ulang
                </button>
            </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-4 border-t border-slate-700 pb-8 safe-area-bottom">
        
        {/* Zoom Control Slider */}
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
             {/* Camera Select Dropdown */}
             <div className="relative flex-1">
                <select 
                    value={selectedCameraId}
                    onChange={handleCameraChange}
                    disabled={cameras.length === 0}
                    className="w-full bg-slate-800 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 appearance-none focus:outline-none focus:border-blue-500"
                >
                    <option value="" disabled>
                        {cameras.length === 0 ? "Kamera..." : "Pilih Kamera"}
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

             {/* Scan Counter */}
             <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 flex items-center justify-center min-w-[80px]">
                <span className="text-blue-400 font-bold mr-2">{scanCount}</span>
                <i className="fa-solid fa-qrcode text-slate-500 text-xs"></i>
             </div>
        </div>
      </div>
    </div>
  );
};