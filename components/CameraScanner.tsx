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
    // Deteksi iOS (iPhone/iPad)
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(iOS);

    const initCamera = async () => {
      try {
        // Minta izin kamera
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();
        
        if (devices && devices.length) {
          setCameras(devices);
          
          // Cari kamera belakang
          // Di iPhone, biasanya kamera belakang ada di akhir list atau berlabel 'Back'
          let backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          
          // Jika tidak ketemu yang ada label 'back', ambil yang terakhir (biasanya main camera)
          if (!backCam && devices.length > 1) {
              backCam = devices[devices.length - 1];
          }

          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      } catch (err) {
        alert("Gagal akses kamera. Periksa izin browser.");
      }
    };

    initCamera();
    return () => { stopScanner(); };
  }, []);

  const startScanner = async (cameraId: string) => {
    if (scannerRef.current) await stopScanner();
    
    // Hapus element lama jika ada agar bersih
    const oldEl = document.getElementById(containerId);
    if(oldEl) oldEl.innerHTML = "";

    const html5QrCode = new Html5Qrcode(containerId);
    scannerRef.current = html5QrCode;

    // CONFIG KHUSUS IOS
    // iPhone tidak suka resolusi dipaksa. Biarkan undefined.
    const videoConstraints = isIOS ? {
        facingMode: "environment" // Cukup ini saja untuk iOS
    } : {
        facingMode: "environment",
        focusMode: "continuous",
        width: { min: 640, ideal: 1280, max: 1920 }, // Android butuh ini biar tajam
        height: { min: 480, ideal: 720, max: 1080 }
    };

    const config = {
      fps: 30,
      qrbox: { width: 280, height: 200 }, // Kotak scan standar
      aspectRatio: 1.0,
      formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
      ]
    };

    try {
      await html5QrCode.start(
        cameraId,
        config,
        (decodedText) => {
           // Sukses
           onScanSuccess(decodedText);
           stopScanner();
        },
        () => {} // Abaikan error scan frame
      );
    } catch (err) {
      console.error("Start failed", err);
      // Jika gagal start (biasanya karena constraint resolusi di HP jadul), coba mode basic
      if (!isIOS) {
          // Fallback tanpa constraint resolusi
          try {
             await html5QrCode.start(cameraId, { fps: 20, qrbox: 250 }, (t)=>onScanSuccess(t), ()=>{});
          } catch(e) {}
      }
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
      <div className="bg-slate-900 w-full max-w-md h-full flex flex-col relative">
        
        {/* Header */}
        <div className="p-4 bg-slate-800 flex justify-between items-center shrink-0 z-20">
          <h3 className="text-white font-bold flex items-center gap-2">
             <i className="fa-solid fa-qrcode text-blue-400"></i> Scanner
          </h3>
          <button onClick={onClose} className="bg-slate-700 text-white w-9 h-9 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Camera View */}
        <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
             <div id="reader-custom-view" className="w-full h-full"></div>
             
             {/* Overlay Laser Merah */}
             <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                <div className="w-[80%] h-[200px] border-2 border-white/50 rounded-lg relative box-border">
                    <div className="absolute w-full h-[2px] bg-red-500 shadow-[0_0_10px_red] top-1/2 animate-pulse"></div>
                    <p className="absolute -bottom-8 w-full text-center text-white text-xs font-bold bg-black/50 py-1 rounded">
                        Arahkan Barcode ke Sini
                    </p>
                </div>
             </div>
        </div>

        {/* Controls */}
        <div className="p-5 bg-slate-800 shrink-0 z-20">
           <label className="text-slate-400 text-xs font-bold mb-2 block uppercase">Pilih Kamera:</label>
           <div className="flex gap-2">
               <select 
                 className="flex-1 bg-white text-slate-900 font-bold p-3 rounded outline-none border-2 border-blue-500 text-sm"
                 value={selectedCameraId}
                 onChange={(e) => setSelectedCameraId(e.target.value)}
               >
                 {cameras.map((cam) => (
                   <option key={cam.id} value={cam.id}>{cam.label || `Camera ${cam.id.slice(0,5)}`}</option>
                 ))}
               </select>
               <button 
                onClick={() => { stopScanner().then(() => startScanner(selectedCameraId)); }}
                className="bg-blue-600 text-white px-4 rounded font-bold"
               >
                <i className="fa-solid fa-rotate"></i>
               </button>
           </div>
           {isIOS && <p className="text-[10px] text-yellow-500 mt-2 text-center">Mode iPhone (iOS) Aktif</p>}
        </div>
      </div>
    </div>
  );
};