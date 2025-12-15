import { supabase } from '../lib/supabaseClient';
import { InventoryItem } from '../types';

export const fetchInventory = async (): Promise<InventoryItem[]> => {
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as InventoryItem[];
};

export const markItemAsScanned = async (barcode: string): Promise<InventoryItem | null> => {
  // 1. Check if item exists
  const { data: items, error: fetchError } = await supabase
    .from('inventory')
    .select('*')
    .eq('barcode', barcode)
    .single();

  if (fetchError || !items) return null;
  
  // 2. Update
  const { data, error } = await supabase
    .from('inventory')
    .update({ 
        is_scanned: true, 
        scan_timestamp: Date.now() 
    })
    .eq('id', items.id)
    .select()
    .single();

  if (error) throw error;
  return data as InventoryItem;
};

export const uploadBulkInventory = async (items: Omit<InventoryItem, 'id'>[]) => {
  // Batch insert to prevent timeouts
  const batchSize = 100;
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    
    // Using upsert based on barcode to prevent duplicates but update details
    const { error } = await supabase
      .from('inventory')
      .upsert(chunk, { onConflict: 'barcode' });
      
    if (error) {
        console.error("Batch upload error:", error);
        throw error;
    }
  }
};

export const resetInventoryStatus = async () => {
    const { error } = await supabase
        .from('inventory')
        .update({ is_scanned: false, scan_timestamp: null })
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Update all
    if (error) throw error;
}

export const clearAllData = async () => {
    const { error } = await supabase
        .from('inventory')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    if (error) throw error;
}