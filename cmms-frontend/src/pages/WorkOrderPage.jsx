// src/pages/WorkOrderPage.jsx
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FileWarning, Play, Check, Trash2, Edit, Plus, HardDrive, Image as ImageIcon, X, ShieldCheck, User, ShieldAlert, Search, ArrowUpDown } from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import WorkOrderForm from './WorkOrderForm.jsx';
import Modal from '../components/Modal.jsx';
import { useAuth } from '../context/useAuth.js';
import { useSocket } from '../context/useSocket.js';
import { useLocation } from 'react-router-dom';

export default function WorkOrderPage() {
  const { user, checkRole } = useAuth();
  const location = useLocation();
  const { socket } = useSocket();

  const [workOrders, setWorkOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // State Modal Create/Edit
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [currentWo, setCurrentWo] = useState(null);
  const [woPrefillData, setWoPrefillData] = useState(null); 

  // State Modal Bukti (Teknisi)
  const [isEvidenceModalOpen, setIsEvidenceModalOpen] = useState(false);
  const [woToComplete, setWoToComplete] = useState(null);
  const [evidenceImage, setEvidenceImage] = useState('');

  // State Modal Verifikasi (Admin/Manager)
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [woToVerify, setWoToVerify] = useState(null);

  // State Lihat Gambar
  const [isViewImageModalOpen, setIsViewImageModalOpen] = useState(false);
  const [viewingImages, setViewingImages] = useState({ initial: null, evidence: null, title: '' });

  // Search, Sort & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('date_desc');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [woResponse, assetResponse] = await Promise.all([
        api.get('/workorders'),
        api.get('/assets')
      ]);
      setWorkOrders(woResponse.data);
      setAssets(assetResponse.data); 
    } catch (err) {
      console.error("Fetch Error:", err);
      setError("Gagal memuat data work order.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh saat ada WO dibuat/diubah/dihapus dari sesi lain
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchData();
    socket.on('wo_updated', handleUpdate);
    return () => {
      socket.off('wo_updated', handleUpdate);
    };
  }, [socket]);

  useEffect(() => {
    if (location.state?.fromSchedule) {
      setWoPrefillData(location.state.fromSchedule);
      setIsCreateModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // --- CRUD Handlers ---
  const handleWorkOrderCreated = (newWorkOrder) => {
    setWorkOrders([newWorkOrder, ...workOrders]);
    setIsCreateModalOpen(false);
  };
  
  const handleWorkOrderUpdated = (updatedWo) => {
    setWorkOrders(workOrders.map(wo => wo.id === updatedWo.id ? updatedWo : wo));
    setIsEditModalOpen(false);
    setCurrentWo(null);
  };
  
  const handleDeleteWorkOrder = async (wo_id, title) => {
      if (!window.confirm(`Hapus Work Order: "${title}"?`)) return;
      try {
          await api.delete(`/workorders/${wo_id}`);
          setWorkOrders(workOrders.filter(wo => wo.id !== wo_id));
      } catch (err) {
          console.error("Delete Error:", err);
          alert("Gagal menghapus Work Order.");
      }
  };

  // --- Admin Actions (Approval untuk WO buatan Manajer) ---
  const handleApproveWorkOrder = async (wo_id) => {
      if(!window.confirm("Setujui Work Order ini agar bisa dikerjakan teknisi?")) return;
      try {
        const response = await api.patch(
            `/workorders/${wo_id}`,
            { status: 'open' }
        );
        setWorkOrders(workOrders.map(wo => wo.id === wo_id ? response.data : wo));
      } catch (err) {
          console.error("Approve Error:", err);
          alert("Gagal menyetujui WO.");
      }
  };

  // --- Technician Actions (Mulai & Ajukan Selesai) ---
  const handleStartWork = async (wo_id) => {
      try {
        // PERBAIKAN: Mengirim user.id saat mulai kerja
        const response = await api.patch(
            `/workorders/${wo_id}`,
            {
                status: 'in_progress',
                assigned_to_id: user.id // Simpan teknisi
            }
        );
        setWorkOrders(workOrders.map(wo => wo.id === wo_id ? response.data : wo));
      } catch (err) {
          console.error("Start Error:", err);
          alert("Gagal memulai pekerjaan.");
      }
  };

  const handleFinishClick = (wo) => {
      setWoToComplete(wo);
      setEvidenceImage('');
      setIsEvidenceModalOpen(true);
  };

  const handleSubmitEvidence = async (e) => {
      e.preventDefault();
      if (!evidenceImage) return alert("Wajib upload bukti foto!");

      try {
          // PERBAIKAN: Mengirim user.id saat selesai kerja
          const response = await api.patch(
             `/workorders/${woToComplete.id}`,
             {
                 status: 'pending_verification',
                 evidence_image: evidenceImage,
                 assigned_to_id: user.id // Update teknisi (jika belum terassign)
             }
          );
          
          setWorkOrders(workOrders.map(wo => wo.id === woToComplete.id ? response.data : wo));
          setIsEvidenceModalOpen(false);
          setWoToComplete(null);
          setEvidenceImage('');
      } catch (err) {
          console.error("Evidence Error:", err);
          alert("Gagal mengirim bukti.");
      }
  };

  // --- Admin/Manager Verifikasi Selesai ---
  const handleVerifyClick = (wo) => {
      setWoToVerify(wo);
      setIsVerifyModalOpen(true);
  };

  const handleConfirmVerification = async () => {
      if (!woToVerify) return;
      try {
          await api.patch(
              `/workorders/${woToVerify.id}`,
              { status: 'completed' }
          );
          setWorkOrders(workOrders.filter(wo => wo.id !== woToVerify.id));
          setIsVerifyModalOpen(false);
          setWoToVerify(null);
      } catch (err) {
          console.error("Verify Error:", err);
          alert("Gagal memverifikasi WO.");
      }
  };

  const handleRejectVerification = async () => {
      if (!woToVerify) return;
      
      if (!window.confirm("Tolak verifikasi ini? Status akan dikembalikan ke 'In Progress' dan foto bukti akan dihapus.")) {
          return;
      }
      
      try {
          const response = await api.patch(
              `/workorders/${woToVerify.id}/reject-verification`,
              {}
          );
          
          // Update work orders list
          setWorkOrders(workOrders.map(wo => wo.id === woToVerify.id ? response.data.work_order : wo));
          
          setIsVerifyModalOpen(false);
          setWoToVerify(null);
          
          alert("Verifikasi ditolak. Teknisi perlu mengerjakan ulang dan upload bukti baru.");
      } catch (err) {
          console.error("Reject Error:", err);
          alert(err.response?.data?.error || "Gagal menolak verifikasi.");
      }
  };

  // --- Utilities ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => setEvidenceImage(reader.result);
        reader.readAsDataURL(file);
    }
  };

  const handleViewImages = (wo) => {
      setViewingImages({ title: wo.title, initial: wo.initial_image, evidence: wo.evidence_image });
      setIsViewImageModalOpen(true);
  };

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
      timeZoneName: 'short' 
    }).format(date);
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending_approval: 'bg-blue-100 text-blue-700 border-blue-200',
      open: 'bg-red-100 text-red-700 border-red-200',
      in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
      pending_verification: 'bg-purple-100 text-purple-700 border-purple-200',
      completed: 'bg-green-100 text-green-700 border-green-200'
    };
    const labels = {
      pending_approval: 'Tunggu Persetujuan',
      open: 'Open',
      in_progress: 'Dikerjakan',
      pending_verification: 'Verifikasi',
      completed: 'Selesai'
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles[status] || 'bg-gray-100'}`}>
            {labels[status] || status}
        </span>
    );
  };

  if (error) return <ErrorState message={error} />;

  const displayedWorkOrders = workOrders
    .filter(wo => {
      const q = searchTerm.toLowerCase();
      const matchSearch = (wo.title || '').toLowerCase().includes(q) ||
        (wo.asset_name || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || wo.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortKey === 'title_asc') return (a.title || '').localeCompare(b.title || '');
      if (sortKey === 'title_desc') return (b.title || '').localeCompare(a.title || '');
      if (sortKey === 'date_asc') return new Date(a.created_at) - new Date(b.created_at);
      if (sortKey === 'date_desc') return new Date(b.created_at) - new Date(a.created_at);
      return 0;
    });

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Work Order</h1>
            <p className="text-slate-500 mt-1">
                {checkRole(['technician']) 
                    ? "Kerjakan tugas yang tersedia." 
                    : "Kelola, setujui, dan verifikasi pekerjaan."}
            </p>
        </div>
        
        {checkRole(['manager']) && (
            <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg shadow-md hover:bg-blue-700 transition"
            >
                <Plus size={18} className="mr-2" /> Buat WO Baru
            </button>
        )}
      </div>
      
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari judul atau nama aset..."
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
              <option value="date_desc">Terbaru</option>
              <option value="date_asc">Terlama</option>
              <option value="title_asc">Judul A→Z</option>
              <option value="title_desc">Judul Z→A</option>
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="all">Semua Status</option>
            <option value="pending_approval">Tunggu Persetujuan</option>
            <option value="open">Open</option>
            <option value="in_progress">Dikerjakan</option>
            <option value="pending_verification">Verifikasi</option>
          </select>
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && <LoadingState />}
        
        {!loading && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">Info Pekerjaan</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-1"><HardDrive size={14}/> Aset</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                     <div className="flex items-center gap-1"><User size={14}/> Dibuat Oleh</div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {displayedWorkOrders.length === 0 && (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center gap-3">
                            <FileWarning size={32} className="text-slate-400" />
                            {workOrders.length === 0
                              ? <p>Tidak ada Work Order aktif.</p>
                              : <p className="font-medium">Tidak ada hasil untuk pencarian ini.</p>
                            }
                        </div>
                    </td>
                  </tr>
                )}
                {displayedWorkOrders.map(wo => (
                  <tr key={wo.id} className="hover:bg-slate-50 transition-colors">
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(wo.status)}
                    </td>
                    
                    <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{wo.title}</div>
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{wo.description || 'Tidak ada deskripsi'}</div>
                        <span className={`mt-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            wo.type === 'preventive' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                        }`}>
                            {wo.type === 'preventive' ? 'Preventive' : 'Corrective'}
                        </span>
                    </td>
                    
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        {wo.asset_name}
                        <div className="text-xs text-slate-400 font-normal mt-0.5">{formatDate(wo.created_at)}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700 capitalize">
                            {wo.created_by_role || 'System'}
                        </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                            
                            {checkRole(['admin']) && wo.status === 'pending_approval' && (
                                <button 
                                    onClick={() => handleApproveWorkOrder(wo.id)}
                                    className="bg-blue-100 text-blue-700 px-2 py-1 text-xs font-bold rounded hover:bg-blue-200 flex items-center gap-1"
                                    title="Setujui Work Order"
                                >
                                    <ShieldAlert size={14}/> Setujui
                                </button>
                            )}

                            {checkRole(['technician']) && (
                                <>
                                    {wo.status === 'open' && (
                                        <button onClick={() => handleStartWork(wo.id)} className="bg-amber-100 text-amber-700 p-1.5 rounded hover:bg-amber-200" title="Mulai Pekerjaan">
                                            <Play size={18} />
                                        </button>
                                    )}
                                    {wo.status === 'in_progress' && (
                                        <button onClick={() => handleFinishClick(wo)} className="bg-green-100 text-green-700 p-1.5 rounded hover:bg-green-200" title="Selesaikan & Upload Bukti">
                                            <Check size={18} />
                                        </button>
                                    )}
                                </>
                            )}

                            {checkRole(['admin', 'manager']) && (
                                <>
                                    {wo.status === 'pending_verification' && (
                                        <button onClick={() => handleVerifyClick(wo)} className="bg-purple-100 text-purple-700 px-2 py-1 text-xs font-bold rounded hover:bg-purple-200 flex items-center gap-1" title="Verifikasi Pekerjaan">
                                            <ShieldCheck size={14} /> Verifikasi
                                        </button>
                                    )}
                                    
                                    <button onClick={() => { setCurrentWo(wo); setIsEditModalOpen(true); }} className="text-slate-400 hover:text-blue-600 p-1" title="Edit">
                                        <Edit size={18} />
                                    </button>
                                    <button onClick={() => handleDeleteWorkOrder(wo.id, wo.title)} className="text-slate-400 hover:text-red-600 p-1" title="Hapus">
                                        <Trash2 size={18} />
                                    </button>
                                </>
                            )}

                             <button onClick={() => handleViewImages(wo)} className="text-slate-400 hover:text-slate-600 p-1" title="Lihat Foto">
                                <ImageIcon size={18} />
                            </button>
                        </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {isCreateModalOpen && (
        <Modal isOpen={isCreateModalOpen} onClose={() => { setIsCreateModalOpen(false); setWoPrefillData(null); }} title={woPrefillData ? `Buat WO dari Jadwal: ${woPrefillData.title}` : "Buat Work Order Baru"}>
            <WorkOrderForm assets={assets} onWorkOrderCreated={handleWorkOrderCreated} onClose={() => { setIsCreateModalOpen(false); setWoPrefillData(null); }} prefillData={woPrefillData} />
        </Modal>
      )}

      {isEditModalOpen && currentWo && (
        <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Work Order">
            <WorkOrderForm assets={assets} initialData={currentWo} onWOUpdated={handleWorkOrderUpdated} onClose={() => setIsEditModalOpen(false)} />
        </Modal>
      )}

      {isEvidenceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                  <h3 className="font-bold text-lg mb-4">Selesaikan Pekerjaan</h3>
                  <p className="text-sm text-slate-600 mb-4">Upload foto bukti perbaikan untuk mengajukan verifikasi ke Admin/Manajer.</p>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="mb-4 w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-blue-50 file:text-blue-700"/>
                  {evidenceImage && <img src={evidenceImage} alt="Preview" className="h-32 object-contain mb-4 rounded border"/>}
                  <div className="flex justify-end gap-2">
                      <button onClick={() => setIsEvidenceModalOpen(false)} className="px-4 py-2 text-slate-600">Batal</button>
                      <button onClick={handleSubmitEvidence} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Kirim Verifikasi</button>
                  </div>
              </div>
          </div>
      )}

      {isVerifyModalOpen && woToVerify && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                  <h3 className="font-bold text-lg mb-2">Verifikasi Pekerjaan</h3>
                  <p className="text-sm text-slate-600 mb-4">
                      Apakah Anda yakin pekerjaan pada asset <b>{woToVerify.asset_name}</b> sudah selesai dengan benar?
                  </p>
                  
                  <div className="flex gap-2 mb-4 overflow-x-auto bg-slate-50 p-2 rounded border">
                      <div className="shrink-0">
                           <p className="text-xs font-bold text-red-500 mb-1">Foto Awal</p>
                           {woToVerify.initial_image ? <img src={woToVerify.initial_image} alt="Awal" className="h-24 rounded"/> : <span className="text-xs text-slate-400">Tidak ada</span>}
                      </div>
                      <div className="shrink-0">
                           <p className="text-xs font-bold text-green-500 mb-1">Foto Bukti</p>
                           {woToVerify.evidence_image ? <img src={woToVerify.evidence_image} alt="Akhir" className="h-24 rounded"/> : <span className="text-xs text-slate-400">Tidak ada</span>}
                      </div>
                  </div>

                  <div className="flex justify-between gap-2">
                      <button onClick={() => setIsVerifyModalOpen(false)} className="px-4 py-2 text-slate-600 border rounded hover:bg-slate-50">Batal</button>
                      
                      <div className="flex gap-2">
                          <button onClick={handleRejectVerification} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1">
                              <X size={16} /> Tolak
                          </button>
                          <button onClick={handleConfirmVerification} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">Ya, Validasi Selesai</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {isViewImageModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm" onClick={() => setIsViewImageModalOpen(false)}>
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl p-4" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4 border-b pb-2">
                      <h3 className="font-bold text-slate-800">Dokumentasi: {viewingImages.title}</h3>
                      <button onClick={() => setIsViewImageModalOpen(false)}><X size={24}/></button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <span className="text-sm font-bold text-red-600 block mb-2">Awal (Masalah)</span>
                          {viewingImages.initial ? <img src={viewingImages.initial} alt="Awal" className="w-full rounded border"/> : <p className="text-slate-400 italic text-sm">Kosong</p>}
                      </div>
                      <div>
                          <span className="text-sm font-bold text-green-600 block mb-2">Akhir (Bukti)</span>
                          {viewingImages.evidence ? <img src={viewingImages.evidence} alt="Akhir" className="w-full rounded border"/> : <p className="text-slate-400 italic text-sm">Belum ada</p>}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}