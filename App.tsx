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

  // Load initial data
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

  // Real-time Subscription Setup
  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('inventory-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
           if (payload.eventType === 'INSERT') {
              setInventory(prev => [payload.new as InventoryItem, ...prev]);
           } else if (payload.eventType === 'UPDATE') {
              setInventory(prev => prev.map(item => 
                  item.id === payload.new.id ? { ...item, ...payload.new } : item
              ));
           } else if (payload.eventType === 'DELETE') {
              setInventory(prev => prev.filter(item => item.id !== payload.old.id));
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if(!confirm("Upload data akan menggabungkan/memperbarui data berdasarkan Barcode. Lanjutkan?")) return;

    setIsLoading(true);
    try {
      const data = await parseExcelFile(file);
      await uploadBulkInventory(data);
      alert(`Import Berhasil! ${data.length} data diproses.`);
    } catch (error: any) {
      console.error("Import failed:", error);
      alert(`Gagal: ${error.message}`);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  // Logic Download CSV (Ditambahkan Kembali)
  const handleExport = () => {
    if (inventory.length === 0) {
        alert("Tidak ada data untuk didownload.");
        return;
    }
    
    // Header CSV
    const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time"];
    
    // Isi CSV
    const rows = inventory.map(i => {
        // Escape tanda kutip jika ada di nama barang
        const safeName = i.item_name ? i.item_name.replace(/"/g, '""') : "";
        const scanTime = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleString() : "";
        return `${i.barcode},"${safeName}",${i.status},${i.color},${i.brand},${i.price},${i.type},${i.is_scanned ? 'YES' : 'NO'},${scanTime}`;
    });

    const csvContent = headers.concat(rows).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `StockOpname_${Date.now()}.csv`);
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
        setLastScanFeedback({ status: 'NOT_FOUND', message: 'Tidak Ditemukan' });
        setIsProcessing(false);
        return;
    }

    if (localItem.is_scanned) {
        setLastScanFeedback({ status: 'DUPLICATE', message: 'Sudah di Scan', item: localItem });
        setIsProcessing(false);
        return;
    }

    try {
        const updatedItem = await markItemAsScanned(searchCode);
        if (updatedItem) {
            setLastScanFeedback({ 
                status: 'FOUND', 
                message: updatedItem.type, 
                item: updatedItem 
            });
        }
    } catch (error) {
        console.error("Scan error", error);
        setLastScanFeedback({ status: 'NOT_FOUND', message: 'Error Koneksi' });
    } finally {
        setIsProcessing(false);
    }
  }, [inventory, isProcessing]);

  // Handle Action Buttons
  const handleResetScan = async () => {
      if(confirm("Reset status SCAN semua item menjadi 0? Data master tetap ada.")) {
          setIsLoading(true);
          await resetInventoryStatus();
          setIsLoading(false);
      }
  }

  const handleClearAll = async () => {
      if(confirm("BAHAYA: HAPUS SEMUA DATA MASTER? Tindakan ini tidak bisa dibatalkan.")) {
          setIsLoading(true);
          await clearAllData();
          setIsLoading(false);
      }
  }

  const totalItems = inventory.length;
  const scannedItems = inventory.filter(i => i.is_scanned).length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar Responsive */}
      <header className="bg-white shadow-sm z-20 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 text-white p-2 rounded-lg">
              <i className="fa-solid fa-cloud"></i>
            </div>
            {/* Judul disesuaikan untuk mobile */}
            <h1 className="text-lg font-bold text-slate-800 hidden sm:block">SO Cloud Pro</h1>
            <h1 className="text-lg font-bold text-slate-800 sm:hidden">SO Cloud</h1>
          </div>

          <div className="flex items-center gap-2">
             {/* Tombol Upload Responsive (Icon Only di HP) */}
             <label className={`cursor-pointer ${isLoading ? 'bg-slate-400' : 'bg-blue-600 active:bg-blue-800'} text-white p-2 sm:py-2 sm:px-4 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2`}>
                <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
                <span className="hidden sm:inline">{isLoading ? 'Loading...' : 'Upload Excel'}</span>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              
              {/* Dropdown Menu */}
              <div className="dropdown relative group">
                  <button className="bg-slate-100 p-2 rounded-lg text-slate-600 hover:bg-slate-200 active:bg-slate-300">
                    <i className="fa-solid fa-bars text-lg"></i>
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-52 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block p-2 z-50">
                      <button onClick={() => window.location.reload()} className="w-full text-left p-3 hover:bg-slate-50 text-sm rounded border-b"><i className="fa-solid fa-sync mr-2"></i> Refresh App</button>
                      <button onClick={handleExport} className="w-full text-left p-3 hover:bg-slate-50 text-sm rounded text-green-700 font-semibold border-b"><i className="fa-solid fa-download mr-2"></i> Download Excel</button>
                      <button onClick={handleResetScan} className="w-full text-left p-3 hover:bg-slate-50 text-sm rounded text-orange-600 font-semibold"><i className="fa-solid fa-undo mr-2"></i> Reset Scan</button>
                      <button onClick={handleClearAll} className="w-full text-left p-3 hover:bg-slate-50 text-sm rounded text-red-600 font-bold bg-red-50 mt-1"><i className="fa-solid fa-trash mr-2"></i> Hapus Semua</button>
                  </div>
              </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-6 flex flex-col lg:flex-row gap-4 sm:gap-6 overflow-hidden lg:h-[calc(100vh-64px)]">
        
        {/* 
            PERBAIKAN LAYOUT MOBILE:
            Kita HAPUS class 'order-2' dan 'order-1'.
            Dengan menaruh kode Scanner div DULUAN di bawah ini,
            maka otomatis di HP (flex-col) dia akan ada di ATAS.
            Di PC (lg:flex-row), dia akan ada di KIRI.
        */}

        {/* 1. Bagian Kiri (Scanner & Feedback) */}
        <div className="w-full lg:w-5/12 flex flex-col shrink-0">
          <DashboardStats total={totalItems} scanned={scannedItems} />
          
          <div className="bg-white p-3 sm:p-4 rounded-xl shadow-sm border border-slate-200 mb-4 flex flex-col gap-3">
             <ScannerInput 
                onScan={handleScan} 
                lastResult={lastScanFeedback.status}
                isProcessing={isProcessing}
             />
             <button 
                onClick={() => setShowCamera(true)}
                className="w-full py-3 sm:py-4 bg-indigo-600 active:bg-indigo-800 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-3 text-lg font-bold"
             >
                <i className="fa-solid fa-camera"></i>
                SCAN KAMERA
             </button>
          </div>

          <FeedbackDisplay feedback={lastScanFeedback} />
        </div>

        {/* 2. Bagian Kanan (Tabel Data) */}
        {/* Added overflow-hidden to parent and h-full logic to keep scroll internal */}
        <div className="w-full lg:w-7/12 flex flex-col h-[500px] lg:h-full overflow-hidden pb-10 sm:pb-0">
          <InventoryTable items={inventory} />
        </div>

      </main>

      {/* Camera Modal */}
      {showCamera && (
          <CameraScanner 
            onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} 
            onClose={() => setShowCamera(false)} 
          />
      )}
    </div>
  );
};

export default App;