import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import { fetchInventory, markItemAsScanned, uploadBulkInventory, clearAllData, resetInventoryStatus } from './services/inventoryService';
import { parseExcelFile } from './services/excelService';
import { InventoryItem, ScanFeedback } from './types';
import { ScannerInput } from './components/ScannerInput';
import { DashboardStats } from './components/DashboardStats';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { InventoryTable } from './components/InventoryTable';
import { CameraScanner } from './components/CameraScanner';

const App: React.FC = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ status: 'IDLE', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // State Progress
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const loadData = async () => {
    // Load silent agar tidak mengganggu UX
    try {
        const data = await fetchInventory();
        setInventory(data);
    } catch (error) { console.error("Error loading data", error); }
  };

  useEffect(() => {
    loadData();
    // Realtime listener
    const channel = supabase.channel('inventory-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, (payload) => {
           if (payload.eventType === 'INSERT') setInventory(prev => [payload.new as InventoryItem, ...prev]);
           else if (payload.eventType === 'UPDATE') setInventory(prev => prev.map(item => item.id === payload.new.id ? { ...item, ...payload.new } : item));
           else if (payload.eventType === 'DELETE') setInventory(prev => prev.filter(item => item.id !== payload.old.id));
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if(!confirm("Upload 25.000+ data mungkin butuh 1-2 menit. JANGAN TUTUP BROWSER. Lanjut?")) return;

    setIsLoading(true);
    setUploadProgress(0); // Reset progress

    try {
      const data = await parseExcelFile(file);
      console.log(`Parsed ${data.length} items.`);
      
      // Pass callback progress bar
      await uploadBulkInventory(data, (percent) => {
          setUploadProgress(percent);
      });

      alert(`SUKSES! ${data.length} Data berhasil disimpan.`);
      window.location.reload(); // Reload agar data fresh tampil
    } catch (error: any) {
      alert(`GAGAL: ${error.message}`);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  const handleExport = (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (inventory.length === 0) { alert("Data Kosong / Belum termuat."); return; }
    let dataToExport = inventory;
    let fileName = "SO_ALL";
    if (filterType === 'SCANNED') { dataToExport = inventory.filter(i => i.is_scanned); fileName = "SO_SUDAH"; } 
    else if (filterType === 'PENDING') { dataToExport = inventory.filter(i => !i.is_scanned); fileName = "SO_BELUM"; }

    const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time"];
    const rows = dataToExport.map(i => {
        const safeName = i.item_name ? i.item_name.replace(/"/g, '""') : "";
        const scanTime = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleString() : "-";
        return `${i.barcode},"${safeName}",${i.status},${i.color},${i.brand},${Number(i.price).toFixed(0)},${i.type},${i.is_scanned ? 'YES' : 'NO'},${scanTime}`;
    });

    const csvContent = headers.concat(rows).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.setAttribute("download", `${fileName}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode || isProcessing) return;
    setIsProcessing(true);
    const searchCode = barcode.trim();
    // Cari di local inventory dulu
    const localItem = inventory.find(i => i.barcode === searchCode);

    if (!localItem) { 
        setLastScanFeedback({ status: 'NOT_FOUND', message: 'Nihil' }); 
        setIsProcessing(false); return; 
    }
    if (localItem.is_scanned) { 
        setLastScanFeedback({ status: 'DUPLICATE', message: 'SUDAH SCAN', item: localItem }); 
        setIsProcessing(false); return; 
    }

    try {
        const updatedItem = await markItemAsScanned(searchCode);
        if (updatedItem) setLastScanFeedback({ status: 'FOUND', message: updatedItem.type, item: updatedItem });
    } catch (error) { setLastScanFeedback({ status: 'NOT_FOUND', message: 'Error' }); } 
    finally { setIsProcessing(false); }
  }, [inventory, isProcessing]);

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* OVERLAY LOADING BAR saat Upload Besar */}
      {isLoading && (
          <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center text-white p-6">
              <i className="fa-solid fa-cloud-arrow-up text-5xl mb-4 animate-bounce"></i>
              <h2 className="text-2xl font-bold mb-2">Mengupload Data...</h2>
              <div className="w-full max-w-md bg-slate-700 rounded-full h-6 overflow-hidden border border-slate-500">
                  <div 
                    className="bg-green-500 h-full transition-all duration-300 flex items-center justify-center text-xs font-bold" 
                    style={{ width: `${uploadProgress}%` }}
                  >
                    {uploadProgress}%
                  </div>
              </div>
              <p className="mt-4 text-slate-300 text-center animate-pulse">
                Mohon tunggu. Jangan tutup browser.<br/>Sedang memproses 25.000+ data.
              </p>
          </div>
      )}

      <header className="bg-white shadow-sm z-30 shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg"><i className="fa-solid fa-cloud"></i></div>
            <h1 className="text-base font-bold text-slate-800">SO Cloud</h1>
          </div>
          <div className="flex items-center gap-2">
             <label className="cursor-pointer bg-blue-600 text-white p-2 rounded-lg text-sm flex items-center gap-2">
                <i className="fa-solid fa-upload"></i>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              <div className="dropdown relative group">
                  <button className="bg-slate-100 p-2 rounded-lg text-slate-600"><i className="fa-solid fa-bars text-lg"></i></button>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block p-2 z-50">
                      <div className="px-3 py-2 text-xs font-bold text-slate-400">DOWNLOAD</div>
                      <button onClick={() => handleExport('SCANNED')} className="w-full text-left p-2 hover:bg-green-50 text-xs text-green-700 font-bold"><i className="fa-solid fa-check mr-2"></i> DATA SUDAH SO</button>
                      <button onClick={() => handleExport('PENDING')} className="w-full text-left p-2 hover:bg-orange-50 text-xs text-orange-600 font-bold"><i className="fa-solid fa-clock mr-2"></i> DATA BELUM SO</button>
                      <button onClick={() => handleExport('ALL')} className="w-full text-left p-2 hover:bg-blue-50 text-xs text-slate-600 border-b"><i className="fa-solid fa-list mr-2"></i> SEMUA DATA</button>
                      <button onClick={() => window.location.reload()} className="w-full text-left p-2 hover:bg-slate-50 text-xs mt-1"><i className="fa-solid fa-sync mr-2"></i> REFRESH</button>
                      <button onClick={async () => { if(confirm("HAPUS SEMUA?")) { setIsLoading(true); await clearAllData(); setIsLoading(false); } }} className="w-full text-left p-2 hover:bg-red-50 text-xs text-red-600 font-bold"><i className="fa-solid fa-trash mr-2"></i> HAPUS DATA</button>
                  </div>
              </div>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-3 lg:p-6">
        <div className="w-full lg:w-5/12 flex flex-col shrink-0">
          <DashboardStats total={inventory.length} scanned={inventory.filter(i => i.is_scanned).length} />
          <FeedbackDisplay feedback={lastScanFeedback} />
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
             <ScannerInput onScan={handleScan} lastResult={lastScanFeedback.status} isProcessing={isProcessing} />
             <button onClick={() => setShowCamera(true)} className="w-full py-3 bg-indigo-600 active:bg-indigo-800 text-white rounded-xl shadow-md font-bold flex justify-center gap-2 items-center text-base">
                <i className="fa-solid fa-camera"></i> SCAN KAMERA
             </button>
          </div>
        </div>
        <div className="w-full lg:w-7/12 flex flex-col shrink-0 h-[400px] lg:h-full pb-10">
          <InventoryTable items={inventory} />
        </div>
      </main>
      {showCamera && <CameraScanner onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default App;