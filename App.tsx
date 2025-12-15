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
        alert("Gagal memuat data dari server. Cek koneksi internet.");
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
           // Jika ada perubahan di DB (oleh siapa saja), update state lokal
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
      alert("Import Berhasil! Data tersimpan di Cloud.");
      // Real-time will handle the UI update
    } catch (error: any) {
      console.error("Import failed:", error);
      alert(`Failed: ${error.message}`);
    } finally {
      setIsLoading(false);
      event.target.value = '';
    }
  };

  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode || isProcessing) return;
    
    setIsProcessing(true);
    const searchCode = barcode.trim();

    // Cek di data lokal dulu untuk feedback cepat
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

    // Update ke Server
    try {
        const updatedItem = await markItemAsScanned(searchCode);
        if (updatedItem) {
            setLastScanFeedback({ 
                status: 'FOUND', 
                message: updatedItem.type, 
                item: updatedItem 
            });
            // Mainkan suara 'beep' di sini jika perlu
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
      if(confirm("HAPUS SEMUA DATA MASTER? Tindakan ini tidak bisa dibatalkan.")) {
          setIsLoading(true);
          await clearAllData();
          setIsLoading(false);
      }
  }

  // Stats
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
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 hidden sm:block">SO Cloud Pro</h1>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 sm:hidden">SO Cloud</h1>
          </div>

          <div className="flex items-center gap-2">
             <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg shadow-sm transition-all text-sm flex items-center gap-2">
                <i className={`fa-solid ${isLoading ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
                <span className="hidden sm:inline">Upload Excel</span>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              
              <div className="dropdown relative group">
                  <button className="bg-slate-100 p-2 rounded-lg text-slate-600 hover:bg-slate-200">
                    <i className="fa-solid fa-ellipsis-vertical"></i>
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white shadow-xl rounded-lg border border-slate-100 hidden group-hover:block p-2">
                      <button onClick={() => window.location.reload()} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded"><i className="fa-solid fa-sync mr-2"></i> Refresh</button>
                      <button onClick={handleResetScan} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded text-orange-600"><i className="fa-solid fa-undo mr-2"></i> Reset Scan</button>
                      <button onClick={handleClearAll} className="w-full text-left p-2 hover:bg-slate-50 text-sm rounded text-red-600"><i className="fa-solid fa-trash mr-2"></i> Hapus Semua</button>
                  </div>
              </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-6 flex flex-col lg:flex-row gap-6 overflow-hidden lg:h-[calc(100vh-64px)]">
        
        {/* Left Column */}
        <div className="w-full lg:w-5/12 flex flex-col shrink-0 order-2 lg:order-1">
          <DashboardStats total={totalItems} scanned={scannedItems} />
          
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col gap-4">
             <ScannerInput 
                onScan={handleScan} 
                lastResult={lastScanFeedback.status}
                isProcessing={isProcessing}
             />
             <button 
                onClick={() => setShowCamera(true)}
                className="w-full py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-all flex items-center justify-center gap-3 text-lg font-bold"
             >
                <i className="fa-solid fa-camera"></i>
                Scan Kamera
             </button>
          </div>

          <FeedbackDisplay feedback={lastScanFeedback} />
        </div>

        {/* Right Column (Table) */}
        <div className="w-full lg:w-7/12 flex flex-col h-full overflow-hidden order-1 lg:order-2">
          <InventoryTable items={inventory} />
        </div>

      </main>

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