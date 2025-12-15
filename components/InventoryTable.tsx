import React, { useState } from 'react';
import { InventoryItem } from '../types';

interface InventoryTableProps {
  items: InventoryItem[];
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ items }) => {
  const [filter, setFilter] = useState('');
  
  // OPTIMISASI: Hanya render item yang sesuai filter, dan batasi max 100 baris untuk DOM
  // PC 32-bit akan lemot jika merender 5000 <tr> sekaligus.
  const filteredItems = items.filter(item => 
      item.barcode.toLowerCase().includes(filter.toLowerCase()) || 
      item.item_name.toLowerCase().includes(filter.toLowerCase())
  );

  const displayItems = filteredItems.slice(0, 100);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-[calc(100vh-450px)] min-h-[300px]">
      <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center bg-slate-50 rounded-t-xl gap-2">
        <h3 className="font-semibold text-slate-700">Inventory Data</h3>
        
        <input 
            type="text" 
            placeholder="Search barcode/name..." 
            className="px-3 py-1 border rounded text-sm w-full sm:w-64"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
        />
        
        <span className="text-xs font-medium bg-slate-200 text-slate-600 py-1 px-2 rounded whitespace-nowrap">
          Showing {displayItems.length} of {items.length}
        </span>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
              <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Barcode</th>
              <th className="p-3 text-xs font-semibold text-slate-500 uppercase">Name</th>
              <th className="hidden sm:table-cell p-3 text-xs font-semibold text-slate-500 uppercase">Brand</th>
              <th className="hidden sm:table-cell p-3 text-xs font-semibold text-slate-500 uppercase">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayItems.length === 0 ? (
               <tr><td colSpan={5} className="p-8 text-center text-slate-400">No data found.</td></tr>
            ) : (
              displayItems.map((item) => (
                <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${item.is_scanned ? 'bg-emerald-50' : ''}`}>
                  <td className="p-3">
                    {item.is_scanned ? (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
                        <i className="fa-solid fa-check mr-1"></i> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-500">Pending</span>
                    )}
                  </td>
                  <td className="p-3 font-mono text-sm text-slate-600">{item.barcode}</td>
                  <td className="p-3 text-sm font-medium text-slate-800">{item.item_name}</td>
                  <td className="hidden sm:table-cell p-3 text-sm text-slate-600">{item.brand}</td>
                  <td className="hidden sm:table-cell p-3 text-sm">{item.type}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};