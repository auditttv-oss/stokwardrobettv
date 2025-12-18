import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

/**
 * 1. GET STATS
 * Mengambil jumlah total data dan data yang sudah discan (Ringan)
 */
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

/**
 * 2. GET SINGLE ITEM
 * Helper untuk mencari item berdasarkan barcode
 */
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  
  if (error) console.error("Get Item Error:", error);
  return data as InventoryItem;
};

/**
 * 3. SCAN PROCESS
 * Menandai item sebagai scanned dengan validasi
 */
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  const item = await getItemByBarcode(barcode);
  
  if (!item) throw new Error("Item tidak ditemukan di database");
  if (item.is_scanned) throw new Error("Item sudah discan sebelumnya");

  const { data, error } = await supabase
    .from('inventory')
    .update({ 
        is_scanned: true, 
        scan_timestamp: Date.now() 
    })
    .eq('id', item.id)
    .eq('is_scanned', false) // Optimistic locking
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Gagal menyimpan scan (konflik data).");

  return data as InventoryItem;
};

/**
 * 4. FETCH TABLE DATA
 * Hanya mengambil 50 data terbaru agar aplikasi ringan
 */
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

/**
 * 5. UPLOAD MASSAL (BATCHING)
 * Upload data Excel dalam pecahan 1000 baris agar tidak timeout
 */
export const uploadBulkInventory = async (items: any[], onProgress: (percent: number) => void) => {
  const BATCH_SIZE = 1000; 
  const total = items.length;
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    const { error } = await supabase
        .from('inventory')
        .upsert(chunk, { onConflict: 'barcode' });
    
    if (error) throw new Error(`Gagal upload batch ${i}: ${error.message}`);
    
    const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    onProgress(progress);
  }
};

/**
 * 6. CLEAR DATABASE
 */
export const clearAllData = async () => {
    const { error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
}

/**
 * 7. EXPORT DATA (FITUR UTAMA: BATCH FETCHING)
 * Mengambil data dalam loop sampai habis (Unlimited Rows)
 */
export const fetchAllForExport = async (
    filterType: 'ALL' | 'SCANNED' | 'PENDING',
    onProgress: (current: number, total: number) => void
): Promise<InventoryItem[]> => {
    
    // LANGKAH A: Hitung Total Data dulu
    let countQuery = supabase.from('inventory').select('*', { count: 'exact', head: true });
    
    if (filterType === 'SCANNED') countQuery = countQuery.eq('is_scanned', true);
    if (filterType === 'PENDING') countQuery = countQuery.eq('is_scanned', false);
    
    const { count, error: countError } = await countQuery;
    if (countError) throw new Error("Gagal menghitung total data.");
    
    const totalRecords = count || 0;
    if (totalRecords === 0) return [];

    // LANGKAH B: Ambil data per 1000 baris (Looping)
    let allItems: InventoryItem[] = [];
    const BATCH_SIZE = 1000; // Batas aman Supabase
    
    for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
        let query = supabase.from('inventory').select('*');
        
        if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
        if (filterType === 'PENDING') query = query.eq('is_scanned', false);
        
        // Pagination logic: Ambil dari index i sampai i+999
        const { data, error } = await query
            .order('id', { ascending: true }) // Order by ID wajib agar halaman konsisten
            .range(i, i + BATCH_SIZE - 1);
            
        if (error) throw new Error("Gagal mengambil batch data.");
        
        if (data) {
            allItems = allItems.concat(data as InventoryItem[]);
            // Update UI Progress
            onProgress(allItems.length, totalRecords);
        }
    }
    
    return allItems;
}
