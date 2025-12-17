import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State Utama
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // State Fitur (Zoom & Torch)
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [canTorch, setCanTorch] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const isMounted = useRef(true);

  // 1. Init Kamera & Permission
  useEffect(() => {
    isMounted.current = true;

    const initCamera = async () => {
      try {
        // Pancing Permission
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
          // LOGIKA BARU: SORTING AGAR KAMERA BELAKANG JADI NO. 1
          const sortedCameras = devices.sort((a, b) => {
             const labelA = a.label.toLowerCase();
             const labelB = b.label.toLowerCase();
             const isBackA = labelA.includes('back') || labelA.includes('rear') || labelA.includes('environment');
             const isBackB = labelB.includes('back') || labelB.includes('rear') || labelB.includes('environment');
             
             // Jika A belakang & B depan, A duluan
             if (isBackA && !isBackB) return -1;
             if (!isBackA && isBackB) return 1;
             return 0;
          });

          setCameras(sortedCameras);
          
          // Pilih kamera pertama dari list yang sudah disortir (Pasti belakang jika ada)
          setSelectedCameraId(sortedCameras[0].id);
        }
      } catch (err) {
        console.error(err);
        alert("Gagal mengakses kamera. Mohon izinkan akses.");
      }
    };

    initCamera();

    return () => {
        isMounted.current = false;
        stopScanner();
    };
  }, []);

  // 2. Start Scanner Logic
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();

    // Reset Zoom State saat ganti kamera
    setZoom(1);
    setZoomCap(null);
    setCanTorch(false);

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    const constraints = {
        deviceId: { exact: cameraId },
        // Paksa browser mencari kamera belakang
        facingMode: "environment", 
        // Resolusi Ideal 720p
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        advanced: [{ focusMode: "continuous" }]
    };

    try {
      await html5QrCode.start(
        constraints,
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false, // Jangan mirror gambar
          formatsToSupport: [ 
             Html5QrcodeSupportedFormats.CODE_128, 
             Html5QrcodeSupportedFormats.EAN_13, 
             Html5QrcodeSupportedFormats.QR_CODE 
          ]
        },
        (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(200);
          onScanSuccess(decodedText);
          onClose();
        },
        () => {}
      );

      // Cek Capabilities (Zoom & Torch)
      setTimeout(setupCapabilities, 500);

    } catch (err) {
      console.warn("Start fail, retrying basic config...", err);
      // Fallback: Start tanpa constraints berat
      try {
          await html5QrCode.start(cameraId, { fps: 15, qrbox: 250 }, (t) => { onScanSuccess(t); onClose(); }, () => {});
      } catch(e) {}
    }
  };

  const setupCapabilities = () => {
    const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (video && video.srcObject) {
         // Fix CSS Video agar tidak gepeng
         video.style.objectFit = "cover";
         
         const stream = video.srcObject as MediaStream;
         const track = stream.getVideoTracks()[0];
         const caps: any = track.getCapabilities ? track.getCapabilities() : {};

         // Cek Torch
         setCanTorch(!!caps.torch);

         // Cek Zoom
         if (caps.zoom) {
            setZoomCap({
                min: caps.zoom.min || 1,
                max: Math.min(caps.zoom.max || 5, 5), // Max 5x
                step: caps.zoom.step || 0.1
            });
            // Auto Zoom dikit (1.2x)
            applyZoom(1.2, track);
         }
    }
  };

  const applyZoom = (val: number, trackParam?: MediaStreamTrack) => {
    const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!video || !video.srcObject) return;
    const track = trackParam || (video.srcObject as MediaStream).getVideoTracks()[0];
    
    try {
        // @ts-ignore
        track.applyConstraints({ advanced: [{ zoom: val }] });
        setZoom(val);
    } catch (e) {}
  };

  const applyTorch = () => {
    const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
    if (!video || !video.srcObject) return;
    const track = (video.srcObject as MediaStream).getVideoTracks()[0];
    const newStatus = !torchOn;
    
    try {
        // @ts-ignore
        track.applyConstraints({ advanced: [{ torch: newStatus }] });
        setTorchOn(newStatus);
    } catch (e) {}
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
    }
  };

  useEffect(() => {
    if (selectedCameraId && isMounted.current) {
        startScanner(selectedCameraId);
    }
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center z-20 shadow-md">
        <h3 className="text-white font-bold flex items-center gap-2">
            <i className="fa-solid fa-camera text-blue-500"></i> Scanner
        </h3>
        <button onClick={onClose} className="w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center hover:bg-slate-700">
            <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Viewport */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
         <div id="reader-custom-view" className="w-full h-full bg-black"></div>
         
         {/* Overlay Laser */}
         <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
            <div className="w-64 h-64 border-2 border-green-500 rounded-lg relative shadow-[0_0_100vmax_rgba(0,0,0,0.6)]">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
            </div>
            <div className="mt-8 bg-black/50 px-4 py-1 rounded-full backdrop-blur-sm">
                <p className="text-white text-xs font-medium">Jauhkan HP (20cm) & Gunakan Zoom</p>
            </div>
         </div>
      </div>

      {/* Controls */}
      <div className="bg-slate-900 p-5 border-t border-slate-800 flex flex-col gap-4 z-20">
         
         {/* ZOOM SLIDER - SOLUSI FOKUS */}
         {zoomCap ? (
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
         ) : (
            <p className="text-[10px] text-slate-500 text-center">Fitur Zoom tidak didukung di kamera ini</p>
         )}

         <div className="flex gap-3">
             {/* Dropdown Kamera */}
             <div className="relative flex-1">
                 <select 
                    className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg py-3 px-3 pr-8 text-sm font-bold outline-none appearance-none"
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                 >
                    {cameras.map((c, i) => (
                        <option key={c.id} value={c.id}>
                            {c.label || `Kamera ${i+1}`} {c.label.toLowerCase().includes('back') ? '(Belakang)' : ''}
                        </option>
                    ))}
                 </select>
                 <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">▼</div>
             </div>

             {/* Tombol Flash */}
             {canTorch && (
                 <button 
                    onClick={applyTorch}
                    className={`w-12 rounded-lg flex items-center justify-center text-xl border transition-all ${torchOn ? 'bg-amber-400 border-amber-400 text-black shadow-[0_0_15px_#fbbf24]' : 'bg-slate-800 border-slate-600 text-slate-400'}`}
                 >
                    <i className="fa-solid fa-bolt"></i>
                 </button>
             )}
         </div>
      </div>
    </div>
  );
};