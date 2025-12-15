import * as XLSX from 'xlsx';

// Helper untuk membersihkan format uang "250,000" menjadi 250000
const parsePrice = (price: any): number => {
  if (typeof price === 'number') return price;
  if (typeof price === 'string') {
    // Hapus 'Rp', koma, titik (tergantung locale, di sini asumsi koma adalah ribuan)
    // Jika format excel '250,000' (en-US), hapus koma.
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
        // @ts-ignore
        const lib = XLSX.read ? XLSX : (XLSX.default || XLSX);
        
        if (!lib) {
            throw new Error("Library Excel gagal dimuat. Refresh halaman.");
        }

        const workbook = lib.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert ke JSON
        const rawData = lib.utils.sheet_to_json(worksheet);
        
        console.log("Raw Excel Data:", rawData); // Debugging

        if (rawData.length === 0) {
            throw new Error("File Excel kosong atau tidak terbaca.");
        }

        // Mapping Data sesuai gambar tabel Anda
        const formattedData = rawData.map((row: any) => {
            // Deteksi nama kolom (Case Insensitive & Variasi)
            const barcode = row['Barcode'] || row['barcode'] || row['BARCODE'] || '';
            const name = row['Name'] || row['name'] || row['Item Name'] || row['item name'] || 'No Name';
            const brand = row['Brand'] || row['brand'] || '-';
            const color = row['Color'] || row['color'] || '-';
            const status = row['Status'] || row['status'] || '-';
            const type = row['Type'] || row['type'] || 'Sistem';
            const priceRaw = row['Price'] || row['price'] || 0;

            return {
              barcode: String(barcode).trim(),
              item_name: String(name).trim(),
              brand: String(brand).trim(),
              color: String(color).trim(),
              status: String(status).trim(),
              type: String(type).trim(),
              price: parsePrice(priceRaw),
              is_scanned: false,
              // timestamp dikosongkan agar null di DB
            };
        }).filter((item: any) => item.barcode.length > 0 && item.barcode !== 'undefined');

        if (formattedData.length === 0) {
            throw new Error("Tidak ada data Barcode yang valid ditemukan.");
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