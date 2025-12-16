import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import { 
  getInventoryStats, getItemByBarcode, markItemAsScanned, 
  fetchRecentInventory, uploadBulkInventory, clearAllData, 
  fetchAllForExport 
} from './services/inventoryService';
import { parseExcelFile } from './services/excelService';
import { InventoryItem, ScanFeedback } from './types';
import { ScannerInput } from './components/ScannerInput';
import { DashboardStats } from './components/DashboardStats';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { InventoryTable } from './components/InventoryTable';
import { CameraScanner } from './components/CameraScanner';

const App: React.FC = () => {
  const [tableData, setTableData] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({ total: 0, scanned: 0 });
  
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ status: 'IDLE', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // --- AUDIO HELPER (Nada Keras & Jelas) ---
  const playSound = (type: 'SUCCESS' | 'ERROR' | 'DUPLICATE') => {
    let url = '';
    if (type === 'SUCCESS') url = 'https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.m4a'; // Beep Keras
    if (type === 'ERROR') url = 'https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.m4a'; // Buzzer Error
    if (type === 'DUPLICATE') url = 'https://assets.mixkit.co/active_storage/sfx/950/950-preview.m4a'; // Alert Warning

    const audio = new Audio(url);
    audio.volume = 1.0; // Volume Maksimal
    audio.play().catch(e => console.log("Audio block:", e));
  };

  const refreshData = async () => {
    try {
        const [statData, recentData] = await Promise.all([
            getInventoryStats(),
            fetchRecentInventory()
        ]);
        setStats(statData);
        setTableData(recentData);
    } catch (e) { console.error("Sync Error", e); }
  };

  useEffect(() => {
    refreshData();
    const channel = supabase.channel('global-inventory-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
           refreshData(); 
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if(!confirm("Upload Data Stok?")) return;

    setIsLoading(true);
    setUploadProgress(0);

    try {
      const data = await parseExcelFile(file);
      await uploadBulkInventory(data, (pct) => setUploadProgress(pct));
      alert(`SUKSES! Data masuk.`);
      window.location.reload();
    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  const handleExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (stats.total === 0) { alert("Data Kosong."); return; }
    const btnText = document.getElementById('export-btn-text');
    if(btnText) btnText.innerText = "Processing...";
    try {
        const data = await fetchAllForExport(filterType);
        if (data.length === 0) { alert("Data Nihil."); return; }
        const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time"];
        const rows = data.map(i => {
            const safeName = i.item_name ? i.item_name.replace(/"/g, '""') : "";
            const scanTime = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleString() : "-";
            return `${i.barcode},"${safeName}",${i.status},${i.color},${i.brand},${Number(i.price).toFixed(0)},${i.type},${i.is_scanned ? 'YES' : 'NO'},${scanTime}`;
        });
        const csvContent = headers.concat(rows).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); link.href = url; 
        link.setAttribute("download", `SO_${filterType}_${Date.now()}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch(e) { alert("Error export."); }
    finally { if(btnText) btnText.innerText = "DOWNLOAD REPORT"; }
  };

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode || isProcessing) return;
    setIsProcessing(true);
    const searchCode = barcode.trim();

    try {
        const item = await getItemByBarcode(searchCode);
        
        if (!item) {
            playSound('ERROR');
            setLastScanFeedback({ status: 'NOT_FOUND', message: 'ITEM TIDAK ADA' });
        } else if (item.is_scanned) {
            playSound('DUPLICATE');
            setLastScanFeedback({ status: 'DUPLICATE', message: 'SUDAH DI SCAN', item });
        } else {
            // SUKSES
            const scannedItem = await markItemAsScanned(searchCode);
            playSound('SUCCESS'); // Bunyi Dulu
            setLastScanFeedback({ status: 'FOUND', message: scannedItem.type || 'BERHASIL', item: scannedItem });
        }
    } catch (error) {
        playSound('ERROR');
        setLastScanFeedback({ status: 'NOT_FOUND', message: 'ERROR SERVER' });
    } finally {
        setIsProcessing(false);
    }
  }, [isProcessing]);

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden">
      {isLoading && (
          <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-white p-6">
              <h2 className="text-2xl font-bold mb-4">Uploading...</h2>
              <div className="w-64 bg-slate-700 rounded-full h-6 overflow-hidden">
                  <div className="bg-green-500 h-full transition-all" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <p className="mt-2 font-mono">{uploadProgress}%</p>
          </div>
      )}

      <header className="bg-white shadow-sm z-30 shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg"><i className="fa-solid fa-cloud"></i></div>
            <h1 className="text-base font-bold text-slate-800">SO Pro</h1>
          </div>
          <div className="flex items-center gap-2">
             <label className="cursor-pointer bg-blue-600 text-white p-2 rounded-lg text-sm flex items-center gap-2">
                <i className="fa-solid fa-upload"></i>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              <div className="dropdown relative group">
                  <button className="bg-slate-100 p-2 rounded-lg text-slate-600"><i className="fa-solid fa-bars text-lg"></i></button>
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block p-2 z-50">
                      <div className="px-3 py-2 text-xs font-bold text-slate-400" id="export-btn-text">DOWNLOAD REPORT</div>
                      <button onClick={() => handleExport('SCANNED')} className="w-full text-left p-2 hover:bg-green-50 text-xs text-green-700 font-bold"><i className="fa-solid fa-check mr-2"></i> SUDAH SO</button>
                      <button onClick={() => handleExport('PENDING')} className="w-full text-left p-2 hover:bg-orange-50 text-xs text-orange-600 font-bold"><i className="fa-solid fa-clock mr-2"></i> BELUM SO</button>
                      <button onClick={() => handleExport('ALL')} className="w-full text-left p-2 hover:bg-blue-50 text-xs text-slate-600 border-b"><i className="fa-solid fa-list mr-2"></i> SEMUA DATA</button>
                      <button onClick={async () => { if(confirm("HAPUS SEMUA DATA?")) { setIsLoading(true); await clearAllData(); window.location.reload(); } }} className="w-full text-left p-2 hover:bg-red-50 text-xs text-red-600 font-bold mt-1"><i className="fa-solid fa-trash mr-2"></i> HAPUS DATA</button>
                  </div>
              </div>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-3 lg:p-6">
        <div className="w-full lg:w-5/12 flex flex-col shrink-0">
          <DashboardStats total={stats.total} scanned={stats.scanned} />
          <FeedbackDisplay feedback={lastScanFeedback} />
          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
             <ScannerInput onScan={handleScan} lastResult={lastScanFeedback.status} isProcessing={isProcessing} />
             <button onClick={() => setShowCamera(true)} className="w-full py-4 bg-indigo-600 active:bg-indigo-800 text-white rounded-xl shadow-md font-bold flex justify-center gap-2 items-center text-lg animate-pulse">
                <i className="fa-solid fa-camera text-2xl"></i> SCAN BARCODE
             </button>
          </div>
        </div>
        
        <div className="w-full lg:w-7/12 flex flex-col shrink-0 h-[400px] lg:h-full pb-10">
          <InventoryTable items={tableData} />
        </div>
      </main>

      {showCamera && <CameraScanner onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default App;