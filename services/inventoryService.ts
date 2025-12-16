import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

export const fetchInventory = async (): Promise<InventoryItem[]> => {
  // Limit dinaikkan untuk handle data besar saat load awal
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000); // Kita limit load awal agar HP tidak crash, pencarian tetap bisa via RPC/Filter nanti

  if (error) throw error;
  return data as InventoryItem[];
};

export const markItemAsScanned = async (barcode: string): Promise<InventoryItem | null> => {
  const { data: items } = await supabase.from('inventory').select('*').eq('barcode', barcode).single();
  if (!items) return null;
  
  const { data, error } = await supabase
    .from('inventory')
    .update({ is_scanned: true, scan_timestamp: Date.now() })
    .eq('id', items.id)
    .select().single();

  if (error) throw error;
  return data as InventoryItem;
};

// FITUR UTAMA: Batch Upload Besar dengan Progress Bar
export const uploadBulkInventory = async (items: any[], onProgress: (percent: number) => void) => {
  // Naikkan batch size ke 1000 untuk kecepatan
  const BATCH_SIZE = 1000; 
  const total = items.length;
  
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    
    // Upsert = Insert or Update jika barcode sama
    const { error } = await supabase
      .from('inventory')
      .upsert(chunk, { onConflict: 'barcode' });
      
    if (error) {
        console.error("Batch Error:", error);
        throw new Error(`Gagal pada data ke ${i} - ${i+BATCH_SIZE}: ${error.message}`);
    }

    // Update Progress
    const progress = Math.min(100, Math.round(((i + chunk.length) / total) * 100));
    onProgress(progress);
  }
};

export const resetInventoryStatus = async () => {
    const { error } = await supabase
        .from('inventory')
        .update({ is_scanned: false, scan_timestamp: null })
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
}

export const clearAllData = async () => {
    const { error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
}