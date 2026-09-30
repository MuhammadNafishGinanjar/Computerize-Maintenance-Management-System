// src/pages/MaintenanceHistoryPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api, { BASE_URL } from '../services/api';
import {
    FileWarning, History, CalendarCheck, Wrench, HardDrive,
    Eye, X, User, CheckCircle2, AlertTriangle, Image as ImageIcon, FileText,
    Download, FileDown, Search, ArrowUpDown, ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Modal from '../components/Modal.jsx';
import { useSocket } from '../context/useSocket.js';

const PAGE_SIZE = 20;

export default function MaintenanceHistoryPage() {
  const { socket } = useSocket();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State untuk Detail Modal
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedWo, setSelectedWo] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // State untuk Zoom Gambar Fullscreen
  const [viewImage, setViewImage] = useState(null);

  // Search, Sort & Filter — dikirim ke backend, bukan difilter di client,
  // supaya tidak perlu menarik seluruh riwayat (bisa ribuan WO + foto) sekaligus.
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState('date_desc');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Debounce input pencarian agar tidak fetch di setiap ketikan
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: PAGE_SIZE, sort: sortKey };
      if (debouncedSearch) params.search = debouncedSearch;
      if (typeFilter !== 'all') params.type = typeFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const response = await api.get('/workorders/history', { params });
      setItems(response.data.items || []);
      setTotal(response.data.total || 0);
      setPages(response.data.pages || 1);
    } catch (err) {
      if (err.response) {
        setError(`Gagal mengambil data: ${err.response.status} ${err.response.statusText}`);
      } else if (err.request) {
        setError("Gagal memuat data. Pastikan server Flask berjalan.");
      } else {
        setError(`Error: ${err.message}`);
      }
      console.error(err);
    }
    setLoading(false);
  }, [page, sortKey, debouncedSearch, typeFilter, priorityFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Auto-refresh saat ada WO diverifikasi/selesai dari sesi lain
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchHistory();
    socket.on('wo_updated', handleUpdate);
    return () => {
      socket.off('wo_updated', handleUpdate);
    };
  }, [socket, fetchHistory]);

  const hasActiveFilters = Boolean(debouncedSearch) || typeFilter !== 'all' || priorityFilter !== 'all';

  // Detail (termasuk foto) baru ditarik saat user benar-benar buka modalnya —
  // list utama tidak lagi membawa base64 gambar tiap WO.
  const handleViewDetail = async (wo) => {
      setSelectedWo(wo);
      setIsDetailModalOpen(true);
      setDetailLoading(true);
      try {
          const response = await api.get(`/workorders/${wo.id}`);
          setSelectedWo(response.data);
      } catch (err) {
          console.error('Gagal memuat detail work order:', err);
      }
      setDetailLoading(false);
  };

  const handleExport = (format) => {
    window.open(`${BASE_URL}/workorders/history/export/${format}`, '_blank');
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
      timeZoneName: 'short'     
    }).format(date);
  };

  if (error) return <ErrorState message={error} />;

  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Riwayat Perawatan</h1>
            <p className="text-slate-500 mt-1">Arsip lengkap Work Order yang telah diselesaikan dan diverifikasi.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={loading || total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Unduh riwayat perawatan sebagai CSV"
          >
            <FileDown size={16} />
            Export CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={loading || total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Unduh riwayat perawatan sebagai PDF"
          >
            <Download size={16} />
            Export PDF
          </button>
        </div>
      </div>
      
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari judul, aset, atau teknisi..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown size={15} className="text-slate-400" />
            <select
              value={sortKey}
              onChange={e => { setSortKey(e.target.value); setPage(1); }}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="date_desc">Terbaru</option>
              <option value="date_asc">Terlama</option>
              <option value="title_asc">Judul A→Z</option>
              <option value="title_desc">Judul Z→A</option>
            </select>
          </div>
          <select
            value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="all">Semua Tipe</option>
            <option value="preventive">Preventive</option>
            <option value="corrective">Corrective</option>
          </select>
          <select
            value={priorityFilter}
            onChange={e => { setPriorityFilter(e.target.value); setPage(1); }}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="all">Semua Prioritas</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Tabel Riwayat */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && <LoadingState />}
        
        {!loading && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <div className="flex items-center gap-1"><History size={14}/> Judul WO</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1"><HardDrive size={14}/> Aset</div>
                  </th>
                  {/* KOLOM BARU: TEKNISI */}
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1"><User size={14}/> Teknisi</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1"><Wrench size={14}/> Tipe & Prioritas</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1"><CalendarCheck size={14}/> Tanggal Selesai</div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Detail
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {items.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-slate-100 rounded-full">
                            <FileWarning size={32} className="text-slate-400" />
                        </div>
                        {!hasActiveFilters ? (
                          <>
                            <p className="font-medium">Belum ada riwayat perawatan.</p>
                            <p className="text-sm">Work Order yang statusnya "Completed" akan muncul di sini.</p>
                          </>
                        ) : (
                          <p className="font-medium">Tidak ada hasil untuk pencarian ini.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {items.map(wo => (
                  <tr key={wo.id} className="hover:bg-slate-50 transition-colors">
                    
                    {/* Judul */}
                    <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{wo.title}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{wo.description || 'Tidak ada deskripsi'}</div>
                    </td>
                    
                    {/* Aset */}
                    <td className="px-6 py-4">
                        <div className="text-sm font-medium text-slate-800">{wo.asset_name}</div>
                        {wo.component_name && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 mt-1">
                                Komponen: {wo.component_name}
                            </span>
                        )}
                    </td>

                    {/* TEKNISI (DATA BARU) */}
                    <td className="px-6 py-4 whitespace-nowrap">
                         <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                 {wo.assigned_to ? wo.assigned_to.charAt(0).toUpperCase() : '?'}
                             </div>
                             <span className="text-sm text-slate-700 font-medium">
                                 {wo.assigned_to || <span className="text-slate-400 italic">Tidak ada</span>}
                             </span>
                         </div>
                    </td>
                    
                    {/* Tipe & Prioritas */}
                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded border w-fit ${
                                wo.type === 'preventive' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                            }`}>
                                {wo.type === 'preventive' ? 'Preventive' : 'Corrective'}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border w-fit ${
                                wo.priority === 'high' ? 'bg-red-50 text-red-600 border-red-100' : 
                                wo.priority === 'medium' ? 'bg-yellow-50 text-yellow-600 border-yellow-100' :
                                'bg-green-50 text-green-600 border-green-100'
                            }`}>
                                {wo.priority ? wo.priority.toUpperCase() : 'NORMAL'}
                            </span>
                        </div>
                    </td>
                    
                    {/* Tanggal Selesai */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                        {formatDate(wo.completed_at)}
                    </td>
                    
                    {/* Tombol Detail */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button 
                            onClick={() => handleViewDetail(wo)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                            title="Lihat Detail Lengkap"
                        >
                            <Eye size={20} />
                        </button>
                    </td>
                  
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-t border-slate-200 bg-slate-50">
            <p className="text-xs text-slate-500">
              Menampilkan <b>{rangeStart}-{rangeEnd}</b> dari <b>{total}</b> riwayat
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-medium text-slate-600">Halaman {page} / {pages}</span>
              <button
                onClick={() => setPage(p => Math.min(p + 1, pages))}
                disabled={page >= pages}
                className="p-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL DETAIL WO --- */}
      {isDetailModalOpen && selectedWo && (
          <Modal
            isOpen={isDetailModalOpen}
            onClose={() => setIsDetailModalOpen(false)}
            title="Detail Riwayat Work Order"
          >
              <div className="space-y-6">
                  
                  {/* Header Status */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-full text-green-600">
                          <CheckCircle2 size={24} />
                      </div>
                      <div>
                          <h4 className="font-bold text-green-800 text-lg">Selesai & Terverifikasi</h4>
                          <p className="text-sm text-green-700">
                              Diselesaikan pada: <b>{formatDate(selectedWo.completed_at)}</b>
                          </p>
                      </div>
                  </div>

                  {/* Informasi Utama */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Judul Pekerjaan</label>
                              <p className="text-slate-800 font-bold text-lg">{selectedWo.title}</p>
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aset & Komponen</label>
                              <p className="text-slate-700 flex items-center gap-2">
                                  <HardDrive size={16} /> {selectedWo.asset_name}
                              </p>
                              {selectedWo.component_name && (
                                  <p className="text-slate-500 text-sm ml-6 mt-1">• Komponen: {selectedWo.component_name}</p>
                              )}
                          </div>
                          <div>
                               <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Deskripsi Masalah</label>
                               <div className="bg-slate-50 p-3 rounded-md border border-slate-200 mt-1">
                                   <p className="text-slate-600 text-sm leading-relaxed">
                                       {selectedWo.description || "Tidak ada deskripsi detail."}
                                   </p>
                               </div>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dibuat Oleh</label>
                                  <p className="text-slate-700 flex items-center gap-1 text-sm capitalize">
                                      <User size={14} /> {selectedWo.created_by_role || 'System'}
                                  </p>
                              </div>
                              <div>
                                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Teknisi</label>
                                  <p className="text-slate-700 flex items-center gap-1 text-sm font-bold">
                                      <Wrench size={14} /> {selectedWo.assigned_to || '-'}
                                  </p>
                              </div>
                          </div>
                          
                          <div>
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Waktu Pengerjaan</label>
                              <div className="text-sm text-slate-600 mt-1 space-y-1 bg-slate-50 p-2 rounded border border-slate-100">
                                  <div className="flex justify-between border-b border-slate-200 pb-1">
                                      <span>Dibuat:</span> <span className="font-medium">{formatDate(selectedWo.created_at)}</span>
                                  </div>
                                  <div className="flex justify-between font-bold text-green-700 pt-1">
                                      <span>Selesai:</span> <span>{formatDate(selectedWo.completed_at)}</span>
                                  </div>
                              </div>
                          </div>

                          <div className="flex gap-2">
                              <div className={`px-3 py-1.5 rounded-lg border text-sm font-medium w-full text-center ${
                                  selectedWo.type === 'preventive' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-orange-50 border-orange-200 text-orange-700'
                              }`}>
                                  Tipe: {selectedWo.type === 'preventive' ? 'Preventive' : 'Corrective'}
                              </div>
                              <div className="px-3 py-1.5 rounded-lg border bg-slate-50 border-slate-200 text-slate-600 text-sm font-medium w-full text-center capitalize">
                                  Prioritas: {selectedWo.priority}
                              </div>
                          </div>
                      </div>
                  </div>

                  {/* GALERI FOTO (DOKUMENTASI) — ditarik on-demand saat modal dibuka */}
                  <div>
                      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 border-b pb-2">
                          <FileText size={18}/> Dokumentasi Pekerjaan
                      </h3>

                      {detailLoading ? (
                          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-10">
                              <Loader2 size={18} className="animate-spin" /> Memuat foto dokumentasi...
                          </div>
                      ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* FOTO AWAL */}
                          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
                              <div className="flex items-center gap-2 mb-3 text-red-700 font-bold">
                                  <AlertTriangle size={18}/> Kondisi Awal (Masalah)
                              </div>
                              <div 
                                className="aspect-video bg-white rounded-lg border border-red-200 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                                onClick={() => selectedWo.initial_image && setViewImage(selectedWo.initial_image)}
                              >
                                  {selectedWo.initial_image ? (
                                      <img src={selectedWo.initial_image} alt="Awal" className="w-full h-full object-contain" />
                                  ) : (
                                      <div className="text-red-300 flex flex-col items-center">
                                          <ImageIcon size={32} />
                                          <span className="text-xs mt-1">Tidak ada foto</span>
                                      </div>
                                  )}
                              </div>
                          </div>

                          {/* FOTO AKHIR */}
                          <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                              <div className="flex items-center gap-2 mb-3 text-green-700 font-bold">
                                  <CheckCircle2 size={18}/> Kondisi Akhir (Selesai)
                              </div>
                              <div 
                                className="aspect-video bg-white rounded-lg border border-green-200 flex items-center justify-center overflow-hidden cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                                onClick={() => selectedWo.evidence_image && setViewImage(selectedWo.evidence_image)}
                              >
                                  {selectedWo.evidence_image ? (
                                      <img src={selectedWo.evidence_image} alt="Akhir" className="w-full h-full object-contain" />
                                  ) : (
                                      <div className="text-green-300 flex flex-col items-center">
                                          <ImageIcon size={32} />
                                          <span className="text-xs mt-1">Tidak ada foto</span>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                      )}
                  </div>

                  <div className="flex justify-end pt-4 border-t border-slate-100">
                      <button 
                          onClick={() => setIsDetailModalOpen(false)}
                          className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors font-medium"
                      >
                          Tutup Detail
                      </button>
                  </div>

              </div>
          </Modal>
      )}

      {/* --- LIGHTBOX GAMBAR FULLSCREEN --- */}
      {viewImage && (
        <div className="fixed inset-0 z-[70] bg-black bg-opacity-95 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewImage(null)}>
            <button className="absolute top-6 right-6 text-white p-2 hover:bg-white/20 rounded-full transition-colors">
                <X size={32} />
            </button>
            <img 
                src={viewImage} 
                alt="Fullscreen" 
                className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                onClick={(e) => e.stopPropagation()} 
            />
        </div>
      )}

    </div>
  );
}