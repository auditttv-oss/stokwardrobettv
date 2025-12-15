import * as XLSX from 'xlsx';

export const parseExcelFile = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        // @ts-ignore
        const lib = XLSX.read ? XLSX : (XLSX.default || XLSX);
        const workbook = lib.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = lib.utils.sheet_to_json(worksheet);
        
        // Map to DB structure
        const formattedData = rawData.map((row: any) => ({
          barcode: String(row['Barcode'] || row['barcode'] || '').trim(),
          item_name: row['Item Name'] || row['item name'] || row['Name'] || 'Unknown Item',
          status: row['Status'] || row['status'] || '-',
          color: row['Color'] || row['color'] || '-',
          brand: row['Brand'] || row['brand'] || '-',
          price: row['Price'] || row['price'] || 0,
          type: row['Type'] || row['type'] || 'Data Sistem',
          is_scanned: false,
        })).filter((item: any) => item.barcode.length > 0);

        resolve(formattedData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};