// src/pages/DashboardPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import ErrorState from '../components/ErrorState.jsx';
import { 
    Loader2, CheckCircle, Package, Activity, 
    Wrench, ShieldCheck, CalendarClock, ArrowRight, User, Box, AlertOctagon 
} from 'lucide-react';
import StatusChart from '../components/StatusChart.jsx';
import AssetWOChart from '../components/AssetWOChart.jsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth.js';
import { useSocket } from '../context/useSocket.js';

// --- KOMPONEN STAT CARD ---
const StatCard = ({ title, value, subtitle, icon, color, isLoading, linkTo, alert }) => (
  <div className={`group relative bg-white p-5 rounded-2xl border ${alert ? 'border-red-200 bg-red-50' : 'border-slate-100'} shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden`}>
    
    {/* Decorative Blob */}
    <div 
        className="absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 transition-transform group-hover:scale-150"
        style={{ backgroundColor: color }}
    />

    <div className="flex items-center justify-between mb-3 relative z-10">
        <div 
            className="p-2.5 rounded-xl"
            style={{ backgroundColor: alert ? '#FEE2E2' : `${color}15`, color: color }} 
        >
            {React.createElement(icon, { size: 22 })}
        </div>
        {linkTo && (
            <Link to={linkTo} className="text-[10px] font-bold text-slate-400 hover:text-blue-600 flex items-center gap-1 uppercase tracking-wider">
                Lihat <ArrowRight size={10}/>
            </Link>
        )}
    </div>

    <div className="relative z-10">
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wide mb-1">{title}</p>
        {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        ) : (
            <div className="flex items-baseline gap-2">
                <h3 className={`text-2xl font-extrabold ${alert ? 'text-red-600' : 'text-slate-800'}`}>{value}</h3>
                {subtitle && <span className="text-[10px] text-slate-400 font-medium">{subtitle}</span>}
            </div>
        )}
    </div>
  </div>
);

export default function DashboardPage() {
  const { checkRole } = useAuth();
  const { socket } = useSocket();
  const [stats, setStats] = useState({
    total_assets: 0,
    down_assets: 0,
    
    // Inventory
    total_components: 0,
    low_stock_components: 0,

    open_work_orders: 0,
    in_progress_work_orders: 0,
    pending_verification_orders: 0, 
    completed_work_orders: 0, 
    total_work_orders: 0,
    upcoming_schedules: [], 
    verification_needed_list: [], 
    wo_asset_report: [],
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsResponse, assetReportResponse] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/workorders/report/asset_stats'),
      ]);

      // Endpoint report sudah mengagregasi per-asset di backend (tanpa foto
      // base64 yang ada di payload WO penuh), jadi tinggal dipetakan ke bentuk
      // yang dipakai chart (open = semua status yang belum selesai).
      const wo_asset_report = assetReportResponse.data.map(r => ({
          asset_name: r.asset_name,
          open: r.open + r.in_progress + r.pending_approval + r.pending_verification,
          completed: r.completed,
      }));

      setStats({
          ...statsResponse.data,
          wo_asset_report
      });

    } catch (err) {
      if (err.response) setError(`Gagal: ${err.response.status}`);
      else if (err.request) setError("Koneksi Server Gagal");
      else setError(err.message);
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-refresh saat ada WO atau aset dibuat/diubah/dihapus dari sesi lain
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchStats();
    socket.on('wo_updated', handleUpdate);
    socket.on('asset_updated', handleUpdate);
    return () => {
      socket.off('wo_updated', handleUpdate);
      socket.off('asset_updated', handleUpdate);
    };
  }, [socket, fetchStats]);

  if (error) return <ErrorState message={error} />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-900">Maintenance Overview</h1>
            <p className="text-slate-500 mt-1 text-sm">Analisis performa aset, inventaris, dan status pekerjaan.</p>
        </div>
        <div className="bg-white px-3 py-1.5 rounded-full shadow-sm border border-slate-200 text-xs font-medium text-slate-600 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            System Online
        </div>
      </div>
      
      {/* --- ROW 1: OVERVIEW STATS (6 Kolom) --- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        
        {/* 1. Total Aset */}
        <StatCard 
          title="Total Aset" 
          value={stats.total_assets} 
          icon={Package}
          color="#3B82F6" // Blue
          isLoading={loading} 
          linkTo="/assets"
        />

        {/* 2. Total Komponen (Inventory) */}
        <StatCard 
          title="Total Sparepart" 
          value={stats.total_components} 
          icon={Box}
          color="#6366F1" // Indigo
          isLoading={loading} 
          linkTo="/inventory"
        />
        
        {/* 3. Stok Menipis (Alert Inventory) */}
        <StatCard 
          title="Stok Menipis" 
          value={stats.low_stock_components} 
          icon={AlertOctagon}
          color="#F43F5E" // Rose
          isLoading={loading} 
          linkTo="/inventory"
          alert={stats.low_stock_components > 0} // Highlight merah jika ada stok tipis
        />

        {/* 4. WO Aktif */}
        <StatCard 
          title="WO Dikerjakan" 
          value={stats.in_progress_work_orders} 
          icon={Wrench}
          color="#F59E0B" // Amber
          isLoading={loading}
          linkTo="/work-orders"
        />

        {/* 5. Butuh Verifikasi */}
        <StatCard 
          title="Verifikasi" 
          value={stats.pending_verification_orders} 
          icon={ShieldCheck}
          color="#8B5CF6" // Purple
          isLoading={loading} 
          linkTo="/work-orders"
        />

        {/* 6. Mesin Down (Critical) */}
        <StatCard 
          title="Mesin Down" 
          value={stats.down_assets}
          icon={Activity}
          color="#EF4444" // Red
          isLoading={loading}
          linkTo="/assets"
          alert={stats.down_assets > 0}
        />
      </div>
      
      {/* --- ROW 2: DETAIL OPERASIONAL --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* KOLOM KIRI: Chart Status */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 border-b pb-2">Distribusi WO</h2>
              <div className="flex-1 flex flex-col justify-center">
                  {loading ? <Loader2 className="animate-spin mx-auto text-slate-300"/> : (
                      <StatusChart 
                          open={stats.open_work_orders}
                          inProgress={stats.in_progress_work_orders}
                          completed={stats.completed_work_orders}
                      />
                  )}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-center">
                  <div className="p-2 bg-slate-50 rounded border border-slate-100">
                      <span className="block font-bold text-slate-800 text-lg">{stats.total_work_orders}</span>
                      Total WO
                  </div>
                  <div className="p-2 bg-purple-50 rounded border border-purple-100">
                      <span className="block font-bold text-purple-700 text-lg">{stats.pending_verification_orders}</span>
                      Pending
                  </div>
              </div>
          </div>

          {/* KOLOM TENGAH & KANAN: List Detail */}
          <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* 1. JADWAL MENDATANG */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-96">
                   <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                            <CalendarClock className="text-blue-500" size={18}/> 
                            Jadwal <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full text-slate-500">7 Hari</span>
                        </h2>
                        <Link to="/schedules" className="text-[10px] font-bold text-blue-600 hover:underline uppercase">Semua</Link>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {loading ? <Loader2 className="animate-spin mx-auto mt-10 text-slate-300"/> : 
                         stats.upcoming_schedules.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-50 rounded-xl">
                                 <CheckCircle size={24} className="mb-2 text-green-400"/>
                                 Tidak ada jadwal mendesak.
                             </div>
                         ) : (
                             stats.upcoming_schedules.map((sch, idx) => (
                                 <div key={idx} className="p-3 rounded-lg border border-slate-100 hover:bg-blue-50 transition-colors flex justify-between items-center group">
                                     <div>
                                         <p className="font-bold text-slate-700 text-xs group-hover:text-blue-700">{sch.task_name}</p>
                                         <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                             <Package size={10}/> {sch.asset_name}
                                         </p>
                                     </div>
                                     <div className="text-right">
                                         <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                             sch.priority === 'high' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                         }`}>
                                             {sch.days_left < 0 ? `Terlewat ${Math.abs(sch.days_left)} Hari` : sch.days_left === 0 ? "HARI INI" : `${sch.days_left} Hari`}
                                         </span>
                                     </div>
                                 </div>
                             ))
                         )
                        }
                   </div>
              </div>

              {/* 2. BUTUH VERIFIKASI */}
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col h-96">
                   <div className="flex justify-between items-center mb-4 border-b pb-2">
                        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                            <ShieldCheck className="text-purple-500" size={18}/> 
                            Verifikasi <span className="text-[10px] text-white bg-purple-500 px-1.5 rounded-full">{stats.pending_verification_orders}</span>
                        </h2>
                        <Link to="/work-orders" className="text-[10px] font-bold text-purple-600 hover:underline uppercase">Proses</Link>
                   </div>

                   <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                        {loading ? <Loader2 className="animate-spin mx-auto mt-10 text-slate-300"/> : 
                         stats.verification_needed_list.length === 0 ? (
                             <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs border-2 border-dashed border-slate-50 rounded-xl">
                                 <CheckCircle size={24} className="mb-2 text-purple-300"/>
                                 Semua pekerjaan beres.
                             </div>
                         ) : (
                             stats.verification_needed_list.map((wo, idx) => (
                                 <div key={idx} className="p-3 rounded-lg border border-purple-100 bg-purple-50/20 hover:bg-purple-50 transition-colors group">
                                     <div className="flex justify-between items-start mb-1">
                                         <p className="font-bold text-slate-700 text-xs line-clamp-1 group-hover:text-purple-700">{wo.title}</p>
                                         <Link to="/work-orders" className="text-[9px] bg-white border border-purple-200 text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-600 hover:text-white transition uppercase font-bold">
                                             Review
                                         </Link>
                                     </div>
                                     <div className="flex justify-between items-end text-[10px] text-slate-500">
                                         <span>{wo.asset_name}</span>
                                         <span className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-100">
                                             <User size={8}/> {wo.technician}
                                         </span>
                                     </div>
                                 </div>
                             ))
                         )
                        }
                   </div>
              </div>

          </div>
      </div>

      {/* --- ROW 3: CHART PERFORMA ASET --- */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
              <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Analisis Beban Kerja Aset</h2>
                  <p className="mt-1 text-xs text-slate-500">Perbandingan work order open/berjalan dan selesai per aset.</p>
              </div>
              {!loading && checkRole(['admin', 'manager']) && (
                  <Link to="/reports" className="text-[10px] font-bold text-blue-600 hover:underline uppercase tracking-wide">
                      Laporan Detail
                  </Link>
              )}
          </div>
          {loading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              </div>
          ) : (
              <div className="min-h-0">
                  <AssetWOChart 
                      reportData={stats.wo_asset_report.map(r => ({
                        asset_name: r.asset_name, 
                        open: r.open, 
                        completed: r.completed
                      }))}
                  />
              </div>
          )}
      </div>
    </div>
  );
}
