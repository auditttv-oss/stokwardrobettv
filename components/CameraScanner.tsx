import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "reader-custom-view";

const SCANNER_CONFIG = {
  fps: 15,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
    return {
      width: Math.floor(minEdge * 0.7),
      height: Math.floor(minEdge * 0.7),
    };
  },
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
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Memuat kamera...');
  
  // Hardware State
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const mountedRef = useRef(true);

  // --- LOGIKA UTAMA (FIX IPHONE & ANDROID) ---

  // 1. Helper: Cari Kamera Belakang Terbaik (Non-Ultra Wide)
  const getBestBackCamera = (devices: CameraDevice[]): string | null => {
    if (!devices || devices.length === 0) return null;

    // Filter yang mengandung kata 'back', 'belakang', atau 'environment'
    const backCameras = devices.filter(d => 
      d.label.toLowerCase().includes('back') || 
      d.label.toLowerCase().includes('belakang') ||
      d.label.toLowerCase().includes('environment')
    );

    if (backCameras.length > 0) {
      // Cari yang BUKAN Ultra Wide (0.5x)
      const mainCamera = backCameras.find(d => 
        !d.label.toLowerCase().includes('ultra') && 
        !d.label.toLowerCase().includes('0.5') &&
        !d.label.toLowerCase().includes('wide')
      );
      return mainCamera ? mainCamera.id : backCameras[0].id;
    }

    // Fallback: Ambil kamera terakhir di list (biasanya belakang pada Android)
    return devices[devices.length - 1].id;
  };

  // 2. Start Scanner Logic
  const startScanner = useCallback(async (preferredCameraId?: string) => {
    // Bersihkan sesi sebelumnya jika ada
    if (scannerRef.current?.isScanning) {
      await stopScannerInternal();
    }

    setIsLoading(true);
    setStatusMsg('Membuka kamera...');

    // Reset DOM
    const container = document.getElementById(CONTAINER_ID);
    if(container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // Ambil List Kamera
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);

      // Tentukan ID Kamera
      let cameraIdToUse = preferredCameraId;
      if (!cameraIdToUse && devices.length > 0) {
        cameraIdToUse = getBestBackCamera(devices) || devices[0].id;
      }

      if (cameraIdToUse) setSelectedCameraId(cameraIdToUse);

      // Config Constraints
      // Kita pakai deviceId exact agar tidak salah pilih lensa
      const config = cameraIdToUse 
        ? { deviceId: { exact: cameraIdToUse } } 
        : { facingMode: "environment" };

      // Mulai Stream
      await html5QrCode.start(
        config,
        SCANNER_CONFIG,
        (decodedText) => {
          // Success Callback
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount(prev => prev + 1);
          onScanSuccess(decodedText);
          
          // Pause sebentar agar tidak spam
          html5QrCode.pause(true);
          setTimeout(() => html5QrCode.resume(), 1500);
        },
        () => {} // Ignore failure errors
      );

      setIsScanning(true);
      setIsLoading(false);

      // JALANKAN FIX HARDWARE (ZOOM & FOCUS)
      applyHardwareFixes();

    } catch (err: any) {
      console.error("Start Error:", err);
      setStatusMsg("Gagal akses kamera: " + (err.message || "Unknown error"));
      setIsLoading(false);
    }
  }, [onScanSuccess]);

  // 3. Stop Scanner Logic
  const stopScannerInternal = async () => {
    if (scannerRef.current) {
        try {
            if(scannerRef.current.isScanning) await scannerRef.current.stop();
            scannerRef.current.clear();
        } catch (e) { console.warn(e); }
    }
    setIsScanning(false);
  };

  // 4. THE MAGIC FIX: Auto Zoom & Focus (S21/iPhone Fix)
  // Fungsi ini dipanggil SETELAH kamera berhasil nyala
  const applyHardwareFixes = () => {
    setTimeout(async () => {
      const videoElement = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!videoElement || !videoElement.srcObject) return;

      // CSS agar full screen
      videoElement.style.objectFit = "cover";
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";

      const stream = videoElement.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;

      const caps = track.getCapabilities ? track.getCapabilities() : {};

      // A. Cek Flash
      if ('torch' in caps || 'fillLightMode' in caps) {
        setHasFlash(true);
      }

      // B. Setup Zoom (PENTING UNTUK FOKUS)
      if ('zoom' in caps) {
        const z = (caps as any).zoom;
        setZoomCap({ min: z.min, max: z.max });

        // Auto Zoom ke 1.7x - 2.0x
        // Ini memaksa user mundur (jarak 20cm), sehingga lensa S21/iPhone bisa fokus
        let targetZoom = 1.7; 
        if (targetZoom < z.min) targetZoom = z.min;
        if (targetZoom > z.max) targetZoom = z.max;

        try {
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
            setZoom(targetZoom);
            console.log("Auto-zoom applied:", targetZoom);
        } catch (e) { 
            console.warn("Zoom fail", e); 
        }
      }

      // C. Setup Focus (Fix Android Blur)
      try {
        // @ts-ignore
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { 
        console.warn("Focus continuous not supported"); 
      }

    }, 500); // Tunggu 500ms agar stream stabil
  };

  // --- UI HANDLERS ---
  const handleZoom = async (val: number) => {
    setZoom(val);
    if (videoTrackRef.current) {
      try { await videoTrackRef.current.applyConstraints({ advanced: [{ zoom: val } as any] }); } catch(e){}
    }
  };

  const toggleFlash = async () => {
    if (!videoTrackRef.current) return;
    try {
      const target = !isFlashOn;
      await videoTrackRef.current.applyConstraints({ advanced: [{ torch: target } as any] });
      setIsFlashOn(target);
    } catch (e) {}
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    startScanner(newId);
  };

  const handleClose = async () => {
    await stopScannerInternal();
    onClose();
  };

  // Lifecycle
  useEffect(() => {
    mountedRef.current = true;
    startScanner();
    
    // Inject Laser CSS
    if (!document.getElementById('laser-css')) {
        const style = document.createElement('style');
        style.id = 'laser-css';
        style.textContent = `@keyframes laser-move { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } } .laser-beam { animation: laser-move 2s infinite ease-in-out; }`;
        document.head.appendChild(style);
    }

    return () => {
      mountedRef.current = false;
      stopScannerInternal();
    };
    // eslint-disable-next-line
  }, []);

  // --- RENDER ---
  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col font-sans">
      
      {/* HEADER */}
      <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 z-20 shadow-lg">
        <button onClick={handleClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 active:scale-95 transition">
           <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
            <h3 className="font-bold text-sm tracking-wide">SCANNER</h3>
            <p className="text-[10px] text-slate-400">{isScanning ? 'Siap Scan' : 'Inisialisasi...'}</p>
        </div>
        <button onClick={toggleFlash} disabled={!hasFlash} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${isFlashOn ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-500'} ${!hasFlash && 'opacity-20'}`}>
           <i className="fa-solid fa-bolt"></i>
        </button>
      </div>

      {/* VIEWPORT */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
         <div id={CONTAINER_ID} className="w-full h-full bg-black" />

         {/* Loading */}
         {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-30">
                <div className="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 text-xs">{statusMsg}</p>
            </div>
         )}

         {/* Overlay & Laser */}
         {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="relative w-72 h-72 border-2 border-white/20 rounded-xl overflow-hidden shadow-2xl">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                    <div className="absolute w-full h-0.5 bg-red-500 shadow-[0_0_15px_#ef4444] laser-beam"></div>
                </div>
                <div className="mt-8 bg-black/60 backdrop-blur px-4 py-2 rounded-full border border-white/10">
                    <p className="text-xs text-white/90">Jaga jarak 15-20cm agar fokus</p>
                </div>
            </div>
         )}
      </div>

      {/* CONTROLS */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 safe-area-bottom">
         {/* Zoom */}
         {zoomCap && (
            <div className="flex items-center gap-3 mb-4 px-2">
               <i className="fa-solid fa-minus text-[10px] text-slate-500"></i>
               <input 
                 type="range" min={zoomCap.min} max={zoomCap.max} step={0.1}
                 value={zoom} onChange={(e) => handleZoom(parseFloat(e.target.value))}
                 className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500"
               />
               <i className="fa-solid fa-plus text-[10px] text-slate-500"></i>
            </div>
         )}

         {/* Camera Select */}
         <div className="flex gap-2">
            <div className="relative flex-1">
                <select 
                    value={selectedCameraId} onChange={handleCameraChange} disabled={cameras.length <= 1}
                    className="w-full bg-slate-800 text-white text-xs py-3 px-3 rounded-lg border border-slate-700 outline-none appearance-none"
                >
                    {cameras.length === 0 ? <option>Mendeteksi...</option> :
                        cameras.map((c, i) => (
                            <option key={c.id} value={c.id}>
                                {c.label ? c.label.replace(/\(.*\)/g, '') : `Kamera ${i+1}`}
                            </option>
                        ))
                    }
                </select>
                <i className="fa-solid fa-chevron-down absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none"></i>
            </div>
            <div className="flex flex-col items-center justify-center w-14 bg-slate-800 border border-slate-700 rounded-lg">
                <span className="text-blue-400 font-bold text-sm">{scanCount}</span>
                <span className="text-[8px] text-slate-500 uppercase">SCAN</span>
            </div>
         </div>
      </div>
    </div>
  );
};
