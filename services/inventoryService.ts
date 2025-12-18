import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

// 1. Ambil Statistik (Ringan)
export const getInventoryStats = async () => {
  const { count: total, error: errTotal } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true });

  const { count: scanned, error: errScanned } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('is_scanned', true);

  if (errTotal || errScanned) console.error("Stats Error:", errTotal || errScanned);

  return {
    total: total || 0,
    scanned: scanned || 0
  };
};

// 2. Helper: Ambil item
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle(); 
  
  if (error) console.error("Get Item Error:", error);
  return data as InventoryItem;
};

// 3. Scan Item (Atomic)
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  const item = await getItemByBarcode(barcode);
  if (!item) throw new Error("Item tidak ditemukan di database (Nihil)");
  if (item.is_scanned) throw new Error("Item sudah discan sebelumnya");

  const { data, error } = await supabase
    .from('inventory')
    .update({ 
        is_scanned: true, 
        scan_timestamp: Date.now() 
    })
    .eq('id', item.id)
    .eq('is_scanned', false) 
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Item baru saja discan oleh user lain");

  return data as InventoryItem;
};

// 4. Data Tabel (Limit 50)
export const fetchRecentInventory = async (searchQuery: string = ''): Promise<InventoryItem[]> => {
  let query = supabase
    .from('inventory')
    .select('*')
    .order('scan_timestamp', { ascending: false, nullsFirst: false }) 
    .order('created_at', { ascending: false }) 
    .limit(50); 

  if (searchQuery) {
    query = supabase
      .from('inventory')
      .select('*')
      .or(`barcode.ilike.%${searchQuery}%,item_name.ilike.%${searchQuery}%`)
      .limit(50);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as InventoryItem[];
};

// 5. Upload Massal (Batch 1000)
export const uploadBulkInventory = async (items: any[], onProgress: (percent: number) => void) => {
  const BATCH_SIZE = 1000; 
  const total = items.length;
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('inventory').upsert(chunk, { onConflict: 'barcode' });
    if (error) throw new Error(`Gagal upload pada baris ${i}: ${error.message}`);
    const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    onProgress(progress);
  }
};

// 6. Reset & Clear
export const resetInventoryStatus = async () => {
    await supabase.from('inventory').update({ is_scanned: false, scan_timestamp: null }).neq('id', '0');
}
export const clearAllData = async () => {
    await supabase.from('inventory').delete().neq('id', '0');
}

// 7. EXPORT DATA TANPA BATAS (Pagination Loop)
// Fungsi ini dimodifikasi untuk mengambil SEMUA data, bukan cuma 1000.
export const fetchAllForExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING', onProgress?: (msg: string) => void) => {
    let allData: InventoryItem[] = [];
    let page = 0;
    const PAGE_SIZE = 1000; // Ambil per 1000 baris (Max Supabase)
    let hasMore = true;

    while (hasMore) {
        if(onProgress) onProgress(`Mengambil data ${allData.length}...`);

        let query = supabase.from('inventory').select('*').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
        
        if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
        if (filterType === 'PENDING') query = query.eq('is_scanned', false);
        
        const { data, error } = await query;
        
        if (error) throw error;

        if (data && data.length > 0) {
            allData = [...allData, ...(data as InventoryItem[])];
            // Jika data yang diambil kurang dari PAGE_SIZE, berarti ini halaman terakhir
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++; // Lanjut halaman berikutnya
            }
        } else {
            hasMore = false;
        }
    }

    if(onProgress) onProgress(`Selesai! Total ${allData.length} data.`);
    return allData;
}
