import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // --- STATE ---
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Status State
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Hardware Features State
  const [zoom, setZoom] = useState(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [canTorch, setCanTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const mountedRef = useRef(true);

  // --- 1. INITIALIZATION (CEPAT & INGAT KAMERA) ---
  useEffect(() => {
    mountedRef.current = true;
    
    // 1. Ambil ID kamera terakhir dari Memory HP
    const savedCameraId = localStorage.getItem('SO_PREFERRED_CAMERA_ID');
    
    // 2. Langsung start scanner (Jangan tunggu list kamera, biar cepat)
    initScanner(savedCameraId);

    // 3. Ambil list kamera di background (untuk dropdown nanti)
    fetchCameras(savedCameraId);

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  // Fungsi ambil list kamera
  const fetchCameras = async (savedId: string | null) => {
    try {
        const devices = await Html5Qrcode.getCameras();
        if (mountedRef.current && devices && devices.length > 0) {
            setCameras(devices);
            
            // Jika belum ada kamera tersimpan, cari kamera belakang terbaik
            if (!savedId) {
                const backCam = devices.find(d => 
                    d.label.toLowerCase().includes('back') || 
                    d.label.toLowerCase().includes('environment')
                );
                // Jika ketemu back cam, simpan ID-nya untuk nanti
                if (backCam) {
                    setSelectedCameraId(backCam.id);
                } else {
                    setSelectedCameraId(devices[devices.length - 1].id);
                }
            } else {
                setSelectedCameraId(savedId);
            }
        }
    } catch (e) {
        console.warn("Gagal fetch list kamera (tapi scanner mungkin sudah jalan)", e);
    }
  };

  // --- 2. LOGIKA START SCANNER (OPTIMAL IOS & ANDROID) ---
  const initScanner = async (cameraId: string | null) => {
    setIsLoading(true);
    setErrorMsg('');

    // Cleanup instance lama
    if (scannerRef.current) {
        try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
    }

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // KONFIGURASI PENTING UNTUK IOS/ANDROID:
    // 1. width: ideal 1280 (720p). Jangan pakai 'max' atau 4K karena iPhone akan pakai lensa wide yang tidak bisa fokus dekat.
    // 2. focusMode: continuous (Wajib buat Android).
    const videoConstraints = cameraId 
        ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: "continuous" }] }
        : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: "continuous" }] };

    const config = {
        fps: 15, // Stabil & Terang
        qrbox: { width: 250, height: 250 }, // Area Scan Tetap
        aspectRatio: 1.0,
        disableFlip: false,
        formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE 
        ]
    };

    try {
        // Start Scanning
        await html5QrCode.start(
            cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
            { ...config, videoConstraints },
            (decodedText) => {
                if (navigator.vibrate) navigator.vibrate(200);
                onScanSuccess(decodedText);
                onClose();
            },
            () => {}
        );

        if (mountedRef.current) {
            setIsLoading(false);
            // Simpan ID kamera yang berhasil dipakai
            if (cameraId) localStorage.setItem('SO_PREFERRED_CAMERA_ID', cameraId);
            
            // Setup Zoom & Flash setelah kamera nyala
            setTimeout(setupHardwareFeatures, 500);
        }

    } catch (err) {
        console.error("Start Failed:", err);
        // Jika gagal start dengan ID tersimpan, coba mode auto (reset storage)
        if (cameraId) {
            console.log("Retry with auto mode...");
            localStorage.removeItem('SO_PREFERRED_CAMERA_ID');
            initScanner(null); 
        } else {
             if (mountedRef.current) {
                 setErrorMsg("Gagal membuka kamera. Pastikan izin diberikan.");
                 setIsLoading(false);
             }
        }
    }
  };

  const stopScanner = async () => {
      if (scannerRef.current?.isScanning) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }
  };

  // --- 3. HARDWARE FEATURES (ZOOM & FLASH) ---
  const setupHardwareFeatures = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      video.style.objectFit = "cover"; // CSS Fix agar full screen

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      // Setup Zoom
      if (caps.zoom) {
          setZoomCap({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5),
              step: caps.zoom.step || 0.1
          });
          // Auto Zoom dikit (1.2x) untuk bantu iPhone fokus
          track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
          setZoom(1.2);
      }

      // Setup Torch (Flash)
      if (caps.torch) {
          setCanTorch(true);
      }
  };

  const applyZoom = (val: number) => {
      setZoom(val);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: val }] }).catch(()=>{});
  };

  const toggleTorch = () => {
      const newState = !isTorchOn;
      setIsTorchOn(newState);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ torch: newState }] }).catch(()=>{});
  };

  const handleCameraChange = (newId: string) => {
      setSelectedCameraId(newId);
      localStorage.setItem('SO_PREFERRED_CAMERA_ID', newId); // Simpan pilihan user
      initScanner(newId); // Restart scanner dengan kamera baru
  };

  // --- 4. RENDER UI ---
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white font-sans">
      
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-md z-20 shrink-0 border-b border-slate-800">
         <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-white">Scanner</h3>
            {/* Indikator Loading Kecil di Header */}
            {isLoading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
         </div>
         <button onClick={onClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center hover:bg-slate-700 transition-colors">
            <i className="fa-solid fa-xmark text-lg"></i>
         </button>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
         
         <div id="reader-custom-view" className="w-full h-full bg-black relative"></div>

         {/* Error State */}
         {errorMsg && !isLoading && (
             <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 p-6 text-center">
                 <i className="fa-solid fa-triangle-exclamation text-amber-500 text-4xl mb-4"></i>
                 <p className="text-white mb-6">{errorMsg}</p>
                 <button onClick={() => window.location.reload()} className="bg-blue-600 px-6 py-3 rounded-xl font-bold">
                    Refresh Halaman
                 </button>
             </div>
         )}

         {/* OVERLAY: Kotak Scan Konsisten */}
         {!errorMsg && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                {/* Kotak Scan 250x250 Fixed */}
                <div className="w-[250px] h-[250px] relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
                    {/* Laser */}
                    <div className="absolute w-full h-0.5 bg-red-500 top-1/2 shadow-[0_0_10px_red] animate-pulse"></div>
                </div>
                
                {/* Instruksi */}
                <div className="mt-8 bg-black/60 px-4 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                    <p className="text-white text-xs font-bold tracking-wide">
                        Jarak 15-20cm & Gunakan Zoom
                    </p>
                </div>
             </div>
         )}
      </div>

      {/* Footer Controls */}
      <div className="bg-slate-900 p-5 border-t border-slate-800 z-20 shrink-0 space-y-4">
         
         {/* ZOOM SLIDER (Wajib untuk iPhone) */}
         {zoomCap && (
             <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                 <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-2">
                     <span>Mundur</span>
                     <span className="text-blue-400">Zoom {zoom.toFixed(1)}x</span>
                     <span>Dekat</span>
                 </div>
                 <input 
                    type="range" 
                    min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} 
                    value={zoom} 
                    onChange={(e) => applyZoom(parseFloat(e.target.value))} 
                    className="w-full h-3 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                 />
             </div>
         )}

         {/* Baris Bawah: Pilih Kamera & Flash */}
         <div className="flex gap-3">
             <div className="relative flex-1">
                 <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <i className="fa-solid fa-camera"></i>
                 </div>
                 <select 
                    className="w-full bg-slate-800 text-white border border-slate-600 rounded-xl py-3.5 pl-10 pr-4 text-sm font-bold outline-none focus:border-blue-500 appearance-none truncate"
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    disabled={cameras.length === 0}
                 >
                    {cameras.length === 0 && <option>Memuat kamera...</option>}
                    {cameras.map((c, i) => (
                        <option key={c.id} value={c.id}>
                            {c.label || `Kamera ${i+1}`}
                        </option>
                    ))}
                 </select>
             </div>

             {/* Tombol Flash (Hanya muncul jika support) */}
             {canTorch && (
                 <button 
                    onClick={toggleTorch}
                    className={`w-12 rounded-xl flex items-center justify-center text-xl border transition-all ${isTorchOn ? 'bg-amber-400 border-amber-400 text-slate-900' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                 >
                    <i className="fa-solid fa-bolt"></i>
                 </button>
             )}
         </div>
      </div>
    </div>
  );
};