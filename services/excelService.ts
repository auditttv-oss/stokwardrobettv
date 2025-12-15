import { read, utils } from 'xlsx';

// Helper: Cari value di row berdasarkan kata kunci (case insensitive)
const findValue = (row: any, keywords: string[]): any => {
  const keys = Object.keys(row);
  const foundKey = keys.find(key => 
    keywords.some(keyword => key.toLowerCase().trim() === keyword.toLowerCase())
  );
  return foundKey ? row[foundKey] : null;
};

const parsePrice = (price: any): number => {
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    const cleanString = price.replace(/[^0-9.]/g, ''); 
    return parseFloat(cleanString) || 0;
  }
  return 0;
};

export const parseExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        
        // GUNAKAN IMPORT NAMED DARI XLSX AGAR TIDAK ERROR DI VERCEL
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rawData.length === 0) {
            throw new Error("File Excel kosong.");
        }

        const formattedData = rawData.map((row: any) => {
            const barcode = findValue(row, ['barcode', 'bar code', 'kode', 'sku']) || '';
            const name = findValue(row, ['item name', 'name', 'nama barang', 'description']) || 'No Name';
            const brand = findValue(row, ['brand', 'merk']) || '-';
            const color = findValue(row, ['color', 'warna']) || '-';
            const status = findValue(row, ['status', 'sts']) || '-';
            const type = findValue(row, ['type', 'tipe']) || 'Sistem';
            const priceRaw = findValue(row, ['price', 'harga', 'rp']) || 0;

            return {
              barcode: String(barcode).trim(),
              item_name: String(name).trim(),
              brand: String(brand).trim(),
              color: String(color).trim(),
              status: String(status).trim(),
              type: String(type).trim(),
              price: parsePrice(priceRaw),
              is_scanned: false,
            };
        }).filter((item: any) => item.barcode.length > 0 && item.barcode !== 'undefined');

        if (formattedData.length === 0) {
            throw new Error("Gagal membaca Barcode. Pastikan ada kolom Barcode.");
        }

        resolve(formattedData);
      } catch (error) {
        console.error("Parse Error:", error);
        reject(error);
      }
    };

    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};