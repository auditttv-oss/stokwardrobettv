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
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
        const data = await fetchInventory();
        setInventory(data);
    } catch (error) {
        console.error("Error loading data", error);
    } finally {
        setIsLoading(false);
    }
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
    if(!confirm("Upload data baru? Data lama dengan barcode sama akan diupdate.")) return;

    setIsLoading(true);
    try {
      const data = await parseExcelFile(file);
      await uploadBulkInventory(data);
      alert(`Berhasil import ${data.length} data.`);
    } catch (error: any) {
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  // FITUR BARU: Export dengan Filter Pilihan
  const handleExport = (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (inventory.length === 0) {
        alert("Data kosong."); return;
    }

    let dataToExport = inventory;
    let fileName = "StockOpname_ALL";

    if (filterType === 'SCANNED') {
        dataToExport = inventory.filter(i => i.is_scanned);
        fileName = "StockOpname_SUDAH_SO";
    } else if (filterType === 'PENDING') {
        dataToExport = inventory.filter(i => !i.is_scanned);
        fileName = "StockOpname_BELUM_SO";
    }

    if (dataToExport.length === 0) {
        alert(`Tidak ada data untuk kategori: ${fileName.replace('StockOpname_', '')}`);
        return;
    }
    
    const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time"];
    const rows = dataToExport.map(i => {
        const safeName = i.item_name ? i.item_name.replace(/"/g, '""') : "";
        const scanTime = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleString() : "-";
        return `${i.barcode},"${safeName}",${i.status},${i.color},${i.brand},${i.price},${i.type},${i.is_scanned ? 'YES' : 'NO'},${scanTime}`;
    });

    const csvContent = headers.concat(rows).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${fileName}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode || isProcessing) return;
    setIsProcessing(true);
    const searchCode = barcode.trim();
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

  const handleResetScan = async () => {
      if(confirm("Reset status SCAN semua item menjadi 0?")) {
          setIsLoading(true); await resetInventoryStatus(); setIsLoading(false);
      }
  }

  const handleClearAll = async () => {
      if(confirm("HAPUS SEMUA DATA MASTER?")) {
          setIsLoading(true); await clearAllData(); setIsLoading(false);
      }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white shadow-sm z-20 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-2 rounded-lg"><i className="fa-solid fa-cloud"></i></div>
            <h1 className="text-lg font-bold text-slate-800 hidden sm:block">SO Cloud Pro</h1>
            <h1 className="text-lg font-bold text-slate-800 sm:hidden">SO Cloud</h1>
          </div>

          <div className="flex items-center gap-2">
             <label className={`cursor-pointer ${isLoading ? 'bg-slate-400' : 'bg-blue-600 active:bg-blue-800'} text-white p-2 sm:py-2 sm:px-4 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2`}>
                <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
                <span className="hidden sm:inline">Upload</span>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              
              <div className="dropdown relative group">
                  <button className="bg-slate-100 p-2 rounded-lg text-slate-600 hover:bg-slate-200 active:bg-slate-300">
                    <i className="fa-solid fa-bars text-lg"></i>
                  </button>
                  {/* Menu Dropdown dengan 3 Pilihan Download */}
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block p-2 z-50">
                      <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Download Report</div>
                      <button onClick={() => handleExport('SCANNED')} className="w-full text-left p-2 hover:bg-green-50 text-sm rounded text-green-700 font-semibold mb-1"><i className="fa-solid fa-check mr-2"></i> Report SUDAH SO</button>
                      <button onClick={() => handleExport('PENDING')} className="w-full text-left p-2 hover:bg-orange-50 text-sm rounded text-orange-600 font-semibold mb-1"><i className="fa-solid fa-clock mr-2"></i> Report BELUM SO</button>
                      <button onClick={() => handleExport('ALL')} className="w-full text-left p-2 hover:bg-blue-50 text-sm rounded text-slate-600 border-b mb-1"><i className="fa-solid fa-list mr-2"></i> Semua Data</button>
                      
                      <div className="h-2"></div>
                      <button onClick={() => window.location.reload()} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded text-slate-500"><i className="fa-solid fa-sync mr-2"></i> Refresh App</button>
                      <button onClick={handleResetScan} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded text-slate-500"><i className="fa-solid fa-undo mr-2"></i> Reset Scan</button>
                      <button onClick={handleClearAll} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded text-red-600 font-bold bg-red-50 mt-1"><i className="fa-solid fa-trash mr-2"></i> Hapus Semua</button>
                  </div>
              </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-6 flex flex-col lg:flex-row gap-4 sm:gap-6 overflow-hidden lg:h-[calc(100vh-64px)]">
        <div className="w-full lg:w-5/12 flex flex-col shrink-0">
          <DashboardStats total={inventory.length} scanned={inventory.filter(i => i.is_scanned).length} />
          <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-col gap-3">
             <ScannerInput onScan={handleScan} lastResult={lastScanFeedback.status} isProcessing={isProcessing} />
             <button onClick={() => setShowCamera(true)} className="w-full py-3 bg-indigo-600 active:bg-indigo-800 text-white rounded-xl shadow-md font-bold flex justify-center gap-2 items-center text-lg">
                <i className="fa-solid fa-camera"></i> SCAN KAMERA
             </button>
          </div>
          <FeedbackDisplay feedback={lastScanFeedback} />
        </div>
        <div className="w-full lg:w-7/12 flex flex-col h-[500px] lg:h-full overflow-hidden pb-10 sm:pb-0">
          <InventoryTable items={inventory} />
        </div>
      </main>

      {showCamera && <CameraScanner onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default App;