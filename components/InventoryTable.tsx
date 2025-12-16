import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { fetchRecentInventory } from '../services/inventoryService';

interface InventoryTableProps {
  items: InventoryItem[];
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ items }) => {
  const [search, setSearch] = useState('');
  const [localItems, setLocalItems] = useState<InventoryItem[]>(items);

  // Sync props: Jika data induk berubah, update tabel
  React.useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        // Cari ke server jika tekan enter (Penting untuk data 25.000)
        try {
            const res = await fetchRecentInventory(search);
            setLocalItems(res);
        } catch(err) { console.error(err); }
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="p-3 border-b border-slate-100 flex flex-col gap-2 bg-slate-50 rounded-t-xl">
        <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700 text-sm"><i className="fa-solid fa-clock-rotate-left mr-1"></i> Riwayat & Pencarian</h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 py-1 px-2 rounded">
             Tampil Max 50 Data
            </span>
        </div>
        <input 
            type="text" 
            placeholder="Cari Nama/Barcode lalu Enter..." 
            className="px-3 py-2 border rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearch}
        />
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs font-semibold text-slate-500 uppercase">
            <tr>
              <th className="p-3 w-10 text-center">STS</th>
              <th className="p-3">Item Info</th>
              <th className="hidden sm:table-cell p-3 text-right">Harga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {localItems.length === 0 ? (
               <tr><td colSpan={3} className="p-8 text-center text-slate-400">Belum ada scan terbaru / Data tidak ditemukan.</td></tr>
            ) : (
              localItems.map((item) => (
                <tr key={item.id} className={`hover:bg-slate-50 ${item.is_scanned ? 'bg-green-50' : ''}`}>
                  <td className="p-3 align-top text-center">
                    {item.is_scanned ? <i className="fa-solid fa-check-circle text-green-600"></i> : <span className="w-2 h-2 inline-block rounded-full bg-slate-300"></span>}
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-bold text-slate-800 text-xs sm:text-sm">{item.item_name}</div>
                    <div className="font-mono text-[10px] sm:text-xs text-slate-500 mt-1">{item.barcode}</div>
                    <div className="sm:hidden text-[10px] text-slate-400 mt-1">{item.brand} • {Number(item.price).toLocaleString('id-ID')}</div>
                  </td>
                  <td className="hidden sm:table-cell p-3 align-top text-right font-mono text-xs">
                      {Number(item.price).toLocaleString('id-ID')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};