import React from 'react';

interface DashboardStatsProps {
  total: number;
  scanned: number;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ total, scanned }) => {
  const remaining = total - scanned;
  const percentage = total > 0 ? Math.round((scanned / total) * 100) : 0;

  return (
    // PERUBAHAN DI SINI: 'grid-cols-2' (untuk HP) dan 'md:grid-cols-4' (untuk PC)
    // gap-2 agar lebih rapat di HP
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-4">
      
      {/* Kartu 1: Total */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
        <div className="flex justify-between items-start">
            <p className="text-slate-500 text-xs font-medium">Total Item</p>
            <i className="fa-solid fa-boxes-stacked text-slate-300 text-sm"></i>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mt-1">{total}</h3>
      </div>

      {/* Kartu 2: Scanned */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-emerald-100 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 bg-emerald-500 w-1"></div>
        <div className="flex justify-between items-start pl-2">
            <p className="text-emerald-600 text-xs font-medium">Sudah SO</p>
            <i className="fa-solid fa-check-double text-emerald-200 text-sm"></i>
        </div>
        <h3 className="text-xl font-bold text-emerald-700 mt-1 pl-2">{scanned}</h3>
      </div>

      {/* Kartu 3: Sisa */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
         <div className="flex justify-between items-start">
            <p className="text-slate-500 text-xs font-medium">Sisa (Nihil)</p>
            <i className="fa-solid fa-hourglass-half text-orange-200 text-sm"></i>
        </div>
        <h3 className="text-xl font-bold text-slate-800 mt-1">{remaining}</h3>
      </div>

      {/* Kartu 4: Persen */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
         <div className="flex justify-between items-start">
            <p className="text-slate-500 text-xs font-medium">Progress</p>
            <i className="fa-solid fa-chart-pie text-blue-200 text-sm"></i>
        </div>
        <h3 className="text-xl font-bold text-blue-600 mt-1">{percentage}%</h3>
      </div>
    </div>
  );
};