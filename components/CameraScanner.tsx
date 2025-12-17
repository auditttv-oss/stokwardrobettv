import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

// Helper function to detect iOS devices
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [cameraLabel, setCameraLabel] = useState<string>('Memuat kamera...');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStarted, setIsStarted] = useState<boolean>(false); // Default false untuk kontrol lebih baik
  const [qrDims, setQrDims] = useState<{ width: number; height: number }>({ width: 300, height: 150 });
  
  // Controls State
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [canTorch, setCanTorch] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);

  // Refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const hasReportedRef = useRef<boolean>(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  // 1. Hitung Dimensi Box Scanner
  const computeQrDims = () => {
    const vw = Math.min(window.innerWidth || 360, 640);
    const isPortrait = (window.innerHeight || 0) >= (window.innerWidth || 0);
    // Lebih lebar agar barcode panjang masuk
    const width = Math.min(vw * 0.85, 400); 
    const height = Math.floor(width * 0.6); 
    return { width, height };
  };

  // 2. Handle Zoom & Torch Capability
  const checkCapabilities = (track: MediaStreamTrack) => {
    trackRef.current = track;
    const caps: any = track.getCapabilities ? track.getCapabilities() : {};
    
    // Cek Torch
    if (caps.torch) {
      setCanTorch(true);
    } else {
      setCanTorch(false);
    }

    // Cek Zoom
    if (caps.zoom) {
      setZoomCap({
        min: caps.zoom.min || 1,
        max: caps.zoom.max || 5, // Batasi max zoom agar tidak pecah
        step: caps.zoom.step || 0.1
      });
      // Set default zoom agak maju sedikit (1.2x) untuk bantu fokus
      const initialZoom = Math.min(caps.zoom.max, 1.2);
      applyZoom(initialZoom, track);
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
      } catch (err) {
        console.warn("Torch error", err);
      }
    }
  };

  const applyZoom = async (value: number, trackParam?: MediaStreamTrack) => {
    const track: any = trackParam || trackRef.current;
    if (track && zoomCap) {
      try {
        await track.applyConstraints({ advanced: [{ zoom: value }] });
        setZoom(value);
      } catch (err) {
        console.warn("Zoom error", err);
      }
    }
  };

  // 3. Styling Video Element agar Fullscreen & Proper
  const tuneVideoElement = () => {
    const container = document.getElementById(containerId);
    const video = container?.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.style.objectFit = 'cover';
      video.style.width = '100%';
      video.style.height = '100%';
    }
  };

  // 4. Init Perangkat & Kamera
  useEffect(() => {
    const update = () => setQrDims(computeQrDims());
    update();
    window.addEventListener('resize', update);
    
    const initCamera = async () => {
      try {
        setIsLoading(true);
        // Minta izin dulu
        await Html5Qrcode.getCameras(); 
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
          setCameras(devices);
          
          // Logika Pemilihan Kamera yang Lebih Pintar
          let bestId = devices[0].id;
          const savedId = localStorage.getItem('scanner.cameraId');

          // Cari kamera belakang (environment)
          const backCameras = devices.filter(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('belakang') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
          );

          if (savedId && devices.find(d => d.id === savedId)) {
            bestId = savedId;
          } else if (backCameras.length > 0) {
            // Pada HP multi-kamera, kamera utama biasanya adalah back camera terakhir atau pertama tergantung brand.
            // Kita ambil yang terakhir karena seringkali index 0 itu wide/fisheye pada beberapa array.
            // Namun, paling aman biarkan user memilih, kita set default ke salah satu back.
            bestId = backCameras[backCameras.length - 1].id;
          }

          const selectedCam = devices.find(d => d.id === bestId) || devices[0];
          setSelectedCameraId(selectedCam.id);
          setCameraLabel(selectedCam.label);
          setIsStarted(true); // Auto start setelah dapat kamera
        } else {
          alert("Tidak ada kamera ditemukan.");
        }
      } catch (err) {
        console.error("Permission error", err);
        alert("Izin kamera diperlukan.");
      } finally {
        setIsLoading(false);
      }
    };

    initCamera();
    return () => { 
        if(scannerRef.current) {
            scannerRef.current.stop().catch(err => console.error(err));
        }
        window.removeEventListener('resize', update);
    };
  }, []);

  // 5. Fungsi Utama Start Scanner
  const startScanner = async (cameraId: string) => {
    if (!cameraId) return;
    
    // Stop dulu jika ada yang jalan
    if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
    }
    
    hasReportedRef.current = false;
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // Config untuk performa & fokus
    const config = {
      fps: 15, // FPS stabil, tidak perlu terlalu tinggi agar prosesor fokus ke autofocus
      qrbox: qrDims,
      aspectRatio: 1.0, // Default 1.0 agar tidak stretch
      disableFlip: false, // Kadang perlu false untuk kamera depan, tapi kita lock environment
      formatsToSupport: [
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.QR_CODE
      ],
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };

    // Constraints Kamera (Kunci perbaikan fokus)
    const constraints = {
        deviceId: { exact: cameraId },
        // Resolusi Ideal (720p). 4K seringkali membuat autofocus lambat di browser.
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
        // Paksa continuous focus jika didukung browser
        advanced: [{ focusMode: "continuous" }] 
    };

    try {
      await html5QrCode.start(
        constraints, 
        config,
        (decodedText) => {
          if (hasReportedRef.current) return;
          hasReportedRef.current = true;
          if (navigator.vibrate) navigator.vibrate(200);
          onScanSuccess(decodedText);
          stopScanner();
        },
        (errorMessage) => {
          // Ignore parse errors, scanning is ongoing
        }
      );

      // Setelah start sukses, ambil track untuk setup Torch & Zoom
      const videoEl = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (videoEl && videoEl.srcObject) {
         const stream = videoEl.srcObject as MediaStream;
         const track = stream.getVideoTracks()[0];
         if (track) checkCapabilities(track);
      }
      
      setTimeout(tuneVideoElement, 100);

    } catch (err) {
      console.error("Start failed", err);
      alert("Gagal memulai kamera. Coba pilih kamera lain atau refresh.");
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.warn(e);
      }
    }
  };

  // Trigger start saat ID kamera berubah & status started true
  useEffect(() => {
    if (isStarted && selectedCameraId) {
      startScanner(selectedCameraId);
    }
  }, [selectedCameraId, isStarted]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black">
      <div className="w-full h-full max-w-md bg-slate-900 flex flex-col relative">
        
        {/* Header */}
        <div className="h-14 px-4 bg-slate-800 flex justify-between items-center shadow-lg z-20">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <span className="text-blue-400">Scan</span> Barcode
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition">
             ✕
          </button>
        </div>

        {/* Viewport Scanner */}
        <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
            <div id="reader-custom-view" className="w-full h-full"></div>

            {/* Overlay UI */}
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                
                {/* Kotak Scanner */}
                <div 
                    style={{ width: qrDims.width, height: qrDims.height }}
                    className="relative border-2 border-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                >
                    {/* Sudut-sudut */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-lg"></div>
                    
                    {/* Laser Merah Animasi */}
                    <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></div>
                </div>

                <p className="mt-6 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    Arahkan kamera ke barcode/QR
                </p>
            </div>

            {/* Loading Indicator */}
            {isLoading && (
               <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
               </div>
            )}
        </div>

        {/* Footer Controls */}
        <div className="bg-slate-800 p-4 pb-8 z-20 border-t border-slate-700 space-y-4">
            
            {/* 1. Zoom Slider (KUNCI PERBAIKAN FOKUS) */}
            {zoomCap && (
                <div className="flex items-center gap-3 px-2">
                    <span className="text-xs text-slate-400 font-bold">1x</span>
                    <input 
                        type="range" 
                        min={zoomCap.min} 
                        max={zoomCap.max} 
                        step={zoomCap.step} 
                        value={zoom}
                        onChange={(e) => applyZoom(parseFloat(e.target.value))}
                        className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <span className="text-xs text-slate-400 font-bold">{zoomCap.max}x</span>
                </div>
            )}

            {/* 2. Camera & Torch Controls */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <select 
                        className="w-full bg-slate-700 text-white text-sm font-medium py-3 px-3 pr-8 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                        value={selectedCameraId}
                        onChange={(e) => {
                             const id = e.target.value;
                             setSelectedCameraId(id);
                             localStorage.setItem('scanner.cameraId', id);
                             // Trigger restart via useEffect
                        }}
                    >
                        {cameras.map((c, i) => (
                            <option key={c.id} value={c.id}>
                                {c.label || `Kamera ${i + 1}`}
                            </option>
                        ))}
                    </select>
                    {/* Icon Panah Dropdown */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        ▼
                    </div>
                </div>

                {canTorch && (
                    <button 
                        onClick={() => applyTorch(!torchOn)}
                        className={`w-12 flex items-center justify-center rounded-lg transition-colors ${torchOn ? 'bg-amber-500 text-white shadow-[0_0_10px_rgba(245,158,11,0.5)]' : 'bg-slate-700 text-slate-300'}`}
                    >
                        {/* Icon Petir */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </button>
                )}
            </div>
            
            <div className="text-center">
                 <p className="text-[10px] text-slate-500">
                    Jika buram, mundur sedikit dan gunakan slider Zoom.
                 </p>
            </div>
        </div>
      </div>
    </div>
  );
};