// ... (Import bagian atas TETAP SAMA seperti sebelumnya)
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
  // ... (Bagian Logic State & Function TETAP SAMA, copy dari file App.tsx sebelumnya)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ status: 'IDLE', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // Load initial data
  const loadData = async () => {
    setIsLoading(true);
    try {
        const data = await fetchInventory();
        setInventory(data);
    } catch (error) { console.error("Error", error); } finally { setIsLoading(false); }
  };

  useEffect(() => {
    loadData();
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
    if(!confirm("Upload data?")) return;
    setIsLoading(true);
    try {
      const data = await parseExcelFile(file);
      await uploadBulkInventory(data);
      alert(`Import Berhasil!`);
    } catch (error: any) { alert(`Gagal: ${error.message}`); } 
    finally { setIsLoading(false); event.target.value = ''; }
  };

  const handleExport = (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (inventory.length === 0) { alert("Kosong."); return; }
    let dataToExport = inventory;
    let fileName = "StockOpname_ALL";
    if (filterType === 'SCANNED') { dataToExport = inventory.filter(i => i.is_scanned); fileName = "SO_SUDAH"; } 
    else if (filterType === 'PENDING') { dataToExport = inventory.filter(i => !i.is_scanned); fileName = "SO_BELUM"; }
    
    const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time"];
    const rows = dataToExport.map(i => `${i.barcode},"${i.item_name?.replace(/"/g, '""')}",${i.status},${i.color},${i.brand},${i.price},${i.type},${i.is_scanned ? 'YES' : 'NO'},${i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleString() : "-"}`);
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
    const localItem = inventory.find(i => i.barcode === searchCode);

    if (!localItem) { setLastScanFeedback({ status: 'NOT_FOUND', message: 'Nihil' }); setIsProcessing(false); return; }
    if (localItem.is_scanned) { setLastScanFeedback({ status: 'DUPLICATE', message: 'SUDAH SCAN', item: localItem }); setIsProcessing(false); return; }

    try {
        const updatedItem = await markItemAsScanned(searchCode);
        if (updatedItem) setLastScanFeedback({ status: 'FOUND', message: updatedItem.type, item: updatedItem });
    } catch (error) { setLastScanFeedback({ status: 'NOT_FOUND', message: 'Error' }); } 
    finally { setIsProcessing(false); }
  }, [inventory, isProcessing]);

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* Navbar Fixed */}
      <header className="bg-white shadow-sm z-30 shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-1.5 rounded-lg"><i className="fa-solid fa-cloud"></i></div>
            <h1 className="text-base font-bold text-slate-800">SO Cloud</h1>
          </div>
          <div className="flex items-center gap-2">
             <label className="cursor-pointer bg-blue-600 text-white p-2 rounded-lg text-sm flex items-center gap-2">
                <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
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

      {/* Main Content: SCROLLABLE AREA */}
      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-3 lg:p-6">
        
        {/* Bagian Scanner */}
        <div className="w-full lg:w-5/12 flex flex-col shrink-0">
          {/* Dashboard Stats sekarang Grid 2x2 jadi lebih pendek */}
          <DashboardStats total={inventory.length} scanned={inventory.filter(i => i.is_scanned).length} />
          
          {/* Feedback Display ditaruh DI ATAS Scanner Input agar langsung terlihat mata */}
          <FeedbackDisplay feedback={lastScanFeedback} />

          <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
             <ScannerInput onScan={handleScan} lastResult={lastScanFeedback.status} isProcessing={isProcessing} />
             <button onClick={() => setShowCamera(true)} className="w-full py-3 bg-indigo-600 active:bg-indigo-800 text-white rounded-xl shadow-md font-bold flex justify-center gap-2 items-center text-base">
                <i className="fa-solid fa-camera"></i> SCAN KAMERA
             </button>
          </div>
        </div>

        {/* Bagian Tabel */}
        <div className="w-full lg:w-7/12 flex flex-col shrink-0 h-[400px] lg:h-full pb-10">
          <InventoryTable items={inventory} />
        </div>

      </main>

      {showCamera && <CameraScanner onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default App;