import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

// 1. Ambil Statistik (Total & Scanned) langsung dari DB (Ringan & Cepat)
export const getInventoryStats = async () => {
  const { count: total, error: errTotal } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true }); // Head: true artinya cuma hitung jumlah, tidak ambil data

  const { count: scanned, error: errScanned } = await supabase
    .from('inventory')
    .select('*', { count: 'exact', head: true })
    .eq('is_scanned', true);

  if (errTotal || errScanned) throw new Error("Gagal mengambil statistik");

  return {
    total: total || 0,
    scanned: scanned || 0
  };
};

// 2. Cari Item by Barcode (Langsung ke Server)
export const getItemByBarcode = async (barcode: string): Promise<InventoryItem | null> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle(); // maybeSingle aman jika data tidak ditemukan

  if (error) return null;
  return data as InventoryItem;
};

// 3. Mark Scan
export const markItemAsScanned = async (barcode: string): Promise<InventoryItem> => {
  // Ambil ID dulu
  const item = await getItemByBarcode(barcode);
  if (!item) throw new Error("Item tidak ditemukan");

  const { data, error } = await supabase
    .from('inventory')
    .update({ is_scanned: true, scan_timestamp: Date.now() })
    .eq('id', item.id)
    .select()
    .single();

  if (error) throw error;
  return data as InventoryItem;
};

// 4. Fetch Data untuk Tabel (Hanya 50 Terakhir atau Search)
export const fetchRecentInventory = async (searchQuery: string = ''): Promise<InventoryItem[]> => {
  let query = supabase
    .from('inventory')
    .select('*')
    .order('scan_timestamp', { ascending: false, nullsFirst: false }) // Yang baru discan di atas
    .order('created_at', { ascending: false })
    .limit(50); // Cuma ambil 50 biar ringan

  if (searchQuery) {
    // Jika ada search, cari spesifik
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
    if (error) throw new Error(`Batch Error: ${error.message}`);
    onProgress(Math.min(100, Math.round(((i + chunk.length) / total) * 100)));
  }
};

export const resetInventoryStatus = async () => {
    await supabase.from('inventory').update({ is_scanned: false, scan_timestamp: null }).neq('id', '0');
}

export const clearAllData = async () => {
    await supabase.from('inventory').delete().neq('id', '0');
}

// 6. Helper Export (Ambil semua data streaming untuk CSV)
export const fetchAllForExport = async (filterType: 'ALL' | 'SCANNED' | 'PENDING') => {
    let query = supabase.from('inventory').select('*');
    
    if (filterType === 'SCANNED') query = query.eq('is_scanned', true);
    if (filterType === 'PENDING') query = query.eq('is_scanned', false);

    // Limit csv export ke 30.000 agar browser kuat
    const { data, error } = await query.limit(30000); 
    if (error) throw error;
    return data as InventoryItem[];
}