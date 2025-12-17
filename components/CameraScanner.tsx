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
  
  // State Kontrol Kamera
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [canTorch, setCanTorch] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  
  // State UI
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [boxSize, setBoxSize] = useState({ width: 300, height: 150 });

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // 1. Hitung Ukuran Box Scanner agar Responsif
  useEffect(() => {
    const handleResize = () => {
        const vw = Math.min(window.innerWidth, 600);
        // Lebar 80% layar, Tinggi 50% dari lebar (persegi panjang untuk barcode)
        setBoxSize({ width: Math.floor(vw * 0.8), height: Math.floor(vw * 0.5) });
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 2. Cek Kemampuan Kamera (Zoom & Torch)
  const checkCapabilities = (track: MediaStreamTrack) => {
    trackRef.current = track;
    const caps: any = track.getCapabilities ? track.getCapabilities() : {};
    
    // Cek Torch
    setCanTorch(!!caps.torch);

    // Cek Zoom
    if (caps.zoom) {
      setZoomCap({
        min: caps.zoom.min || 1,
        max: Math.min(caps.zoom.max || 5, 5), // Batasi max zoom 5x saja
        step: caps.zoom.step || 0.1
      });
      // Set default zoom agak maju (1.2x) untuk membantu inisiasi fokus
      applyZoom(1.2, track);
    } else {
      setZoomCap(null);
    }
  };

  const applyTorch = async (on: boolean) => {
    const track: any = trackRef.current;
    if (track && canTorch) {
      try {
        await track.applyConstraints({ advanced: [{ torch: on }] });
        setTorchOn(on);
      } catch (err) { console.warn(err); }
    }
  };

  const applyZoom = async (value: number, trackParam?: MediaStreamTrack) => {
    const track: any = trackParam || trackRef.current;
    if (track && track.getCapabilities) {
        const caps: any = track.getCapabilities();
        if(caps.zoom) {
            try {
                await track.applyConstraints({ advanced: [{ zoom: value }] });
                setZoom(value);
            } catch (err) { console.warn(err); }
        }
    }
  };

  // 3. Init Scanner
  useEffect(() => {
    const initCamera = async () => {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          setCameras(devices);
          
          // Logika Filter Kamera Belakang yang lebih cerdas
          const backCameras = devices.filter(d => 
             d.label.toLowerCase().includes('back') || 
             d.label.toLowerCase().includes('belakang') || 
             d.label.toLowerCase().includes('environment')
          );

          // Pilih kamera belakang terakhir (biasanya kamera utama pada setup multi-cam)
          // atau fallback ke device pertama
          const bestCam = backCameras.length > 0 ? backCameras[backCameras.length - 1] : devices[0];
          setSelectedCameraId(bestCam.id);
        } else {
          alert("Kamera tidak ditemukan.");
        }
      } catch (err) {
        alert("Gagal akses kamera. Periksa izin browser.");
      } finally {
        setIsLoading(false);
      }
    };
    initCamera();

    return () => { stopScanner(); };
  }, []);

  // 4. Start Scanner Logic
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // KONFIGURASI KUNCI AGAR FOKUS BAGUS
    const constraints = {
        deviceId: { exact: cameraId },
        // Resolusi Ideal: 720p (Cukup tajam, tapi ringan untuk autofocus)
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        // Paksa mode fokus continuous
        advanced: [{ focusMode: "continuous" }] 
    };

    try {
      await html5QrCode.start(
        constraints,
        {
          fps: 15, // FPS 15 lebih baik untuk Low Light & Fokus daripada 30
          qrbox: boxSize,
          aspectRatio: 1.0,
          disableFlip: false,
          formatsToSupport: [ 
            Html5QrcodeSupportedFormats.CODE_128, 
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.QR_CODE 
          ]
        },
        (decodedText) => {
          if (navigator.vibrate) navigator.vibrate(200);
          onScanSuccess(decodedText);
          stopScanner();
        },
        () => {} // Ignore errors
      );

      // Ambil Track untuk kontrol Zoom/Flash setelah kamera nyala
      const videoElement = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (videoElement && videoElement.srcObject) {
         // Fix CSS Video agar full cover
         videoElement.style.objectFit = "cover"; 
         
         const stream = videoElement.srcObject as MediaStream;
         const track = stream.getVideoTracks()[0];
         checkCapabilities(track);
      }
      
    } catch (err) {
      console.error(err);
      // Fallback jika constraints gagal (biasanya di laptop/hp lama)
      try {
        await html5QrCode.start(cameraId, { fps: 10, qrbox: 250 }, (t) => onScanSuccess(t), () => {});
      } catch(e) { alert("Kamera gagal dimulai."); }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch(e) {}
    }
  };

  // Restart kamera jika ID berubah
  useEffect(() => {
    if (selectedCameraId) startScanner(selectedCameraId);
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center z-20 shadow-md">
        <h3 className="text-white font-bold flex items-center gap-2">
            <i className="fa-solid fa-qrcode text-blue-500"></i> Scan Barcode
        </h3>
        <button onClick={onClose} className="bg-slate-800 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-slate-700">
            <i className="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
         <div id="reader-custom-view" className="w-full h-full bg-black"></div>
         
         {/* Overlay UI */}
         <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
            {/* Box Hijau */}
            <div 
                style={{ width: boxSize.width, height: boxSize.height }} 
                className="border-2 border-green-500 rounded-lg relative shadow-[0_0_0_100vmax_rgba(0,0,0,0.6)]"
            >
                <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
            </div>
            <p className="mt-8 text-white text-xs bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                Jauhkan HP (20cm) & Gunakan Zoom
            </p>
         </div>

         {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black z-30"><span className="text-white animate-pulse">Memuat Kamera...</span></div>}
      </div>

      {/* Control Panel (Zoom & Settings) */}
      <div className="bg-slate-900 p-5 z-20 border-t border-slate-800 flex flex-col gap-4">
        
        {/* ZOOM SLIDER - FITUR UTAMA PERBAIKAN FOKUS */}
        {zoomCap && (
            <div className="w-full px-2">
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
             {/* Dropdown Kamera */}
             <div className="relative flex-1">
                <select 
                    className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg py-3 px-3 text-sm font-bold outline-none focus:border-blue-500 appearance-none"
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                >
                    {cameras.map(c => (
                        <option key={c.id} value={c.id}>{c.label || 'Kamera'}</option>
                    ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">▼</div>
             </div>

             {/* Tombol Flash */}
             {canTorch && (
                 <button 
                    onClick={() => applyTorch(!torchOn)}
                    className={`w-14 rounded-lg flex items-center justify-center text-xl transition-all ${torchOn ? 'bg-amber-400 text-black shadow-[0_0_15px_#fbbf24]' : 'bg-slate-800 text-slate-400 border border-slate-600'}`}
                 >
                    <i className="fa-solid fa-bolt"></i>
                 </button>
             )}
        </div>
      </div>
    </div>
  );
};