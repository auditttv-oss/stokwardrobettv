import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State Data
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // State Error & Loading
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isStarting, setIsStarting] = useState<boolean>(true);

  // State Fitur (Zoom & Flash)
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";

  // 1. Inisialisasi: Minta Izin & Cari Kamera
  useEffect(() => {
    let mounted = true;

    const getCameras = async () => {
      try {
        // Pancing izin browser
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();

        if (mounted && devices && devices.length > 0) {
          setCameras(devices);
          
          // --- LOGIKA PEMILIHAN KAMERA YANG STABIL ---
          // 1. Cari yang ada tulisan 'back' atau 'belakang'
          const backCam = devices.find(d => 
             d.label.toLowerCase().includes('back') || 
             d.label.toLowerCase().includes('rear') || 
             d.label.toLowerCase().includes('environment')
          );

          // 2. Jika ada, pakai itu. Jika tidak, pakai kamera TERAKHIR (biasanya kamera utama di HP)
          const targetCamId = backCam ? backCam.id : devices[devices.length - 1].id;
          
          setSelectedCameraId(targetCamId);
        } else {
          setErrorMessage("Tidak ada kamera ditemukan.");
          setIsStarting(false);
        }
      } catch (err) {
        console.error(err);
        setErrorMessage("Gagal akses kamera. Pastikan izin diberikan dan HTTPS aktif.");
        setIsStarting(false);
      }
    };

    getCameras();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, []);

  // 2. Logika Start Scanner (Dipanggil saat ID Kamera berubah)
  useEffect(() => {
    if (selectedCameraId) {
      startScanner(selectedCameraId);
    }
  }, [selectedCameraId]);

  const startScanner = async (cameraId: string) => {
    // Stop scanner lama jika ada
    if (scannerRef.current) {
        try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
    }

    setIsStarting(true);
    setErrorMessage('');
    
    // Reset Zoom/Torch
    setZoom(1); 
    setZoomCap(null); 
    setCanTorch(false);

    // Buat Instance Baru
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    try {
        await html5QrCode.start(
            cameraId, // Gunakan ID langsung, JANGAN pakai facingMode di sini (bisa konflik)
            {
                fps: 15, // FPS Stabil
                qrbox: { width: 250, height: 250 },
                aspectRatio: 1.0,
                disableFlip: false,
                formatsToSupport: [ 
                    Html5QrcodeSupportedFormats.CODE_128, 
                    Html5QrcodeSupportedFormats.EAN_13, 
                    Html5QrcodeSupportedFormats.QR_CODE 
                ]
            },
            (decodedText) => {
                // Success Callback
                if (navigator.vibrate) navigator.vibrate(200);
                onScanSuccess(decodedText);
                onClose(); // Tutup modal
            },
            () => {} // Error Callback (ignore frame errors)
        );

        setIsStarting(false);
        
        // Aktifkan Fitur Hardware (Zoom/Torch) setelah start sukses
        setTimeout(setupHardwareFeatures, 500);

    } catch (err: any) {
        console.error("Start Error:", err);
        setErrorMessage(`Kamera gagal: ${err?.message || "Error tidak diketahui"}`);
        setIsStarting(false);
    }
  };

  const stopScanner = async () => {
      if (scannerRef.current?.isScanning) {
          try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
      }
  };

  // 3. Setup Zoom & Flash
  const setupHardwareFeatures = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      // Fix tampilan video agar full cover
      video.style.objectFit = "cover";

      const stream = video.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      // Cek Zoom
      if (caps.zoom) {
          setZoomCap({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5),
              step: caps.zoom.step || 0.1
          });
          // Auto Zoom dikit (1.2x) untuk bantu fokus
          track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
      }

      // Cek Torch
      if (caps.torch) setCanTorch(true);
  };

  const applyZoom = (val: number) => {
      setZoom(val);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ zoom: val }] }).catch(()=>{});
  };

  const toggleTorch = () => {
      const newState = !torchOn;
      setTorchOn(newState);
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      const track = (video?.srcObject as MediaStream)?.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ torch: newState }] }).catch(()=>{});
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center z-20 shadow-md border-b border-slate-800">
        <h3 className="text-white font-bold flex items-center gap-2">
            <i className="fa-solid fa-qrcode text-blue-500"></i> Scanner
        </h3>
        <button onClick={onClose} className="w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center hover:bg-slate-700">
            <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Main Viewport */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
         {/* Container Video */}
         <div id="reader-custom-view" className="w-full h-full bg-black"></div>
         
         {/* Loading / Error States */}
         {isStarting && (
             <div className="absolute inset-0 flex items-center justify-center bg-black z-30">
                 <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
             </div>
         )}

         {errorMessage && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-40 p-6 text-center">
                 <i className="fa-solid fa-triangle-exclamation text-amber-500 text-3xl mb-3"></i>
                 <p className="text-white mb-4">{errorMessage}</p>
                 <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded font-bold">Refresh Halaman</button>
             </div>
         )}
         
         {/* Overlay (Hanya muncul jika tidak error) */}
         {!errorMessage && !isStarting && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                <div className="w-64 h-64 border-2 border-green-500 rounded-lg relative shadow-[0_0_100vmax_rgba(0,0,0,0.6)]">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
                </div>
                <div className="mt-8 bg-black/60 px-4 py-2 rounded-full backdrop-blur-sm">
                    <p className="text-white text-xs font-medium">Jauhkan HP (20cm) & Gunakan Zoom</p>
                </div>
             </div>
         )}
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-5 border-t border-slate-800 flex flex-col gap-4 z-20">
         
         {/* ZOOM SLIDER (Wajib Ada untuk Fokus) */}
         {zoomCap && !errorMessage && (
             <div className="w-full px-1">
                 <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-1">
                     <span>Mundur</span>
                     <span>Zoom: {zoom.toFixed(1)}x</span>
                     <span>Dekat</span>
                 </div>
                 <input 
                    type="range" 
                    min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} 
                    value={zoom} 
                    onChange={(e) => applyZoom(parseFloat(e.target.value))} 
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" 
                 />
             </div>
         )}

         <div className="flex gap-3">
             <select 
                className="flex-1 bg-slate-800 text-white border border-slate-600 rounded-lg py-3 px-3 text-sm font-bold outline-none"
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                disabled={cameras.length === 0}
             >
                {cameras.map((c, i) => (
                    <option key={c.id} value={c.id}>
                        {c.label || `Kamera ${i+1}`}
                    </option>
                ))}
             </select>

             {canTorch && (
                 <button 
                    onClick={toggleTorch}
                    className={`w-12 rounded-lg flex items-center justify-center text-xl border transition-all ${torchOn ? 'bg-amber-400 border-amber-400 text-black' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                 >
                    <i className="fa-solid fa-bolt"></i>
                 </button>
             )}
         </div>
      </div>
    </div>
  );
};