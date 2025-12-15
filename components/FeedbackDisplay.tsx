import React, { useState } from 'react';
import { InventoryItem } from '../types';

interface InventoryTableProps {
  items: InventoryItem[];
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ items }) => {
  const [filter, setFilter] = useState('');
  
  const filteredItems = items.filter(item => 
      item.barcode.toLowerCase().includes(filter.toLowerCase()) || 
      item.item_name.toLowerCase().includes(filter.toLowerCase())
  );
  // Limit render agar ringan di HP
  const displayItems = filteredItems.slice(0, 50);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full">
      <div className="p-3 border-b border-slate-100 flex flex-col gap-2 bg-slate-50 rounded-t-xl">
        <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-700">Data Barang</h3>
            <span className="text-xs font-bold bg-slate-200 text-slate-700 py-1 px-2 rounded">
            {items.length} Total
            </span>
        </div>
        <input 
            type="text" 
            placeholder="Cari nama / barcode..." 
            className="px-3 py-2 border rounded-lg text-sm w-full focus:ring-2 focus:ring-blue-500 outline-none"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="p-3 w-20">Status</th>
              <th className="p-3">Item Info</th>
              {/* Kolom ini disembunyikan di HP (hidden sm:table-cell) */}
              <th className="hidden sm:table-cell p-3">Brand</th>
              <th className="hidden sm:table-cell p-3 text-right">Harga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {displayItems.length === 0 ? (
               <tr><td colSpan={4} className="p-8 text-center text-slate-400">Data tidak ditemukan.</td></tr>
            ) : (
              displayItems.map((item) => (
                <tr key={item.id} className={`hover:bg-slate-50 ${item.is_scanned ? 'bg-green-50' : ''}`}>
                  <td className="p-3 align-top">
                    {item.is_scanned ? (
                      <div className="text-center">
                          <i className="fa-solid fa-check-circle text-green-600 text-xl"></i>
                      </div>
                    ) : (
                      <span className="w-3 h-3 block rounded-full bg-slate-300 mx-auto mt-1"></span>
                    )}
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-bold text-slate-800">{item.item_name}</div>
                    <div className="font-mono text-xs text-slate-500 mt-1 bg-slate-100 inline-block px-1 rounded">{item.barcode}</div>
                    {/* Tampilkan info tambahan di mobile karena kolom kanan di-hide */}
                    <div className="sm:hidden text-xs text-slate-400 mt-1">
                        {item.color} • {item.brand} • {new Intl.NumberFormat('id-ID').format(Number(item.price))}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell p-3 align-top text-slate-600">{item.brand}</td>
                  <td className="hidden sm:table-cell p-3 align-top text-right font-mono">
                      {new Intl.NumberFormat('id-ID').format(Number(item.price))}
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