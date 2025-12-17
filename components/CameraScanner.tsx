import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface CameraScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onClose: () => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({ onScanSuccess, onClose }) => {
  // State
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  
  // Status State
  const [hasPermission, setHasPermission] = useState<boolean | null>(null); // null = checking
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // Features
  const [zoom, setZoom] = useState<number>(1);
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number; step: number } | null>(null);
  const [canTorch, setCanTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "reader-custom-view";
  const isMounted = useRef(true);

  // 1. Cleanup saat close
  useEffect(() => {
    isMounted.current = true;
    
    // Coba Auto Start saat pertama buka
    initCamera(true);

    return () => {
      isMounted.current = false;
      stopScanner();
    };
  }, []);

  const stopScanner = async () => {
     if (scannerRef.current) {
         try {
             if (scannerRef.current.isScanning) {
                 await scannerRef.current.stop();
             }
             scannerRef.current.clear();
         } catch (e) { console.warn(e); }
     }
  };

  // 2. Fungsi Utama: Init Kamera (Bisa dipanggil otomatis atau manual via tombol)
  const initCamera = async (isAuto: boolean) => {
    setErrorMsg('');
    try {
        // Cek dulu apakah browser support
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
             throw new Error("Browser tidak mendukung akses kamera.");
        }

        // Trigger Permission
        await Html5Qrcode.getCameras();
        const devices = await Html5Qrcode.getCameras();

        if (devices && devices.length > 0) {
            setHasPermission(true);
            setCameras(devices);
            
            // Logic Pilih Kamera Belakang
            const backCam = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('rear') || 
                d.label.toLowerCase().includes('environment')
            );
            const targetId = backCam ? backCam.id : devices[devices.length - 1].id;
            
            setSelectedCameraId(targetId);
            // Lanjut start scanning
            startScannerProcess(targetId);
        } else {
            setErrorMsg("Kamera tidak ditemukan.");
            setHasPermission(false);
        }
    } catch (err: any) {
        console.error("Init Error:", err);
        // Jika Auto start gagal, set permission false agar muncul tombol manual
        if (isAuto) {
            setHasPermission(false); 
        } else {
            // Jika sudah manual masih gagal, kasih pesan detail
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setErrorMsg("Izin kamera ditolak browser. Reset izin di pengaturan situs (ikon gembok di URL).");
            } else {
                setErrorMsg(`Gagal: ${err.message}`);
            }
        }
    }
  };

  const startScannerProcess = async (cameraId: string) => {
      await stopScanner();
      
      if (!isMounted.current) return;

      const html5QrCode = new Html5Qrcode(containerId);
      scannerRef.current = html5QrCode;

      try {
          await html5QrCode.start(
              cameraId,
              {
                  fps: 15,
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
                  if (navigator.vibrate) navigator.vibrate(200);
                  onScanSuccess(decodedText);
                  onClose();
              },
              () => {}
          );
          
          setIsScanning(true);
          setTimeout(setupHardware, 500); // Setup Zoom setelah start

      } catch (e) {
          console.error("Start Scanner Fail:", e);
          setErrorMsg("Gagal memulai stream kamera.");
          setIsScanning(false);
      }
  };

  const setupHardware = () => {
      const video = document.querySelector(`#${containerId} video`) as HTMLVideoElement;
      if (!video || !video.srcObject) return;

      video.style.objectFit = "cover";
      const track = (video.srcObject as MediaStream).getVideoTracks()[0];
      const caps: any = track.getCapabilities ? track.getCapabilities() : {};

      if (caps.zoom) {
          setZoomCap({
              min: caps.zoom.min || 1,
              max: Math.min(caps.zoom.max || 5, 5),
              step: caps.zoom.step || 0.1
          });
          track.applyConstraints({ advanced: [{ zoom: 1.2 }] }).catch(()=>{});
      }
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <div className="bg-slate-900 p-4 flex justify-between items-center shadow-md shrink-0">
          <h3 className="font-bold flex items-center gap-2 text-lg">
             <i className="fa-solid fa-qrcode text-blue-500"></i> Scanner
          </h3>
          <button onClick={onClose} className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
             <i className="fa-solid fa-xmark"></i>
          </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
          
          {/* Skenario 1: Kamera Aktif */}
          <div id="reader-custom-view" className="w-full h-full bg-black"></div>

          {/* Skenario 2: Belum Ada Izin / Error (TOMBOL MANUAL) */}
          {(!isScanning || errorMsg) && (
              <div className="absolute inset-0 z-20 bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
                  
                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6">
                      <i className={`fa-solid ${errorMsg ? 'fa-triangle-exclamation text-red-500' : 'fa-camera text-blue-500'} text-3xl`}></i>
                  </div>

                  <h2 className="text-xl font-bold mb-2">
                      {errorMsg ? "Kendala Akses" : "Akses Kamera"}
                  </h2>
                  
                  <p className="text-slate-400 mb-8 max-w-xs">
                      {errorMsg || "Browser membutuhkan izin Anda untuk menyalakan kamera."}
                  </p>

                  {/* TOMBOL INI ADALAH SOLUSINYA: User Gesture */}
                  <button 
                      onClick={() => initCamera(false)} 
                      className="bg-blue-600 active:bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg flex items-center gap-3 transition-transform active:scale-95"
                  >
                      <i className="fa-solid fa-power-off"></i>
                      {errorMsg ? "Coba Lagi Manual" : "Nyalakan Kamera"}
                  </button>

                  {errorMsg && (
                      <div className="mt-8 text-xs text-slate-500 border border-slate-700 p-3 rounded bg-slate-800/50">
                          Tips: Jika tombol macet, klik ikon gembok 🔒 di samping URL website, pilih "Reset Permission" atau "Izinkan Kamera".
                      </div>
                  )}
              </div>
          )}

          {/* Overlay Garis (Hanya saat scanning aktif) */}
          {isScanning && !errorMsg && (
             <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center z-10">
                <div className="w-64 h-64 border-2 border-green-500 rounded-lg relative shadow-[0_0_100vmax_rgba(0,0,0,0.6)]">
                    <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 animate-pulse shadow-[0_0_8px_red]"></div>
                </div>
                <div className="mt-8 bg-black/60 px-4 py-1 rounded-full backdrop-blur-sm">
                    <p className="text-white text-xs font-medium">Gunakan Zoom Slider dibawah</p>
                </div>
             </div>
          )}
      </div>

      {/* Footer Controls */}
      {isScanning && !errorMsg && (
          <div className="bg-slate-900 p-5 border-t border-slate-800 flex flex-col gap-4 shrink-0">
             
             {/* Zoom Slider */}
             {zoomCap && (
                 <div className="px-1">
                     <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase mb-1">
                         <span>Mundur</span>
                         <span>Zoom {zoom.toFixed(1)}x</span>
                         <span>Dekat</span>
                     </div>
                     <input type="range" min={zoomCap.min} max={zoomCap.max} step={zoomCap.step} value={zoom} onChange={(e) => applyZoom(parseFloat(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
                 </div>
             )}

             <div className="flex gap-3">
                 <select 
                    className="flex-1 bg-slate-800 text-white border border-slate-600 rounded-lg p-3 text-sm font-bold outline-none"
                    value={selectedCameraId}
                    onChange={(e) => { setSelectedCameraId(e.target.value); startScannerProcess(e.target.value); }}
                 >
                    {cameras.map((c, i) => (
                        <option key={c.id} value={c.id}>{c.label || `Kamera ${i+1}`}</option>
                    ))}
                 </select>

                 {canTorch && (
                     <button onClick={toggleTorch} className={`w-12 rounded-lg flex items-center justify-center text-xl border ${torchOn ? 'bg-amber-400 border-amber-400 text-black' : 'bg-slate-800 border-slate-600 text-slate-400'}`}>
                        <i className="fa-solid fa-bolt"></i>
                     </button>
                 )}
             </div>
          </div>
      )}
    </div>
  );
};