// src/pages/ReportPage.jsx
import React, { useState, useEffect } from 'react';
import api, { BASE_URL } from '../services/api';
import { FileWarning, FileText, FileDown, BarChart2, CalendarRange } from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';

const EXPORT_CSV_API = `${BASE_URL}/workorders/report/export/csv`;
const EXPORT_PDF_API = `${BASE_URL}/workorders/report/export/pdf`;

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export default function ReportPage() {
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter periode — default bulan & tahun berjalan. isAll=true berarti
  // tombol "Semua" aktif (tanpa filter periode, tampilkan seluruh riwayat).
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [isAll, setIsAll] = useState(false);

  // Ambil data laporan — refetch tiap kali filter periode berubah
  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = isAll ? {} : { month, year };
        const response = await api.get('/workorders/report/asset_stats', { params });
        setReportData(response.data);
      } catch (err) {
        if (err.response) {
          setError(`Gagal mengambil data laporan: ${err.response.status} ${err.response.statusText}`);
        } else if (err.request) {
          setError("Gagal memuat data. Pastikan server Flask berjalan.");
        } else {
          setError(`Error: ${err.message}`);
        }
        console.error(err);
      }
      setLoading(false);
    };

    fetchReport();
  }, [month, year, isAll]);

  const handleMonthChange = (e) => { setIsAll(false); setMonth(Number(e.target.value)); };
  const handleYearChange = (e) => { setIsAll(false); setYear(Number(e.target.value)); };

  // --- LOGIKA EKSPOR — kirim periode filter aktif ke endpoint export ---
  const handleExport = (format) => {
    const query = isAll ? '' : `?month=${month}&year=${year}`;
    let url;
    if (format === 'CSV') {
        url = `${EXPORT_CSV_API}${query}`;
    } else if (format === 'PDF') {
        url = `${EXPORT_PDF_API}${query}`;
    } else {
        return;
    }
    window.open(url, '_blank');
  };

  if (error) {
    return <ErrorState message={error} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Laporan Kinerja</h1>
            <p className="text-slate-500 mt-1">Analisis detail performa work order berdasarkan aset.</p>
        </div>
        
        {/* Tombol Ekspor */}
        <div className="flex gap-3">
          <button
            onClick={() => handleExport('CSV')}
            disabled={loading || reportData.length === 0}
            className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown size={18} className="mr-2 text-green-600" /> Export CSV
          </button>
          <button
            onClick={() => handleExport('PDF')}
            disabled={loading || reportData.length === 0}
            className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText size={18} className="mr-2 text-red-600" /> Export PDF
          </button>
        </div>
      </div>
      
      {/* Filter Periode */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium shrink-0">
            <CalendarRange size={16} />
            Periode
          </div>
          <select
            value={month}
            onChange={handleMonthChange}
            className={`text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0 ${
              isAll ? 'border-slate-200 text-slate-400' : 'border-slate-300'
            }`}
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={handleYearChange}
            className={`text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0 ${
              isAll ? 'border-slate-200 text-slate-400' : 'border-slate-300'
            }`}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setIsAll(prev => !prev)}
            className={`text-sm font-semibold px-4 py-2 rounded-lg border transition-colors shrink-0 ${
              isAll
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Semua
          </button>
        </div>
      </div>

      {/* Card Tabel Laporan */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <BarChart2 size={20} className="text-blue-600"/>
            <h2 className="text-lg font-semibold text-slate-800">Statistik Work Order per Mesin</h2>
        </div>

        {loading && <LoadingState />}
        
        {!loading && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Nama Mesin (Aset)</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Open</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">In Progress</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Completed</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-900 uppercase tracking-wider">Total WO</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Completion Rate</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {reportData.length === 0 ? (
                   <tr>
                     <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                       <div className="flex flex-col items-center gap-3">
                         <div className="p-3 bg-slate-100 rounded-full">
                             <FileWarning size={32} className="text-slate-400" />
                         </div>
                         <p className="font-medium">Belum ada data Work Order untuk dianalisis.</p>
                       </div>
                     </td>
                   </tr>
                ) : (
                    reportData.map(item => {
                        // Hitung persentase penyelesaian
                        const completionRate = item.total_wo > 0 
                            ? Math.round((item.completed / item.total_wo) * 100) 
                            : 0;
                        
                        return (
                          <tr key={item.asset_id} className="hover:bg-slate-50 transition-colors group">
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-sm font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                                    {item.asset_name}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${item.open > 0 ? 'bg-red-100 text-red-700' : 'text-slate-400 bg-slate-100'}`}>
                                    {item.open}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${item.in_progress > 0 ? 'bg-amber-100 text-amber-700' : 'text-slate-400 bg-slate-100'}`}>
                                    {item.in_progress}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${item.completed > 0 ? 'bg-green-100 text-green-700' : 'text-slate-400 bg-slate-100'}`}>
                                    {item.completed}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <span className="text-sm font-bold text-slate-900">{item.total_wo}</span>
                            </td>
                            
                            {/* Kolom Baru: Completion Rate Progress Bar */}
                            <td className="px-6 py-4 whitespace-nowrap">
                                <div className="flex items-center gap-2 justify-center">
                                    <div className="w-16 bg-slate-200 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full ${completionRate === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                                            style={{ width: `${completionRate}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs font-medium text-slate-600">{completionRate}%</span>
                                </div>
                            </td>
                          </tr>
                        );
                    })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}