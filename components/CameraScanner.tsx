import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isIOS, setIsIOS] = useState(false);
  
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view"; // ID Unik

  // 1. Init Kamera & Deteksi OS
  useEffect(() => {
    // Deteksi iPhone/iPad
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    const initCamera = async () => {
      try {
        await Html5Qrcode.getCameras(); // Minta izin
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
          setCameras(devices);
          
          // Logic pilih kamera belakang
          const backCameras = devices.filter(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          
          let cameraIdToUse = devices[0].id; 
          if (backCameras.length > 0) {
             // Ambil kamera terakhir (biasanya kamera utama pada multi-camera setup)
             const mainCam = backCameras[backCameras.length - 1]; 
             cameraIdToUse = mainCam.id;
          }
          setSelectedCameraId(cameraIdToUse);
        }
      } catch (err) {
        alert("Gagal akses kamera. Pastikan izin browser diberikan.");
      }
    };

    initCamera();
    return () => { stopScanner(); };
  }, []);

  // 2. Start Scanner
  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // CONFIG KHUSUS IOS vs ANDROID
    const config = {
      fps: 30, // High FPS
      qrbox: { width: 300, height: 200 }, // Kotak Melebar (Landscape)
      aspectRatio: 1.0,
      disableFlip: false,
      formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128, // Barcode Batang (Prioritas)
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    // Video Constraint Logic
    let videoConstraints: any = {
        facingMode: "environment", // Kamera Belakang
        focusMode: "continuous"
    };

    if (!isIOS) {
        // ANDROID: Paksa Resolusi HD agar tajam
        videoConstraints = {
            ...videoConstraints,
            width: { min: 640, ideal: 1280, max: 1920 },
            height: { min: 480, ideal: 720, max: 1080 },
        };
    } else {
        // IPHONE (X-15): JANGAN PAKSA RESOLUSI! 
        // Biarkan kosong agar iOS pakai native resolution. 
        // Memaksa resolusi di iOS sering bikin kamera nge-zoom sendiri atau blur.
    }

    try {
      await html5QrCode.start(
        cameraId, // Bisa Camera ID atau Constraints
        config,
        (decodedText) => {
           if (navigator.vibrate) navigator.vibrate(200);
           onScanSuccess(decodedText);
           stopScanner(); // Tutup setelah berhasil
        },
        () => {} // Ignore failures
      );
    } catch (err) {
      console.error("Start failed", err);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
    }
  };

  // Auto start saat kamera terpilih
  useEffect(() => {
    if (selectedCameraId) startScanner(selectedCameraId);
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0 sm:p-4">
      
      {/* Container Utama */}
      <div className="bg-slate-900 w-full max-w-md h-full sm:h-auto sm:rounded-2xl flex flex-col relative overflow-hidden">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex justify-between items-center z-20 shadow-md">
          <h3 className="text-white font-bold text-lg flex items-center">
             <i className="fa-solid fa-expand text-blue-400 mr-2"></i> 
             Scanner Pro
          </h3>
          <button onClick={onClose} className="bg-slate-700 hover:bg-slate-600 text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        {/* AREA KAMERA */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
             
             {/* Element Video Library */}
             <div id="reader-custom-view" className="w-full h-full object-cover"></div>
             
             {/* OVERLAY ANIMASI LASER (Manual Div agar pasti muncul) */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                {/* Kotak Target */}
                <div className="w-[80%] h-[200px] border-[3px] border-white/40 rounded-xl relative shadow-[0_0_100px_rgba(0,0,0,0.5)_inset]">
                    
                    {/* Sudut-sudut Penegas */}
                    <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-blue-500 -mt-1 -ml-1 rounded-tl-lg"></div>
                    <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-blue-500 -mt-1 -mr-1 rounded-tr-lg"></div>
                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-blue-500 -mb-1 -ml-1 rounded-bl-lg"></div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-blue-500 -mb-1 -mr-1 rounded-br-lg"></div>

                    {/* Laser Merah Bergerak */}
                    <div className="absolute w-full h-[2px] bg-red-500 shadow-[0_0_15px_red] animate-scan-laser top-0"></div>
                    
                    {/* Teks Instruksi */}
                    <p className="absolute -bottom-10 w-full text-center text-white text-sm font-semibold drop-shadow-md bg-black/40 py-1 rounded-full">
                        Tempatkan Barcode di sini
                    </p>
                </div>
             </div>
        </div>

        {/* Footer Controls */}
        <div className="p-5 bg-slate-800 border-t border-slate-700 z-20">
           <label className="text-slate-400 text-[10px] uppercase font-bold mb-2 block tracking-wider">
               Kamera Aktif:
           </label>
           
           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded-lg outline-none border-2 border-blue-500 text-sm shadow-lg"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>
                     {cam.label || `Camera ${cam.id}`}
                   </option>
                 ))}
               </select>

               {/* Tombol Restart Manual */}
               <button 
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 rounded-lg transition-colors border border-slate-600"
                title="Refresh Kamera"
               >
                <i className="fa-solid fa-rotate"></i>
               </button>
           </div>
           
           <div className="mt-3 flex justify-between items-center text-[10px] text-slate-500 font-mono">
              <span>{isIOS ? 'Mode: iOS Native' : 'Mode: Android HD'}</span>
              <span>FPS: 30</span>
           </div>
        </div>
      </div>
      
      {/* Style Animasi Laser */}
      <style>{`
        @keyframes scan-laser {
            0% { top: 5%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 95%; opacity: 0; }
        }
        .animate-scan-laser {
            animation: scan-laser 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
};