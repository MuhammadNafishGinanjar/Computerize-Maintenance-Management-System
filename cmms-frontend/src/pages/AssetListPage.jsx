// src/pages/AssetListPage.jsx
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { FileWarning, PackagePlus, HardDrive, MapPin, Activity, Settings, Edit, Trash2, Image as ImageIcon, X, Search, ArrowUpDown } from 'lucide-react';
import AssetForm from './AssetForm.jsx';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Modal from '../components/Modal.jsx';
import { useSocket } from '../context/useSocket.js';

export default function AssetListPage() {
  const { socket } = useSocket();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State untuk Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null); 

  // State untuk Zoom Gambar
  const [viewImage, setViewImage] = useState(null);

  // Search, Sort & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('name_asc');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/assets');
      setAssets(response.data);
    } catch (err) {
      if (err.response) {
        setError(`Gagal mengambil data: ${err.response.status} ${err.response.statusText}`);
      } else if (err.request) {
        setError("Gagal mengambil data dari server. Pastikan server Flask berjalan.");
      } else {
        setError(`Error: ${err.message}`);
      }
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh saat ada aset dibuat/diubah/dihapus dari sesi lain
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchAssets();
    socket.on('asset_updated', handleUpdate);
    return () => {
      socket.off('asset_updated', handleUpdate);
    };
  }, [socket]);

  const handleAssetCreated = () => {
    fetchAssets(); 
    setIsModalOpen(false);
  };

  const handleAssetUpdated = (updatedAsset) => {
    setAssets(assets.map(a => a.id === updatedAsset.id ? updatedAsset : a));
    setIsModalOpen(false);
    setEditingAsset(null);
  };

  const handleDeleteAsset = async (assetId, assetName) => {
      if (!window.confirm(`Apakah Anda yakin ingin menghapus aset "${assetName}"?`)) return;

      try {
          await api.delete(`/assets/${assetId}`);
          setAssets(assets.filter(a => a.id !== assetId));
      } catch (err) {
          alert("Gagal menghapus aset. Pastikan tidak ada Work Order yang terhubung.");
          console.error(err);
      }
  };

  const openCreateModal = () => {
      setEditingAsset(null);
      setIsModalOpen(true);
  };

  const openEditModal = (asset) => {
      setEditingAsset(asset);
      setIsModalOpen(true);
  };

  const STATUS_CONFIG = {
    running:     { label: 'Beroperasi',  cls: 'bg-green-100 text-green-700 border-green-200' },
    idle:        { label: 'Standby',     cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    breakdown:   { label: 'Gangguan',    cls: 'bg-red-100 text-red-700 border-red-200' },
    maintenance: { label: 'Perawatan',   cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    warning:     { label: 'Peringatan',  cls: 'bg-orange-100 text-orange-700 border-orange-200' },
    off:         { label: 'Tidak Aktif', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    down:        { label: 'Gangguan',    cls: 'bg-red-100 text-red-700 border-red-200' },
  };

  if (error) {
    return <ErrorState message={error} />;
  }

  const displayedAssets = assets
    .filter(asset => {
      const q = searchTerm.toLowerCase();
      const matchSearch = asset.name.toLowerCase().includes(q) ||
        (asset.machine_id || '').toLowerCase().includes(q) ||
        (asset.location || '').toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || asset.status === statusFilter;
      return matchSearch && matchStatus;
    })
    .sort((a, b) => {
      if (sortKey === 'name_asc') return a.name.localeCompare(b.name);
      if (sortKey === 'name_desc') return b.name.localeCompare(a.name);
      return 0;
    });

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-3xl font-bold text-slate-800">Manajemen Aset</h1>
            <p className="text-slate-500 mt-1">Kelola daftar mesin dan spesifikasi komponennya.</p>
        </div>
        <button
            onClick={openCreateModal}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 transition-all transform hover:-translate-y-0.5"
        >
            <PackagePlus size={18} className="mr-2" /> Tambah Aset Baru
        </button>
      </div>
      
      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama mesin, ID, atau lokasi..."
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
            </select>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white shrink-0"
          >
            <option value="all">Semua Status</option>
            <option value="running">Beroperasi</option>
            <option value="idle">Standby</option>
            <option value="maintenance">Perawatan</option>
            <option value="breakdown">Gangguan</option>
            <option value="warning">Peringatan</option>
            <option value="off">Tidak Aktif</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading && <LoadingState />}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  {/* Kolom Gambar */}
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider w-16">
                    Foto
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2"><HardDrive size={14}/> Nama Mesin</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">ID Mesin</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2"><MapPin size={14}/> Lokasi</div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <div className="flex items-center justify-center gap-2"><Activity size={14}/> Status</div>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider w-1/3">
                    <div className="flex items-center gap-2"><Settings size={14}/> Komponen (BOM)</div>
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Opsi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {displayedAssets.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 bg-slate-100 rounded-full">
                            <FileWarning size={32} className="text-slate-400" />
                        </div>
                        {assets.length === 0 ? (
                          <>
                            <p className="font-medium">Belum ada data aset.</p>
                            <p className="text-sm">Silakan tambahkan aset baru untuk memulai.</p>
                          </>
                        ) : (
                          <p className="font-medium">Tidak ada hasil untuk pencarian ini.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {displayedAssets.map(asset => (
                  <tr key={asset.id} className="hover:bg-slate-50 transition-colors group">
                    
                    {/* Foto Thumbnail (Klik untuk Zoom) */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        {asset.image ? (
                            <div 
                                className="h-10 w-10 rounded overflow-hidden border border-slate-200 shadow-sm cursor-pointer hover:opacity-80 transition-opacity mx-auto"
                                onClick={() => setViewImage(asset.image)}
                            >
                                <img src={asset.image} alt={asset.name} className="h-full w-full object-cover" />
                            </div>
                        ) : (
                            <div className="h-10 w-10 rounded bg-slate-100 flex items-center justify-center text-slate-300 mx-auto">
                                <ImageIcon size={18} />
                            </div>
                        )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-900">{asset.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600 border border-slate-200">
                            {asset.machine_id}
                        </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {asset.location || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {(() => {
                        const cfg = STATUS_CONFIG[asset.status] || STATUS_CONFIG.off;
                        return (
                          <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </td>
                    
                    {/* Tampilan Komponen */}
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {asset.components.length > 0 ? (
                          asset.components.map((comp, idx) => (
                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                {comp.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">Tidak ada komponen terdaftar</span>
                        )}
                      </div>
                    </td>

                    {/* Tombol Aksi (Edit/Hapus) */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={() => openEditModal(asset)}
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                title="Edit Aset"
                            >
                                <Edit size={18} />
                            </button>
                            <button 
                                onClick={() => handleDeleteAsset(asset.id, asset.name)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                title="Hapus Aset"
                            >
                                <Trash2 size={18} />
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

      {/* Modal Tambah/Edit Aset */}
      {isModalOpen && (
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={editingAsset ? `Edit Aset: ${editingAsset.name}` : "Tambah Aset Baru"}
        >
            <AssetForm 
                initialData={editingAsset}
                onAssetCreated={handleAssetCreated}
                onAssetUpdated={handleAssetUpdated}
                onClose={() => setIsModalOpen(false)}
            />
        </Modal>
      )}

      {/* --- IMAGE LIGHTBOX (POPUP) --- */}
      {viewImage && (
        <div className="fixed inset-0 z-[60] bg-black bg-opacity-90 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewImage(null)}>
            <button className="absolute top-4 right-4 text-white p-2 hover:bg-white/20 rounded-full transition-colors" onClick={() => setViewImage(null)}>
                <X size={32} />
            </button>
            <img 
                src={viewImage} 
                alt="Preview Fullscreen" 
                className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
                onClick={(e) => e.stopPropagation()} 
            />
        </div>
      )}
    </div>
  );
}