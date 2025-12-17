import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScanType } from 'html5-qrcode';
import { CameraDevice } from 'html5-qrcode/esm/camera/core';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

const CONTAINER_ID = "reader-custom-view";

const SCANNER_CONFIG = {
  fps: 15, // FPS stabil
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
  ],
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('Menginisialisasi Kamera...');
  
  // Hardware Features
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const mountedRef = useRef(true);

  // --- LOGIKA PINTAR PEMILIHAN LENSA (Fix iPhone) ---
  const selectBestCamera = (devices: CameraDevice[]) => {
    if (!devices || devices.length === 0) return null;

    // 1. Filter hanya kamera belakang
    const backCameras = devices.filter(d => 
        d.label.toLowerCase().includes('back') || 
        d.label.toLowerCase().includes('belakang') ||
        d.label.toLowerCase().includes('environment')
    );

    // Jika tidak ada label jelas, pakai list asli (biasanya index terakhir adalah belakang di Android lama)
    const candidates = backCameras.length > 0 ? backCameras : devices;

    // 2. Filter Lensa Ultra Wide (Penyebab Blur di iPhone)
    // Label iPhone biasanya: "Back Camera 1", "Back Camera 2" (Ultra Wide)
    // Kita cari yang TIDAK mengandung kata 'ultra', 'wide', '0.5' jika memungkinkan
    const mainCamera = candidates.find(d => {
        const label = d.label.toLowerCase();
        return !label.includes('ultra') && !label.includes('0.5') && !label.includes('wide');
    });

    // Jika ketemu kamera "bersih", pakai itu. Jika tidak, pakai kandidat pertama.
    return mainCamera ? mainCamera.id : candidates[0].id;
  };

  // --- START SCANNER ---
  const startScanner = useCallback(async (forcedId?: string) => {
    if (scannerRef.current?.isScanning) {
        await stopScannerInternal();
    }

    setIsLoading(true);
    setStatusMsg('Membuka Lensa Utama...');
    
    // Reset Container
    const container = document.getElementById(CONTAINER_ID);
    if(container) container.innerHTML = '';

    try {
      const html5QrCode = new Html5Qrcode(CONTAINER_ID);
      scannerRef.current = html5QrCode;

      // 1. Dapatkan List Kamera
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);

      // 2. Tentukan ID Kamera
      let targetId = forcedId;
      if (!targetId && devices.length > 0) {
          targetId = selectBestCamera(devices) || devices[0].id;
      }
      if (targetId) setSelectedCameraId(targetId);

      // 3. CONSTRAINT KHUSUS (Fix iPhone Focus)
      // Meminta resolusi tinggi (HD/FHD) memaksa iOS menggunakan Lensa Utama
      // Lensa Ultra-Wide biasanya resolusinya lebih rendah atau tidak diprioritaskan untuk constraint ini.
      const constraints = targetId 
        ? { 
            deviceId: { exact: targetId },
            // Request 720p - 1080p agar dapat Lensa Utama yang punya Auto Focus
            width: { min: 640, ideal: 1280 }, 
            height: { min: 480, ideal: 720 }
          }
        : { facingMode: "environment" };

      // 4. Start Camera
      await html5QrCode.start(
        constraints,
        SCANNER_CONFIG,
        (decodedText) => {
          // Success
          if (navigator.vibrate) navigator.vibrate(50);
          setScanCount(p => p + 1);
          onScanSuccess(decodedText);
          html5QrCode.pause(true);
          setTimeout(() => html5QrCode.resume(), 1500);
        },
        () => {} // Ignore frame errors
      );

      setIsScanning(true);
      setIsLoading(false);

      // 5. TERAPKAN OPTIMASI HARDWARE (Zoom & Focus)
      applyHardwareOptimizations();

    } catch (err: any) {
      console.error("Start fail:", err);
      // Retry Fallback: Jika resolusi tinggi gagal, coba mode basic
      if (!forcedId) {
          console.log("Retrying with basic constraints...");
          try {
             await scannerRef.current?.start({ facingMode: "environment" }, SCANNER_CONFIG, onScanSuccess, () => {});
             setIsScanning(true);
             setIsLoading(false);
             applyHardwareOptimizations(); // Tetap coba optimasi
          } catch (e) {
             setStatusMsg("Gagal akses kamera. Pastikan izin diberikan.");
             setIsLoading(false);
          }
      } else {
        setStatusMsg("Error kamera: " + err.message);
        setIsLoading(false);
      }
    }
  }, [onScanSuccess]);

  const stopScannerInternal = async () => {
      if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) await scannerRef.current.stop();
            scannerRef.current.clear();
          } catch(e) {}
      }
      setIsScanning(false);
  };

  // --- LOGIKA ZOOM & FOKUS (Jantung Perbaikan) ---
  const applyHardwareOptimizations = () => {
    setTimeout(async () => {
      const video = document.querySelector(`#${CONTAINER_ID} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      // CSS agar full screen
      video.style.objectFit = "cover";
      video.style.width = "100%";
      video.style.height = "100%";

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      videoTrackRef.current = track;
      
      const caps = track.getCapabilities ? track.getCapabilities() : {};

      // 1. FLASH
      if ('torch' in caps || 'fillLightMode' in caps) setHasFlash(true);

      // 2. FOCUS (Android/Chrome)
      // Memaksa mode continuous focus
      try {
        // @ts-ignore
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { console.log("Focus mode not editable"); }

      // 3. ZOOM (Solusi Samsung S21 & iPhone Focus)
      // Kita set zoom default ke ~1.5x - 2.0x
      // Ini memaksa pengguna memundurkan HP, masuk ke "Sweet Spot" fokus lensa.
      if ('zoom' in caps) {
        const z = (caps as any).zoom;
        setZoomCap({ min: z.min, max: z.max });
        
        let targetZoom = 1.7; // Sweet spot untuk S21/iPhone 13
        // Clamp value
        if (targetZoom < z.min) targetZoom = z.min;
        if (targetZoom > z.max) targetZoom = z.max;

        try {
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
            setZoom(targetZoom);
        } catch (e) { console.log("Zoom failed"); }
      }

    }, 800); // Delay sedikit agar stream stabil dulu
  };

  // --- UI HANDLERS ---
  const handleZoom = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setZoom(val);
      if (videoTrackRef.current) {
          try { await videoTrackRef.current.applyConstraints({ advanced: [{ zoom: val } as any] }); } catch(e){}
      }
  };

  const handleToggleFlash = async () => {
      if(!videoTrackRef.current) return;
      try {
          const target = !isFlashOn;
          await videoTrackRef.current.applyConstraints({ advanced: [{ torch: target } as any] });
          setIsFlashOn(target);
      } catch(e){}
  };

  const handleSwitchCamera = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      setSelectedCameraId(id);
      startScanner(id);
  };

  const handleClose = async () => {
      await stopScannerInternal();
      onClose();
  };

  useEffect(() => {
      mountedRef.current = true;
      startScanner();
      
      // Inject CSS Laser
      const styleId = 'scanner-laser-style';
      if(!document.getElementById(styleId)) {
          const style = document.createElement('style');
          style.id = styleId;
          style.textContent = `@keyframes scan-laser { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } } .laser { animation: scan-laser 1.5s infinite ease-in-out; }`;
          document.head.appendChild(style);
      }

      return () => {
          mountedRef.current = false;
          stopScannerInternal();
      };
      // eslint-disable-next-line
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col font-sans">
        {/* HEADER */}
        <div className="flex justify-between items-center p-4 bg-slate-900/90 backdrop-blur border-b border-slate-800 z-20">
            <button onClick={handleClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 active:scale-95 transition">
                <i className="fa-solid fa-arrow-left"></i>
            </button>
            <div>
                <h3 className="font-bold text-sm tracking-widest text-center">SCANNER</h3>
                <p className="text-[10px] text-slate-400 text-center">{selectedCameraId ? 'High Accuracy Mode' : 'Loading...'}</p>
            </div>
            <button onClick={handleToggleFlash} disabled={!hasFlash} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${isFlashOn ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/50' : 'bg-slate-800 text-slate-500'} ${!hasFlash && 'opacity-30'}`}>
                <i className="fa-solid fa-bolt"></i>
            </button>
        </div>

        {/* CAMERA VIEWPORT */}
        <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
            <div id={CONTAINER_ID} className="w-full h-full bg-black"></div>

            {/* OVERLAY UI */}
            {isScanning && !isLoading && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                    {/* Viewfinder Box */}
                    <div className="relative w-72 h-72 border-2 border-white/30 rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]">
                        {/* Corners */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                        {/* Laser */}
                        <div className="absolute w-full h-0.5 bg-red-500 shadow-[0_0_20px_#ef4444] laser"></div>
                    </div>
                    {/* Instructions */}
                    <div className="mt-8 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                        <p className="text-xs text-white/90 font-medium">Jaga jarak 15-20cm agar fokus</p>
                    </div>
                </div>
            )}

            {/* LOADING STATE */}
            {isLoading && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black">
                    <div className="w-12 h-12 border-4 border-slate-800 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                    <p className="text-slate-400 text-xs">{statusMsg}</p>
                </div>
            )}
        </div>

        {/* FOOTER CONTROLS */}
        <div className="bg-slate-900/90 backdrop-blur p-4 pb-8 safe-area-bottom border-t border-slate-800">
            {/* Zoom Slider */}
            {zoomCap && (
                <div className="flex items-center gap-4 mb-4 px-2">
                    <i className="fa-solid fa-minus text-[10px] text-slate-500"></i>
                    <input 
                        type="range" 
                        min={zoomCap.min} max={zoomCap.max} step={0.1}
                        value={zoom} 
                        onChange={handleZoom}
                        className="flex-1 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                    />
                    <i className="fa-solid fa-plus text-[10px] text-slate-500"></i>
                </div>
            )}

            {/* Camera Switcher & Status */}
            <div className="flex gap-3">
                <div className="relative flex-1">
                    <select 
                        value={selectedCameraId} 
                        onChange={handleSwitchCamera} 
                        disabled={cameras.length <= 1}
                        className="w-full bg-slate-800 text-white text-xs py-3.5 px-4 rounded-xl border border-slate-700 outline-none focus:border-blue-500 appearance-none disabled:opacity-50"
                    >
                        {cameras.length === 0 ? <option>Mendeteksi Lensa...</option> : 
                            cameras.map((c, i) => (
                                <option key={c.id} value={c.id}>
                                    {c.label ? c.label.replace(/\(.*\)/, '').trim() : `Kamera ${i+1}`}
                                </option>
                            ))
                        }
                    </select>
                    <i className="fa-solid fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 pointer-events-none"></i>
                </div>
                
                <div className="w-16 flex flex-col items-center justify-center bg-slate-800 border border-slate-700 rounded-xl">
                    <span className="text-blue-400 font-bold text-sm">{scanCount}</span>
                    <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">SCAN</span>
                </div>
            </div>
        </div>
    </div>
  );
};        // karena jarak fokus minimal lensa utama mereka jauh (15cm+)
        let targetZoom = 2.0; 
        
        // Safety check range zoom
        if (targetZoom < z.min) targetZoom = z.min;
        if (targetZoom > z.max) targetZoom = z.max;

        try {
            await track.applyConstraints({ advanced: [{ zoom: targetZoom } as any] });
            setZoom(targetZoom);
            console.log("Auto-zoom applied:", targetZoom);
        } catch (e) { console.warn("Zoom fail", e); }
      }

      // --- LOGIKA FOKUS (ANDROID) ---
      try {
        // Memaksa continuous focus untuk Android
        // @ts-ignore
        await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
      } catch (e) { console.warn("Focus fail", e); }

    }, 500);
  };

  // --- HANDLERS ---
  const handleZoom = async (val: number) => {
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
    } catch (e) {}
  };

  const switchCamera = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedCameraId(id);
    startScanner(id);
  };

  useEffect(() => {
    mountedRef.current = true;
    startScanner();
    
    // Inject CSS Animation
    const styleId = 'scanner-css';
    if(!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `@keyframes scan-laser { 0% { top: 0; opacity: 0; } 50% { opacity: 1; } 100% { top: 100%; opacity: 0; } } .laser { animation: scan-laser 2s infinite ease-in-out; }`;
        document.head.appendChild(style);
    }

    return () => {
      mountedRef.current = false;
      stopScannerInternal();
    };
    // eslint-disable-next-line
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] bg-black text-white flex flex-col font-sans">
      {/* HEADER */}
      <div className="flex justify-between items-center p-4 bg-slate-900 border-b border-slate-800 z-20">
        <button onClick={() => { stopScannerInternal(); onClose(); }} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700">
           <i className="fa-solid fa-arrow-left"></i>
        </button>
        <div className="text-center">
            <h3 className="font-bold text-sm tracking-wide">SCANNER</h3>
            <p className="text-[10px] text-slate-400">{isScanning ? 'Siap Scan' : 'Memuat...'}</p>
        </div>
        <button onClick={toggleFlash} disabled={!hasFlash} className={`w-10 h-10 rounded-full flex items-center justify-center transition ${isFlashOn ? 'bg-yellow-500 text-black' : 'bg-slate-800 text-slate-500'} ${!hasFlash && 'opacity-20'}`}>
           <i className="fa-solid fa-bolt"></i>
        </button>
      </div>

      {/* SCAN AREA */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
         <div id={CONTAINER_ID} className="w-full h-full bg-black" />

         {/* LOADING */}
         {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-30">
               <div className="w-10 h-10 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
               <p className="text-slate-400 text-xs">{statusMsg}</p>
            </div>
         )}

         {/* OVERLAY & LASER */}
         {isScanning && !isLoading && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
                <div className="relative w-72 h-72 border-2 border-white/20 rounded-xl">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-lg -ml-[2px] -mt-[2px]"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-lg -mr-[2px] -mt-[2px]"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-lg -ml-[2px] -mb-[2px]"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-lg -mr-[2px] -mb-[2px]"></div>
                    <div className="absolute w-full h-0.5 bg-blue-500 shadow-[0_0_15px_#3b82f6] laser"></div>
                </div>
                <div className="mt-8 bg-black/60 backdrop-blur px-4 py-2 rounded-full text-xs text-white/90">
                    Jaga jarak 15-20cm dari Barcode
                </div>
            </div>
         )}
      </div>

      {/* FOOTER CONTROLS */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 safe-area-bottom">
         {/* ZOOM SLIDER */}
         {zoomCap && (
            <div className="flex items-center gap-3 mb-4 px-2">
               <i className="fa-solid fa-minus text-[10px] text-slate-500"></i>
               <input 
                 type="range" min={zoomCap.min} max={zoomCap.max} step={0.1}
                 value={zoom} onChange={(e) => handleZoom(parseFloat(e.target.value))}
                 className="flex-1 h-1 bg-slate-700 rounded-full appearance-none accent-blue-500"
               />
               <i className="fa-solid fa-plus text-[10px] text-slate-500"></i>
            </div>
         )}

         <div className="flex gap-2">
            <div className="relative flex-1">
                <select 
                    value={selectedCameraId} onChange={switchCamera} disabled={cameras.length <= 1}
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
