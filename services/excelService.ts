import { read, utils } from 'xlsx';

const findValue = (row: any, keywords: string[]): any => {
  const keys = Object.keys(row);
  const foundKey = keys.find(key => 
    keywords.some(keyword => key.toLowerCase().trim() === keyword.toLowerCase())
  );
  return foundKey ? row[foundKey] : null;
};

// PEMBERSIH HARGA AGRESIF
const parsePrice = (price: any): number => {
  if (typeof price === 'number') return Math.floor(price); // Pastikan bulat
  
  if (typeof price === 'string') {
    // Hapus desimal nol di belakang (,00 atau .00)
    let clean = price.replace(/[,.]00$/, '');
    // Hapus SEMUA karakter kecuali angka 0-9
    clean = clean.replace(/[^0-9]/g, '');
    return parseInt(clean, 10) || 0;
  }
  return 0;
};

export const parseExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = utils.sheet_to_json(worksheet, { defval: '' });
        
        if (rawData.length === 0) throw new Error("File Kosong.");

        const formattedData = rawData.map((row: any) => {
            const barcode = findValue(row, ['barcode', 'bar code', 'kode', 'sku']) || '';
            const name = findValue(row, ['item name', 'name', 'nama', 'desc']) || 'No Name';
            const brand = findValue(row, ['brand', 'merk']) || '-';
            const color = findValue(row, ['color', 'warna']) || '-';
            const status = findValue(row, ['status', 'sts']) || '-';
            const type = findValue(row, ['type', 'tipe']) || 'Sistem';
            const priceRaw = findValue(row, ['price', 'harga', 'rp', 'amount']) || 0;

            // Validasi ketat: Barcode harus ada
            const cleanBarcode = String(barcode).trim();
            if(!cleanBarcode || cleanBarcode.toLowerCase() === 'undefined') return null;

            return {
              barcode: cleanBarcode,
              item_name: String(name).trim().replace(/['"]/g, ''), // Hapus kutip yang bikin error SQL
              brand: String(brand).trim(),
              color: String(color).trim(),
              status: String(status).trim(),
              type: String(type).trim(),
              price: parsePrice(priceRaw),
              is_scanned: false,
            };
        }).filter(item => item !== null); // Hapus baris kosong/invalid

        if (formattedData.length === 0) throw new Error("Tidak ada data valid.");
        resolve(formattedData);

      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};