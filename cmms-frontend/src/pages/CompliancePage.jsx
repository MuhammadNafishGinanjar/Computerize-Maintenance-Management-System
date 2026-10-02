// src/pages/CompliancePage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useSocket } from '../context/useSocket.js';
import { FileWarning, CheckCircle, Clock, RefreshCw, AlertTriangle, ShieldCheck, Plus, Calendar, Search, ArrowUpDown, Eye, Upload, Loader2, History, Check, Download } from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import ComplianceForm from './ComplianceForm.jsx';
import Modal from '../components/Modal.jsx'; // <-- Impor Modal

export default function CompliancePage() {
  const { socket } = useSocket();
  const [logs, setLogs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State untuk Modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  // State untuk Modal Upload Sertifikat (saat "Tandai Selesai")
  const [isCertModalOpen, setIsCertModalOpen] = useState(false);
  const [logToComplete, setLogToComplete] = useState(null);
  const [certificateImage, setCertificateImage] = useState('');
  const [certExpiryDate, setCertExpiryDate] = useState('');
  const [certError, setCertError] = useState(null);
  const [isSubmittingCert, setIsSubmittingCert] = useState(false);

  // State untuk Modal Riwayat Kalibrasi (per aset + regulasi)
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // State untuk Modal Viewer Sertifikat
  const [certViewerOpen, setCertViewerOpen] = useState(false);
  const [certViewerData, setCertViewerData] = useState('');
  const [certViewerType, setCertViewerType] = useState('image'); // 'image' | 'pdf'

  // State untuk input Jatuh Tempo per log (key = log.id)
  const [pendingDates, setPendingDates] = useState({});
  const [savingDateId, setSavingDateId] = useState(null);

  // Search, Sort & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('name_asc');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
        const [logResponse, assetResponse] = await Promise.all([
            api.get('/compliance/logs'),
            api.get('/assets')
        ]);
        
        setLogs(logResponse.data);
        setAssets(assetResponse.data);
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
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, []);

  // Refetch log saja (tanpa spinner/loading penuh) — dipakai listener socket.
  const fetchLogs = useCallback(async () => {
    try {
      const response = await api.get('/compliance/logs');
      setLogs(response.data);
    } catch (err) {
      console.error("Gagal refresh log kepatuhan:", err);
    }
  }, []);

  // Auto-refresh saat log kepatuhan berubah dari sesi lain / otomatis di backend
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchLogs();
    socket.on('compliance_updated', handleUpdate);
    return () => {
      socket.off('compliance_updated', handleUpdate);
    };
  }, [socket, fetchLogs]);

  const handleLogCreated = (newLog) => {
    setLogs([newLog, ...logs]);
    setIsModalOpen(false); // Tutup modal
  };
  
  // FUNGSI UPDATE STATUS
  const handleUpdateStatus = async (logId, newStatus) => {
    const originalLogs = [...logs];
    
    // Optimistic Update
    setLogs(logs.map(log =>
        log.id === logId ? { ...log, status: newStatus } : log
    ));

    try {
        await api.patch(`/compliance/logs/${logId}`, { status: newStatus });
        const updatedLogs = await api.get('/compliance/logs');
        setLogs(updatedLogs.data);
    } catch (err) {
        console.error("Gagal update status kepatuhan:", err);
        setLogs(originalLogs);
        alert(`Gagal mengubah status. Cek konsol untuk info.`);
    }
  };

  // --- Upload Sertifikat saat "Tandai Selesai" ---
  const handleFinishClick = (log) => {
    setLogToComplete(log);
    setCertificateImage('');
    setCertExpiryDate('');
    setCertError(null);
    setIsCertModalOpen(true);
  };

  const handleCertificateFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCertificateImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitCertificate = async (e) => {
    e.preventDefault();
    if (!certExpiryDate) { setCertError("Tanggal berlaku sertifikat wajib diisi"); return; }
    if (!certificateImage) { setCertError("Wajib upload sertifikat."); return; }

    setCertError(null);
    setIsSubmittingCert(true);
    try {
      const response = await api.patch(`/compliance/logs/${logToComplete.id}`, {
        status: 'compliant',
        certificate_image: certificateImage,
        next_check_due: certExpiryDate,
      });
      // PATCH mengembalikan { updated: <log, sekarang compliant> }. Refetch
      // semua log supaya siklus baru dari H-7 (dibuat di GET /logs) langsung
      // muncul tanpa reload manual.
      setLogs(prev => prev.map(l =>
        l.id === logToComplete.id ? response.data.updated : l
      ));
      await fetchLogs();
      setIsCertModalOpen(false);
      setLogToComplete(null);
      setCertificateImage('');
      setCertExpiryDate('');
    } catch (err) {
      setCertError(err.response?.data?.error || "Gagal menandai selesai.");
    }
    setIsSubmittingCert(false);
  };

  // Sertifikat ditampilkan di modal (bukan tab baru): <img>/<iframe> menerima
  // data URI langsung, jadi tidak perlu Blob.
  const handleViewCertificate = (dataUri) => {
    if (dataUri.startsWith('data:image/')) {
      setCertViewerType('image');
    } else if (dataUri.startsWith('data:application/pdf')) {
      setCertViewerType('pdf');
    } else {
      alert("Format sertifikat tidak didukung.");
      return;
    }
    setCertViewerData(dataUri);
    setCertViewerOpen(true);
  };

  // --- Set Jatuh Tempo untuk siklus baru (next_check_due masih kosong) ---
  const handleSaveDueDate = async (log) => {
    const selectedDate = pendingDates[log.id];
    if (!selectedDate) return;
    setSavingDateId(log.id);
    try {
      const response = await api.patch(`/compliance/logs/${log.id}`, {
        next_check_due: selectedDate,
      });
      setLogs(prev => prev.map(l => (l.id === log.id ? response.data.updated : l)));
      setPendingDates(prev => {
        const { [log.id]: _removed, ...rest } = prev;
        return rest;
      });
    } catch (err) {
      alert(err.response?.data?.error || "Gagal menyimpan jatuh tempo.");
    }
    setSavingDateId(null);
  };

  // --- Riwayat Siklus Kalibrasi ---
  const handleViewHistory = async (log) => {
    setHistoryTarget({ regulation_name: log.regulation_name, asset_name: log.asset_name });
    setIsHistoryModalOpen(true);
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await api.get(
        `/compliance/logs/history/${log.asset_id}/${encodeURIComponent(log.regulation_name)}`
      );
      setHistoryLogs(response.data);
    } catch (err) {
      setHistoryError(err.response?.data?.error || "Gagal memuat riwayat kalibrasi.");
    }
    setHistoryLoading(false);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };
  
  const getStatusInfo = (status) => {
    switch (status) {
      case 'pending':
        return { text: 'Pending', class: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock };
      case 'compliant':
        return { text: 'Compliant', class: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle };
      case 'overdue':
        return { text: 'Overdue', class: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle };
      default:
        return { text: status, class: 'bg-gray-100 text-gray-700 border-gray-200', icon: AlertTriangle };
    }
  };

  if (error) return <ErrorState message={error} />;

  // Tabel utama hanya menampilkan siklus TERBARU per kombinasi aset+regulasi
  // — record lama tetap ada di database sebagai riwayat, cuma disembunyikan
  // dari tampilan utama (lihat lewat tombol "Riwayat Kalibrasi").
  const latestLogs = Array.from(
    logs.reduce((map, log) => {
      const key = `${log.asset_id}::${log.regulation_name}`;
      const existing = map.get(key);
      if (!existing || new Date(log.created_at) > new Date(existing.created_at)) {
        map.set(key, log);
      }
      return map;
    }, new Map()).values()
  );

  const displayedLogs = latestLogs
    .filter(log => {
      const q = searchTerm.toLowerCase();
      const matchSearch = (log.regulation_name || '').toLowerCase().includes(q) ||
        (log.asset_name || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || log.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortKey === 'name_asc') return (a.regulation_name || '').localeCompare(b.regulation_name || '');
      if (sortKey === 'name_desc') return (b.regulation_name || '').localeCompare(a.regulation_name || '');
      if (sortKey === 'date_asc') return new Date(a.next_check_due) - new Date(b.next_check_due);
      if (sortKey === 'date_desc') return new Date(b.next_check_due) - new Date(a.next_check_due);
      return 0;
    });

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Manajemen Kalibrasi & Regulasi</h1>
            <p className="text-slate-500 mt-1">Monitor status kalibrasi dan regulasi aset.</p>
        </div>
        <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md hover:bg-blue-700 transition-all transform hover:-translate-y-0.5"
        >
            <Plus size={18} className="mr-2" /> Catat Log Baru
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari regulasi atau nama aset..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ArrowUpDown size={15} className="text-slate-400" />
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            >
              <option value="name_asc">Nama A→Z</option>
              <option value="name_desc">Nama Z→A</option>
              <option value="date_asc">Jatuh Tempo Terdekat</option>
              <option value="date_desc">Jatuh Tempo Terjauh</option>
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="all">Semua Status</option>
            <option value="pending">Pending</option>
            <option value="compliant">Compliant</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Tabel Daftar Log */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && <LoadingState />}
        
        {!loading && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2"><ShieldCheck size={14}/> Regulasi / Standar</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Mesin (Aset)</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2"><Calendar size={14}/> Jatuh Tempo</div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Sertifikat</th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Tindakan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {displayedLogs.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-slate-100 rounded-full">
                            <FileWarning size={32} className="text-slate-400" />
                        </div>
                        {logs.length === 0 ? (
                          <>
                            <p className="font-medium">Belum ada log kepatuhan.</p>
                            <p className="text-sm">Catat log baru untuk memulai pelacakan.</p>
                          </>
                        ) : (
                          <p className="font-medium">Tidak ada hasil untuk pencarian ini.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {displayedLogs.map(log => {
                    const statusInfo = getStatusInfo(log.status);
                    const IconComponent = statusInfo.icon;
                    return (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                            
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                                {log.regulation_name}
                            </td>
                            
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-medium">
                                {log.asset_name}
                            </td>
                            
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusInfo.class}`}>
                                <IconComponent size={12} className="mr-1.5" />
                                {statusInfo.text}
                              </span>
                            </td>
                            
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">
                                {!log.next_check_due && log.status === 'pending' ? (
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} className="text-slate-400 shrink-0" />
                                        <input
                                            type="date"
                                            min={new Date().toISOString().split('T')[0]}
                                            placeholder="Atur jatuh tempo"
                                            title="Atur jatuh tempo"
                                            value={pendingDates[log.id] || ''}
                                            onChange={e => setPendingDates(prev => ({ ...prev, [log.id]: e.target.value }))}
                                            className="text-sm border border-slate-300 rounded-lg px-2 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button
                                            onClick={() => handleSaveDueDate(log)}
                                            disabled={!pendingDates[log.id] || savingDateId === log.id}
                                            title="Simpan jatuh tempo"
                                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-40"
                                        >
                                            {savingDateId === log.id ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                        </button>
                                    </div>
                                ) : (
                                    formatDate(log.next_check_due)
                                )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                {log.status === 'pending' ? (
                                    (() => {
                                        // Siklus pending: sertifikat dari siklus compliant
                                        // sebelumnya (yang terbaru) masih berlaku.
                                        const prevCompliant = logs
                                            .filter(l =>
                                                l.asset_id === log.asset_id &&
                                                l.regulation_name === log.regulation_name &&
                                                l.status === 'compliant' &&
                                                l.certificate_image
                                            )
                                            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
                                        return prevCompliant ? (
                                            <div className="flex flex-col items-center">
                                                <button
                                                    onClick={() => handleViewCertificate(prevCompliant.certificate_image)}
                                                    title="Lihat sertifikat aktif"
                                                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <span className="text-xs text-green-600">
                                                    Aktif s/d {formatDate(prevCompliant.next_check_due)}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-slate-300">-</span>
                                        );
                                    })()
                                ) : log.certificate_image ? (
                                    <button
                                        onClick={() => handleViewCertificate(log.certificate_image)}
                                        title="Lihat Sertifikat"
                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Eye size={18} />
                                    </button>
                                ) : (
                                    <span className="text-slate-300">-</span>
                                )}
                            </td>

                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    {(log.status === 'pending' || log.status === 'overdue') && (
                                        <button
                                            onClick={() => handleFinishClick(log)}
                                            title="Tandai Selesai (Compliant)"
                                            className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition"
                                        >
                                            <CheckCircle size={18} />
                                        </button>
                                    )}
                                    {log.status === 'compliant' && (
                                        <button
                                            onClick={() => handleUpdateStatus(log.id, 'pending')}
                                            title="Reset ke Pending"
                                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                        >
                                            <RefreshCw size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleViewHistory(log)}
                                        title="Riwayat Kalibrasi"
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                    >
                                        <History size={18} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL CREATE */}
      {isModalOpen && (
        <Modal 
            isOpen={isModalOpen} 
            onClose={() => setIsModalOpen(false)} 
            title="Catat Log Kepatuhan Baru"
        >
            <ComplianceForm 
                assets={assets} 
                onLogCreated={handleLogCreated} 
                // Tambahkan prop onClose jika ComplianceForm mendukungnya, atau biarkan form menanganinya
            />
        </Modal>
      )}

      {/* MODAL UPLOAD SERTIFIKAT (saat "Tandai Selesai") */}
      {isCertModalOpen && logToComplete && (
        <Modal
            isOpen={isCertModalOpen}
            onClose={() => { setIsCertModalOpen(false); setLogToComplete(null); setCertExpiryDate(''); }}
            title="Upload Sertifikat Kalibrasi"
        >
            <form onSubmit={handleSubmitCertificate} className="space-y-4">
                {certError && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{certError}</div>}

                <p className="text-sm text-slate-600">
                    Tandai <b>{logToComplete.regulation_name}</b> ({logToComplete.asset_name}) selesai —
                    unggah sertifikat/bukti kalibrasi terlebih dahulu.
                </p>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Berlaku Sampai Tanggal *</label>
                    <input
                        type="date"
                        value={certExpiryDate}
                        onChange={e => setCertExpiryDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        required
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                        Tanggal kadaluarsa sertifikat kalibrasi
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">File Sertifikat *</label>
                    <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={handleCertificateFileChange}
                        required
                        className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {certificateImage && (
                        <p className="text-xs text-green-600 mt-1">File siap diunggah.</p>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => { setIsCertModalOpen(false); setLogToComplete(null); setCertExpiryDate(''); }}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                        Batal
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmittingCert}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg shadow-md hover:bg-green-700 disabled:opacity-50 transition"
                    >
                        {isSubmittingCert ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Tandai Selesai & Upload Sertifikat
                    </button>
                </div>
            </form>
        </Modal>
      )}

      {/* MODAL RIWAYAT KALIBRASI */}
      {isHistoryModalOpen && historyTarget && (
        <Modal
            isOpen={isHistoryModalOpen}
            onClose={() => { setIsHistoryModalOpen(false); setHistoryTarget(null); setHistoryLogs([]); }}
            title={`${historyTarget.regulation_name} — ${historyTarget.asset_name}`}
        >
            {historyLoading && <LoadingState />}
            {!historyLoading && historyError && (
                <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{historyError}</div>
            )}
            {!historyLoading && !historyError && (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">No</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Tanggal Dibuat</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Jatuh Tempo</th>
                                <th className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-3 py-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Sertifikat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {historyLogs.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="px-3 py-6 text-center text-slate-500">
                                        Belum ada riwayat untuk kombinasi ini.
                                    </td>
                                </tr>
                            )}
                            {historyLogs.map((h, idx) => {
                                const statusInfo = getStatusInfo(h.status);
                                const IconComponent = statusInfo.icon;
                                return (
                                    <tr key={h.id}>
                                        <td className="px-3 py-2 text-slate-600">{idx + 1}</td>
                                        <td className="px-3 py-2 text-slate-700">{formatDate(h.created_at)}</td>
                                        <td className="px-3 py-2 text-slate-700">{formatDate(h.next_check_due)}</td>
                                        <td className="px-3 py-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${statusInfo.class}`}>
                                                <IconComponent size={12} className="mr-1.5" />
                                                {statusInfo.text}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {h.certificate_image ? (
                                                <button
                                                    onClick={() => handleViewCertificate(h.certificate_image)}
                                                    title="Lihat Sertifikat"
                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </Modal>
      )}

      {/* MODAL VIEWER SERTIFIKAT (dirender terakhir agar tampil di atas modal riwayat) */}
      {certViewerOpen && (
        <Modal
            isOpen={certViewerOpen}
            onClose={() => setCertViewerOpen(false)}
            title="Sertifikat Kalibrasi"
            maxWidth="max-w-4xl"
        >
            {certViewerType === 'image' && (
                <img
                    src={certViewerData}
                    alt="Sertifikat Kalibrasi"
                    className="w-full h-auto rounded-lg object-contain max-h-[70vh]"
                />
            )}
            {certViewerType === 'pdf' && (
                <iframe
                    src={certViewerData}
                    className="w-full rounded-lg border border-slate-200"
                    style={{ height: '70vh' }}
                    title="Sertifikat Kalibrasi"
                />
            )}
            <div className="flex justify-end mt-4">
                <button
                    onClick={() => {
                        const link = document.createElement('a');
                        link.href = certViewerData;
                        link.download = 'sertifikat-kalibrasi';
                        link.click();
                    }}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md hover:bg-blue-700 transition"
                >
                    <Download size={16} className="mr-2" />
                    Download
                </button>
            </div>
        </Modal>
      )}
    </div>
  );
}