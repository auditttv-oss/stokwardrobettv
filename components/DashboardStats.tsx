import React from 'react';

interface DashboardStatsProps {
  total: number;
  scanned: number;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ total, scanned }) => {
  const remaining = total - scanned;
  const percentage = total > 0 ? Math.round((scanned / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">Total Items</p>
          <h3 className="text-2xl font-bold text-slate-800">{total}</h3>
        </div>
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
          <i className="fa-solid fa-boxes-stacked"></i>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 flex items-center justify-between relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 bg-emerald-500 w-1"></div>
        <div>
          <p className="text-emerald-600 text-sm font-medium">Scanned</p>
          <h3 className="text-2xl font-bold text-emerald-700">{scanned}</h3>
        </div>
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
          <i className="fa-solid fa-check-double"></i>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">Remaining</p>
          <h3 className="text-2xl font-bold text-slate-800">{remaining}</h3>
        </div>
        <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-orange-400">
          <i className="fa-solid fa-hourglass-half"></i>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div>
          <p className="text-slate-500 text-sm font-medium">Progress</p>
          <div className="flex items-end gap-1">
             <h3 className="text-2xl font-bold text-blue-600">{percentage}%</h3>
          </div>
        </div>
         <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
          <i className="fa-solid fa-chart-pie"></i>
        </div>
      </div>
    </div>
  );
};