export interface InventoryItem {
  id: string; // UUID from Supabase
  barcode: string;
  item_name: string; // Changed to match DB column standard (snake_case mapped manually or via alias)
  status: string;
  color: string;
  brand: string;
  price: number;
  type: string;
  
  // App specific state
  is_scanned: boolean; // Changed to match DB
  scan_timestamp?: number;
}

export type ScanResult = 'FOUND' | 'NOT_FOUND' | 'IDLE' | 'DUPLICATE' | 'ERROR';

export interface ScanFeedback {
  status: ScanResult;
  message: string;
  item?: InventoryItem;
}