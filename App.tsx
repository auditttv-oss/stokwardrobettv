import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabaseClient';
import { 
  getInventoryStats, getItemByBarcode, markItemAsScanned, 
  fetchRecentInventory, uploadBulkInventory, clearAllData, 
  fetchAllForExport 
} from './services/inventoryService';
import { parseExcelFile } from './services/excelService';
import { playBeep } from './services/audioService';
import { InventoryItem, ScanFeedback } from './types';
import { ScannerInput } from './components/ScannerInput';
import { DashboardStats } from './components/DashboardStats';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { InventoryTable } from './components/InventoryTable';
import { CameraScanner } from './components/CameraScanner';

const App: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [tableData, setTableData] = useState<InventoryItem[]>([]);
  const [stats, setStats] = useState({ total: 0, scanned: 0 });
  const [lastScanFeedback, setLastScanFeedback] = useState<ScanFeedback>({ status: 'IDLE', message: '' });
  
  // Loading & Progress State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // --- DATA SYNC ---
  const refreshData = async () => {
    try {
        const [statData, recentData] = await Promise.all([ getInventoryStats(), fetchRecentInventory() ]);
        setStats(statData); setTableData(recentData);
    } catch (e) { console.error("Sync Error", e); }
  };

  useEffect(() => {
    refreshData();
    const channel = supabase.channel('global-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => refreshData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- UPLOAD HANDLER ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if(!confirm("Upload Data Stok Baru?")) return;
    
    setIsLoading(true); setProgressPct(0); setLoadingMsg('Membaca Excel...');
    try {
      const data = await parseExcelFile(file);
      setLoadingMsg('Mengupload ke Database...');
      await uploadBulkInventory(data, (pct) => setProgressPct(pct));
      alert(`SUKSES! Data berhasil diupload.`); window.location.reload();
    } catch (error: any) { alert(`Gagal: ${error.message}`); } 
    finally { setIsLoading(false); setProgressPct(0); event.target.value = ''; }
  };

  // --- EXPORT HANDLER (CORE FEATURE) ---
  const handleExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    if (stats.total === 0) { alert("Data Kosong."); return; }
    
    const label = filterType === 'SCANNED' ? 'DATA SUDAH SO' : filterType === 'PENDING' ? 'DATA BELUM SO' : 'SEMUA DATA';
    if(!confirm(`Download ${label}?\n(Sistem akan mengambil semua data secara otomatis)`)) return;

    setIsLoading(true);
    setProgressPct(0);
    setLoadingMsg('Menghubungkan ke Server...');

    try {
        // Panggil service dengan callback progress
        const data = await fetchAllForExport(filterType, (current, total) => {
            // Ini yang membuat user tidak perlu klik berkali-kali
            // UI akan update sendiri seiring data diambil
            setLoadingMsg(`Mengambil ${current.toLocaleString()} dari ${total.toLocaleString()} baris...`);
            const percentage = Math.round((current / total) * 100);
            setProgressPct(percentage);
        });

        if (data.length === 0) { alert("Tidak ada data ditemukan untuk kategori ini."); return; }

        setLoadingMsg('Membuat File Excel (CSV)...');
        
        // Generate CSV Content
        const headers = ["Barcode,Item Name,Status,Color,Brand,Price,Type,Is Scanned,Scan Time,Scan Date"];
        const rows = data.map(i => {
            const safeName = i.item_name ? `"${i.item_name.replace(/"/g, '""')}"` : "";
            const scanDate = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleDateString('id-ID') : "-";
            const scanTime = i.scan_timestamp ? new Date(i.scan_timestamp).toLocaleTimeString('id-ID') : "-";
            
            return `${i.barcode},${safeName},${i.status},${i.color},${i.brand},${Number(i.price).toFixed(0)},${i.type},${i.is_scanned ? 'SUDAH' : 'BELUM'},${scanTime},${scanDate}`;
        });

        // Add BOM for Excel compatibility
        const csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        
        // Trigger Download
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a"); 
        link.href = url; 
        link.setAttribute("download", `Laporan_SO_${filterType}_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link);

    } catch(e: any) { 
        alert("Error Export: " + e.message); 
    } finally { 
        setIsLoading(false); 
    }
  };

  // --- SCAN HANDLER ---
  const handleScan = useCallback(async (barcode: string) => {
    if (!barcode || isProcessing) return;
    setIsProcessing(true);
    const searchCode = barcode.trim();

    try {
        const item = await getItemByBarcode(searchCode);
        
        if (!item) {
            playBeep('ERROR');
            setLastScanFeedback({ status: 'NOT_FOUND', message: 'TIDAK DITEMUKAN' });
        } else if (item.is_scanned) {
            playBeep('WARNING');
            setLastScanFeedback({ status: 'DUPLICATE', message: 'SUDAH DI SCAN', item });
        } else {
            const scannedItem = await markItemAsScanned(searchCode);
            playBeep('SUCCESS');
            setLastScanFeedback({ status: 'FOUND', message: scannedItem.type || 'BERHASIL', item: scannedItem });
        }
    } catch (error) {
        playBeep('ERROR');
        setLastScanFeedback({ status: 'NOT_FOUND', message: 'ERROR SERVER' });
    } finally {
        setIsProcessing(false);
    }
  }, [isProcessing]);

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans overflow-hidden">
      
      {/* PROFESSIONAL LOADING OVERLAY */}
      {isLoading && (
          <div className="fixed inset-0 z-[100] bg-slate-900/95 flex flex-col items-center justify-center text-white p-6">
              <div className="text-xl font-bold mb-3 tracking-wide animate-pulse text-center">
                  {loadingMsg || 'Memproses...'}
              </div>
              <div className="w-full max-w-xs bg-slate-700 rounded-full h-4 overflow-hidden border border-slate-600 shadow-inner">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300 ease-out" 
                    style={{ width: `${progressPct}%` }}
                  ></div>
              </div>
              <div className="mt-3 font-mono text-sm text-slate-400">{progressPct}% Selesai</div>
          </div>
      )}

      {/* HEADER */}
      <header className="bg-white shadow-sm z-30 shrink-0">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white w-8 h-8 flex items-center justify-center rounded-lg shadow-sm shadow-indigo-200">
                <i className="fa-solid fa-boxes-stacked"></i>
            </div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">SO Pro <span className="text-indigo-600">App</span></h1>
          </div>
          
          <div className="flex items-center gap-2">
             <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2">
                <i className="fa-solid fa-file-excel text-green-600"></i>
                <span className="hidden sm:inline">Upload</span>
                <input type="file" accept=".xlsx, .csv" className="hidden" onChange={handleFileUpload} disabled={isLoading} />
              </label>
              
              <div className="relative group">
                  <button className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg transition">
                      <i className="fa-solid fa-download"></i>
                  </button>
                  <div className="absolute right-0 top-full mt-2 w-60 bg-white shadow-xl rounded-xl border border-slate-100 hidden group-hover:block p-2 z-50 transform origin-top-right transition-all">
                      <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b mb-1">Export Data</div>
                      
                      <button onClick={() => handleExport('SCANNED')} className="w-full text-left p-2.5 hover:bg-green-50 text-xs text-green-700 font-bold rounded-lg flex items-center transition">
                          <i className="fa-solid fa-check-circle w-6 text-sm"></i> SUDAH SCAN
                      </button>
                      
                      <button onClick={() => handleExport('PENDING')} className="w-full text-left p-2.5 hover:bg-orange-50 text-xs text-orange-600 font-bold rounded-lg flex items-center transition">
                          <i className="fa-solid fa-clock w-6 text-sm"></i> BELUM SCAN
                      </button>
                      
                      <button onClick={() => handleExport('ALL')} className="w-full text-left p-2.5 hover:bg-blue-50 text-xs text-blue-600 font-bold rounded-lg flex items-center border-b transition">
                          <i className="fa-solid fa-database w-6 text-sm"></i> SEMUA DATA
                      </button>
                      
                      <button onClick={async () => { if(confirm("PERINGATAN KERAS:\nAnda akan menghapus SEMUA data di database.\nLanjutkan?")) { setIsLoading(true); setLoadingMsg('Mereset Database...'); await clearAllData(); window.location.reload(); } }} className="w-full text-left p-2.5 hover:bg-red-50 text-xs text-red-600 font-bold mt-1 rounded-lg flex items-center transition">
                          <i className="fa-solid fa-trash-can w-6 text-sm"></i> RESET TOTAL
                      </button>
                  </div>
              </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row gap-4 p-3 lg:p-6">
        <div className="w-full lg:w-4/12 flex flex-col shrink-0 gap-4">
          <DashboardStats total={stats.total} scanned={stats.scanned} />
          <FeedbackDisplay feedback={lastScanFeedback} />
          <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4">
             <ScannerInput onScan={handleScan} lastResult={lastScanFeedback.status} isProcessing={isProcessing} />
             <button onClick={() => { playBeep('SUCCESS'); setShowCamera(true); }} className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl shadow-lg shadow-indigo-200 font-bold flex justify-center gap-2 items-center text-base transition transform active:scale-95">
                <i className="fa-solid fa-qrcode text-lg"></i> SCANNER KAMERA
             </button>
          </div>
        </div>
        <div className="w-full lg:w-8/12 flex flex-col shrink-0 h-[500px] lg:h-full pb-10">
          <InventoryTable items={tableData} />
        </div>
      </main>

      {showCamera && <CameraScanner onScanSuccess={(code) => { handleScan(code); setShowCamera(false); }} onClose={() => setShowCamera(false)} />}
    </div>
  );
};

export default App;
