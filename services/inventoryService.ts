import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

// 1. Ambil Statistik
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

// 2. Helper: Ambil item by barcode
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  
  if (error) console.error("Get Item Error:", error);
  return data as InventoryItem;
};

// 3. PROSES SCAN
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  const item = await getItemByBarcode(barcode);
  
  if (!item) {
    throw new Error("Item tidak ditemukan di database");
  }

  if (item.is_scanned) {
    throw new Error("Item sudah discan sebelumnya");
  }

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

// 4. Data untuk Tabel (Limit 50 agar ringan)
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

// 5. Upload Massal (Batch Insert)
export const uploadBulkInventory = async (items: any[], onProgress: (percent: number) => void) => {
  const BATCH_SIZE = 1000; 
  const total = items.length;
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
        .from('inventory')
        .upsert(chunk, { onConflict: 'barcode' });
    
    if (error) throw new Error(`Gagal upload baris ${i}: ${error.message}`);
    
    const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    onProgress(progress);
  }
};

export const clearAllData = async () => {
    const { error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
}

// 6. EXPORT DATA (FIX 25.000 DATA)
// Menggunakan teknik Pagination Loop agar menembus batas 1000 baris
export const fetchAllForExport = async (
    filterType: 'ALL' | 'SCANNED' | 'PENDING',
    onProgress: (count: number) => void
): Promise<InventoryItem[]> => {
    let allItems: InventoryItem[] = [];
    let hasMore = true;
    let page = 0;
    const PAGE_SIZE = 2000; // Ambil 2000 data per request (Aman & Cepat)

    while (hasMore) {
        let query = supabase.from('inventory').select('*');
        
        // Terapkan Filter
        if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
        if (filterType === 'PENDING') query = query.eq('is_scanned', false);
        
        // Ambil range data (Misal: 0-1999, lalu 2000-3999, dst)
        const { data, error } = await query
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            .order('id', { ascending: true }); // Order ID penting agar data konsisten

        if (error) throw error;

        if (data && data.length > 0) {
            // Gabungkan data
            allItems = allItems.concat(data as InventoryItem[]);
            
            // Update progress ke UI
            onProgress(allItems.length);

            // Cek apakah data sudah habis
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++; // Lanjut ke halaman berikutnya
            }
        } else {
            hasMore = false;
        }
    }
    
    return allItems;
}
