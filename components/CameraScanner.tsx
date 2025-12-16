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
  const containerId = "reader-custom-view";

  useEffect(() => {
    // Deteksi iOS yang lebih akurat
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    const initCamera = async () => {
      try {
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
          setCameras(devices);
          
          // Prioritas Kamera Belakang
          let backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          // Ambil yang terakhir (biasanya Main Camera di iPhone)
          if (!backCam && devices.length > 1) backCam = devices[devices.length - 1];
          
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      } catch (err) {
        alert("Gagal akses kamera.");
      }
    };
    initCamera();
    return () => { stopScanner(); };
  }, []);

  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();
    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // CONFIG RAHASIA IPHONE:
    // 1. Jangan set width/height constraint (biar auto fokus jalan)
    // 2. Gunakan 'advanced' property untuk zoom
    const videoConstraints = {
        facingMode: "environment",
        focusMode: "continuous", // Android Only
        // Trik Zoom: Mencoba meminta zoom level jika browser support
        advanced: [{ zoom: 2.0 }] 
    };

    const config = {
      fps: 30, // Wajib tinggi
      qrbox: { width: 250, height: 250 }, // Kotak standar (jangan gepeng, iPhone lebih suka kotak)
      aspectRatio: 1.0,
      disableFlip: false, // Jangan mirror
      formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128, // Paling penting untuk retail
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    try {
      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
           // Sukses Scan
           if (navigator.vibrate) navigator.vibrate(200);
           onScanSuccess(decodedText);
           stopScanner();
        },
        () => {} // Abaikan frame kosong
      );
    } catch (err) {
      console.error("Start failed", err);
      // Fallback mode jika config di atas gagal (untuk HP lama)
      try {
         await html5QrCode.start(cameraId, { fps: 15, qrbox: 200 }, (t)=>onScanSuccess(t), ()=>{});
      } catch(e) {}
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try { await scannerRef.current.stop(); scannerRef.current.clear(); } catch (e) {}
    }
  };

  useEffect(() => {
    if (selectedCameraId) startScanner(selectedCameraId);
  }, [selectedCameraId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-0 sm:p-4">
      
      {/* CSS Animasi Laser (Disuntik Langsung) */}
      <style>{`
        @keyframes scan-laser {
            0% { top: 0; opacity: 0; box-shadow: 0 0 5px red; }
            20% { opacity: 1; }
            80% { opacity: 1; }
            100% { top: 100%; opacity: 0; box-shadow: 0 0 20px red; }
        }
        .laser-line {
            position: absolute;
            width: 100%;
            height: 2px;
            background: #ef4444; /* Merah */
            box-shadow: 0 0 10px #ef4444;
            animation: scan-laser 2s infinite linear;
            left: 0;
            z-index: 20;
        }
      `}</style>

      <div className="bg-slate-900 w-full max-w-md h-full flex flex-col relative">
        <div className="p-4 bg-slate-800 flex justify-between items-center shrink-0 z-20">
          <h3 className="text-white font-bold flex items-center gap-2">
             <i className="fa-solid fa-qrcode text-blue-400"></i> Scanner
          </h3>
          <button onClick={onClose} className="bg-slate-700 text-white w-9 h-9 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
             {/* VIDEO LIBRARY */}
             <div id="reader-custom-view" className="w-full h-full object-cover"></div>
             
             {/* OVERLAY ANIMASI (MANUAL DIV) */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[260px] h-[260px] border-[3px] border-white/30 rounded-lg relative overflow-hidden">
                    {/* Laser Merah */}
                    <div className="laser-line"></div>
                    
                    {/* Sudut Penanda */}
                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-blue-500"></div>
                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-blue-500"></div>
                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-blue-500"></div>
                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-blue-500"></div>
                    
                    <p className="absolute bottom-2 w-full text-center text-white text-[10px] bg-black/40 py-1">
                        Jaga Jarak 15-20cm
                    </p>
                </div>
             </div>
        </div>

        <div className="p-5 bg-slate-800 shrink-0 z-20">
           <label className="text-slate-400 text-xs font-bold mb-2 block uppercase">Kamera:</label>
           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded outline-none border-2 border-blue-500 text-sm"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>{cam.label || `Cam ${cam.id.slice(0,4)}`}</option>
                 ))}
               </select>
               <button 
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                className="bg-blue-600 text-white px-4 rounded font-bold"
               >
                <i className="fa-solid fa-rotate"></i>
               </button>
           </div>
           {isIOS && <p className="text-[10px] text-yellow-500 mt-2 text-center">Tips iPhone: Jangan terlalu dekat (min 15cm)</p>}
        </div>
      </div>
    </div>
  );
};